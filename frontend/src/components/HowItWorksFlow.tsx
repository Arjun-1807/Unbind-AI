"use client";

import React from "react";
import { useScrollJack } from "@/hooks/useScrollJack";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface Step {
  step: string;
  title: string;
  desc: string;
  mockup: React.ReactNode;
}

interface HowItWorksFlowProps {
  steps: Step[];
}

/**
 * "How it works" as a hard scroll-jacked flow: once this section reaches
 * the top of the viewport, native page scrolling is intercepted and every
 * scroll/swipe/arrow-key gesture instead drives an SVG path drawing itself
 * in and lighting up each step in turn. Because scroll input is captured
 * directly (see useScrollJack) rather than relying on scrollTop position,
 * no scroll speed — fast wheel flick, trackpad swipe, scrollbar drag — can
 * skip past the section before all three steps have revealed. Native
 * scrolling resumes automatically the instant the flow completes.
 *
 * A single-viewport pin only fits when the 3-column grid is active. Below
 * `md`, the steps stack in one column and are far taller than any phone or
 * small-tablet viewport, so pinning there just clips/overlaps content
 * instead of revealing it. Below `md` we render a plain stacked layout with
 * a simple scroll-in reveal per step instead of pinning at all.
 *
 * The mockups passed in via `steps` are rendered unchanged; only the
 * surrounding reveal mechanism is new.
 */
export default function HowItWorksFlow({ steps }: HowItWorksFlowProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { containerRef, progress: drawT, locked } = useScrollJack(0.0016, !isDesktop);
  const revealRef = React.useRef<HTMLDivElement | null>(null);
  useScrollReveal(revealRef, [isDesktop]);

  // Each step "arrives" at an even fraction along the drawn path.
  const stepThresholds = steps.map((_, i) => (i + 0.5) / steps.length);
  const allArrived = drawT >= stepThresholds[stepThresholds.length - 1] - 0.02;

  if (!isDesktop) {
    return (
      <div ref={revealRef} className="py-4">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-semibold text-ink tracking-tight">How it works</h2>
          <p className="mt-4 text-base text-ink-subtle">Three steps to contract clarity</p>
        </div>

        <div className="relative flex flex-col gap-14">
          <div
            className="pointer-events-none absolute left-1/2 top-9 -z-10 w-0.5"
            style={{
              height: "calc(100% - 72px)",
              background: "var(--ln-hairline-strong)",
              transform: "translateX(-50%)",
            }}
            aria-hidden="true"
          />

          {steps.map((s, i) => (
            <div key={i} className="reveal text-center" style={{ ["--i" as string]: i }}>
              <div
                className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  background: "var(--ln-primary)",
                  color: "#fff",
                  border: "1px solid var(--ln-primary)",
                }}
              >
                {i + 1}
              </div>
              <div className="lift mb-6 flex justify-center">{s.mockup}</div>
              <h3 className="text-lg font-medium text-ink mb-2">{s.title}</h3>
              <p className="text-ink-subtle text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    // Tall spacer so there's room in the document flow for the pinned
    // content; height matters less than with a pure-CSS sticky pin since
    // useScrollJack drives progress directly rather than from scrollTop,
    // but it still needs to exceed one viewport so the pin has somewhere
    // to "release" into once the flow completes.
    <div ref={containerRef} className="relative" style={{ height: "160vh" }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center py-12">
        <div className="mb-16 text-center sm:mb-24">
          <h2 className="text-2xl sm:text-4xl font-semibold text-ink tracking-tight">How it works</h2>
          <p className="mt-4 text-base sm:text-lg text-ink-subtle">
            {allArrived ? "Three steps to contract clarity" : "Scroll to reveal each step"}
          </p>
        </div>

        <div className="relative">
          {/* ── Desktop: zigzag path connecting three nodes left/center/right ── */}
          <div className="relative" aria-hidden="true">
            <svg
              viewBox="0 0 1200 160"
              preserveAspectRatio="none"
              className="pointer-events-none absolute left-0 top-[52px] h-[2px] w-full overflow-visible"
            >
              <path
                d="M 150 20 C 350 20, 350 140, 600 140 C 850 140, 850 20, 1050 20"
                fill="none"
                stroke="var(--ln-hairline-strong)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M 150 20 C 350 20, 350 140, 600 140 C 850 140, 850 20, 1050 20"
                fill="none"
                stroke="var(--ln-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1 - drawT,
                  filter: "drop-shadow(0 0 4px rgba(94,106,210,0.6))",
                }}
              />
              {/* Node dots that light up as the line reaches them */}
              {[150, 600, 1050].map((cx, i) => {
                const cy = i === 1 ? 140 : 20;
                const lit = drawT >= stepThresholds[i] - 0.02;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={lit ? 7 : 5}
                    fill={lit ? "var(--ln-primary)" : "var(--ln-surface-2)"}
                    stroke={lit ? "var(--ln-primary)" : "var(--ln-hairline-strong)"}
                    strokeWidth="2"
                    style={{
                      transition: "r 0.3s ease, fill 0.3s ease, stroke 0.3s ease",
                      filter: lit ? "drop-shadow(0 0 6px rgba(94,106,210,0.7))" : "none",
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {steps.map((s, i) => {
              const arrived = drawT >= stepThresholds[i] - 0.05;
              return (
                <div
                  key={i}
                  className="text-center transition-all duration-500 ease-out"
                  style={{
                    opacity: arrived ? 1 : 0.25,
                    transform: arrived ? "translateY(0)" : "translateY(18px)",
                  }}
                >
                  <div
                    className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-500"
                    style={{
                      background: arrived ? "var(--ln-primary)" : "var(--ln-surface-2)",
                      color: arrived ? "#fff" : "var(--ln-ink-tertiary)",
                      border: `1px solid ${arrived ? "var(--ln-primary)" : "var(--ln-hairline-strong)"}`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="lift mb-6 flex justify-center">{s.mockup}</div>
                  <h3 className="text-lg font-medium text-ink mb-2">{s.title}</h3>
                  <p className="text-ink-subtle text-sm leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scroll-to-continue hint — visible only while locked and incomplete */}
        <div
          className="mt-10 flex flex-col items-center gap-1.5 transition-opacity duration-300"
          style={{ opacity: locked && !allArrived ? 1 : 0 }}
          aria-hidden={!locked || allArrived}
        >
          <span className="text-xs text-ink-tertiary">Keep scrolling</span>
          <svg
            className="h-4 w-4 animate-bounce text-ink-tertiary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
