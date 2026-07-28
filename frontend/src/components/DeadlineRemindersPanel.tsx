"use client";

import React, { useCallback, useEffect, useState } from "react";
import * as api from "@/services/api";
import type { Reminder, ReminderReason } from "@/types";
import { CalendarIcon } from "./Icons";

interface DeadlineRemindersPanelProps {
  analysisId: string;
}

/**
 * Explanations for dates we deliberately refused to schedule.
 *
 * Being specific matters: "we couldn't read this date" is useless, while
 * "this depends on your signing date" tells the user exactly what to supply.
 */
const REASON_COPY: Record<ReminderReason, string> = {
  relative: "Counted from another date — tell us when that was.",
  recurring: "This repeats. Set the next date you want to be reminded about.",
  ambiguous: "This date could be read two ways, so we didn't guess.",
  conditional: "Depends on something happening, so there's no fixed date.",
  unparseable: "We couldn't read a date here.",
  past: "This date has already passed.",
};

const DeadlineRemindersPanel: React.FC<DeadlineRemindersPanelProps> = ({
  analysisId,
}) => {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReminders(await api.getReminders(analysisId));
    } catch {
      // Reminders are supplementary to the key-dates list this sits above, so a
      // failure here hides the panel rather than breaking the tab.
      setReminders([]);
    }
  }, [analysisId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDueDate = async (reminderId: string) => {
    const value = drafts[reminderId];
    if (!value) return;
    setSavingId(reminderId);
    setError(null);
    try {
      await api.setReminderDueDate(reminderId, value);
      await load();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[reminderId];
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save that date.",
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!reminders || reminders.length === 0) return null;

  const scheduled = reminders.filter((r) => r.schedulable && r.dueDate);
  const needsAttention = reminders.filter((r) => r.needsAttention);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="ln-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <CalendarIcon className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h4 className="font-semibold text-ink">Email reminders</h4>
          <p className="text-sm text-ink-muted mt-1">
            {scheduled.length > 0 ? (
              <>
                We&apos;ll email you before{" "}
                <strong className="text-ink">
                  {scheduled.length}{" "}
                  {scheduled.length === 1 ? "deadline" : "deadlines"}
                </strong>{" "}
                from this document.
              </>
            ) : (
              <>No deadlines from this document are scheduled yet.</>
            )}{" "}
            Manage this in your{" "}
            <a href="/profile" className="text-primary hover:underline">
              profile settings
            </a>
            .
          </p>
        </div>
      </div>

      {scheduled.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {scheduled.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2 text-ink-muted">
              <span className="font-medium text-ink">{r.dueDate}</span>
              <span className="break-words">— {r.description}</span>
            </li>
          ))}
        </ul>
      )}

      {needsAttention.length > 0 && (
        <div className="border-t border-hairline pt-4 space-y-3">
          <p className="text-sm text-ink">
            <strong>
              {needsAttention.length}{" "}
              {needsAttention.length === 1 ? "date needs" : "dates need"} your
              input
            </strong>{" "}
            <span className="text-ink-muted">
              — we don&apos;t guess deadlines, because a wrong reminder is worse
              than none.
            </span>
          </p>
          <ul className="space-y-3">
            {needsAttention.map((r) => (
              <li key={r.id} className="rounded-lg bg-surface-1 p-3">
                <p className="text-sm font-medium text-ink break-words">
                  {r.description}
                </p>
                <p className="text-xs text-ink-subtle mt-1 break-words">
                  Contract says: &ldquo;{r.sourceDate}&rdquo;
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  {r.reason ? REASON_COPY[r.reason] : ""}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    min={today}
                    value={drafts[r.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    className="ln-input px-2 py-1 text-sm"
                    aria-label={`Deadline date for ${r.description}`}
                  />
                  <button
                    type="button"
                    onClick={() => saveDueDate(r.id)}
                    disabled={!drafts[r.id] || savingId === r.id}
                    className="inline-flex cursor-pointer items-center px-3 py-1.5 text-xs ln-btn-primary disabled:opacity-50"
                  >
                    {savingId === r.id ? "Saving…" : "Set reminder"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
};

export default DeadlineRemindersPanel;
