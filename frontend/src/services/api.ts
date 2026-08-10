import type {
  User,
  AnalysisSummary,
  StoredAnalysis,
  AnalysisResponse,
  LawyerProfile,
  AnalysisProgressEvent,
  Citation,
  ChatMessage,
  DocumentAnswer,
  Reminder,
  ReminderPreferences,
  NegotiationDraftRequest,
  NegotiationDraft,
} from "@/types";

const API_BASE = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api`;
// Streaming (SSE) requests must bypass the Next.js rewrite proxy used by
// API_BASE — rewrites buffer the whole response before forwarding it, which
// defeats incremental progress events. Hit the backend origin directly.
// NEXT_PUBLIC_BACKEND_ORIGIN is injected by next.config.mjs from the same
// BACKEND_API_URL the rewrite uses, so both paths always agree.
const STREAM_API_BASE = process.env.NEXT_PUBLIC_BACKEND_ORIGIN || "http://localhost:8000";

/**
 * Keys older builds used to persist the session credential in the browser.
 * `unbind_access_token` held the raw 7-day JWT and `"user"` cached the whole
 * auth response, `accessToken` included. Both are gone (see
 * `withoutAccessToken`), but existing visitors still have them on disk, so
 * `purgeLegacyBrowserCredentials` deletes them on first load.
 */
const LEGACY_CREDENTIAL_KEYS = ["unbind_access_token", "user"] as const;

/**
 * Delete any session credential a previous version of this app persisted in
 * `localStorage`. Safe to call on every page load; it is a no-op once clean.
 */
export function purgeLegacyBrowserCredentials(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_CREDENTIAL_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable (private mode, disabled cookies). Nothing
      // to purge in that case, and failing here must not break boot.
    }
  }
}

/**
 * Typed error thrown for every non-2xx response. Carries the HTTP `status`
 * and the parsed backend `detail` so callers can branch on the status code or
 * a machine-readable code (e.g. "NOT_A_LEGAL_DOCUMENT") instead of matching on
 * a free-text message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Build an ApiError from a failed Response, parsing FastAPI's `detail` field
 * (falling back to `error`/`message`) without throwing if the body isn't JSON.
 */
async function toApiError(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => null);
  const raw =
    (data && (data.detail ?? data.error ?? data.message)) ?? `Request failed (${res.status})`;
  const detail = typeof raw === "string" ? raw : JSON.stringify(raw);
  return new ApiError(res.status, detail);
}

/**
 * The auth endpoints still return `accessToken` in the JSON body because the
 * published Node CLI needs it as a `Authorization: Bearer` credential. The
 * browser must never keep a copy: the backend sets the same token as an
 * `httpOnly` cookie, which script cannot read and which every request below
 * sends via `credentials: "include"`. A script-reachable duplicate would hand
 * any XSS or hostile dependency a 7-day bearer credential usable from
 * anywhere, so it is stripped here, at the boundary, before it can reach React
 * state or storage.
 */
function withoutAccessToken(raw: User & { accessToken?: string }): User {
  const safe: User & { accessToken?: string } = { ...raw };
  delete safe.accessToken;
  return safe;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const shouldSetJsonHeader = method !== "GET" && !(init?.body instanceof FormData);
  const headers = {
    ...(shouldSetJsonHeader ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // The httpOnly auth cookie is the *only* credential the browser holds, so
    // this is mandatory on every path and must not be overridable by `init`.
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ───

export const signup = async (
  username: string,
  email: string,
  password: string,
): Promise<User> => {
  const user = await apiFetch<User & { accessToken?: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  return withoutAccessToken(user);
};

export const login = async (email: string, password: string): Promise<User> => {
  const user = await apiFetch<User & { accessToken?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return withoutAccessToken(user);
};

export const logout = async (): Promise<void> => {
  await apiFetch("/auth/logout", { method: "POST" });
  // The session itself lives in the httpOnly cookie the server just cleared;
  // this only sweeps credentials older builds left behind in localStorage.
  purgeLegacyBrowserCredentials();
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const user = await apiFetch<User & { accessToken?: string }>("/auth/me");
    // /auth/me re-mints a fresh cookie server-side; nothing to persist here.
    return user ? withoutAccessToken(user) : null;
  } catch {
    // A 401 means no session; any other failure (network, 5xx) also leaves us
    // without a user for this render. Either way there is nothing local to
    // clear, because the credential is a cookie the browser manages.
    return null;
  }
};

export const googleLogin = async (credential: string): Promise<User> => {
  const user = await apiFetch<User & { accessToken?: string }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  return withoutAccessToken(user);
};

export const updatePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  await apiFetch<{ ok: boolean; message: string }>("/auth/update-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};

// ─── Analysis ───

export const analyzeText = async (
  text: string,
  role: string,
  fileName: string,
): Promise<StoredAnalysis> => {
  return apiFetch<StoredAnalysis>("/analysis/analyze", {
    method: "POST",
    body: JSON.stringify({ text, role, fileName }),
  });
};

export const uploadAndAnalyze = async (
  file: File,
  role: string,
): Promise<StoredAnalysis> => {
  const form = new FormData();
  form.append("file", file);
  form.append("role", role);
  const res = await fetch(`${API_BASE}/analysis/upload`, {
    method: "POST",
    // Authenticated by the httpOnly auth cookie. Do not set Content-Type: the
    // browser must generate the multipart boundary itself.
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res.json() as Promise<StoredAnalysis>;
};

/**
 * Parses a text/event-stream body into `{event, data}` frames as they arrive.
 * SSE frames are separated by a blank line; each frame carries an `event:`
 * line naming the type and a `data:` line with a JSON payload.
 */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: any }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        let event = "message";
        let data = "";
        for (const line of rawFrame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data = line.slice(5).trim();
        }
        if (data) {
          try {
            yield { event, data: JSON.parse(data) };
          } catch {
            // Ignore malformed frames rather than aborting the whole stream.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams contract analysis progress over SSE while uploading a file.
 * Calls `onProgress` for each intermediate event and resolves with the final
 * stored analysis once the `result` event arrives.
 */
export const uploadAndAnalyzeStream = async (
  file: File,
  role: string,
  onProgress: (event: AnalysisProgressEvent) => void,
): Promise<StoredAnalysis> => {
  const form = new FormData();
  form.append("file", file);
  form.append("role", role);
  // This is a `fetch` + ReadableStream reader, not an `EventSource`, so the
  // cookie travels normally. STREAM_API_BASE is a different origin from the app
  // in production, and the backend answers with SameSite=None;Secure cookies
  // plus CORS `allow_credentials` for exactly this origin, so
  // `credentials: "include"` authenticates the stream without any header.
  const res = await fetch(`${STREAM_API_BASE}/api/analysis/upload/stream`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok || !res.body) {
    throw await toApiError(res);
  }

  for await (const { event, data } of parseSseStream(res.body)) {
    if (event === "progress") {
      onProgress(data as AnalysisProgressEvent);
    } else if (event === "error") {
      throw new ApiError(422, data.detail ?? data.code ?? "Analysis failed");
    } else if (event === "result") {
      return data as StoredAnalysis;
    }
  }

  throw new ApiError(500, "Stream ended without a result");
};

export const getUserAnalyses = async (
  { limit, skip }: { limit?: number; skip?: number } = {},
): Promise<AnalysisSummary[]> => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (skip !== undefined) params.set("skip", String(skip));
  const query = params.toString();
  return apiFetch<AnalysisSummary[]>(
    `/analysis/history${query ? `?${query}` : ""}`,
  );
};

export const getAnalysisById = async (id: string): Promise<StoredAnalysis> => {
  return apiFetch<StoredAnalysis>(`/analysis/history/${id}`);
};

// ── Document Q&A ────────────────────────────────────────────────────────────
//
// The web app asks questions through /analysis/{id}/chat. The older
// /analysis/simulate endpoint still exists server-side for the published CLI,
// but nothing here calls it, so there's no client method for it.

export const askDocument = async (
  analysisId: string,
  question: string,
): Promise<DocumentAnswer> => {
  const data = await apiFetch<{ answer: string; citations?: Citation[] }>(
    `/analysis/${analysisId}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ question }),
    },
  );
  return { answer: data.answer, citations: data.citations ?? [] };
};

export const getDocumentChat = async (
  analysisId: string,
): Promise<ChatMessage[]> => {
  const data = await apiFetch<ChatMessage[]>(`/analysis/${analysisId}/chat`);
  return data.map((m) => ({ ...m, citations: m.citations ?? [] }));
};

export const clearDocumentChat = async (analysisId: string): Promise<void> => {
  await apiFetch(`/analysis/${analysisId}/chat`, { method: "DELETE" });
};

export const draftNegotiationMessage = async (
  payload: NegotiationDraftRequest,
): Promise<NegotiationDraft> => {
  return apiFetch<NegotiationDraft>("/analysis/negotiation-message", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const deleteAnalysis = async (id: string): Promise<void> => {
  await apiFetch<{ ok: boolean }>(`/analysis/history/${id}`, {
    method: "DELETE",
  });
};

// ─── User Plan ───

export const getUserPlan = async (): Promise<{ plan: string | null; isPro: boolean; aiModel: string; dailyCount: number; dailyLimit: number | null; limitReached: boolean }> => {
  try {
    return await apiFetch<{ plan: string | null; isPro: boolean; aiModel: string; dailyCount: number; dailyLimit: number | null; limitReached: boolean }>("/user/plan/");
  } catch (error) {
    // Unauthenticated users get sensible free-tier defaults; any other
    // failure is a real error and must not be silently swallowed.
    if (error instanceof ApiError && error.status === 401) {
      return {
        plan: null,
        isPro: false,
        aiModel: "llama-3.3-70b-versatile",
        dailyCount: 0,
        dailyLimit: 1,
        limitReached: false,
      };
    }
    throw error;
  }
};

export interface PlanOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: string;
  description: string;
}

/** Ask the backend to create a Razorpay order for the chosen plan. The price
 * is decided server-side from the plan name — the client never sends an amount. */
export const createPlanOrder = async (plan: string): Promise<PlanOrder> => {
  return apiFetch<PlanOrder>("/user/plan/create-order", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
};

/** Send the Razorpay callback back to the backend for signature verification.
 * The plan is only granted server-side once the signature checks out. */
export const verifyPlanPayment = async (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ success: boolean; plan: string; expiresAt: string | null }> => {
  return apiFetch<{ success: boolean; plan: string; expiresAt: string | null }>(
    "/user/plan/verify",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
};

export const cancelUserPlan = async (): Promise<{ success: boolean }> => {
  return apiFetch<{ success: boolean }>("/user/plan/cancel", {
    method: "POST",
  });
};

export interface PaymentRecord {
  id: string;
  plan: string;
  /** Amount in the smallest currency unit (e.g. paise for INR — 45000 = ₹450.00). */
  amount: number;
  currency: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  /** ISO timestamp of when the payment was made. */
  createdAt: string;
  /** ISO timestamp of when the granted plan expires, or null if it never does. */
  expiresAt: string | null;
}

/** Fetch the authenticated user's past plan payments, newest first. */
export const getPaymentHistory = async (): Promise<PaymentRecord[]> => {
  return apiFetch<PaymentRecord[]>("/user/plan/payments");
};

// ─── Lawyer Referral ───

export const getLawyers = async (
  specialization?: string,
): Promise<LawyerProfile[]> => {
  const qs = specialization
    ? `?specialization=${encodeURIComponent(specialization)}`
    : "";
  return apiFetch<LawyerProfile[]>(`/lawyers/${qs}`);
};

export const getLawyerById = async (id: string): Promise<LawyerProfile> => {
  return apiFetch<LawyerProfile>(`/lawyers/${id}`);
};

export const contactLawyer = async (
  lawyerId: string,
  message: string,
  contactEmail: string,
): Promise<{ success: boolean; requestId: string }> => {
  return apiFetch<{ success: boolean; requestId: string }>(
    `/lawyers/${lawyerId}/contact`,
    {
      method: "POST",
      body: JSON.stringify({ lawyerId, message, contactEmail }),
    },
  );
};

export const registerLawyer = async (data: {
  name: string;
  email: string;
  specializations: string[];
  bio: string;
  experienceYears: number;
  city: string;
  phone?: string;
}): Promise<{ success: boolean; message: string; lawyerId: string }> => {
  return apiFetch<{ success: boolean; message: string; lawyerId: string }>(
    "/lawyer-register/",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

// ── Deadline reminders ──────────────────────────────────────────────────────

export const getReminders = async (
  analysisId: string,
): Promise<Reminder[]> => {
  return apiFetch<Reminder[]>(`/reminders/analysis/${analysisId}`);
};

/**
 * Supply a date the parser refused to guess (e.g. "within 30 days of signing"),
 * turning a flagged item into a real reminder.
 */
export const setReminderDueDate = async (
  reminderId: string,
  dueDate: string,
): Promise<void> => {
  await apiFetch(`/reminders/${reminderId}/due-date`, {
    method: "PUT",
    body: JSON.stringify({ dueDate }),
  });
};

export const getReminderPreferences =
  async (): Promise<ReminderPreferences> => {
    return apiFetch<ReminderPreferences>("/reminders/preferences");
  };

export const updateReminderPreferences = async (
  changes: Partial<ReminderPreferences>,
): Promise<ReminderPreferences> => {
  return apiFetch<ReminderPreferences>("/reminders/preferences", {
    method: "PUT",
    body: JSON.stringify(changes),
  });
};
