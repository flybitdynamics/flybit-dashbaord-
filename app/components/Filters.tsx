"use client";

import { Zone } from "../lib/types";
import { ZoneDot } from "./Badges";

export interface FilterState {
  query: string;
  zone: Zone | "all";
  payment: "all" | "paid" | "partial" | "pending" | "due";
  status: "active" | "all" | "upcoming" | "completed" | "cancelled";
}

export const defaultFilters: FilterState = {
  query: "",
  zone: "all",
  payment: "all",
  status: "active",
};

const zoneOptions: { value: Zone | "all"; label: string }[] = [
  { value: "all", label: "All zones" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
];

const selectClass =
  "rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm text-neutral-700 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900";

export function Filters({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex min-w-52 flex-1">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search client, location, person or B2B"
          aria-label="Search shows"
          className="w-full rounded-md border border-neutral-300 bg-white py-2 pl-8 pr-3 text-sm outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-900"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by zone"
        className="flex overflow-hidden rounded-md border border-neutral-300 bg-white"
      >
        {zoneOptions.map((option) => {
          const active = filters.zone === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => set("zone", option.value)}
              className={`flex items-center gap-1.5 border-r border-neutral-100 px-3 py-2 text-sm last:border-r-0 ${
                active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {option.value !== "all" && <ZoneDot zone={option.value as Zone} />}
              {option.label}
            </button>
          );
        })}
      </div>

      <select
        aria-label="Filter by payment"
        className={selectClass}
        value={filters.payment}
        onChange={(e) => set("payment", e.target.value as FilterState["payment"])}
      >
        <option value="all">Any payment</option>
        <option value="paid">Paid in full</option>
        <option value="partial">Part paid</option>
        <option value="pending">Nothing received</option>
        <option value="due">Amount pending</option>
      </select>

      <select
        aria-label="Filter by show status"
        className={selectClass}
        value={filters.status}
        onChange={(e) => set("status", e.target.value as FilterState["status"])}
      >
        <option value="active">Active shows</option>
        <option value="all">All statuses</option>
        <option value="upcoming">Upcoming</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
  );
}
