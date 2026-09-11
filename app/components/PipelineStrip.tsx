"use client";

import {
  PIPELINE,
  Payment,
  SHOW_STATUSES,
  STAGE_HINTS,
  Show,
  ShowStatus,
  formatCompactMoney,
  pendingFor,
} from "../lib/types";
import { FilterState } from "./Filters";

/** The funnel at a glance: how many shows sit at each stage and what they
 *  are worth. Clicking a stage filters the table to it. */
export function PipelineStrip({
  shows,
  payments,
  active,
  onPick,
}: {
  shows: Show[];
  payments: Payment[];
  active: FilterState["status"];
  onPick: (status: FilterState["status"]) => void;
}) {
  const at = (status: ShowStatus) => shows.filter((s) => s.showStatus === status);
  const value = (list: Show[]) => list.reduce((sum, s) => sum + (s.showAmount || 0), 0);

  const notes: Record<ShowStatus, (list: Show[]) => string> = {
    inquiry: (list) => (list.length ? `${formatCompactMoney(value(list))} if all convert` : "no open leads"),
    confirmed: (list) => (list.length ? `${formatCompactMoney(value(list))} booked` : "nothing booked"),
    completed: (list) => {
      const due = list.reduce((sum, s) => sum + pendingFor(s, payments), 0);
      return due > 0 ? `${formatCompactMoney(due)} to collect` : "all collected";
    },
    closed: (list) => (list.length ? `${formatCompactMoney(value(list))} earned` : "none yet"),
    lost: () => "",
    cancelled: () => "",
  };

  const lost = at("lost").length;
  const cancelled = at("cancelled").length;

  return (
    <section aria-label="Pipeline">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
          Pipeline
        </h2>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <button
            type="button"
            onClick={() => onPick(active === "lost" ? "all" : "lost")}
            className={`hover:text-neutral-900 ${active === "lost" ? "font-semibold text-neutral-900" : ""}`}
          >
            {lost} lost
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onPick(active === "cancelled" ? "all" : "cancelled")}
            className={`hover:text-neutral-900 ${active === "cancelled" ? "font-semibold text-neutral-900" : ""}`}
          >
            {cancelled} cancelled
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
        {PIPELINE.map((status, i) => {
          const list = at(status);
          const selected = active === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              title={STAGE_HINTS[status]}
              onClick={() => onPick(selected ? "all" : status)}
              className={`group relative px-4 py-3.5 text-left transition-colors ${selected ? "bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50"
                }`}
            >
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${selected ? "text-neutral-300" : "text-neutral-500"
                  }`}
              >
                <span
                  className={`tnum inline-flex size-4 items-center justify-center rounded-full text-[9px] ${selected ? "bg-white/15" : "bg-neutral-100"
                    }`}
                >
                  {i + 1}
                </span>
                {SHOW_STATUSES[status]}
              </div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{list.length}</div>
              <div className={`mt-0.5 text-xs ${selected ? "text-neutral-300" : "text-neutral-500"}`}>
                {notes[status](list)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
