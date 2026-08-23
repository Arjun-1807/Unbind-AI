"use client";

import React, { useEffect, useRef } from "react";

/**
 * Gives its child a slight pointer-tracked parallax tilt.
 *
 * Rotation is published as `--rx` / `--ry` custom properties and consumed by
 * the `.tilt` class, so a pointer move updates two variables and the
 * compositor re-transforms one already-rasterised layer — no React render, no
 * layout, no paint. Updates are coalesced to one per frame.
 *
 * Skipped entirely without a fine hover-capable pointer (a tilt nobody can
 * see is not worth a `pointermove` listener on every scroll-drag) and under
 * reduced motion.
 */
export default function TiltPanel({
  children,
  max = 2.5,
  className = "",
}: {
  children: React.ReactNode;
  /** Peak rotation in degrees at the panel's edge. */
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let rx = 0;
    let ry = 0;

    const paint = () => {
      frame = 0;
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (event.clientX - rect.left) / rect.width - 0.5;
      const dy = (event.clientY - rect.top) / rect.height - 0.5;
      ry = dx * max * 2;
      rx = -dy * max * 2;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onEnter = () => el.setAttribute("data-tilting", "true");
    const onLeave = () => {
      el.removeAttribute("data-tilting");
      rx = 0;
      ry = 0;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
