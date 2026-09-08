import {
  Payment,
  Show,
  countdownLabel,
  daysAway,
  formatCompactMoney,
  formatDate,
  formatNumber,
  formatTime,
  pendingFor,
} from "../lib/types";
import { PermissionLabel, ZoneBadge } from "./Badges";

export function OnDeck({ shows, payments }: { shows: Show[]; payments: Payment[] }) {
  const next = shows
    .filter((s) => {
      const days = daysAway(s.showDate);
      return s.showStatus === "upcoming" && days !== null && days >= 0;
    })
    .slice(0, 3);

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
          On deck
        </h2>
        <span className="text-xs text-neutral-500">Next three shows by date</span>
      </div>

      {next.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          Nothing on the calendar. Add a booking and the next three shows appear here.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {next.map((show) => {
            const pending = pendingFor(show, payments);
            return (
              <article
                key={show.id}
                className="card p-4"
              >
                <div className="tnum flex items-baseline justify-between gap-2 font-mono text-xs text-neutral-500">
                  <span>
                    {formatDate(show.showDate)} · {formatTime(show.showStartTime)}
                  </span>
                  <span>{countdownLabel(show.showDate)}</span>
                </div>

                <h3 className="mt-2 text-base font-semibold tracking-tight text-neutral-900">
                  {show.client || show.location || "Untitled booking"}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-600">
                  {show.location || "Location TBC"} ·{" "}
                  <span className="tnum font-mono">{formatNumber(show.droneCount)}</span> drones
                </p>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                  <div className="flex items-center gap-2">
                    <ZoneBadge zone={show.zone} />
                    <PermissionLabel status={show.permission} />
                  </div>
                  <span className="tnum font-mono text-xs text-neutral-600">
                    {pending > 0 ? `${formatCompactMoney(pending)} due` : "Paid"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
