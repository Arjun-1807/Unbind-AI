"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

const DocumentChatView: React.FC<DocumentChatViewProps> = ({
  analysisId,
  onError,
  onCitationJump,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // The conversation lives on the server, keyed to this analysis, so it survives
  // refreshes, navigation, and a switch to another device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const history = await api.getDocumentChat(analysisId);
        if (!cancelled) setMessages(history);
      } catch {
        // An unreachable history is not worth blocking the ask box over — the
        // user can still ask, they just start from an empty thread.
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isSending]);

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
    const previous = messages;
    setMessages([]);
    try {
      await api.clearDocumentChat(analysisId);
    } catch (err) {
      setMessages(previous);
      onError(
        err instanceof Error ? err.message : "Could not clear the conversation.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl sm:text-2xl font-semibold text-ink">
          Ask Anything
        </h3>
        <p className="text-ink-muted mt-2 max-w-3xl">
          Ask anything about this document — what a clause means, or what would
          happen in a situation like &quot;what if I move out early?&quot; You
          get a plain-English answer with the exact clauses it came from. Click a
          source to jump straight to that passage.
        </p>
      </div>

      {isLoadingHistory ? (
        <div className="p-6 text-center text-ink-subtle">
          Loading conversation…
        </div>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="ln-card p-4 sm:p-5">
              <h4 className="font-semibold text-ink mb-3">
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
          )}

          {messages.length > 0 && (
            <ul className="space-y-4">
              {messages.map((m, i) => (
                <li
                  key={`${m.role}-${i}-${m.createdAt ?? ""}`}
                  className={
                    m.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2.5 text-ink break-words">
                      {m.content}
                    </div>
                  ) : (
                    <div className="ln-card w-full p-4 sm:p-5 fade-in">
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
          )}

          {isSending && (
            <div className="flex items-center p-4 text-ink-subtle">
              <svg
                className="animate-spin mr-3 h-5 w-5 text-primary"
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
              Reading your contract…
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
              className="w-full p-3 ln-input"
              rows={2}
              disabled={isSending}
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="submit"
                disabled={isSending || !question.trim()}
                className="inline-flex w-full sm:w-auto justify-center cursor-pointer items-center px-6 py-2.5 ln-btn-primary disabled:opacity-50"
              >
                {isSending ? "Thinking..." : "Ask"}
                <SparklesIcon className="ml-2 h-5 w-5" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSending}
                  className="inline-flex w-full sm:w-auto justify-center cursor-pointer items-center px-4 py-2.5 ln-btn-secondary disabled:opacity-50"
                >
                  Clear conversation
                </button>
              )}
            </div>
            <p className="text-xs text-ink-subtle">
              Answers come only from this document. UnBind explains contracts —
              it isn&apos;t legal advice.
            </p>
          </form>
        </>
      )}
    </div>
  );
};

export default DocumentChatView;
