"use client";

import React from "react";
import { useScrollScene } from "@/hooks/useScrollScene";

/**
 * A block whose entrance — and optionally its exit — is tied to scroll
 * position rather than fired once by an IntersectionObserver.
 *
 * The difference is legible: a one-shot reveal plays its own timeline
 * regardless of how fast you are scrolling, so a quick flick shows content
 * mid-animation and a slow scroll shows it finished long before it reaches
 * the eye. Scrubbing the same motion from scroll position ties it to the
 * reader's hand, which is what makes a page feel driven rather than merely
 * decorated.
 *
 * `mode`:
 *   "lift"  — rises in, then lifts and fades as it clears the top. For solo
 *             moments that own the viewport.
 *   "hold"  — rises in and stays. For anything a reader may scroll back to.
 *   "unfold"— artwork tipped back and slightly small, righting itself as it
 *             arrives.
 */
export default function ScrollScene({
  children,
  className = "",
  mode = "hold",
}: {
  children: React.ReactNode;
  className?: string;
  mode?: "lift" | "hold" | "unfold";
}) {
  const ref = useScrollScene<HTMLDivElement>();
  const base = mode === "lift" ? "scene" : mode === "unfold" ? "unfold" : "scene--hold";

  return (
    <div ref={ref} className={`${base} ${className}`}>
      {children}
    </div>
  );
}
