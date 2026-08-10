import fs from 'fs';
import os from 'os';

import Conf from 'conf';

/**
 * Persistent config store in the per-user app-data directory.
 *
 * NOT a keychain: `conf` writes a plain, unencrypted JSON file, so the JWT is
 * readable by anything that can read the file. The only protection is the file
 * mode, which `conf` leaves at the process umask default (typically 0644 —
 * world-readable on a shared machine). `restrictStorePermissions` below tightens
 * it to owner-only after every write; treat the token as plaintext on disk and
 * `unbind logout` when done on a machine you do not control.
 *
 * Config file lives at: ~/.config/unbindai-nodejs/config.json         (Linux)
 *                        ~/Library/Preferences/unbindai-nodejs/...    (macOS)
 *                        %APPDATA%\unbindai-nodejs\Config\...         (Windows)
 * (`conf` resolves these via env-paths, which appends the `-nodejs` suffix.)
 */
const store = new Conf({
  projectName: 'unbindai',
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
 * `conf` creates and rewrites the file with the default umask mode, so this has
 * to run after every write rather than once at startup. Best-effort by design:
 * POSIX modes are meaningless on Windows, and a chmod failure (odd filesystem,
 * missing file because nothing has been written yet) must never break the CLI.
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
  restrictStorePermissions();
};

/** Removes the stored JWT (logout). */
export const clearToken = () => {
  store.delete('token');
  restrictStorePermissions();
};

/**
 * Backend base URL.
 * Priority: UNBINDAI_API_URL env var > stored config > default deployed backend.
 */
export const getApiUrl = () =>
  process.env.UNBINDAI_API_URL ||
  (() => {
    const storedUrl = (store.get('apiUrl') || '').toString().replace(/\/$/, '');
    if (!storedUrl || storedUrl === 'http://localhost:8000' || storedUrl === 'http://127.0.0.1:8000') {
      return DEFAULT_API_URL;
    }
    return storedUrl;
  })();

/** Persists a custom API base URL. */
export const setApiUrl = (url) => {
  store.set('apiUrl', url.replace(/\/$/, ''));
  restrictStorePermissions();
};
