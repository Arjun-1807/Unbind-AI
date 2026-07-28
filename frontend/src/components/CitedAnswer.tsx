"use client";

import React from "react";
import type { Citation } from "@/types";

interface CitedAnswerProps {
  answer: string;
  citations: Citation[];
  /** Ask the parent to highlight + scroll to a cited passage in the document. */
  onCitationJump: (citation: Citation) => void;
  /** Render the "Sources" list below the answer. */
  showSources?: boolean;
}

/**
 * Renders a grounded answer: inline `[S#]` markers become clickable chips that
 * jump to the exact cited passage in the document.
 *
 * Shared by the impact simulator and document Q&A — both produce answers under
 * the same citation contract, and the marker-parsing plus the not-locatable
 * handling should behave identically in each.
 */
const CitedAnswer: React.FC<CitedAnswerProps> = ({
  answer,
  citations,
  onCitationJump,
  showSources = true,
}) => {
  const byId = new Map(citations.map((c) => [c.id, c]));

  const chip = (citation: Citation, label: string, keyHint: string) => {
    // A chunk the splitter couldn't locate verbatim gets start = -1; show it as
    // inert rather than scrolling the document to the wrong place.
    const jumpable = citation.startIndex >= 0;
    return (
      <button
        key={keyHint}
        type="button"
        onClick={() => jumpable && onCitationJump(citation)}
        disabled={!jumpable}
        title={
          jumpable
            ? `Jump to source ${citation.id} in the document`
            : "Source location unavailable"
        }
        className="mx-0.5 inline-flex items-center align-baseline rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-default disabled:opacity-60"
      >
        {label}
      </button>
    );
  };

  const nodes: React.ReactNode[] = [];
  const regex = /\[S(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = regex.exec(answer)) !== null) {
    if (match.index > last) nodes.push(answer.slice(last, match.index));
    const id = parseInt(match[1], 10);
    const cite = byId.get(id);
    if (cite) {
      nodes.push(chip(cite, String(id), `cite-${k++}`));
    } else {
      // Marker with no matching source — plain text, never a dead link.
      nodes.push(match[0]);
    }
    last = regex.lastIndex;
  }
  if (last < answer.length) nodes.push(answer.slice(last));

  return (
    <>
      <div className="text-ink-muted whitespace-pre-wrap break-words leading-relaxed">
        {nodes}
      </div>
      {showSources && citations.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-4">
          <h5 className="font-semibold text-sm text-ink mb-2">Sources</h5>
          <ul className="space-y-2">
            {citations.map((c) => {
              const jumpable = c.startIndex >= 0;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => jumpable && onCitationJump(c)}
                    disabled={!jumpable}
                    title={
                      jumpable
                        ? "Jump to this passage in the document"
                        : "Source location unavailable"
                    }
                    className="flex w-full items-start gap-2 text-left text-sm text-ink-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                      {c.id}
                    </span>
                    <span className="break-words">{c.snippet}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
};

export default CitedAnswer;
