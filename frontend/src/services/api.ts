import type { User, StoredAnalysis, AnalysisResponse } from "@/types";

const API_BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      (data && (data.detail || data.error || data.message)) ||
      `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ───

export const signup = async (
  username: string,
  email: string,
  password: string,
): Promise<User> => {
  return apiFetch<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
};

export const login = async (email: string, password: string): Promise<User> => {
  return apiFetch<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
};

export const logout = async (): Promise<void> => {
  await apiFetch("/auth/logout", { method: "POST" });
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    return await apiFetch<User>("/auth/me");
  } catch {
    return null;
  }
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
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.detail || data.error || `Upload failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoredAnalysis>;
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
): Promise<string> => {
  const data = await apiFetch<{ result: string }>("/analysis/simulate", {
    method: "POST",
    body: JSON.stringify({ documentText, scenario }),
  });
  return data.result;
};

export const deleteAnalysis = async (id: string): Promise<void> => {
  await apiFetch<{ ok: boolean }>(`/analysis/history/${id}`, {
    method: "DELETE",
  });
};

// ─── User Plan ───

export const getUserPlan = async (): Promise<{ plan: string | null; isPro: boolean }> => {
  return apiFetch<{ plan: string | null; isPro: boolean }>("/user/plan/");
};

export const activateUserPlan = async (plan: string): Promise<{ success: boolean; plan: string }> => {
  return apiFetch<{ success: boolean; plan: string }>("/user/plan/activate", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
};

export const cancelUserPlan = async (): Promise<{ success: boolean }> => {
  return apiFetch<{ success: boolean }>("/user/plan/cancel", {
    method: "POST",
  });
};
