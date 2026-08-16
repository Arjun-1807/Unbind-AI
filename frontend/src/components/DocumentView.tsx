"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { ClauseAnalysis } from "@/types";
import { RISK_COLORS } from "@/constants";
import { findClauseInText } from "@/lib/diffDocument";

type ClausePart = ClauseAnalysis & {
  originalIndex: number;
  start: number;
  end: number;
};
type CitationPart = {
  isCitation: true;
  start: number;
  end: number;
  key: number;
};
type DocumentPart = string | ClausePart | CitationPart;

interface DocumentViewProps {
  documentText: string;
  clauses: ClauseAnalysis[];
  activeClauseIndex: number | null;
  setActiveClauseIndex: (index: number | null) => void;
  /**
   * Passage the impact simulator asked to highlight, as exact character offsets
   * into `documentText` (the same string the backend computed them against).
   * `key` changes on every request so re-citing the same span still re-scrolls.
   */
  activeCitation?: { start: number; end: number; key: number } | null;
}

const DocumentView: React.FC<DocumentViewProps> = ({
  documentText,
  clauses,
  activeClauseIndex,
  setActiveClauseIndex,
  activeCitation = null,
}) => {
  const activeClauseRef = useRef<HTMLSpanElement>(null);
  const activeCitationRef = useRef<HTMLSpanElement>(null);

  // Scroll the cited passage into view whenever a new citation is clicked.
  useEffect(() => {
    if (activeCitation && activeCitationRef.current) {
      activeCitationRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCitation?.key]);

  const parts: DocumentPart[] = useMemo(() => {
    if (!documentText || documentText.trim().length === 0) {
      return ["No document text available"];
    }
    if (!clauses || clauses.length === 0) {
      return [documentText];
    }

    const usedPositions = new Set<number>();
    const matchedClauses: Array<
      ClauseAnalysis & { originalIndex: number; start: number; end: number }
    > = [];

    clauses.forEach((clause, index) => {
      if (!clause.clauseText || clause.clauseText.trim().length === 0) return;
      const match = findClauseInText(
        clause.clauseText,
        documentText,
        usedPositions,
      );
      if (match) {
        matchedClauses.push({ ...clause, originalIndex: index, ...match });
      }
    });

    let segments: Array<ClausePart | CitationPart> = matchedClauses;

    // Fold in the cited passage (if any). Offsets are exact, so we clamp them
    // to the document and drop any clause highlights that overlap the citation
    // — otherwise the same text would be wrapped twice and the walk below,
    // which assumes non-overlapping segments, would misalign.
    if (
      activeCitation &&
      activeCitation.start >= 0 &&
      activeCitation.end > activeCitation.start
    ) {
      const cs = Math.max(
        0,
        Math.min(activeCitation.start, documentText.length),
      );
      const ce = Math.max(cs, Math.min(activeCitation.end, documentText.length));
      if (ce > cs) {
        const nonOverlapping = matchedClauses.filter(
          (c) => c.end <= cs || c.start >= ce,
        );
        segments = [
          ...nonOverlapping,
          { isCitation: true, start: cs, end: ce, key: activeCitation.key },
        ];
      }
    }

    const sorted = segments.sort((a, b) => a.start - b.start);
    const result: DocumentPart[] = [];
    let lastIndex = 0;

    sorted.forEach((segment) => {
      if (segment.start > lastIndex) {
        const between = documentText.substring(lastIndex, segment.start);
        if (between.trim()) result.push(between);
      }
      result.push(segment);
      lastIndex = segment.end;
    });

    if (lastIndex < documentText.length) {
      const remaining = documentText.substring(lastIndex);
      if (remaining.trim()) result.push(remaining);
    }

    return result.length > 0 ? result : [documentText];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentText, clauses, activeCitation]);

  const safeParts =
    parts && parts.length > 0
      ? parts
      : [documentText || "No content available"];

  const getHoverColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "High":
        return "hover:bg-red-100 hover:border-red-300";
      case "Medium":
        return "hover:bg-yellow-100 hover:border-yellow-300";
      case "Low":
        return "hover:bg-green-100 hover:border-green-300";
      case "Negligible":
        return "hover:bg-blue-100 hover:border-blue-300";
      case "No Risk":
        return "hover:bg-gray-100 hover:border-gray-300";
      default:
        return "hover:bg-gray-100 hover:border-gray-300";
    }
  };

  const getActiveColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "High":
        return "bg-red-200 border-red-400 shadow-red-200";
      case "Medium":
        return "bg-yellow-200 border-yellow-400 shadow-yellow-200";
      case "Low":
        return "bg-green-200 border-green-400 shadow-green-200";
      case "Negligible":
        return "bg-blue-200 border-blue-400 shadow-blue-200";
      case "No Risk":
        return "bg-gray-200 border-gray-400 shadow-gray-200";
      default:
        return "bg-gray-200 border-gray-400 shadow-gray-200";
    }
  };

  // Shared line formatter so plain text and the cited-passage highlight render
  // headings/paragraphs identically.
  const formatLines = (text: string) =>
    text.split("\n").map((line, lineIndex) => {
      const isHeading =
        line.length < 80 &&
        line.length > 3 &&
        (line === line.toUpperCase() ||
          /^\d+\.\s/.test(line) ||
          /^[A-Z]\.\s/.test(line) ||
          /^(SECTION|CHAPTER|PART|ARTICLE|CLAUSE)/i.test(line));

      if (isHeading) {
        return (
          <h3
            key={lineIndex}
            className="text-lg sm:text-xl font-semibold text-gray-800 mt-8 mb-4 first:mt-0 bg-gray-100 px-3 sm:px-4 py-2 rounded-lg border-l-4 border-primary break-words"
          >
            {line}
          </h3>
        );
      }
      if (line.trim()) {
        return (
          <p key={lineIndex} className="text-gray-700 leading-relaxed mb-3">
            {line}
          </p>
        );
      }
      return <br key={lineIndex} />;
    });

  return (
    <div className="ln-card p-4 sm:p-6 h-[75vh] overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white text-gray-900 shadow-lg rounded-lg p-4 sm:p-8 min-h-full">
          <div className="prose prose-base sm:prose-lg max-w-none break-words">
            {safeParts.map((part, index) => {
              if (typeof part === "string") {
                if (!part || part.trim().length === 0) {
                  return <span key={index}></span>;
                }
                return <span key={index}>{formatLines(part)}</span>;
              }

              if ("isCitation" in part) {
                return (
                  <span
                    key={index}
                    ref={activeCitationRef}
                    id="doc-citation"
                    className="block rounded-md bg-primary/10 ring-2 ring-primary/50 px-2 py-1 my-1 transition-all duration-300"
                    title="Source cited in the answer"
                  >
                    {formatLines(documentText.substring(part.start, part.end))}
                  </span>
                );
              }

              const clause = part;
              const isActive = activeClauseIndex === clause.originalIndex;
              const colors = RISK_COLORS[clause.riskLevel];

              return (
                <span
                  key={index}
                  ref={isActive ? activeClauseRef : null}
                  id={`doc-clause-${clause.originalIndex}`}
                  className={`cursor-pointer transition-all duration-300 rounded-md px-1 py-0.5 border border-transparent
                    ${
                      isActive
                        ? `${getActiveColor(clause.riskLevel)} shadow-lg`
                        : `${getHoverColor(clause.riskLevel)}`
                    }`}
                  onClick={() => {
                    const card = document.getElementById(
                      `clause-card-${clause.originalIndex}`,
                    );
                    card?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    setActiveClauseIndex(clause.originalIndex);
                  }}
                  onMouseEnter={() =>
                    setActiveClauseIndex(clause.originalIndex)
                  }
                  onMouseLeave={() => setActiveClauseIndex(null)}
                  title={`${
                    clause.riskLevel === "No Risk"
                      ? "No Risk"
                      : `${clause.riskLevel} Risk`
                  }: ${clause.simplifiedExplanation}`}
                >
                  {/* Render the located span from the document itself, not the
                      model's copy of the clause, so the original wording and
                      spacing are preserved verbatim. */}
                  {documentText.substring(clause.start, clause.end)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {(!documentText || documentText.trim().length === 0) && (
        <div className="text-center py-8 text-ink-subtle">
          <p>No document content available</p>
        </div>
      )}
    </div>
  );
};

export default DocumentView;
