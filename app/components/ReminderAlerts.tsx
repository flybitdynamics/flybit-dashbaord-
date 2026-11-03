"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, saveShowReminders, subscribe } from "../lib/store";
import { Show, ShowReminder } from "../lib/types";
import { useAuth } from "./AuthProvider";
import { reminderStamp } from "./ReminderDialog";

const HIDDEN_KEY = "flybit_hidden_reminders";
const SNOOZE_MINUTES = 15;

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Pops up every show reminder whose time has come, on whichever page of the
 *  desk is open, until someone ticks it off. A reminder that fell due while
 *  the desk was closed shows the next time it opens. */
export function ReminderAlerts() {
  const { can } = useAuth();
  const canView = can("shows", "view");
  const canEdit = can("shows", "edit");
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const notified = useRef(new Set<string>());

  /* Check the clock every 20 seconds. */
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const due: Array<{ show: Show; reminder: ShowReminder }> = canView
    ? (state?.shows ?? [])
        .flatMap((show) => (show.reminders ?? []).map((reminder) => ({ show, reminder })))
        .filter(
          ({ reminder }) =>
            !reminder.done && !hidden.includes(reminder.id) && new Date(reminder.at).getTime() <= now,
        )
        .sort((a, b) => a.reminder.at.localeCompare(b.reminder.at))
    : [];

  /* With the tab in the background, the system notification is what is seen. */
  useEffect(() => {
    for (const { show, reminder } of due) {
      if (notified.current.has(reminder.id)) continue;
      notified.current.add(reminder.id);
      try {
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification(`Reminder: ${show.client || show.location || "Show"}`, { body: reminder.note, tag: reminder.id });
        }
      } catch {
        /* notifications not available */
      }
    }
  });

  if (due.length === 0) return null;

  function hide(id: string) {
    const next = [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next.slice(-200)));
    } catch {
      /* stays hidden until reload */
    }
  }

  function update(show: Show, id: string, patch: Partial<ShowReminder>, what: string) {
    saveShowReminders(
      show.id,
      (show.reminders ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      what,
    );
  }

  const shown = due.slice(0, 3);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-20 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 md:bottom-4"
    >
      {shown.map(({ show, reminder }) => (
        <div key={reminder.id} className="rounded-2xl bg-white p-4 shadow-xl shadow-neutral-900/15 ring-1 ring-amber-300">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 8.5a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12.5 5 8.5z" />
                <path d="M8.5 16.5a1.6 1.6 0 0 0 3 0" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Reminder</div>
              <div className="truncate font-semibold text-neutral-900">{show.client || show.location || "Show"}</div>
              <div className="tnum font-mono text-xs text-neutral-500">{reminderStamp.format(new Date(reminder.at))}</div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-800">{reminder.note}</p>
            </div>
            <button
              type="button"
              onClick={() => hide(reminder.id)}
              aria-label="Hide this reminder on this computer"
              title="Hide on this computer"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>
          {canEdit && (
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  update(
                    show,
                    reminder.id,
                    { at: new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString() },
                    `Snoozed a reminder ${SNOOZE_MINUTES} minutes`,
                  )
                }
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Snooze {SNOOZE_MINUTES} min
              </button>
              <button
                type="button"
                onClick={() => update(show, reminder.id, { done: true }, "Ticked off a reminder")}
                className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          )}
        </div>
      ))}
      {due.length > shown.length && (
        <div className="rounded-xl bg-neutral-900 px-3 py-2 text-center text-xs text-white">
          {due.length - shown.length} more reminder{due.length - shown.length === 1 ? "" : "s"} due
        </div>
      )}
    </div>
  );
}
