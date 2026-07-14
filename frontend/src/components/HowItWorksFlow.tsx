"use client";

import React from "react";
import { useScrollProgress } from "@/hooks/useScrollProgress";

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
 * "How it works" as a connected flow: an SVG path winds between the three
 * step nodes and draws itself in (via stroke-dashoffset) as the section
 * scrolls through the viewport. Each step's content fades/rises in once the
 * drawing line reaches its node, so the steps feel like stations along one
 * continuous path rather than three unrelated cards.
 *
 * The path itself is decorative chrome; the mockups passed in via `steps`
 * are rendered unchanged.
 */
export default function HowItWorksFlow({ steps }: HowItWorksFlowProps) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  // Path travels roughly 8% -> 92% of scroll progress through the section;
  // outside that band it's fully hidden / fully drawn.
  const PATH_START = 0.08;
  const PATH_END = 0.92;
  const drawT = Math.min(
    1,
    Math.max(0, (progress - PATH_START) / (PATH_END - PATH_START)),
  );

  // Each step "arrives" at an even fraction along the drawn path.
  const stepThresholds = steps.map((_, i) => (i + 0.5) / steps.length);

  return (
    <div ref={ref} className="relative">
      {/* ── Desktop: zigzag path connecting three nodes left/center/right ── */}
      <div className="relative hidden md:block" aria-hidden="true">
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
              transition: "stroke-dashoffset 0.05s linear",
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

      <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
        {steps.map((s, i) => {
          const arrived = drawT >= stepThresholds[i] - 0.05;
          return (
            <div
              key={i}
              className="text-center transition-all duration-700 ease-out"
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

      {/* ── Mobile: simple vertical connector between stacked steps ── */}
      <div
        className="pointer-events-none absolute left-1/2 top-9 -z-10 block w-[2px] md:hidden"
        style={{
          height: "calc(100% - 36px)",
          background: "var(--ln-hairline-strong)",
          transform: "translateX(-50%)",
        }}
        aria-hidden="true"
      >
        <div
          className="w-full"
          style={{
            height: `${drawT * 100}%`,
            background: "var(--ln-primary)",
            boxShadow: "0 0 8px rgba(94,106,210,0.6)",
            transition: "height 0.05s linear",
          }}
        />
      </div>
    </div>
  );
}
