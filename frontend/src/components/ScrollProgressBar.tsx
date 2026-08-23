"use client";

import { useRef } from "react";
import { useScrollProgress } from "@/hooks/useScrollProgress";

/**
 * Hairline reading-progress indicator pinned above the header.
 *
 * Progress is written to a CSS variable on the bar itself and expressed as a
 * `scaleX`, so each frame costs one compositor transform and no React render.
 */
export default function ScrollProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);

  useScrollProgress(null, (p) => {
    barRef.current?.style.setProperty("--p", String(p));
  });

  return <div ref={barRef} className="ln-progress" aria-hidden="true" />;
}
