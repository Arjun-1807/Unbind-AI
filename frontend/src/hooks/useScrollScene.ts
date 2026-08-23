"use client";

import { useEffect, useRef } from "react";
import { observeScene, writeSceneVars, type SceneProgress } from "@/lib/scrollScene";

/**
 * Binds an element to the shared scroll driver (see lib/scrollScene).
 *
 * By default it writes `--enter` and `--exit` onto the node and lets CSS do
 * the rest; pass `apply` to compute something else. Either way React never
 * re-renders while scrolling.
 *
 * Detaches entirely under reduced motion, leaving the CSS defaults
 * (`--enter: 1`, `--exit: 0`) in place — which is the fully-arrived state.
 */
export function useScrollScene<T extends HTMLElement>(
  apply?: (progress: SceneProgress, el: HTMLElement) => void,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    return observeScene(el, (progress, node) => {
      (applyRef.current ?? writeSceneVars)(progress, node);
    });
  }, []);

  return ref;
}
