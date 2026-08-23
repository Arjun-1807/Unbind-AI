"use client";

import { useEffect } from "react";

/**
 * Tracks the pointer across `ref` and publishes its position as the `--mx` /
 * `--my` custom properties, plus a `data-glow` flag while the pointer is
 * inside. Pair with the `.spotlight` class in globals.css.
 *
 * Coordinates are written directly to the node — never through state — so
 * moving the mouse repaints one composited overlay instead of re-rendering
 * a React subtree. Updates are coalesced to one per animation frame.
 *
 * Only attaches for devices with a real hover-capable pointer: on a
 * touchscreen the effect can never be seen, and the listeners would fire on
 * every scroll-drag for nothing.
 */
export function usePointerGlow(ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onEnter = () => el.setAttribute("data-glow", "on");
    const onLeave = () => el.removeAttribute("data-glow");

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
