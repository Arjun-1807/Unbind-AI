"use client";

import React from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export interface PipelineStage {
  /** Short taxonomy label, e.g. "Ingest". */
  label: string;
  title: string;
  desc: string;
  /** Technical detail line, set in mono under the copy. */
  meta: string;
  /** Caption strip along the bottom of the viewport panel. */
  readout: string;
  visual: React.ReactNode;
}

/** Viewport-heights of scroll spent on each stage while the section is pinned. */
const DWELL_VH = 60;

/**
 * "How it works" as a scroll-scrubbed pipeline.
 *
 * The section pins for its duration while a progress spine fills down the
 * left rail, the stage copy lights up in turn, and a single large viewport
 * panel cross-dissolves between the three product visuals. The previous
 * version put all three steps side by side and merely faded them from 25% to
 * 100% opacity, which spent two screens of scroll on a dimmer and left each
 * visual too small to read; giving one panel the whole right-hand column
 * roughly doubles the size of the artwork the visitor actually came to see.
 *
 * How this stays smooth:
 *
 * * One rAF-coalesced scroll listener for the whole section.
 * * The continuous value (0→1 progress) is written straight to a CSS
 *   variable on the rail. React never re-renders on it.
 * * `setState` fires only when the *stage index* changes — three times over
 *   the section, not sixty times a second.
 * * The rail beam and its travelling head are both pure `transform`s driven
 *   by that one variable, so scrolling costs a compositor transform and
 *   nothing else.
 * * Nothing here captures scroll input. The scrollbar, keyboard, and
 *   find-in-page all behave exactly as they would on a static page.
 *
 * Below `md`, and whenever reduced motion is requested, the pin is dropped
 * entirely for a plain stacked list — the stages are taller than a phone
 * viewport, so pinning there would clip content rather than reveal it.
 */
export default function HowItWorksPipeline({ stages }: { stages: PipelineStage[] }) {
  // Height matters as much as width here: the pinned layout has to fit a
  // heading, three stages of copy and a framed panel inside one viewport, and
  // on a short laptop screen it simply does not. Below 700px tall we fall back
  // to the stacked list rather than clipping the artwork.
  const isDesktop = useMediaQuery("(min-width: 768px) and (min-height: 700px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pinned = isDesktop && !reducedMotion;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const railRef = React.useRef<HTMLDivElement>(null);
  const stackRef = React.useRef<HTMLDivElement>(null);

  const [active, setActive] = React.useState(0);
  const activeRef = React.useRef(0);

  useScrollReveal(stackRef, [pinned]);

  useScrollProgress(
    containerRef,
    (p) => {
      // Continuous: straight to the DOM, no render.
      railRef.current?.style.setProperty("--p", String(p));
      // Discrete: state, but only on the frames where it actually changes.
      const next = Math.min(stages.length - 1, Math.floor(p * stages.length));
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
      }
    },
    pinned,
  );

  /**
   * `.reveal` is only safe in the stacked branch. The pinned branch mounts
   * *after* first paint (useMediaQuery reports false during SSR, then flips),
   * and the page-level reveal observer has already finished its scan by then
   * — so a `.reveal` node appearing here would never be observed and would
   * sit at opacity 0 forever. The pinned heading is on screen the moment the
   * section is reached anyway, so it needs no entrance of its own.
   */
  const heading = (revealClass: string, spacing: string) => (
    <div className={`${revealClass} ${spacing} max-w-2xl`}>
      <p className="t-label">How it works</p>
      <h2 className="t-section mt-3 text-ink">From a PDF to a plan of action</h2>
      <p className="t-lead mt-3 text-ink-subtle">
        Three stages, about two minutes, no legal training required.
      </p>
    </div>
  );

  /* ── Stacked fallback: mobile and reduced motion ─────────────── */
  if (!pinned) {
    return (
      <div ref={stackRef} className="ln-section">
        {heading("reveal reveal--blur", "mb-14 sm:mb-20")}
        <ol className="flex flex-col gap-12">
          {stages.map((stage, i) => (
            <li key={stage.label} className="reveal" style={{ ["--i" as string]: i }}>
              <div className="mb-4 flex items-center gap-3">
                <StageChip index={i} active />
                <span className="font-mono text-xs uppercase tracking-widest text-primary">
                  {stage.label}
                </span>
              </div>
              <h3 className="text-lg font-medium text-ink">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-subtle">{stage.desc}</p>
              <p className="mt-2 font-mono text-[11px] text-ink-tertiary">{stage.meta}</p>
              <div className="mt-5">
                <ViewportPanel
                  index={i}
                  total={stages.length}
                  readout={stage.readout}
                  sweepKey={`static-${i}`}
                >
                  {stage.visual}
                </ViewportPanel>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  /* ── Pinned, scroll-scrubbed ─────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: `calc(100vh + ${stages.length * DWELL_VH}vh)` }}
    >
      <div
        ref={stackRef}
        className="sticky top-0 flex h-screen flex-col justify-center py-10"
      >
        {heading("", "mb-8 xl:mb-12")}

        <div className="grid grid-cols-12 items-center gap-10 lg:gap-16">
          {/* Stage rail + copy */}
          <ol className="relative col-span-5 pl-8">
            <div ref={railRef} className="rail">
              <div className="rail__beam" />
              <div className="rail__carrier">
                <span className="rail__head" />
              </div>
            </div>

            {stages.map((stage, i) => {
              const isActive = i === active;
              return (
                <li
                  key={stage.label}
                  className="py-3.5 transition-opacity duration-500 xl:py-5"
                  style={{ opacity: isActive ? 1 : 0.38 }}
                >
                  <div className="mb-2 flex items-center gap-3">
                    <StageChip index={i} active={isActive} />
                    <span
                      className="font-mono text-xs uppercase tracking-widest transition-colors duration-500"
                      style={{
                        color: isActive ? "var(--ln-primary-hover)" : "var(--ln-ink-tertiary)",
                      }}
                    >
                      {stage.label}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-ink xl:text-xl">{stage.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-subtle">{stage.desc}</p>
                  <p className="mt-2 font-mono text-[11px] text-ink-tertiary">{stage.meta}</p>
                </li>
              );
            })}
          </ol>

          {/* One viewport, three cross-dissolving layers */}
          <div className="col-span-7">
            <ViewportPanel
              index={active}
              total={stages.length}
              readout={stages[active].readout}
              sweepKey={`stage-${active}`}
            >
              {/* Sized against viewport height as well as width. The layers
                  are absolutely stacked so they cross-dissolve in place, which
                  means they cannot grow the frame — the frame has to be at
                  least as tall as the tallest artwork or the panel's
                  overflow:hidden would crop it. Tying both dimensions to vh
                  keeps that relationship true on every screen instead of only
                  on the one it was designed against. */}
              <div className="relative min-h-[min(20rem,34vh)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(60% 55% at 50% 45%, color-mix(in srgb, var(--ln-primary) 10%, transparent), transparent 70%)",
                  }}
                />
                {stages.map((stage, i) => (
                  <div
                    key={stage.label}
                    className="stage-layer absolute inset-0 flex items-center justify-center"
                    data-active={i === active}
                    aria-hidden={i !== active}
                  >
                    <div className="w-full max-w-[min(32rem,52vh)]">{stage.visual}</div>
                  </div>
                ))}
              </div>
            </ViewportPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageChip({ index, active }: { index: number; active: boolean }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-all duration-500"
      style={{
        background: active ? "var(--ln-primary)" : "transparent",
        color: active ? "#fff" : "var(--ln-ink-tertiary)",
        border: `1px solid ${active ? "var(--ln-primary)" : "var(--ln-hairline-strong)"}`,
        boxShadow: active
          ? "0 0 18px -2px color-mix(in srgb, var(--ln-primary) 65%, transparent)"
          : "none",
      }}
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

/**
 * The framed "instrument panel" the stage visuals sit inside: a mono header
 * strip, the artwork, and a readout caption. `sweepKey` remounts the scan
 * element so its one-shot light pass replays whenever the stage changes.
 */
function ViewportPanel({
  index,
  total,
  readout,
  sweepKey,
  children,
}: {
  index: number;
  total: number;
  readout: string;
  sweepKey: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lit-edge relative overflow-hidden rounded-2xl border border-hairline bg-surface-1">
      <span key={sweepKey} className="scan-sweep" aria-hidden="true" />

      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="font-mono text-[11px] tracking-widest text-ink-tertiary">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-tertiary">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--ln-success-bright)",
              boxShadow: "0 0 8px var(--ln-success-bright)",
            }}
          />
          processing
        </span>
      </div>

      <div className="p-4 sm:p-6">{children}</div>

      <div className="border-t border-hairline px-4 py-2.5">
        <span className="font-mono text-[11px] text-ink-subtle">{readout}</span>
      </div>
    </div>
  );
}
