"use client";

import React from "react";

export interface FaqItem {
  q: string;
  /** Rendered inside the panel, so answers can carry links. */
  a: React.ReactNode;
}

/**
 * Objection-handling FAQ, built as a set of independent disclosures rather
 * than an accordion that closes its siblings — someone comparing two answers
 * should not have to keep re-opening the first one.
 *
 * Each row is a real <button> wired to its panel with aria-controls /
 * aria-expanded, and the panel stays in the DOM (height-collapsed via CSS
 * grid) so find-in-page still reaches closed answers.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = React.useState<Set<number>>(() => new Set([0]));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface-1">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        return (
          <div key={i}>
            <h3>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-trigger-${i}`}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2 sm:px-6 sm:py-5"
              >
                <span className="text-sm font-medium text-ink sm:text-base">
                  {item.q}
                </span>
                <svg
                  className="h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-300"
                  style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className="ln-disclosure"
              data-open={isOpen}
            >
              <div>
                <div className="px-5 pb-5 text-sm leading-relaxed text-ink-subtle sm:px-6 sm:pb-6">
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
