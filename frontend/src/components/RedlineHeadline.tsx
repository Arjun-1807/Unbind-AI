"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type Phase = "before" | "striking" | "swapping" | "after";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The hero tagline performs the product's own trick on mount: a risky-sounding
 * fragment gets struck through in red, then swapped for the real copy — the
 * same red-strike/green-replace language used for clause rewrites elsewhere
 * in the product. Final DOM state matches today's static copy exactly, so
 * SSR, no-JS, and reduced-motion all render "Risks revealed." with no
 * animation dependency.
 */
export default function RedlineHeadline({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [phase, setPhase] = useState<Phase>(
    reducedMotion ? "after" : "before",
  );

  useEffect(() => {
    if (reducedMotion) {
      setPhase("after");
      return;
    }
    // Give each beat room to register: read the red phrase, watch it get
    // struck through, hold on the struck state, then a clear (not
    // simultaneous) fade-out/fade-in swap into the real copy.
    const timers = [
      setTimeout(() => setPhase("striking"), 1400),
      setTimeout(() => setPhase("swapping"), 1850),
      setTimeout(() => setPhase("after"), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  return (
    <h1 className={className} style={style}>
      Contracts decoded.
      <br />
      <span aria-hidden="true">
        Risks{" "}
        <span className="relative inline-grid">
          <AnimatePresence mode="wait" initial={false}>
            {phase !== "after" ? (
              <motion.span
                key="before"
                className="relative inline-block whitespace-nowrap"
                style={{ color: "var(--ln-danger)" }}
                initial={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                buried in fine print
                <motion.span
                  className="absolute left-0 top-1/2 h-[2px] origin-left"
                  style={{ background: "var(--ln-danger)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: phase === "before" ? 0 : 1 }}
                  transition={{ duration: 0.45, ease: EASE }}
                />
              </motion.span>
            ) : (
              <motion.span
                key="after"
                className="relative inline-block whitespace-nowrap"
                style={{ color: "#4ade80" }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}
              >
                revealed
                <motion.span
                  className="absolute -bottom-1 left-0 h-[2px] w-full origin-left"
                  style={{ background: "var(--ln-primary)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.5 }}
                />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        .
      </span>
      <span className="sr-only">Risks revealed.</span>
    </h1>
  );
}
