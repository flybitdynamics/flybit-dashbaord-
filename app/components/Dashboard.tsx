"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CLIENT_TYPES,
  PAYMENT_MODES,
  PAYMENT_STATE_LABELS,
  PERMISSION_STATUSES,
  Payment,
  SHOW_STATUSES,
  Show,
  ZONES,
  formatDate,
  isBooked,
  isOpen,
  paymentStateOf,
  pendingFor,
  receivedFor,
} from "../lib/types";
import {
  addPayment,
  getServerSnapshot,
  getSnapshot,
  removePayment,
  removeShow,
  setShowStatus,
  subscribe,
  upsertClient,
  upsertShow,
} from "../lib/store";
import { useAuth } from "./AuthProvider";
import { DocumentsDialog } from "./DocumentsDialog";
import { FilterState, Filters, defaultFilters } from "./Filters";
import { PaymentsDialog } from "./PaymentsDialog";
import { PipelineStrip } from "./PipelineStrip";
import { ShowDetailDialog } from "./ShowDetailDialog";
import { ShowDialog } from "./ShowDialog";
import { ShowTable } from "./ShowTable";
import { SiteHeader } from "./SiteHeader";

type Dialog =
  | { kind: "none" }
  | { kind: "detail"; show: Show }
  | { kind: "show"; show: Show | null }
  | { kind: "payments"; show: Show }
  | { kind: "documents"; show: Show };

export function Dashboard() {
  const { canEdit } = useAuth();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  /* The desk is read from Firestore, so it stays null through the server
     render and arrives on the client without an effect. */
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const expenses = useMemo(() => state?.expenses ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const pilots = useMemo(() => state?.pilots ?? [], [state]);
  const places = useMemo(() => state?.places ?? [], [state]);
  const settings = state?.settings;
  const storeError = state?.error ?? null;

  /** The live copy, so a stage change shows up in an open dialog at once. */
  const live = (show: Show) => shows.find((s) => s.id === show.id) ?? show;

  function handleDelete(show: Show) {
    if (!window.confirm(`Delete the ${show.client || show.location || "untitled"} show and its payments?`)) {
      return;
    }
    removeShow(show.id);
    setDialog({ kind: "none" });
  }

  const pilotNames = useMemo(
    () => new Map(pilots.map((p) => [p.id, p.name])),
    [pilots],
  );

  const visible = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return shows.filter((show) => {
      if (filters.zone !== "all" && show.zone !== filters.zone) return false;

      if (filters.status === "open") {
        if (!isOpen(show)) return false;
      } else if (filters.status !== "all" && show.showStatus !== filters.status) {
        return false;
      }

      if (filters.payment === "due") {
        if (!isBooked(show) || pendingFor(show, payments) <= 0) return false;
      } else if (
        filters.payment !== "all" &&
        paymentStateOf(show, payments) !== filters.payment
      ) {
        return false;
      }

      if (query) {
        const haystack = [
          show.client,
          show.contactName,
          show.contactPhone,
          show.contact,
          show.state,
          show.location,
          show.area,
          show.venueAddress,
          show.notes,
          show.person,
          ...show.pilotIds.map((id) => pilotNames.get(id) ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [shows, payments, filters, pilotNames]);

  function exportCsv() {
    const headers = [
      "Sr No", "Stage", "Client", "Client type", "Contact person", "Contact number",
      "State", "District / city", "Area", "Zone", "Drone count", "Pilots",
      "Booking date", "Show date", "Show time", "Show amount", "Amount received",
      "Amount pending", "Payment status", "Commission", "Permission",
      "Venue address", "Coordinates", "Notes",
    ];
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(quote).join(",")];

    visible.forEach((show, index) => {
      const client = clients.find((c) => c.id === show.clientId);
      const booked = isBooked(show);
      lines.push(
        [
          index + 1,
          SHOW_STATUSES[show.showStatus],
          show.client,
          client ? CLIENT_TYPES[client.type] : "",
          show.contactName,
          show.contactPhone || show.contact,
          show.state,
          show.location,
          show.area,
          ZONES[show.zone].label,
          show.droneCount,
          show.pilotIds.map((id) => pilotNames.get(id) ?? "").filter(Boolean).join("; ") || show.person,
          formatDate(show.bookingDate),
          formatDate(show.showDate),
          `${show.showStartTime}–${show.showEndTime}`,
          show.showAmount,
          booked ? receivedFor(show.id, payments) : "",
          booked ? pendingFor(show, payments) : "",
          booked ? PAYMENT_STATE_LABELS[paymentStateOf(show, payments)] : "Not booked",
          show.commission,
          PERMISSION_STATUSES[show.permission],
          show.venueAddress,
          show.coordinates,
          show.notes,
        ]
          .map(quote)
          .join(","),
      );
    });

    lines.push("");
    lines.push(["Payment log"].map(quote).join(","));
    lines.push(
      ["Client", "District / city", "Payment received", "Date", "Mode", "Contact number", "Notes"]
        .map(quote)
        .join(","),
    );
    payments.forEach((payment: Payment) => {
      const show = shows.find((s) => s.id === payment.showId);
      lines.push(
        [
          show?.client ?? "",
          show?.location ?? "",
          payment.amount,
          formatDate(payment.date),
          PAYMENT_MODES[payment.mode],
          show?.contactPhone || show?.contact || "",
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
      <SiteHeader
        title="Shows"
        subtitle="Every booking from first inquiry to closed — with payments and MoCA paperwork"
        actions={
          <>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Export CSV
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "show", show: null })}
                className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                + New inquiry
              </button>
            )}
          </>
        }
      />

      {storeError && (
        <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{storeError}</div>
      )}

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading the desk from Firebase…
        </div>
      ) : (
        <>
          <PipelineStrip
            shows={shows}
            payments={payments}
            active={filters.status}
            onPick={(status) => setFilters((prev) => ({ ...prev, status }))}
          />

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
              clients={clients}
              pilots={pilots}
              total={shows.length}
              canEdit={canEdit}
              onOpen={(show) => setDialog({ kind: "detail", show })}
              onEdit={(show) => setDialog({ kind: "show", show })}
              onDelete={handleDelete}
              onPayments={(show) => setDialog({ kind: "payments", show })}
              onDocuments={(show) => setDialog({ kind: "documents", show })}
            />
          </section>
        </>
      )}

      {dialog.kind === "detail" && (
        <ShowDetailDialog
          key={dialog.show.id}
          show={live(dialog.show)}
          clients={clients}
          pilots={pilots}
          payments={payments}
          expenses={expenses}
          canEdit={canEdit}
          onStage={(status) => setShowStatus(dialog.show.id, status)}
          onEdit={() => setDialog({ kind: "show", show: live(dialog.show) })}
          onPayments={() => setDialog({ kind: "payments", show: dialog.show })}
          onDocuments={() => setDialog({ kind: "documents", show: dialog.show })}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "show" && (
        <ShowDialog
          key={dialog.show?.id ?? "new"}
          show={dialog.show}
          clients={clients}
          pilots={pilots}
          places={places}
          onCreateClient={(draft) => upsertClient(draft, null)}
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
          show={live(dialog.show)}
          payments={payments}
          canEdit={canEdit}
          onAdd={addPayment}
          onRemove={removePayment}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "documents" && settings && (
        <DocumentsDialog
          key={dialog.show.id}
          show={live(dialog.show)}
          settings={settings}
          pilots={pilots}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
