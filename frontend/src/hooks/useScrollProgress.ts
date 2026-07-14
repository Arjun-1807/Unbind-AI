"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks how far a section has been scrolled through, as a 0-to-1 progress
 * value: 0 when the section's top just enters the viewport bottom, 1 when
 * its bottom reaches the viewport top. Used to drive scroll-linked effects
 * (e.g. an SVG path drawing in as the user scrolls past a section) rather
 * than the one-shot on/off reveal that IntersectionObserver-only approaches
 * give you.
 *
 * Returns a ref to attach to the tracked section and the live progress value.
 * Updates are throttled to animation frames via requestAnimationFrame.
 */
export function useScrollProgress<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  progress: number;
} {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      frameRef.current = null;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      // Progress 0 = section top at viewport bottom; 1 = section bottom at viewport top.
      const total = rect.height + viewportH;
      const traveled = viewportH - rect.top;
      const raw = total > 0 ? traveled / total : 0;
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const onScroll = () => {
      if (frameRef.current == null) {
        frameRef.current = requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { ref, progress };
}
