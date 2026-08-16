import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readSessionStorage,
  readStorage,
  writeSessionStorage,
  writeStorage,
} from "@/lib/storage";

// Minimal localStorage stand-in — the vitest env is "node", so there is no
// real window/localStorage; we inject one to exercise the read/write paths.
function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe("storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: makeFakeStorage(),
      sessionStorage: makeFakeStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("round-trips an object through write then read", () => {
    writeStorage("k", { a: 1, b: ["x", "y"] });
    expect(readStorage<{ a: number; b: string[] }>("k")).toEqual({
      a: 1,
      b: ["x", "y"],
    });
  });

  it("returns null for a missing key", () => {
    expect(readStorage("nope")).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    (window.localStorage as ReturnType<typeof makeFakeStorage>).setItem(
      "bad",
      "{not json",
    );
    expect(readStorage("bad")).toBeNull();
  });

  it("removes the key when writing null", () => {
    writeStorage("k", { a: 1 });
    writeStorage("k", null);
    expect(readStorage("k")).toBeNull();
  });

  it("no-ops on the server (no window) without throwing", () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(() => writeStorage("k", { a: 1 })).not.toThrow();
    expect(writeStorage("k", { a: 1 })).toBe(false);
    expect(readStorage("k")).toBeNull();
  });

  it("round-trips through sessionStorage, separate from localStorage", () => {
    expect(writeSessionStorage("k", { a: 1 })).toBe(true);
    expect(readSessionStorage<{ a: number }>("k")).toEqual({ a: 1 });
    // The two areas must not alias each other.
    expect(readStorage("k")).toBeNull();
  });

  it("reports false instead of throwing when the quota is exceeded", () => {
    (window as unknown as { sessionStorage: { setItem: unknown } }).sessionStorage.setItem =
      () => {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      };
    // The caller uses the false to fall back to refetching by id.
    expect(writeSessionStorage("currentAnalysis", { documentText: "x" })).toBe(
      false,
    );
    expect(readSessionStorage("currentAnalysis")).toBeNull();
  });
});
