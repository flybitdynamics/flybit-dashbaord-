"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "../../lib/store";
import { currentMonth, formatMonth } from "../../lib/team";
import {
  Show,
  Zone,
  formatCompactMoney,
  formatNumber,
  formatTime,
  pendingFor,
  todayISO,
} from "../../lib/types";
import { SiteHeader } from "../SiteHeader";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const zoneDot: Record<Zone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Six weeks starting on the Monday on or before the 1st. */
function buildGrid(month: string): Cell[] {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, m - 1, 1 - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { iso, day: d.getDate(), inMonth: iso.startsWith(month) };
  });
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ShowCalendar({ onOpenShow }: { onOpenShow: (show: Show) => void }) {
  const [month, setMonth] = useState(currentMonth());

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);

  const grid = useMemo(() => buildGrid(month), [month]);
  const today = todayISO();

  const byDate = useMemo(() => {
    const map = new Map<string, Show[]>();
    for (const show of shows) {
      if (show.showStatus === "cancelled") continue;
      const list = map.get(show.showDate) ?? [];
      list.push(show);
      map.set(show.showDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.showStartTime.localeCompare(b.showStartTime));
    }
    return map;
  }, [shows]);

  const monthShows = shows.filter(
    (s) => s.showStatus !== "cancelled" && s.showDate.startsWith(month),
  );
  const drones = monthShows.reduce((sum, s) => sum + (s.droneCount || 0), 0);
  const value = monthShows.reduce((sum, s) => sum + (s.showAmount || 0), 0);
  const due = monthShows.reduce((sum, s) => sum + pendingFor(s, payments), 0);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Calendar"
        subtitle="Every show by date — click one to open it"
        actions={
          <div className="flex items-center gap-1 rounded-md bg-neutral-100 p-1">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month"
              className="rounded px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-white hover:text-neutral-900"
            >
              ←
            </button>
            <span className="min-w-36 text-center text-sm font-medium text-neutral-900">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month"
              className="rounded px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-white hover:text-neutral-900"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setMonth(currentMonth())}
              className="ml-1 rounded px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-white hover:text-neutral-900"
            >
              Today
            </button>
          </div>
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading the calendar from Firebase…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
            {[
              { label: "Shows", value: String(monthShows.length), note: formatMonth(month) },
              { label: "Drones", value: formatNumber(drones), note: "across the month" },
              { label: "Value", value: formatCompactMoney(value), note: "booked this month" },
              { label: "To collect", value: formatCompactMoney(due), note: "still outstanding" },
            ].map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div className="tnum mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                  {tile.value}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          <section className="card overflow-hidden">
            <div className="grid grid-cols-7 bg-neutral-50/70">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {grid.map((cell) => {
                const dayShows = byDate.get(cell.iso) ?? [];
                const isToday = cell.iso === today;
                return (
                  <div
                    key={cell.iso}
                    className={`min-h-28 border-b border-r border-neutral-100 p-2 last:border-r-0 ${
                      cell.inMonth ? "" : "bg-neutral-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`tnum inline-flex size-6 items-center justify-center rounded-full font-mono text-xs ${
                          isToday
                            ? "bg-neutral-900 font-semibold text-white"
                            : cell.inMonth
                              ? "text-neutral-700"
                              : "text-neutral-300"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {dayShows.length > 1 && (
                        <span className="text-[10px] text-neutral-400">{dayShows.length}</span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-col gap-1">
                      {dayShows.map((show) => (
                        <button
                          key={show.id}
                          type="button"
                          onClick={() => onOpenShow(show)}
                          title={`${show.client || show.location} · ${formatNumber(show.droneCount)} drones`}
                          className="w-full rounded-md bg-neutral-50 px-1.5 py-1 text-left transition-colors hover:bg-neutral-100"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`size-1.5 shrink-0 rounded-full ${zoneDot[show.zone]}`} />
                            <span className="truncate text-[11px] font-medium text-neutral-800">
                              {show.location || show.client || "Show"}
                            </span>
                          </span>
                          <span className="tnum mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                            {formatTime(show.showStartTime)} · {formatNumber(show.droneCount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> Green — no permission needed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" /> Yellow — ATC permission needed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-500" /> Red — Central Government permission
            </span>
          </div>
        </>
      )}
    </div>
  );
}
