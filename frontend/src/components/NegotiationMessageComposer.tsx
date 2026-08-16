"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/services/api";
import type {
  NegotiationDraft,
  NegotiationFormat,
  NegotiationTone,
  RiskLevel,
} from "@/types";
import { RISK_COLORS } from "@/constants";
import { SparklesIcon, CopyIcon, CheckCircleIcon } from "./Icons";

export interface NegotiationCandidate {
  /** Index within the parent's risky-clause list (stable, used as the key). */
  index: number;
  clauseText: string;
  concern: string;
  request: string;
  desiredRewrite?: string | null;
  riskLevel: RiskLevel;
}

interface NegotiationMessageComposerProps {
  candidates: NegotiationCandidate[];
}

const TONES: { value: NegotiationTone; label: string }[] = [
  { value: "polite", label: "Polite" },
  { value: "neutral", label: "Neutral" },
  { value: "firm", label: "Firm" },
];

const FORMATS: { value: NegotiationFormat; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "message", label: "WhatsApp / Message" },
  { value: "letter", label: "Formal letter" },
];

const truncate = (text: string, max = 100) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

const NegotiationMessageComposer: React.FC<NegotiationMessageComposerProps> = ({
  candidates,
}) => {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(candidates.map((c) => c.index)),
  );
  const [tone, setTone] = useState<NegotiationTone>("polite");
  const [format, setFormat] = useState<NegotiationFormat>("email");
  const [counterparty, setCounterparty] = useState("");
  const [senderName, setSenderName] = useState("");
  const [draft, setDraft] = useState<NegotiationDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The "Copied!" reset must not fire after the composer unmounts.
  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const generate = useCallback(async () => {
    const points = candidates
      .filter((c) => selected.has(c.index))
      .map((c) => ({
        clauseText: c.clauseText,
        concern: c.concern,
        request: c.request,
        desiredRewrite: c.desiredRewrite ?? null,
      }));
    if (points.length === 0 || isLoading) return;

    setIsLoading(true);
    setError(null);
    setCopied(false);
    try {
      const result = await api.draftNegotiationMessage({
        points,
        tone,
        format,
        counterparty: counterparty.trim(),
        senderName: senderName.trim(),
      });
      setDraft(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not draft the message. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [candidates, selected, tone, format, counterparty, senderName, isLoading]);

  const copyToClipboard = useCallback(async () => {
    if (!draft) return;
    const text =
      format === "email" && draft.subject
        ? `Subject: ${draft.subject}\n\n${draft.body}`
        : draft.body;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Permission denied, or a non-secure context where the API is unavailable.
      setCopied(false);
      setError("Could not copy. Please copy the text manually.");
      return;
    }
    setError(null);
    setCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [draft, format]);

  const selectedCount = selected.size;

  return (
    <div className="ln-card p-4 sm:p-6 space-y-5">
      <div>
        <h4 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <SparklesIcon className="h-5 w-5 text-primary" />
          Draft a negotiation message
        </h4>
        <p className="text-sm text-ink-muted mt-1 max-w-3xl">
          Turn the points you want to change into a ready-to-send message. Pick
          the points, set the tone, and we&apos;ll write it for you to review,
          edit, and copy.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          No risky clauses were found to negotiate.
        </p>
      ) : (
        <>
          {/* Point selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-ink-muted">
                Points to raise ({selectedCount} of {candidates.length})
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(
                    selectedCount === candidates.length
                      ? new Set()
                      : new Set(candidates.map((c) => c.index)),
                  )
                }
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                {selectedCount === candidates.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {candidates.map((c) => {
                const colors = RISK_COLORS[c.riskLevel] || RISK_COLORS.Negligible;
                return (
                  <li key={c.index}>
                    <label className="flex items-start gap-3 p-2.5 rounded-lg border border-hairline bg-surface-1 cursor-pointer hover:border-hairline-strong transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.has(c.index)}
                        onChange={() => toggle(c.index)}
                        className="mt-1 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span
                          className={`inline-block text-xs font-medium ${colors.text} mb-0.5`}
                        >
                          {c.riskLevel === "No Risk"
                            ? "No Risk"
                            : `${c.riskLevel} Risk`}
                        </span>
                        <span className="block text-sm text-ink-muted break-words">
                          {truncate(c.clauseText)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink-muted">
                Who is this for?
              </span>
              <input
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="e.g. Landlord, Employer, Client"
                className="w-full mt-1 p-2.5 ln-input"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-muted">
                Your name (for the sign-off)
              </span>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Optional"
                className="w-full mt-1 p-2.5 ln-input"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-muted">Tone</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as NegotiationTone)}
                className="w-full mt-1 p-2.5 ln-input cursor-pointer"
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-muted">
                Format
              </span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as NegotiationFormat)}
                className="w-full mt-1 p-2.5 ln-input cursor-pointer"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={isLoading || selectedCount === 0}
            className="inline-flex w-full sm:w-auto justify-center items-center px-6 py-2.5 ln-btn-primary cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Drafting…" : draft ? "Regenerate" : "Draft message"}
            <SparklesIcon className="ml-2 h-5 w-5" />
          </button>

          {error && <p className="text-sm text-danger">{error}</p>}

          {/* Result (editable before sending) */}
          {draft && (
            <div className="space-y-3 border-t border-hairline pt-4 fade-in">
              <div className="flex items-center justify-between">
                <h5 className="font-semibold text-primary">Your message</h5>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="inline-flex items-center px-3 py-1.5 text-xs ln-btn-secondary cursor-pointer"
                >
                  {copied ? (
                    <CheckCircleIcon className="mr-1.5 h-4 w-4 text-success" />
                  ) : (
                    <CopyIcon className="mr-1.5 h-4 w-4" />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              {format === "email" && (
                <label className="block">
                  <span className="text-xs font-semibold text-ink-subtle">
                    Subject
                  </span>
                  <input
                    type="text"
                    value={draft.subject}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value })
                    }
                    className="w-full mt-1 p-2.5 ln-input"
                  />
                </label>
              )}

              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={12}
                className="w-full p-3 ln-input font-mono text-sm leading-relaxed"
              />
              <p className="text-xs text-ink-subtle">
                Review and edit before sending. This is a good-faith request, not
                legal advice.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NegotiationMessageComposer;
