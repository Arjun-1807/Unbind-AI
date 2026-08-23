"use client";

import React, { useRef } from "react";
import { usePointerGlow } from "@/hooks/usePointerGlow";
import {
  BookOpenIcon,
  CalendarIcon,
  CameraIcon,
  FileSearchIcon,
  FileTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "./Icons";

const LayersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 17 9 5 9-5" /><path d="m3 12 9 5 9-5" />
  </svg>
);

const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" />
  </svg>
);

type Capability = { icon: React.ReactNode; title: string; desc: string };

/**
 * The long tail of what UnBind does, after the three pillar sections above
 * have carried the headline capabilities.
 *
 * Deliberately uniform: same tile, same weight, one line of copy each. The
 * page has already made its argument by this point, so this grid's job is
 * completeness for the reader who is scanning for one specific thing —
 * giving these equal billing with the pillars (as the previous eleven-card
 * bento did) flattened the hierarchy and left nothing memorable.
 */
const CAPABILITIES: Capability[] = [
  {
    icon: <CameraIcon className="h-5 w-5" />,
    title: "Photograph a paper contract",
    desc: "Snap or scan it and vision AI reads the text — no retyping.",
  },
  {
    icon: <BookOpenIcon className="h-5 w-5" />,
    title: "Key terms glossary",
    desc: "Indemnification, force majeure, and the rest, in plain English.",
  },
  {
    icon: <SparklesIcon className="h-5 w-5" />,
    title: "Ask anything",
    desc: "“What if I leave early?” — answered from your contract, in a thread that remembers.",
  },
  {
    icon: <FileSearchIcon className="h-5 w-5" />,
    title: "Source citations",
    desc: "Every answer links to the clause it came from. One click jumps there.",
  },
  {
    icon: <CalendarIcon className="h-5 w-5" />,
    title: "Deadlines and reminders",
    desc: "Dates extracted automatically, exported to your calendar, emailed before they land.",
  },
  {
    icon: <FileTextIcon className="h-5 w-5" />,
    title: "Document view",
    desc: "Read the contract side by side with the analysis, clauses highlighted.",
  },
  {
    icon: <LayersIcon className="h-5 w-5" />,
    title: "Compare two versions",
    desc: "Diff a revised draft against the original to see exactly what moved.",
  },
  {
    icon: <HistoryIcon className="h-5 w-5" />,
    title: "Dashboard and history",
    desc: "Every past analysis in one place, with risk scores tracked over time.",
  },
  {
    icon: <ShieldCheckIcon className="h-5 w-5" />,
    title: "Curated lawyer referrals",
    desc: "When you do need a human, get matched with one who knows the area.",
  },
];

export default function CapabilityGrid() {
  const gridRef = useRef<HTMLDivElement>(null);
  // One spotlight overlay for the whole lattice rather than one per tile:
  // nine tracking gradients would be nine repaint regions on every mouse
  // move, where this is a single composited layer.
  usePointerGlow(gridRef);

  return (
    <div
      ref={gridRef}
      className="spotlight grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3"
    >
      {CAPABILITIES.map((c, i) => (
        <div
          key={c.title}
          className="reveal group relative z-[2] bg-surface-1/85 p-6 transition-colors duration-300 hover:bg-surface-2"
          style={{ ["--i" as string]: i % 3 }}
        >
          <div
            className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary transition-transform duration-300 group-hover:scale-110"
            style={{
              background: "color-mix(in srgb, var(--ln-primary) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ln-primary) 25%, transparent)",
            }}
          >
            {c.icon}
          </div>
          <h3 className="mb-1.5 text-[15px] font-medium text-ink">{c.title}</h3>
          <p className="text-sm leading-relaxed text-ink-subtle">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}
