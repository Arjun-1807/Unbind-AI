"use client";

import React from "react";
import type { Citation } from "@/types";
import { parseAnswer, type Block, type Inline } from "@/lib/answerMarkdown";

interface CitedAnswerProps {
  answer: string;
  citations: Citation[];
  /** Ask the parent to highlight + scroll to a cited passage in the document. */
  onCitationJump: (citation: Citation) => void;
  /** Render the "Sources" list below the answer. */
  showSources?: boolean;
}

/**
 * Renders a grounded answer: light Markdown becomes real formatting, and
 * inline `[S#]` markers become clickable chips that jump to the exact cited
 * passage in the document.
 *
 * The two are parsed together rather than in sequence — citations routinely
 * land inside emphasis (`**capped at 2% [S3]**`), so a Markdown pass followed
 * by a citation pass would lose one or the other. See lib/answerMarkdown.
 *
 * Model output is untrusted, so it is parsed into a data structure and
 * rendered as React elements. Nothing is ever handed to dangerouslySetInnerHTML.
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

  const renderInline = (nodes: Inline[], keyPrefix: string): React.ReactNode[] =>
    nodes.map((node, i) => {
      const key = `${keyPrefix}-${i}`;
      switch (node.type) {
        case "text":
          return <React.Fragment key={key}>{node.value}</React.Fragment>;
        case "bold":
          return (
            <strong key={key} className="font-semibold text-ink">
              {renderInline(node.children, key)}
            </strong>
          );
        case "italic":
          return <em key={key}>{renderInline(node.children, key)}</em>;
        case "code":
          return (
            <code
              key={key}
              className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.9em] text-ink"
            >
              {node.value}
            </code>
          );
        case "break":
          return <br key={key} />;
        case "cite": {
          const cite = byId.get(node.id);
          // Marker with no matching source — plain text, never a dead link.
          return cite ? (
            chip(cite, String(node.id), key)
          ) : (
            <React.Fragment key={key}>{node.raw}</React.Fragment>
          );
        }
      }
    });

  const renderBlock = (block: Block, i: number): React.ReactNode => {
    const key = `b${i}`;
    switch (block.type) {
      case "heading": {
        const Tag = (`h${Math.min(block.level + 3, 6)}`) as "h4" | "h5" | "h6";
        return (
          <Tag key={key} className="mt-1 font-semibold text-ink">
            {renderInline(block.children, key)}
          </Tag>
        );
      }
      case "list": {
        const Tag = block.ordered ? "ol" : "ul";
        return (
          <Tag
            key={key}
            className={`space-y-1.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
          >
            {block.items.map((item, j) => (
              <li key={`${key}-${j}`} className="pl-1 marker:text-primary">
                {renderInline(item, `${key}-${j}`)}
              </li>
            ))}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={key}>{renderInline(block.children, key)}</p>;
    }
  };

  return (
    <>
      <div className="space-y-3 break-words leading-relaxed text-ink-muted">
        {parseAnswer(answer).map(renderBlock)}
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
