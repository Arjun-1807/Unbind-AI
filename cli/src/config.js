import fs from 'fs';
import os from 'os';

import Conf from 'conf';

/**
 * Persistent config store in the per-user app-data directory.
 *
 * NOT a keychain: `conf` writes a plain, unencrypted JSON file, so the JWT is
 * readable by anything that can read the file. The only protection is the file
 * mode. `configFileMode: 0o600` makes `conf` create both its temp file and the
 * final file owner-only, so the token is never on disk world-readable — not even
 * for the instant between write and chmod. Treat the token as plaintext on disk
 * and `unbind --logout` when done on a machine you do not control.
 *
 * Config file lives at: ~/.config/unbindai-nodejs/config.json         (Linux)
 *                        ~/Library/Preferences/unbindai-nodejs/...    (macOS)
 *                        %APPDATA%\unbindai-nodejs\Config\...         (Windows)
 * (`conf` resolves these via env-paths, which appends the `-nodejs` suffix.)
 */
const store = new Conf({
  projectName: 'unbindai',
  // conf@12 defaults to 0o666; without this the file is created world-readable
  // and only tightened afterwards, leaving a window where the JWT leaks.
  configFileMode: 0o600,
  schema: {
    token: {
      type: 'string',
      default: '',
    },
    apiUrl: {
      type: 'string',
      default: 'https://unbind-backend.vercel.app',
    },
  },
});

const DEFAULT_API_URL = 'https://unbind-backend.vercel.app';

/**
 * Restrict the config file to owner read/write (0600).
 *
 * Migration only: `configFileMode` above means anything this version writes is
 * already 0600, but a file left behind by an older version can still be 0644.
 * Best-effort by design: POSIX modes are meaningless on Windows, and a chmod
 * failure (odd filesystem, missing file because nothing has been written yet)
 * must never break the CLI.
 */
const restrictStorePermissions = () => {
  if (os.platform() === 'win32') return;
  try {
    fs.chmodSync(store.path, 0o600);
  } catch {
    // Nothing actionable — the value is still stored, just possibly readable
    // by other local users.
  }
};

// Lock down anything a previous version wrote with looser permissions.
restrictStorePermissions();

/** Returns the stored JWT (empty string if none). */
export const getToken = () => store.get('token');

/** Persists the JWT for future sessions, owner-readable only. */
export const setToken = (token) => {
  store.set('token', token);
};

/** Removes the stored JWT (logout). */
export const clearToken = () => {
  store.delete('token');
};

// ─── API base URL ─────────────────────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Validates a backend base URL and returns it normalised (no trailing slash).
 *
 * The CLI POSTs the user's email/password to this host and attaches the stored
 * JWT as a Bearer token on every request, so an attacker-supplied URL is a
 * credential-exfiltration primitive. Plaintext http is therefore only allowed
 * for loopback (local backend development); everything else must be https.
 *
 * Throws with an actionable message when the URL is unusable.
 */
export const validateApiUrl = (url) => {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error(`Invalid server URL: "${url}" — expected something like https://api.example.com`);
  }

  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to use insecure server URL: "${url}".\n` +
        '  → Credentials are sent to this host, so https is required.\n' +
        '  → Plain http is only allowed for localhost / 127.0.0.1.'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Unsupported server URL scheme "${parsed.protocol}" in "${url}" — use https.`
    );
  }

  return parsed.toString().replace(/\/$/, '');
};

// Per-invocation override set by `--server`. Deliberately NOT persisted: a URL
// pasted into a one-off command must not silently become the default forever.
let apiUrlOverride = null;

/** Sets the backend URL for this process only (the `--server` flag). */
export const setApiUrlOverride = (url) => {
  apiUrlOverride = validateApiUrl(url);
};

/**
 * Backend base URL.
 * Priority: --server override > UNBINDAI_API_URL env var > stored config >
 * default deployed backend. Every source is validated; a stored value written
 * by an older, unvalidated version falls back to the default rather than
 * throwing, so a bad config never bricks the CLI.
 */
export const getApiUrl = () => {
  if (apiUrlOverride) return apiUrlOverride;

  const envUrl = process.env.UNBINDAI_API_URL;
  if (envUrl) return validateApiUrl(envUrl);

  const storedUrl = (store.get('apiUrl') || '').toString().replace(/\/$/, '');
  if (!storedUrl || storedUrl === 'http://localhost:8000' || storedUrl === 'http://127.0.0.1:8000') {
    return DEFAULT_API_URL;
  }
  try {
    return validateApiUrl(storedUrl);
  } catch {
    return DEFAULT_API_URL;
  }
};

/** Persists a custom API base URL (`unbind config set-server <url>`). */
export const setApiUrl = (url) => {
  store.set('apiUrl', validateApiUrl(url));
};

/** Clears any persisted API base URL, reverting to the default backend. */
export const clearApiUrl = () => {
  store.delete('apiUrl');
};
