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

/** The funnel at a glance: how many shows sit at each stage and their financial value.
 *  Clicking a stage filters the table to it. */
export function PipelineStrip({
  shows,
  payments = [],
  active,
  onPick,
}: {
  shows: Show[];
  payments?: Payment[];
  active: FilterState["status"];
  onPick: (status: FilterState["status"]) => void;
}) {
  const at = (status: ShowStatus) => shows.filter((s) => s.showStatus === status);

  const emptyNotes: Record<ShowStatus, string> = {
    inquiry: "no open leads",
    confirmed: "nothing booked",
    completed: "none flown yet",
    closed: "none yet",
    lost: "",
    cancelled: "",
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
        {PIPELINE.map((status) => {
          const list = at(status);
          const selected = active === status;
          const stageTotal = list.reduce((sum, s) => sum + (s.showAmount || 0), 0);
          const stagePending = list.reduce((sum, s) => sum + pendingFor(s, payments), 0);

          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              title={STAGE_HINTS[status]}
              onClick={() => onPick(selected ? "all" : status)}
              className={`group relative px-4 py-3.5 text-left transition-colors ${
                selected ? "bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[11px] font-medium uppercase tracking-wider ${
                    selected ? "text-neutral-300" : "text-neutral-500"
                  }`}
                >
                  {SHOW_STATUSES[status]}
                </span>
                {stageTotal > 0 && (
                  <span
                    className={`tnum font-mono text-[11px] font-semibold ${
                      selected ? "text-neutral-300" : "text-neutral-700"
                    }`}
                  >
                    {formatCompactMoney(stageTotal)} {status === "inquiry" ? "quoted" : ""}
                  </span>
                )}
              </div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{list.length}</div>
              <div className={`mt-0.5 text-xs ${selected ? "text-neutral-300" : "text-neutral-500"}`}>
                {status !== "inquiry" && stagePending > 0 ? (
                  <span className={selected ? "font-mono font-medium text-amber-300" : "font-mono font-medium text-amber-700"}>
                    ⏳ {formatCompactMoney(stagePending)} pending
                  </span>
                ) : status === "inquiry" ? (
                  <span className={selected ? "text-neutral-300" : "text-neutral-500"}>
                    {list.length ? "Leads · ₹0 pending (not in budget)" : emptyNotes[status]}
                  </span>
                ) : list.length ? (
                  STAGE_HINTS[status]
                ) : (
                  emptyNotes[status]
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
