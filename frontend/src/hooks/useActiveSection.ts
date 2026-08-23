"use client";

import { useEffect, useState } from "react";

/**
 * Reports which of `ids` is the section the reader is currently looking at,
 * so a section nav can highlight it.
 *
 * The observer's `rootMargin` collapses the viewport down to a thin band just
 * below the sticky header. Watching the whole viewport instead would keep
 * three sections "visible" at once on a tall screen and make the highlight
 * jitter between them; a band answers the question the nav actually asks —
 * what is under the header right now.
 *
 * Ties are broken by position in `ids` rather than by intersection ratio: the
 * ratio flips back and forth mid-scroll, document order does not.
 *
 * Pass an empty array to detach entirely (the nav isn't rendered on routes
 * that have no sections).
 *
 * @param ids Element ids to watch, in document order.
 * @returns The active id, or null before the reader reaches the first section.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  // `ids` is almost always a fresh array literal, so depend on its contents
  // rather than its identity or the observer is torn down every render.
  const key = ids.join(",");

  useEffect(() => {
    const watched = key ? key.split(",") : [];
    if (watched.length === 0 || typeof IntersectionObserver === "undefined") {
      setActive(null);
      return;
    }

    const elements = watched
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(watched.find((id) => visible.has(id)) ?? null);
      },
      { rootMargin: "-72px 0px -75% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}
