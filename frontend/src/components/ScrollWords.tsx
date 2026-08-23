"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { observeScene } from "@/lib/scrollScene";

/**
 * Text that resolves word by word as it rises through the viewport, and lifts
 * away again as it leaves.
 *
 * Each word is its own inline-block carrying an index. The component writes
 * two numbers per frame onto the wrapper — `--reveal` (how far the reading
 * head has travelled) and `--exit` (how far the block has left) — and every
 * word derives its own opacity and offset from those in CSS. A thirty-word
 * sentence therefore costs two property writes per frame, not sixty style
 * mutations, and React never re-renders while scrolling.
 *
 * Measurement comes from the shared scroll driver, so this adds no listener
 * of its own and its rectangle is read in the same batched pass as every
 * other animated block on the page.
 *
 * Renders fully opaque and in place without JavaScript: the custom properties
 * default to the arrived state in CSS, so crawlers and a failed hydration see
 * finished text.
 */
export default function ScrollWords({
  text,
  className = "",
  as: Tag = "p",
  feather = 6,
}: {
  text: string;
  className?: string;
  /** Element to render. Use a heading tag where the text is a heading. */
  as?: "h1" | "h2" | "h3" | "p" | "div";
  /** How many words wide the fade-in front is. Lower = crisper wipe. */
  feather?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  // A callback ref rather than a ref object: `Tag` is a union of intrinsic
  // elements, so a RefObject would need casting to satisfy every member of
  // that union. A callback taking the common HTMLElement supertype does not.
  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);

  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    return observeScene(el, ({ enter, exit }, node) => {
      node.style.setProperty("--reveal", enter.toFixed(4));
      node.style.setProperty("--exit", exit.toFixed(4));
    });
  }, [text]);

  return (
    <Tag
      ref={setRef}
      className={`words ${className}`}
      style={{ ["--n" as string]: words.length, ["--feather" as string]: feather }}
    >
      {words.map((word, i) => (
        <React.Fragment key={`${word}-${i}`}>
          <span className="word" style={{ ["--i" as string]: i }}>
            {word}
          </span>{" "}
        </React.Fragment>
      ))}
    </Tag>
  );
}
