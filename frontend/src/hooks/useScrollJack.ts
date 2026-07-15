"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScrollJackResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 0-1 progress through the locked interaction. */
  progress: number;
  /** True while this section is intercepting scroll input. */
  locked: boolean;
}

/**
 * Hard scroll-jack: while the wrapped section is pinned in the viewport and
 * its internal progress hasn't reached 1, every wheel/touch/keyboard scroll
 * gesture is intercepted (preventDefault) and converted into progress
 * delta instead of moving the page. This guarantees the section cannot be
 * skipped by a fast scroll/fling/scrollbar-drag the way a pure CSS
 * `position: sticky` pin can — native scrolling only resumes once progress
 * reaches 1 (scrolling forward) or the user scrolls back up past 0.
 *
 * The container should render a tall spacer (e.g. via CSS) so there's a
 * natural place for the page to "sit" while progress is between 0 and 1;
 * this hook does not manage sizing, only the lock/progress state machine.
 */
// After progress reaches 1, hold the lock for this long before releasing so
// the last step's CSS transition (opacity/transform) has time to actually
// finish painting — otherwise a single large scroll delta can drive progress
// from "step 3 not arrived" straight past 1 and release native scroll before
// the browser ever paints step 3 in its revealed state.
const SETTLE_MS = 550;

// Cap how much progress a single scroll event can add, so one huge fling
// can't jump straight from "nothing revealed" to "everything revealed" in
// one frame — it still takes a handful of scroll ticks to traverse the
// whole flow, keeping the "reveal all 3 steps" feel even from a fast flick.
const MAX_STEP_DELTA = 0.35;

export function useScrollJack(sensitivity = 0.0016, disabled = false): ScrollJackResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [locked, setLocked] = useState(false);
  const progressRef = useRef(0);
  const lockedRef = useRef(false);
  const settlingRef = useRef(false);

  const setProgressBoth = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    progressRef.current = clamped;
    setProgress(clamped);
  }, []);

  useEffect(() => {
    // When disabled (e.g. below the breakpoint where the pinned layout no
    // longer fits one viewport), skip wiring up any interception entirely
    // and report the flow as fully revealed so callers render everything.
    if (disabled) {
      setProgressBoth(1);
      setLocked(false);
      return;
    }

    // Coming from a disabled pass (see above) leaves progress stuck at 1 —
    // reset it so the flow actually starts from the beginning once enabled,
    // instead of rendering every step already "arrived" on first paint.
    if (progressRef.current >= 1) {
      setProgressBoth(0);
    }

    const el = containerRef.current;
    if (!el) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const engageIfNeeded = () => {
      if (lockedRef.current || settlingRef.current) return;
      const rect = el.getBoundingClientRect();
      // Engage once the section's top has reached (or passed) the viewport
      // top while scrolling down, and progress isn't already complete —
      // i.e. the pinned content is exactly filling the viewport.
      const atPin = rect.top <= 1 && rect.bottom > window.innerHeight;
      if (atPin && progressRef.current < 1) {
        lockedRef.current = true;
        setLocked(true);
      }
    };

    const disengage = () => {
      lockedRef.current = false;
      settlingRef.current = false;
      setLocked(false);
    };

    // Reaching 1 (or 0) doesn't release the lock immediately — it keeps
    // intercepting scroll input (so the page can't move) for SETTLE_MS,
    // giving the final step's reveal transition time to actually paint.
    const finishForward = () => {
      setProgressBoth(1);
      if (settlingRef.current) return;
      settlingRef.current = true;
      settleTimer = setTimeout(() => {
        disengage();
        window.scrollBy({ top: 2, behavior: "auto" });
      }, SETTLE_MS);
    };

    const finishBackward = () => {
      setProgressBoth(0);
      if (settlingRef.current) return;
      settlingRef.current = true;
      settleTimer = setTimeout(() => {
        disengage();
        window.scrollBy({ top: -2, behavior: "auto" });
      }, SETTLE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      engageIfNeeded();
      if (!lockedRef.current) return;
      e.preventDefault();
      if (settlingRef.current) return; // absorb input silently while settling

      const rawDelta = e.deltaY * sensitivity;
      const delta = Math.min(MAX_STEP_DELTA, Math.max(-MAX_STEP_DELTA, rawDelta));
      const next = progressRef.current + delta;

      if (next >= 1) {
        finishForward();
        return;
      }
      if (next <= 0 && delta < 0) {
        finishBackward();
        return;
      }
      setProgressBoth(next);
    };

    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      engageIfNeeded();
      if (!lockedRef.current) return;
      e.preventDefault();
      if (settlingRef.current) return;

      const y = e.touches[0]?.clientY ?? touchStartY;
      const rawDelta = (touchStartY - y) * sensitivity * 2.2;
      const delta = Math.min(MAX_STEP_DELTA, Math.max(-MAX_STEP_DELTA, rawDelta));
      touchStartY = y;
      const next = progressRef.current + delta;

      if (next >= 1) {
        finishForward();
        return;
      }
      if (next <= 0 && delta < 0) {
        finishBackward();
        return;
      }
      setProgressBoth(next);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      engageIfNeeded();
      if (!lockedRef.current) return;
      const downKeys = ["ArrowDown", "PageDown", " "];
      const upKeys = ["ArrowUp", "PageUp"];
      if (!downKeys.includes(e.key) && !upKeys.includes(e.key)) return;
      e.preventDefault();
      if (settlingRef.current) return;

      const dir = downKeys.includes(e.key) ? 1 : -1;
      const next = progressRef.current + dir * 0.12;

      if (next >= 1) {
        finishForward();
        return;
      }
      if (next <= 0 && dir < 0) {
        finishBackward();
        return;
      }
      setProgressBoth(next);
    };

    // A plain scroll (not yet locked) can still bring the section into the
    // pin position — check on every scroll tick too so upward re-entry
    // (scrolling back up into a fully-revealed section) can re-engage.
    const onScroll = () => {
      if (progressRef.current >= 1) {
        // Re-engage in reverse only if the user scrolls back up to the
        // section's pin position with the flow already complete — allow
        // free scroll in that case; nothing to intercept once fully drawn.
        return;
      }
      engageIfNeeded();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [sensitivity, disabled, setProgressBoth]);

  return { containerRef, progress, locked };
}
