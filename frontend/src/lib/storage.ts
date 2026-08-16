/**
 * SSR-safe Web Storage helpers. Every access is guarded with
 * `typeof window === "undefined"` (matching the pattern in services/api.ts) so
 * these can be imported anywhere without breaking server rendering, and reads
 * never throw on corrupt data or writes on quota/private-mode errors.
 *
 * The `*Storage` helpers use `localStorage`; the `*SessionStorage` helpers use
 * `sessionStorage` for values that should die with the tab (e.g. the analysis
 * being handed from one route to the next).
 */

type StorageKind = "local" | "session";

/**
 * The requested storage area, or null when it is unreachable. Merely *touching*
 * `window.localStorage` throws in some privacy modes, so even the lookup is
 * wrapped.
 */
function getArea(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const area = kind === "session" ? window.sessionStorage : window.localStorage;
    return area ?? null;
  } catch {
    return null;
  }
}

function read<T>(kind: StorageKind, key: string): T | null {
  const area = getArea(kind);
  if (!area) return null;
  try {
    const raw = area.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Write `value` (or remove the key when it is null/undefined).
 * Returns true when the value is durably stored, false when the write was
 * dropped — quota exceeded (a big `documentText` easily blows the ~5 MB cap),
 * private browsing, or no `window` at all. Callers that need the value back
 * later should treat false as "not cached" and fall back to refetching.
 */
function write<T>(kind: StorageKind, key: string, value: T | null): boolean {
  const area = getArea(kind);
  if (!area) return false;
  try {
    if (value == null) {
      area.removeItem(key);
    } else {
      area.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch {
    // Ignore write failures (quota exceeded, private browsing, etc.) — losing
    // a cached value is preferable to crashing the UI.
    return false;
  }
}

export function readStorage<T>(key: string): T | null {
  return read<T>("local", key);
}

export function writeStorage<T>(key: string, value: T | null): boolean {
  return write<T>("local", key, value);
}

export function readSessionStorage<T>(key: string): T | null {
  return read<T>("session", key);
}

export function writeSessionStorage<T>(key: string, value: T | null): boolean {
  return write<T>("session", key, value);
}
