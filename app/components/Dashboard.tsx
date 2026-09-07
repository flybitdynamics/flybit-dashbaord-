"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  PAYMENT_MODES,
  PERMISSION_STATUSES,
  PAYMENT_STATE_LABELS,
  Payment,
  SHOW_STATUSES,
  Show,
  ZONES,
  formatDate,
  paymentStateOf,
  pendingFor,
  receivedFor,
} from "../lib/types";
import {
  addPayment,
  browserRowCount,
  getServerSnapshot,
  getSnapshot,
  removePayment,
  removeShow,
  subscribe,
  upsertShow,
  importFromBrowser,
  loadSampleRows,
} from "../lib/store";
import { DocumentsDialog } from "./DocumentsDialog";
import { FilterState, Filters, defaultFilters } from "./Filters";
import { OnDeck } from "./OnDeck";
import { PaymentsDialog } from "./PaymentsDialog";
import { ShowDialog } from "./ShowDialog";
import { ShowTable } from "./ShowTable";
import { StatsRail } from "./StatsRail";

type Dialog =
  | { kind: "none" }
  | { kind: "show"; show: Show | null }
  | { kind: "payments"; show: Show }
  | { kind: "documents"; show: Show };

export function Dashboard() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  /* The desk is read from localStorage, so it stays null through the
     server render and arrives on the client without an effect. */
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const settings = state?.settings;
  const storeError = state?.error ?? null;
  // localStorage is browser-only; the banner only renders once state exists.
  const strandedRows = ready && shows.length === 0 ? browserRowCount() : 0;

  function handleDelete(show: Show) {
    if (!window.confirm(`Delete the ${show.location || "untitled"} show and its payments?`)) {
      return;
    }
    removeShow(show.id);
    setDialog({ kind: "none" });
  }

  const visible = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return shows.filter((show) => {
      if (filters.zone !== "all" && show.zone !== filters.zone) return false;

      if (filters.status === "active") {
        if (show.showStatus === "cancelled") return false;
      } else if (filters.status !== "all" && show.showStatus !== filters.status) {
        return false;
      }

      if (filters.payment === "due") {
        if (pendingFor(show, payments) <= 0) return false;
      } else if (
        filters.payment !== "all" &&
        paymentStateOf(show, payments) !== filters.payment
      ) {
        return false;
      }

      if (query) {
        const haystack = [
          show.location,
          show.client,
          show.contact,
          show.person,
          show.b2b,
          show.venueAddress,
          show.notes,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [shows, payments, filters]);

  function exportCsv() {
    const headers = [
      "Sr No", "Location", "Client", "Contact number", "Zone", "Drone Count", "Person",
      "Booking Date", "Show Amount", "Show Date", "Show Time", "Payment Status",
      "Amount Received", "Amount Pending", "Show Status", "B2B", "Permission",
      "Notes", "Commission", "Venue address", "Coordinates",
    ];
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(quote).join(",")];

    visible.forEach((show, index) => {
      lines.push(
        [
          index + 1,
          show.location,
          show.client,
          show.contact,
          ZONES[show.zone].label,
          show.droneCount,
          show.person,
          formatDate(show.bookingDate),
          show.showAmount,
          formatDate(show.showDate),
          `${show.showStartTime}–${show.showEndTime}`,
          PAYMENT_STATE_LABELS[paymentStateOf(show, payments)],
          receivedFor(show.id, payments),
          pendingFor(show, payments),
          SHOW_STATUSES[show.showStatus],
          show.b2b,
          PERMISSION_STATUSES[show.permission],
          show.notes,
          show.commission,
          show.venueAddress,
          show.coordinates,
        ]
          .map(quote)
          .join(","),
      );
    });

    lines.push("");
    lines.push(["Payment log"].map(quote).join(","));
    lines.push(["Location", "Client", "Payment received", "Date", "Mode", "Contact number", "Notes"].map(quote).join(","));
    payments.forEach((payment: Payment) => {
      const show = shows.find((s) => s.id === payment.showId);
      lines.push(
        [
          show?.location ?? "",
          show?.client ?? "",
          payment.amount,
          formatDate(payment.date),
          PAYMENT_MODES[payment.mode],
          show?.contact ?? "",
          payment.notes,
        ]
          .map(quote)
          .join(","),
      );
    });

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flybit-shows-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1>
            <Image
              src="/logo-on-light.png"
              alt="FLYBIT Dynamics"
              width={666}
              height={276}
              priority
              className="h-9 w-auto"
            />
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Drone show booking desk — shows, payments and MoCA permission paperwork
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setDialog({ kind: "show", show: null })}
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + New show
          </button>
        </div>
      </header>

      {storeError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {storeError}
        </div>
      )}

      {ready && shows.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          <span className="flex-1">
            <strong className="font-semibold text-neutral-900">No shows in Firebase yet.</strong>{" "}
            {strandedRows > 0
              ? `There ${strandedRows === 1 ? "is 1 show" : `are ${strandedRows} shows`} saved in this browser from before — bring them across, or start fresh.`
              : "Add your first booking, or load a few example rows to see how the desk works."}
          </span>
          {strandedRows > 0 && (
            <button
              type="button"
              onClick={importFromBrowser}
              className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Import {strandedRows} from this browser
            </button>
          )}
          <button
            type="button"
            onClick={loadSampleRows}
            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs hover:bg-neutral-100"
          >
            Load sample rows
          </button>
        </div>
      )}

      {!ready ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm text-neutral-500">
          Loading the desk from Firebase…
        </div>
      ) : (
        <>
          <StatsRail shows={shows} payments={payments} />
          <OnDeck shows={shows} payments={payments} />

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Shows
              </h2>
              <span className="text-xs text-neutral-500">
                {visible.length} of {shows.length} show{shows.length === 1 ? "" : "s"}
              </span>
            </div>

            <Filters filters={filters} onChange={setFilters} />

            <ShowTable
              shows={visible}
              payments={payments}
              total={shows.length}
              onEdit={(show) => setDialog({ kind: "show", show })}
              onDelete={handleDelete}
              onPayments={(show) => setDialog({ kind: "payments", show })}
              onDocuments={(show) => setDialog({ kind: "documents", show })}
            />

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                Green — no permission needed, up to 120 m
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                Yellow — controlled airspace, ATC permission needed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                Red — Central Government permission needed
              </span>
              <span className="text-neutral-400">
                Zone comes from the DGCA airspace map, not from your filing status.
              </span>
            </div>
          </section>
        </>
      )}

      <footer className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        Synced to Firebase ({process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}) · Amounts in INR ·
        Times are local to the venue
      </footer>

      {dialog.kind === "show" && (
        <ShowDialog
          key={dialog.show?.id ?? "new"}
          show={dialog.show}
          onSave={(draft, id) => {
            upsertShow(draft, id);
            setDialog({ kind: "none" });
          }}
          onDelete={handleDelete}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "payments" && (
        <PaymentsDialog
          key={dialog.show.id}
          show={shows.find((s) => s.id === dialog.show.id) ?? dialog.show}
          payments={payments}
          onAdd={addPayment}
          onRemove={removePayment}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "documents" && settings && (
        <DocumentsDialog
          key={dialog.show.id}
          show={dialog.show}
          settings={settings}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
