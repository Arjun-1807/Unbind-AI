import Conf from 'conf';

/**
 * Persistent config store backed by the OS keychain/app-data directory.
 * Config file lives at: ~/.config/unbindai/config.json  (Linux)
 *                        ~/Library/Preferences/unbindai  (macOS)
 *                        %APPDATA%\unbindai\Config\       (Windows)
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
      default: 'http://localhost:8000',
    },
  },
});

/** Returns the stored JWT (empty string if none). */
export const getToken = () => store.get('token');

/** Persists the JWT for future sessions. */
export const setToken = (token) => store.set('token', token);

/** Removes the stored JWT (logout). */
export const clearToken = () => store.delete('token');

/**
 * Backend base URL.
 * Priority: UNBINDAI_API_URL env var > stored config > default localhost.
 */
export const getApiUrl = () =>
  process.env.UNBINDAI_API_URL ||
  store.get('apiUrl') ||
  'http://localhost:8000';

/** Persists a custom API base URL. */
export const setApiUrl = (url) => store.set('apiUrl', url.replace(/\/$/, ''));
