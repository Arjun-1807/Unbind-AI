"use client";

import { useEffect, useRef } from "react";

/**
 * Reports how far the page has scrolled through `targetRef` (or the whole
 * document, if no ref is given) as a 0→1 value.
 *
 * The value is delivered through a callback rather than React state on
 * purpose. A scroll-linked value changes on nearly every frame, and routing
 * that through `useState` re-renders the subtree sixty times a second for
 * what is almost always a single CSS custom property. Callers write the
 * number straight onto a DOM node instead, and call `setState` only on the
 * rare frames where something discrete actually changes — which stage is
 * active, say.
 *
 * Measurements are coalesced into one `requestAnimationFrame` per frame, so a
 * burst of scroll events collapses to a single `getBoundingClientRect`.
 *
 * @param targetRef Element whose scroll range to measure. Omit for the document.
 * @param onProgress Called with the clamped 0→1 progress. Keep it cheap: it
 *   runs inside a rAF callback. Held in a ref, so an inline arrow is fine and
 *   will not re-subscribe the listeners.
 * @param enabled Set false to detach entirely (mobile, reduced motion).
 */
export function useScrollProgress(
  targetRef: React.RefObject<HTMLElement | null> | null,
  onProgress: (progress: number) => void,
  enabled = true,
): void {
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      let progress: number;

      if (targetRef) {
        const el = targetRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Travel is the element's overflow beyond one viewport — the
        // distance its top edge moves while it stays pinned.
        const travel = rect.height - window.innerHeight;
        progress = travel <= 0 ? 1 : -rect.top / travel;
      } else {
        const doc = document.documentElement;
        const travel = doc.scrollHeight - window.innerHeight;
        progress = travel <= 0 ? 0 : window.scrollY / travel;
      }

      callbackRef.current(Math.min(1, Math.max(0, progress)));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetRef, enabled]);
}
