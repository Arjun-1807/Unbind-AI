import type {
  User,
  StoredAnalysis,
  AnalysisResponse,
  LawyerProfile,
  AnalysisProgressEvent,
  Citation,
  SimulationResult,
} from "@/types";

const API_BASE = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api`;
// Streaming (SSE) requests must bypass the Next.js rewrite proxy used by
// API_BASE — rewrites buffer the whole response before forwarding it, which
// defeats incremental progress events. Hit the backend origin directly.
// NEXT_PUBLIC_BACKEND_ORIGIN is injected by next.config.mjs from the same
// BACKEND_API_URL the rewrite uses, so both paths always agree.
const STREAM_API_BASE = process.env.NEXT_PUBLIC_BACKEND_ORIGIN || "http://localhost:8000";
const ACCESS_TOKEN_KEY = "unbind_access_token";

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

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function storeAccessToken(token?: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

function withAuthHeader(init?: RequestInit): RequestInit {
  const token = getStoredAccessToken();
  if (!token) return init || {};
  return {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit = withAuthHeader(init);
  const method = (requestInit?.method || "GET").toUpperCase();
  const shouldSetJsonHeader = method !== "GET" && !(requestInit?.body instanceof FormData);
  const headers = {
    ...(shouldSetJsonHeader ? { "Content-Type": "application/json" } : {}),
    ...(requestInit?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...requestInit,
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
  storeAccessToken(user.accessToken);
  return user;
};

export const login = async (email: string, password: string): Promise<User> => {
  const user = await apiFetch<User & { accessToken?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  storeAccessToken(user.accessToken);
  return user;
};

export const logout = async (): Promise<void> => {
  await apiFetch("/auth/logout", { method: "POST" });
  storeAccessToken(null);
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const user = await apiFetch<User & { accessToken?: string }>("/auth/me");
    // Re-hydrate the stored token on every page load
    if (user?.accessToken) storeAccessToken(user.accessToken);
    return user;
  } catch (error) {
    // Only clear the stored token when the server actually rejected auth;
    // a network/other error shouldn't log the user out locally.
    if (error instanceof ApiError && error.status === 401) {
      storeAccessToken(null);
    }
    return null;
  }
};

export const googleLogin = async (credential: string): Promise<User> => {
  const user = await apiFetch<User & { accessToken?: string }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
  storeAccessToken(user.accessToken);
  return user;
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
  const requestInit = withAuthHeader({
    method: "POST",
    credentials: "include",
    body: form,
  });
  const res = await fetch(`${API_BASE}/analysis/upload`, {
    ...requestInit,
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
  const requestInit = withAuthHeader({
    method: "POST",
    credentials: "include",
    body: form,
  });
  const res = await fetch(
    `${STREAM_API_BASE}/api/analysis/upload/stream`,
    requestInit,
  );
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

export const getUserAnalyses = async (): Promise<StoredAnalysis[]> => {
  return apiFetch<StoredAnalysis[]>("/analysis/history");
};

export const getAnalysisById = async (id: string): Promise<StoredAnalysis> => {
  return apiFetch<StoredAnalysis>(`/analysis/history/${id}`);
};

export const simulateImpact = async (
  documentText: string,
  scenario: string,
): Promise<SimulationResult> => {
  const data = await apiFetch<{ result: string; citations?: Citation[] }>(
    "/analysis/simulate",
    {
      method: "POST",
      body: JSON.stringify({ documentText, scenario }),
    },
  );
  return { answer: data.result, citations: data.citations ?? [] };
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
