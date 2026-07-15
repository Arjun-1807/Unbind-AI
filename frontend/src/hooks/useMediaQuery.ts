"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query's match state. Returns `false` during SSR/first
 * paint so server and client markup agree; updates on the client once
 * `matchMedia` is available and stays in sync as the viewport resizes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
