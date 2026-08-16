import fs from 'fs';
import path from 'path';
import { getToken, setToken, getApiUrl } from './config.js';

// ─── Timeouts ─────────────────────────────────────────────────────────────────

// undici (Node's fetch) has no default response timeout: a server that accepts
// the connection and then never replies would hang the spinner forever.
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 180_000; // analysis is slow — give the model room

/** True when a fetch rejection is our own AbortSignal.timeout() firing. */
const isTimeout = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError';

// ─── Cookie helper ────────────────────────────────────────────────────────────

/** A JWT is three base64url segments separated by dots. */
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * The backend sets an httpOnly cookie named "unbind_token".
 * We parse it from the Set-Cookie response header and store it as a
 * Bearer token so every subsequent request can authenticate.
 *
 * Only ever called for a successful login/signup response — any other endpoint
 * (or a hostile `--server` host answering 4xx) must not be able to pin a token
 * of its choosing into the local config or clobber a valid session. The shape
 * check is a second line of defence against storing arbitrary cookie junk.
 */
function extractTokenFromCookie(header) {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const match = raw.match(/unbind_token=([^;,\s]+)/);
  if (!match) return null;
  return JWT_RE.test(match[1]) ? match[1] : null;
}

/** Stores the session cookie from an authentication response, if present. */
function captureAuthToken(res) {
  const newToken = extractTokenFromCookie(res.headers.get('set-cookie'));
  if (newToken) setToken(newToken);
}

/** Endpoints allowed to (re)issue a session token. */
const AUTH_PATHS = new Set(['/auth/login', '/auth/signup']);

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
    res = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) {
      throw new Error(
        `UnBindAI server at ${getApiUrl()} timed out after ${REQUEST_TIMEOUT_MS / 1000}s (no response).`
      );
    }
    if (err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND') {
      throw new Error(
        `Cannot connect to UnBindAI server at ${getApiUrl()}.\n` +
          '  → Make sure the backend is running.\n' +
          '  → Override with: unbind --server https://your-server.com …\n' +
          '  → Or set the UNBINDAI_API_URL environment variable.'
      );
    }
    throw err;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.detail || data.error || data.message || `HTTP ${res.status}`
    );
  }

  // Capture the JWT only from a successful login / signup
  if (AUTH_PATHS.has(urlPath)) captureAuthToken(res);

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
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) {
      throw new Error(
        `UnBindAI server at ${getApiUrl()} timed out after ${UPLOAD_TIMEOUT_MS / 1000}s while analysing the document.`
      );
    }
    if (err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND') {
      throw new Error(
        `Cannot connect to UnBindAI server at ${getApiUrl()}.`
      );
    }
    throw err;
  }

  // Not an auth endpoint — never accept a session token from this response.

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
