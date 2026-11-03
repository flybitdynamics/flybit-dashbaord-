"use client";

import { useState } from "react";
import { saveShowReminders } from "../lib/store";
import { newId } from "../lib/storage";
import { Show, ShowReminder, todayISO } from "../lib/types";
import { useAuth } from "./AuthProvider";
import { Field, Modal, inputClass } from "./Modal";

export const reminderStamp = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** One hour from now, on the next whole quarter hour, as the time box wants it. */
function nextSlot(): { date: string; time: string } {
  const at = new Date(Date.now() + 60 * 60 * 1000);
  at.setMinutes(Math.ceil(at.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** Asks once whether the desk may notify when a reminder is due while this
 *  tab is in the background. The in-app popup works either way. */
function askToNotify() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    /* not supported here */
  }
}

/** Set a reminder on a show, and see or tick off the ones already set. */
export function ReminderDialog({ show, canEdit, onClose }: { show: Show; canEdit: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const [slot] = useState(nextSlot);
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const reminders = [...(show.reminders ?? [])].sort(
    (a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at),
  );
  /** Fixed while the dialog is open; enough to mark what is already due. */
  const [now] = useState(() => Date.now());

  function add(e: React.FormEvent) {
    e.preventDefault();
    const at = new Date(`${date}T${time}`);
    if (!date || !time || Number.isNaN(at.getTime())) {
      setProblem("Pick a date and a time.");
      return;
    }
    if (!note.trim()) {
      setProblem("Write what the reminder is about.");
      return;
    }
    const reminder: ShowReminder = {
      id: newId(),
      at: at.toISOString(),
      note: note.trim(),
      done: false,
      createdBy: profile?.name || profile?.email || "",
      createdAt: new Date().toISOString(),
    };
    saveShowReminders(show.id, [...(show.reminders ?? []), reminder], `Set a reminder for ${reminderStamp.format(at)}`);
    askToNotify();
    setNote("");
    setProblem(null);
  }

  function setDone(reminder: ShowReminder, done: boolean) {
    saveShowReminders(
      show.id,
      (show.reminders ?? []).map((r) => (r.id === reminder.id ? { ...r, done } : r)),
      done ? "Ticked off a reminder" : "Reopened a reminder",
    );
  }

  function remove(reminder: ShowReminder) {
    if (!window.confirm("Delete this reminder?")) return;
    saveShowReminders(
      show.id,
      (show.reminders ?? []).filter((r) => r.id !== reminder.id),
      "Deleted a reminder",
    );
  }

  return (
    <Modal
      title="Reminders"
      subtitle={`For ${show.client || show.location || "this show"}. It pops up in the desk at the time you set.`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
        >
          Close
        </button>
      }
    >
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-5">
        {canEdit && (
          <form onSubmit={add} className="grid grid-cols-1 gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200 sm:grid-cols-2">
            {problem && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{problem}</p>}
            <Field label="Date" htmlFor="r-date">
              <input
                id="r-date"
                type="date"
                min={todayISO()}
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Time" htmlFor="r-time">
              <input
                id="r-time"
                type="time"
                className={inputClass}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field label="Note" htmlFor="r-note" wide>
              <textarea
                id="r-note"
                rows={3}
                autoFocus
                className={`${inputClass} resize-y`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Call the client about the advance, send the revised quotation…"
              />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Set reminder
              </button>
            </div>
          </form>
        )}

        {reminders.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">No reminders on this show yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reminders.map((reminder) => {
              const due = !reminder.done && new Date(reminder.at).getTime() <= now;
              return (
                <li
                  key={reminder.id}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                    reminder.done
                      ? "bg-white text-neutral-400 ring-neutral-100"
                      : due
                        ? "bg-amber-50 ring-amber-200"
                        : "bg-white ring-neutral-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`tnum font-mono font-medium ${reminder.done ? "line-through" : "text-neutral-900"}`}>
                        {reminderStamp.format(new Date(reminder.at))}
                      </span>
                      {due && <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">DUE</span>}
                      {reminder.done && <span className="text-[11px]">Done</span>}
                    </div>
                    <p className={`mt-0.5 whitespace-pre-wrap text-sm ${reminder.done ? "" : "text-neutral-800"}`}>
                      {reminder.note}
                    </p>
                    {reminder.createdBy && <p className="mt-0.5 text-[11px] text-neutral-400">Set by {reminder.createdBy}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setDone(reminder, !reminder.done)}
                        className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        {reminder.done ? "Reopen" : "Done"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(reminder)}
                        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
