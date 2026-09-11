import {
  Payment,
  Show,
  daysAway,
  formatCompactMoney,
  formatNumber,
  isBooked,
  isOverdue,
  needsClearance,
  pendingFor,
  receivedFor,
} from "../lib/types";

interface Tile {
  label: string;
  value: string;
  note: string;
}

export function StatsRail({ shows, payments }: { shows: Show[]; payments: Payment[] }) {
  // Money is only owed on booked shows; an inquiry's figure is a quote.
  const live = shows.filter(isBooked);

  const upcoming = shows.filter((s) => {
    const days = daysAway(s.showDate);
    return days !== null && days >= 0 && s.showStatus === "confirmed";
  });

  const within30 = upcoming.filter((s) => (daysAway(s.showDate) ?? 99) <= 30);
  const fleet = upcoming.reduce((sum, s) => sum + (s.droneCount || 0), 0);
  const booked = live.reduce((sum, s) => sum + (s.showAmount || 0), 0);
  const received = live.reduce((sum, s) => sum + receivedFor(s.id, payments), 0);
  const pending = live.reduce((sum, s) => sum + pendingFor(s, payments), 0);
  const overdue = live.filter((s) => isOverdue(s, payments)).length;
  const flags = shows.filter(needsClearance).length;

  const tiles: Tile[] = [
    {
      label: "Confirmed ahead",
      value: String(upcoming.length),
      note: `${within30.length} within 30 days`,
    },
    {
      label: "Drone count",
      value: formatNumber(fleet),
      note: "committed to upcoming shows",
    },
    {
      label: "Booked value",
      value: formatCompactMoney(booked),
      note: `${formatCompactMoney(received)} received`,
    },
    {
      label: "Amount pending",
      value: formatCompactMoney(pending),
      note: overdue > 0 ? `${overdue} past show date` : "all within terms",
    },
    {
      label: "Permission flags",
      value: String(flags),
      note: "confirmed, yellow/red zone, not approved",
    },
  ];

  return (
    /* gap-px over a gray ground draws clean hairlines however the tiles
       wrap; the last tile fills the short row. */
    <section
      aria-label="Summary"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1"
    >
      {tiles.map((tile) => (
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
  );
}
