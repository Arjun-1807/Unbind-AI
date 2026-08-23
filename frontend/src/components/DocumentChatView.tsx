"use client";

import React, { useCallback, useRef, useState } from "react";
import * as api from "@/services/api";
import type { ChatMessage, Citation } from "@/types";
import CitedAnswer from "./CitedAnswer";
import { SparklesIcon } from "./Icons";

interface DocumentChatViewProps {
  /** Stable analysis id — the conversation is stored against it server-side. */
  analysisId: string;
  onError: (message: string) => void;
  /** Ask the parent to highlight + scroll to a cited passage in the document. */
  onCitationJump: (citation: Citation) => void;
}

/**
 * Starter questions, so the empty state isn't a blank box. Deliberately mixes
 * plain questions with "what if" scenarios to show that both work here — the
 * two used to be separate features and users shouldn't have to wonder.
 */
const SUGGESTIONS = [
  "What are my main obligations under this contract?",
  "How and when can I end this agreement?",
  "What if I need to leave early?",
  "What happens if I pay late?",
  "Are there any fees or charges I might miss?",
];

const ChevronIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" />
  </svg>
);

/** The assistant's mark. Initials rather than an image so it costs no request. */
function SaulAvatar({ className = "h-9 w-9 text-sm" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        background: "linear-gradient(145deg, var(--ln-primary), var(--ln-primary-hover))",
        boxShadow: "0 0 0 1px color-mix(in srgb, var(--ln-primary) 45%, transparent)",
      }}
    >
      SG
    </span>
  );
}

/** Shared renderer — the live thread and the history panel show the same shape. */
function MessageList({
  messages,
  onCitationJump,
}: {
  messages: ChatMessage[];
  onCitationJump: (citation: Citation) => void;
}) {
  return (
    <ul className="space-y-4">
      {messages.map((m, i) => (
        <li
          key={`${m.role}-${i}-${m.createdAt ?? ""}`}
          className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
        >
          {m.role === "user" ? (
            <div className="max-w-[85%] break-words rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2.5 text-ink">
              {m.content}
            </div>
          ) : (
            <div className="w-full rounded-xl border border-hairline bg-surface-2 p-4 fade-in sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <SaulAvatar className="h-6 w-6 text-[10px]" />
                <span className="text-sm font-medium text-ink">Saul Goodman</span>
              </div>
              <CitedAnswer
                answer={m.content}
                citations={m.citations}
                onCitationJump={onCitationJump}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const DocumentChatView: React.FC<DocumentChatViewProps> = ({
  analysisId,
  onError,
  onCitationJump,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Earlier turns live in their own collapsed card below, fetched the first
  // time it is opened. Opening this tab used to block on a history request and
  // then drop the reader at the bottom of a long thread they had to scroll
  // past to reach the ask box; the common case is a fresh question, so that is
  // the default view now.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ChatMessage[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const toggleHistory = useCallback(async () => {
    // Already fetched — this is now a pure show/hide.
    if (history !== null) {
      setHistoryOpen((open) => !open);
      return;
    }
    if (isLoadingHistory) return;

    setIsLoadingHistory(true);
    onError("");
    try {
      const stored = await api.getDocumentChat(analysisId);
      // The server holds the whole conversation, including anything asked in
      // this session — those turns are already on screen in the card above, so
      // trim them off the tail rather than showing them twice. Fetched once
      // and kept: "previous conversation" should stay the snapshot it was when
      // opened, not creep forward as the live thread grows.
      const priorCount = Math.max(0, stored.length - messages.length);
      setHistory(stored.slice(0, priorCount));
      setHistoryOpen(true);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Could not load the earlier conversation.",
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, [analysisId, history, isLoadingHistory, messages.length, onError]);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setIsSending(true);
      onError("");
      setQuestion("");
      // Show the question immediately; the answer lands when it arrives.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, citations: [] },
      ]);

      try {
        const answer = await api.askDocument(analysisId, trimmed);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: answer.answer,
            citations: answer.citations,
          },
        ]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        // Roll the optimistic question back so the thread doesn't keep a
        // question that was never actually answered.
        setMessages((prev) => prev.slice(0, -1));
        setQuestion(trimmed);
        onError(
          err instanceof Error
            ? err.message
            : "Something went wrong answering that question.",
        );
      } finally {
        setIsSending(false);
      }
    },
    [analysisId, isSending, onError],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  };

  const handleClear = async () => {
    if (isSending) return;
    const previousMessages = messages;
    const previousHistory = history;
    setMessages([]);
    setHistory([]);
    setHistoryOpen(false);
    try {
      await api.clearDocumentChat(analysisId);
    } catch (err) {
      setMessages(previousMessages);
      setHistory(previousHistory);
      onError(
        err instanceof Error ? err.message : "Could not clear the conversation.",
      );
    }
  };

  const historyCount = history?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Main chat card ─────────────────────────────────────────────── */}
      <div className="ln-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-hairline p-4 sm:p-5">
          <SaulAvatar className="h-11 w-11 text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold tracking-tight text-ink">
                Saul Goodman
              </h3>
              <span className="ln-badge">Ask anything</span>
            </div>
            <p className="mt-0.5 text-sm text-ink-subtle">
              Reads your contract and tells you, straight, what you walked into.
            </p>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {messages.length === 0 ? (
            <div>
              <p className="text-sm text-ink-muted">
                Ask what a clause means, or what would happen in a situation like
                &quot;what if I move out early?&quot; Every answer cites the exact
                clauses it came from — click a source to jump to that passage.
              </p>
              <h4 className="mb-3 mt-5 text-sm font-semibold text-ink">
                Not sure where to start?
              </h4>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={isSending}
                    className="cursor-pointer rounded-full border border-hairline px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList messages={messages} onCitationJump={onCitationJump} />
          )}

          {isSending && (
            <div className="flex items-center text-ink-subtle">
              <svg
                className="mr-3 h-5 w-5 animate-spin text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Saul is reading your contract…
            </div>
          )}

          <div ref={bottomRef} />

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or describe a situation, for example: 'Can I sublet this apartment?' or 'What if I miss a rent payment?'"
              className="ln-input w-full p-3"
              rows={2}
              disabled={isSending}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={isSending || !question.trim()}
                className="ln-btn-primary inline-flex w-full cursor-pointer items-center justify-center px-6 py-2.5 disabled:opacity-50 sm:w-auto"
              >
                {isSending ? "Thinking..." : "Ask Saul"}
                <SparklesIcon className="ml-2 h-5 w-5" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSending}
                  className="ln-btn-secondary inline-flex w-full cursor-pointer items-center justify-center px-4 py-2.5 disabled:opacity-50 sm:w-auto"
                >
                  Clear conversation
                </button>
              )}
            </div>
            <p className="text-xs text-ink-subtle">
              Answers come only from this document. Saul is a character, not a
              lawyer — UnBind explains contracts, it isn&apos;t legal advice.
            </p>
          </form>
        </div>
      </div>

      {/* ── History card ───────────────────────────────────────────────
          Collapsed by default and only fetched on the first open, so the tab
          costs nothing until someone actually wants the older thread. */}
      <div className="ln-card overflow-hidden">
        <h4>
          <button
            type="button"
            onClick={toggleHistory}
            aria-expanded={historyOpen}
            aria-controls="chat-history-panel"
            id="chat-history-trigger"
            disabled={isLoadingHistory}
            className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-surface-2 disabled:cursor-wait sm:p-5"
          >
            <span className="flex items-center gap-3">
              <HistoryIcon className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-medium text-ink">
                Previous conversation
              </span>
              {history !== null && (
                <span className="ln-badge">
                  {historyCount === 0
                    ? "none saved"
                    : `${historyCount} message${historyCount === 1 ? "" : "s"}`}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 text-xs text-ink-subtle">
              {isLoadingHistory && "Loading…"}
              <ChevronIcon
                className="h-4 w-4 shrink-0 transition-transform duration-300"
                style={{ transform: historyOpen ? "rotate(180deg)" : "none" }}
                aria-hidden="true"
              />
            </span>
          </button>
        </h4>

        <div
          id="chat-history-panel"
          role="region"
          aria-labelledby="chat-history-trigger"
          className="ln-disclosure"
          data-open={historyOpen}
        >
          <div>
            <div className="border-t border-hairline p-4 sm:p-5">
              {historyCount === 0 ? (
                <p className="text-sm text-ink-subtle">
                  No earlier conversation saved for this document yet.
                </p>
              ) : (
                <MessageList
                  messages={history ?? []}
                  onCitationJump={onCitationJump}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentChatView;
