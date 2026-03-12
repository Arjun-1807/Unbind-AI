import fs from 'fs';
import path from 'path';
import { getToken, setToken, getApiUrl } from './config.js';

// ─── Cookie helper ────────────────────────────────────────────────────────────

/**
 * The backend sets an httpOnly cookie named "unbind_token".
 * We parse it from the Set-Cookie response header and store it as a
 * Bearer token so every subsequent request can authenticate.
 */
function extractTokenFromCookie(header) {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const match = raw.match(/unbind_token=([^;,\s]+)/);
  return match ? match[1] : null;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch(urlPath, options = {}) {
  const url = `${getApiUrl()}/api${urlPath}`;
  const token = getToken();

  const headers = { ...options.headers };
  if (token) {
    // The backend accepts both cookies AND Authorization: Bearer <token>
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    if (err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND') {
      throw new Error(
        `Cannot connect to UnBindAI server at ${getApiUrl()}.\n` +
          '  → Make sure the backend is running.\n' +
          '  → Override with: unbind --server http://your-server:8000 …\n' +
          '  → Or set the UNBINDAI_API_URL environment variable.'
      );
    }
    throw err;
  }

  // Capture the JWT when the server sets a new cookie (login / signup)
  const setCookie = res.headers.get('set-cookie');
  const newToken = extractTokenFromCookie(setCookie);
  if (newToken) setToken(newToken);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.detail || data.error || data.message || `HTTP ${res.status}`
    );
  }

  return res.json();
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export async function login(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function signup(username, email, password) {
  return apiFetch('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
}

/** Validates the stored token; throws if not authenticated. */
export async function getMe() {
  return apiFetch('/auth/me');
}

/** Returns { plan, isPro } for the current authenticated user. */
export async function getUserPlan() {
  return apiFetch('/user/plan/');
}

// ─── Analysis endpoints ───────────────────────────────────────────────────────

/**
 * Upload a PDF (or text file) to POST /api/analysis/upload and return the
 * full StoredAnalysis object.  Works with Node 18+ built-in fetch + Blob.
 */
export async function uploadAndAnalyze(filePath, role = '') {
  const content = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const mimeType = fileName.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'text/plain';

  // Node 18+ ships Blob and FormData globally
  const blob = new Blob([content], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('role', role);

  const url = `${getApiUrl()}/api/analysis/upload`;
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: form });
  } catch (err) {
    if (err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND') {
      throw new Error(
        `Cannot connect to UnBindAI server at ${getApiUrl()}.`
      );
    }
    throw err;
  }

  const setCookie = res.headers.get('set-cookie');
  const newToken = extractTokenFromCookie(setCookie);
  if (newToken) setToken(newToken);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.detail || data.error || `Upload failed: HTTP ${res.status}`
    );
  }

  return res.json();
}

/**
 * POST /api/analysis/simulate  — free-form AI question against the document.
 * Returns { result: string }.
 */
export async function askQuestion(documentText, question) {
  return apiFetch('/analysis/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText, scenario: question }),
  });
}

/** GET /api/analysis/history — returns all stored analyses for the user. */
export async function getAnalysisHistory() {
  return apiFetch('/analysis/history');
}

/** GET /api/analysis/history/:id — returns a single stored analysis. */
export async function getAnalysisById(id) {
  return apiFetch(`/analysis/history/${id}`);
}
