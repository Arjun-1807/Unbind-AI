"use client";

import React, { useMemo, useRef } from "react";
import type { ClauseAnalysis } from "@/types";
import { RISK_COLORS } from "@/constants";

type DocumentPart =
  | string
  | (ClauseAnalysis & { originalIndex: number; start: number; end: number });

interface DocumentViewProps {
  documentText: string;
  clauses: ClauseAnalysis[];
  activeClauseIndex: number | null;
  setActiveClauseIndex: (index: number | null) => void;
}

const DocumentView: React.FC<DocumentViewProps> = ({
  documentText,
  clauses,
  activeClauseIndex,
  setActiveClauseIndex,
}) => {
  const activeClauseRef = useRef<HTMLSpanElement>(null);

  const normalizeText = (text: string) =>
    text
      .replace(/\s+/g, " ")
      .replace(/[^\w\s.,;:!?()-]/g, "")
      .toLowerCase()
      .trim();

  const findActualPosition = (
    originalText: string,
    _normalizedText: string,
    normalizedIndex: number,
  ): number => {
    let originalIndex = 0;
    let normalizedIndexCount = 0;
    for (
      let i = 0;
      i < originalText.length && normalizedIndexCount < normalizedIndex;
      i++
    ) {
      const char = originalText[i];
      const nc = normalizeText(char);
      if (nc) normalizedIndexCount++;
      originalIndex = i;
    }
    return originalIndex;
  };

  const findClauseInText = (
    clauseText: string,
    documentText: string,
    usedPositions: Set<number>,
  ): { start: number; end: number } | null => {
    const nc = normalizeText(clauseText);
    const nd = normalizeText(documentText);

    const start = nd.indexOf(nc);
    if (start !== -1) {
      const actualStart = findActualPosition(documentText, nd, start);
      const actualEnd = actualStart + clauseText.length;
      if (!usedPositions.has(actualStart)) {
        usedPositions.add(actualStart);
        return { start: actualStart, end: actualEnd };
      }
    }

    const clauseWords = nc.split(" ").filter((w) => w.length > 3);
    if (clauseWords.length > 0) {
      const firstWord = clauseWords[0];
      const lastWord = clauseWords[clauseWords.length - 1];
      const fi = nd.indexOf(firstWord);
      const li = nd.indexOf(lastWord, fi);
      if (fi !== -1 && li !== -1 && li > fi) {
        const actualStart = findActualPosition(documentText, nd, fi);
        const actualEnd =
          findActualPosition(documentText, nd, li) + lastWord.length;
        if (!usedPositions.has(actualStart)) {
          usedPositions.add(actualStart);
          return { start: actualStart, end: actualEnd };
        }
      }
    }
    return null;
  };

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

    const sorted = matchedClauses.sort((a, b) => a.start - b.start);
    const result: DocumentPart[] = [];
    let lastIndex = 0;

    sorted.forEach((clause) => {
      if (clause.start > lastIndex) {
        const between = documentText.substring(lastIndex, clause.start);
        if (between.trim()) result.push(between);
      }
      result.push(clause);
      lastIndex = clause.end;
    });

    if (lastIndex < documentText.length) {
      const remaining = documentText.substring(lastIndex);
      if (remaining.trim()) result.push(remaining);
    }

    return result.length > 0 ? result : [documentText];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentText, clauses]);

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
                const formattedText = part
                  .split("\n")
                  .map((line, lineIndex) => {
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
                        <p
                          key={lineIndex}
                          className="text-gray-700 leading-relaxed mb-3"
                        >
                          {line}
                        </p>
                      );
                    }
                    return <br key={lineIndex} />;
                  });
                return <span key={index}>{formattedText}</span>;
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
                  {clause.clauseText}
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
