"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ClauseAnalysis } from "@/types";
import {
  applyDecisions,
  buildDocumentSegments,
  diffWords,
  type ClauseDecision,
  type ClauseSegment,
} from "@/lib/diffDocument";

const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-5 w-5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-4 w-4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
    />
  </svg>
);

interface CompareDocumentsModalProps {
  open: boolean;
  documentText: string;
  clauses: ClauseAnalysis[];
  onClose: () => void;
}

const CompareDocumentsModal: React.FC<CompareDocumentsModalProps> = ({
  open,
  documentText,
  clauses,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const { segments, unmatchedCount } = useMemo(
    () => buildDocumentSegments(documentText, clauses),
    [documentText, clauses],
  );

  const changedSegments = useMemo(
    () => segments.filter((s): s is ClauseSegment => s.type === "clause"),
    [segments],
  );

  // Every changed clause defaults to "use the AI rewrite"; reset whenever the
  // underlying document/clauses change (e.g. a different analysis loaded).
  const [decisions, setDecisions] = useState<Record<number, ClauseDecision>>({});
  useEffect(() => {
    setDecisions(
      Object.fromEntries(changedSegments.map((s) => [s.originalIndex, "ai" as const])),
    );
  }, [changedSegments]);

  const finalText = useMemo(
    () => applyDecisions(segments, decisions),
    [segments, decisions],
  );

  const tokens = useMemo(
    () => diffWords(documentText, finalText),
    [documentText, finalText],
  );

  const additions = tokens.filter((t) => t.op === "insert").length;
  const deletions = tokens.filter((t) => t.op === "delete").length;
  const appliedCount = changedSegments.filter(
    (s) => (decisions[s.originalIndex] ?? "ai") === "ai",
  ).length;

  const setDecision = (originalIndex: number, decision: ClauseDecision) =>
    setDecisions((prev) => ({ ...prev, [originalIndex]: decision }));

  const applyAll = () =>
    setDecisions(
      Object.fromEntries(changedSegments.map((s) => [s.originalIndex, "ai" as const])),
    );
  const revertAll = () =>
    setDecisions(
      Object.fromEntries(
        changedSegments.map((s) => [s.originalIndex, "original" as const]),
      ),
    );

  const handleDownload = () => {
    const blob = new Blob([finalText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revised-document.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-canvas fade-in"
    >
      {/* Header — mimics a GitHub PR "Files changed" merge bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-hairline bg-surface-1 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h2 className="text-base sm:text-lg font-semibold text-ink truncate">
            Compare changes
          </h2>
          {changedSegments.length > 0 && (
            <span className="text-xs text-ink-subtle whitespace-nowrap">
              {appliedCount}/{changedSegments.length} rewrite
              {changedSegments.length === 1 ? "" : "s"} applied
            </span>
          )}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono whitespace-nowrap">
            <span className="text-success">+{additions}</span>
            <span className="text-danger">-{deletions}</span>
          </div>
          {unmatchedCount > 0 && (
            <span className="text-xs text-warning whitespace-nowrap">
              {unmatchedCount} suggested rewrite
              {unmatchedCount === 1 ? "" : "s"} couldn&apos;t be matched to text
              and {unmatchedCount === 1 ? "is" : "are"} excluded
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {changedSegments.length > 0 && (
            <button
              onClick={handleDownload}
              className="ln-btn-secondary text-xs sm:text-sm px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5"
            >
              <DownloadIcon />
              Download revised
            </button>
          )}
          <button
            onClick={onClose}
            className="text-ink-subtle hover:text-ink transition-colors cursor-pointer shrink-0 p-1"
            aria-label="Close comparison"
          >
            <XIcon />
          </button>
        </div>
      </div>

      {changedSegments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-ink-subtle text-sm px-6 text-center">
          No AI-suggested rewrites are available for this document yet, so
          there is nothing to compare.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Sidebar: per-clause accept/reject review list */}
          <aside className="w-full max-w-xs sm:max-w-sm lg:w-96 lg:max-w-none shrink-0 border-r border-hairline bg-surface-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
              <span className="text-sm font-semibold text-ink">
                Review changes
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={revertAll}
                  className="text-xs text-ink-subtle hover:text-ink transition-colors cursor-pointer underline decoration-dotted"
                >
                  Revert all
                </button>
                <span className="text-hairline-strong">|</span>
                <button
                  onClick={applyAll}
                  className="text-xs text-ink-subtle hover:text-ink transition-colors cursor-pointer underline decoration-dotted"
                >
                  Apply all
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
              {changedSegments.map((seg, i) => {
                const decision = decisions[seg.originalIndex] ?? "ai";
                return (
                  <div
                    key={seg.originalIndex}
                    className="ln-card p-3.5 text-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-ink-subtle font-medium text-xs">
                        Clause {i + 1}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          decision === "ai"
                            ? "bg-success/10 text-success"
                            : "bg-surface-2 text-ink-subtle"
                        }`}
                      >
                        {decision === "ai" ? "Rewrite applied" : "Kept original"}
                      </span>
                    </div>
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle mb-1">
                        Original
                      </p>
                      <p className="text-ink-muted text-xs leading-relaxed line-clamp-3">
                        {seg.original}
                      </p>
                    </div>
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle mb-1">
                        Suggested rewrite
                      </p>
                      <p className="text-ink text-xs leading-relaxed line-clamp-3">
                        {seg.rewrite}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setDecision(seg.originalIndex, "original")}
                        className={`flex-1 rounded px-2 py-1.5 cursor-pointer transition-colors text-xs ${
                          decision === "original"
                            ? "bg-surface-3 text-ink font-medium"
                            : "text-ink-subtle hover:bg-surface-2"
                        }`}
                      >
                        Keep original
                      </button>
                      <button
                        onClick={() => setDecision(seg.originalIndex, "ai")}
                        className={`flex-1 rounded px-2 py-1.5 cursor-pointer transition-colors text-xs ${
                          decision === "ai"
                            ? "bg-success/15 text-success font-medium"
                            : "text-ink-subtle hover:bg-surface-2"
                        }`}
                      >
                        Use rewrite
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Split diff panes */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-hairline overflow-hidden">
            <DiffPane title="Original" side="old" tokens={tokens} />
            <DiffPane title="Revised" side="new" tokens={tokens} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

interface DiffPaneProps {
  title: string;
  side: "old" | "new";
  tokens: { op: "equal" | "delete" | "insert"; text: string }[];
}

const DiffPane: React.FC<DiffPaneProps> = ({ title, side, tokens }) => {
  const visible = tokens.filter((t) =>
    side === "old" ? t.op !== "insert" : t.op !== "delete",
  );
  const hasChanges = visible.some((t) => t.op !== "equal");

  return (
    <div className="min-h-0 flex flex-col overflow-hidden bg-canvas">
      <div className="px-5 sm:px-8 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle bg-surface-1 border-b border-hairline shrink-0 flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            side === "old" ? "bg-danger" : "bg-success"
          }`}
        />
        {title}
      </div>
      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6">
        <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-lg border border-black/5 shadow-sm p-6 sm:p-8">
          {hasChanges ? (
            <p className="whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base">
              {visible.map((t, idx) => {
                if (t.op === "equal") return <span key={idx}>{t.text}</span>;
                if (t.op === "delete") {
                  return (
                    <span
                      key={idx}
                      className="bg-red-100 text-red-800 line-through decoration-red-500/60 rounded-sm"
                    >
                      {t.text}
                    </span>
                  );
                }
                return (
                  <span
                    key={idx}
                    className="bg-green-100 text-green-800 rounded-sm"
                  >
                    {t.text}
                  </span>
                );
              })}
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base text-gray-700">
              {visible.map((t) => t.text).join("")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompareDocumentsModal;
