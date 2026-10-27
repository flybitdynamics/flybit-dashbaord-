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
  byLastChanged,
  formatDate,
  formatMoney,
  formatCompactMoney,
  isBooked,
  isOpen,
  isOverdue,
  latestLogTimes,
  paymentStateOf,
  pendingFor,
  receivedFor,
} from "../lib/types";
import {
  addPayment,
  getServerSnapshot,
  getSnapshot,
  removeExpense,
  removePayment,
  removeShow,
  setShowStatus,
  subscribe,
  upsertClient,
  upsertExpense,
  upsertShow,
} from "../lib/store";
import {
  getServerSnapshot as teamServerSnapshot,
  getSnapshot as teamSnapshot,
  subscribe as teamSubscribe,
} from "../lib/team-store";
import { ImportShowsDialog } from "./ImportShowsDialog";
import { useAuth } from "./AuthProvider";
import { DocumentsDialog } from "./DocumentsDialog";
import { FilterState, Filters, defaultFilters } from "./Filters";
import { ExpenseDialog } from "./finance/ExpenseDialog";
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
  | { kind: "expense"; show: Show; backToDetail: boolean }
  | { kind: "documents"; show: Show }
  | { kind: "import" };

export function Dashboard() {
  const { can } = useAuth();
  const canCreate = can("shows", "create");
  const canEditShow = can("shows", "edit");
  const canDeleteShow = can("shows", "delete");
  const canDocuments = can("documents", "view");
  const canExpense = can("finance", "create");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  /* The desk is read from Firestore, so it stays null through the server
     render and arrives on the client without an effect. */
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const team = useSyncExternalStore(teamSubscribe, teamSnapshot, teamServerSnapshot);
  const ready = state !== null;
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const pilots = useMemo(() => state?.pilots ?? [], [state]);
  const members = useMemo(() => team?.members ?? [], [team]);
  const places = useMemo(() => state?.places ?? [], [state]);
  const loggedAt = useMemo(() => latestLogTimes(state?.logs ?? []), [state]);
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
    const matching = shows.filter((show) => {
      if (filters.zone !== "all" && show.zone !== filters.zone) return false;

      if (filters.status === "open") {
        if (!isOpen(show)) return false;
      } else if (filters.status !== "all" && show.showStatus !== filters.status) {
        return false;
      }

      if (filters.payment !== "all") {
        if (!isBooked(show)) return false;
        if (filters.payment === "due") {
          if (pendingFor(show, payments) <= 0) return false;
        } else if (filters.payment === "overdue") {
          if (!isOverdue(show, payments)) return false;
        } else if (paymentStateOf(show, payments) !== filters.payment) {
          return false;
        }
      }

      if (filters.pilotId && filters.pilotId !== "all") {
        if (filters.pilotId.startsWith("person-")) {
          const personName = filters.pilotId.replace("person-", "").trim().toLowerCase();
          if ((show.person || "").trim().toLowerCase() !== personName) return false;
        } else {
          if (!show.pilotIds.includes(filters.pilotId)) {
            const pilotName = (pilotNames.get(filters.pilotId) || "").trim().toLowerCase();
            if (!pilotName || (show.person || "").trim().toLowerCase() !== pilotName) {
              return false;
            }
          }
        }
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
    // The store keeps shows in show-date order already.
    return filters.sort === "updated" ? byLastChanged(matching, loggedAt) : matching;
  }, [shows, payments, filters, pilotNames, loggedAt]);

  // Financial totals across all booked/flown shows
  const bookedShows = useMemo(() => shows.filter(isBooked), [shows]);
  const totalBookedValue = useMemo(
    () => bookedShows.reduce((sum, s) => sum + (s.showAmount || 0), 0),
    [bookedShows],
  );
  const totalCollected = useMemo(
    () => bookedShows.reduce((sum, s) => sum + receivedFor(s.id, payments), 0),
    [bookedShows, payments],
  );
  const totalPending = useMemo(
    () => bookedShows.reduce((sum, s) => sum + pendingFor(s, payments), 0),
    [bookedShows, payments],
  );
  const overdueShows = useMemo(
    () => bookedShows.filter((s) => isOverdue(s, payments)),
    [bookedShows, payments],
  );
  const totalOverdue = useMemo(
    () => overdueShows.reduce((sum, s) => sum + pendingFor(s, payments), 0),
    [overdueShows, payments],
  );
  const showsWithPending = useMemo(
    () => bookedShows.filter((s) => pendingFor(s, payments) > 0),
    [bookedShows, payments],
  );

  // Financial totals for currently visible (filtered) shows
  const visibleBooked = useMemo(() => visible.filter(isBooked), [visible]);
  const visibleBookedValue = useMemo(
    () => visibleBooked.reduce((sum, s) => sum + (s.showAmount || 0), 0),
    [visibleBooked],
  );
  const visibleCollected = useMemo(
    () => visibleBooked.reduce((sum, s) => sum + receivedFor(s.id, payments), 0),
    [visibleBooked, payments],
  );
  const visiblePending = useMemo(
    () => visibleBooked.reduce((sum, s) => sum + pendingFor(s, payments), 0),
    [visibleBooked, payments],
  );

  // Summary grouped individually by person / pilot
  const personSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        showsCount: number;
        bookedTotal: number;
        collectedTotal: number;
        pendingTotal: number;
      }
    >();

    pilots.forEach((pilot) => {
      map.set(pilot.id, {
        id: pilot.id,
        name: pilot.name,
        showsCount: 0,
        bookedTotal: 0,
        collectedTotal: 0,
        pendingTotal: 0,
      });
    });

    shows.forEach((show) => {
      const booked = isBooked(show);
      const amt = show.showAmount || 0;
      const rec = receivedFor(show.id, payments);
      const pend = pendingFor(show, payments);

      if (show.pilotIds && show.pilotIds.length > 0) {
        show.pilotIds.forEach((pid) => {
          const entry = map.get(pid);
          if (entry) {
            if (booked) {
              entry.showsCount++;
              entry.bookedTotal += amt;
              entry.collectedTotal += rec;
              entry.pendingTotal += pend;
            }
          }
        });
      } else if (show.person && show.person.trim()) {
        const key = `person-${show.person.trim().toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name: show.person.trim(),
            showsCount: 0,
            bookedTotal: 0,
            collectedTotal: 0,
            pendingTotal: 0,
          });
        }
        const entry = map.get(key)!;
        if (booked) {
          entry.showsCount++;
          entry.bookedTotal += amt;
          entry.collectedTotal += rec;
          entry.pendingTotal += pend;
        }
      }
    });

    return Array.from(map.values())
      .filter((p) => p.showsCount > 0)
      .sort((a, b) => b.bookedTotal - a.bookedTotal || b.showsCount - a.showsCount);
  }, [shows, payments, pilots]);

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
            {canCreate && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "import" })}
                className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Import
              </button>
            )}
            {canCreate && (
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

          {/* Financial KPI Summary for Shows */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Confirmed Budget
              </div>
              <div className="tnum mt-1 font-mono text-xl sm:text-2xl font-bold text-neutral-900">
                {formatMoney(totalBookedValue)}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {bookedShows.length} confirmed & completed show{bookedShows.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                Collected
              </div>
              <div className="tnum mt-1 font-mono text-xl sm:text-2xl font-bold text-emerald-900">
                {formatMoney(totalCollected)}
              </div>
              <div className="mt-0.5 text-xs text-emerald-700">
                {totalBookedValue > 0
                  ? `${Math.round((totalCollected / totalBookedValue) * 100)}% collected`
                  : "No payments yet"}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                Total Pending
              </div>
              <div className="tnum mt-1 font-mono text-xl sm:text-2xl font-bold text-amber-900">
                {formatMoney(totalPending)}
              </div>
              <div className="mt-0.5 text-xs text-amber-700">
                {showsWithPending.length} show{showsWithPending.length === 1 ? "" : "s"} with balance due
              </div>
            </div>

            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-3.5 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                Overdue Pending
              </div>
              <div className="tnum mt-1 font-mono text-xl sm:text-2xl font-bold text-rose-900">
                {formatMoney(totalOverdue)}
              </div>
              <div className="mt-0.5 text-xs text-rose-700">
                {overdueShows.length} show{overdueShows.length === 1 ? "" : "s"} flown past date
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Shows
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 font-mono">
                <span>
                  {visible.length} of {shows.length} show{shows.length === 1 ? "" : "s"}
                </span>
                {visibleBookedValue > 0 && (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span className="text-neutral-700 font-medium">
                      Budget: {formatMoney(visibleBookedValue)}
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-emerald-700 font-medium">
                      ✓ {formatMoney(visibleCollected)} collected
                    </span>
                    {visiblePending > 0 && (
                      <>
                        <span className="text-neutral-300">·</span>
                        <span className="text-amber-800 font-semibold">
                          ⏳ {formatMoney(visiblePending)} pending
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Individual Person / Pilot Breakdown Pills */}
            {personSummary.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-2xl border border-neutral-200/70 bg-neutral-50/60 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-neutral-600 text-[11px]">
                    Amounts by Person / Pilot
                  </span>
                  {filters.pilotId !== "all" && (
                    <button
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, pilotId: "all" }))}
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-900 underline"
                    >
                      Clear person filter
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, pilotId: "all" }))}
                    className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${filters.pilotId === "all"
                        ? "bg-neutral-900 text-white shadow-sm"
                        : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                      }`}
                  >
                    All Team ({bookedShows.length} booked)
                  </button>
                  {personSummary.map((person) => {
                    const isSelected = filters.pilotId === person.id;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            pilotId: isSelected ? "all" : person.id,
                          }))
                        }
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors ${isSelected
                            ? "bg-neutral-900 text-white shadow-sm ring-2 ring-neutral-900"
                            : "bg-white border border-neutral-200 text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
                          }`}
                      >
                        <span className="font-semibold">{person.name}</span>
                        <span className={`text-[11px] ${isSelected ? "text-neutral-300" : "text-neutral-400"}`}>
                          ({person.showsCount} booked)
                        </span>
                        <span
                          className={`font-mono text-[11px] font-medium ${isSelected ? "text-emerald-300" : "text-emerald-700"
                            }`}
                        >
                          ✓ {formatCompactMoney(person.collectedTotal)}
                        </span>
                        {person.pendingTotal > 0 && (
                          <span
                            className={`font-mono text-[11px] font-semibold rounded px-1 ${isSelected
                                ? "bg-amber-400/20 text-amber-200"
                                : "bg-amber-50 text-amber-800 border border-amber-200/60"
                              }`}
                          >
                            ⏳ {formatCompactMoney(person.pendingTotal)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Filters filters={filters} pilots={pilots} onChange={setFilters} />

            <ShowTable
              shows={visible}
              clients={clients}
              pilots={pilots}
              payments={payments}
              total={shows.length}
              canEdit={canEditShow}
              canDelete={canDeleteShow}
              canDocuments={canDocuments}
              onOpen={(show) => setDialog({ kind: "detail", show })}
              onEdit={(show) => setDialog({ kind: "show", show })}
              onDelete={handleDelete}
              onPayments={(show) => setDialog({ kind: "payments", show })}
              canExpense={canExpense}
              onExpense={(show) => setDialog({ kind: "expense", show, backToDetail: false })}
              onDocuments={(show) => setDialog({ kind: "documents", show })}
            />
          </section>
        </>
      )}

      {dialog.kind === "import" && (
        <ImportShowsDialog
          shows={shows}
          onDone={(count) => {
            setDialog({ kind: "none" });
            window.alert(`${count} row${count === 1 ? "" : "s"} imported.`);
          }}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "detail" && (
        <ShowDetailDialog
          key={dialog.show.id}
          show={live(dialog.show)}
          clients={clients}
          pilots={pilots}
          payments={payments}
          canEdit={canEditShow}
          canDocuments={canDocuments}
          canInvoice={can("invoices", "create")}
          canQuote={can("quotations", "create")}
          canExpense={canExpense}
          onStage={(status) => setShowStatus(dialog.show.id, status)}
          onEdit={() => setDialog({ kind: "show", show: live(dialog.show) })}
          onPayments={() => setDialog({ kind: "payments", show: dialog.show })}
          onExpense={() => setDialog({ kind: "expense", show: dialog.show, backToDetail: true })}
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
          canCreateClient={can("clients", "create")}
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
          canEdit={can("finance", "create")}
          canRemove={can("finance", "delete")}
          onAdd={addPayment}
          onRemove={removePayment}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "expense" && (
        <ExpenseDialog
          key={dialog.show.id}
          expense={null}
          shows={shows}
          team={members}
          showId={dialog.show.id}
          canDelete={false}
          onSave={(draft, id) => {
            upsertExpense(draft, id);
            setDialog(
              dialog.backToDetail ? { kind: "detail", show: dialog.show } : { kind: "none" },
            );
          }}
          onDelete={(expense) => removeExpense(expense.id)}
          onClose={() =>
            setDialog(dialog.backToDetail ? { kind: "detail", show: dialog.show } : { kind: "none" })
          }
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
