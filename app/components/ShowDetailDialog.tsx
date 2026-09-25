"use client";

import Link from "next/link";

import { EXPENSE_CATEGORIES, Expense, showMargin } from "../lib/finance";
import {
  Client,
  PAYMENT_MODES,
  PAYMENT_STATE_LABELS,
  PIPELINE,
  Payment,
  Pilot,
  SHOW_STATUSES,
  STAGE_HINTS,
  Show,
  ShowStatus,
  ZONES,
  certificateState,
  contactLabel,
  countdownLabel,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  isBooked,
  paymentStateOf,
  pendingFor,
  placeLabel,
} from "../lib/types";
import { Modal } from "./Modal";
import {
  CertificateBadge,
  ClientTypeBadge,
  PermissionLabel,
  ShowStatusBadge,
  ZoneBadge,
} from "./Badges";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-xs text-neutral-500">{label}</span>
      <span className="text-right text-sm text-neutral-900">{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

type Tone = "primary" | "quiet" | "danger";

/** What can happen next from each stage. */
const MOVES: Record<ShowStatus, { to: ShowStatus; label: string; tone: Tone }[]> = {
  inquiry: [
    { to: "confirmed", label: "Confirm booking", tone: "primary" },
    { to: "lost", label: "Mark as lost", tone: "danger" },
  ],
  confirmed: [
    { to: "completed", label: "Mark show completed", tone: "primary" },
    { to: "cancelled", label: "Cancel show", tone: "danger" },
    { to: "inquiry", label: "Back to inquiry", tone: "quiet" },
  ],
  completed: [
    { to: "closed", label: "Close — fully settled", tone: "primary" },
    { to: "confirmed", label: "Back to confirmed", tone: "quiet" },
  ],
  closed: [{ to: "completed", label: "Reopen", tone: "quiet" }],
  lost: [{ to: "inquiry", label: "Reopen inquiry", tone: "quiet" }],
  cancelled: [{ to: "confirmed", label: "Reinstate booking", tone: "quiet" }],
};

const toneClass: Record<Tone, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  quiet: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
};

/** Inquiry → Confirmed → Completed → Closed, with where this show is. */
function Stepper({ status }: { status: ShowStatus }) {
  const exited = status === "lost" || status === "cancelled";
  const reached = exited
    ? status === "lost"
      ? 0
      : 1
    : PIPELINE.indexOf(status);

  return (
    <ol className="flex items-center gap-1.5" aria-label="Pipeline stage">
      {PIPELINE.map((stage, i) => {
        const done = i < reached;
        const current = i === reached && !exited;
        return (
          <li key={stage} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex h-7 flex-1 items-center justify-center rounded-lg px-2 text-xs font-medium ${current
                ? "bg-neutral-900 text-white"
                : done
                  ? "bg-neutral-200 text-neutral-700"
                  : "bg-neutral-50 text-neutral-400"
                } ${exited && i === reached ? "line-through" : ""}`}
              title={STAGE_HINTS[stage]}
            >
              {SHOW_STATUSES[stage]}
            </span>
            {i < PIPELINE.length - 1 && (
              <span aria-hidden="true" className="text-neutral-300">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ShowDetailDialog({
  show,
  clients,
  pilots,
  payments,
  expenses,
  canEdit,
  canDocuments = true,
  canInvoice = false,
  onStage,
  onEdit,
  onPayments,
  onDocuments,
  onClose,
}: {
  show: Show;
  clients: Client[];
  pilots: Pilot[];
  payments: Payment[];
  expenses: Expense[];
  canEdit: boolean;
  canDocuments?: boolean;
  /** Shown on booked shows, for roles that may raise one. */
  canInvoice?: boolean;
  onStage: (status: ShowStatus) => void;
  /** Leave out where this screen has no edit form (the calendar). */
  onEdit?: () => void;
  onPayments: () => void;
  onDocuments: () => void;
  onClose: () => void;
}) {
  const own = payments
    .filter((p) => p.showId === show.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const linked = expenses.filter((e) => e.showId === show.id);
  const margin = showMargin(show, payments, expenses);
  const pending = pendingFor(show, payments);
  const client = clients.find((c) => c.id === show.clientId);
  const crew = pilots.filter((p) => show.pilotIds.includes(p.id));
  const booked = isBooked(show);

  function move(to: ShowStatus) {
    if (to === "confirmed") {
      const missing: string[] = [];
      if (!show.state?.trim()) missing.push("State");
      if (!show.location?.trim()) missing.push("District / City");
      if (!show.venueAddress?.trim()) missing.push("Venue Address");
      if (!show.coordinates?.trim()) missing.push("Coordinates");
      if (!show.showDate?.trim()) missing.push("Show Date");
      if (!show.showStartTime?.trim() || !show.showEndTime?.trim()) missing.push("Start/End Time");
      if (!show.droneCount || show.droneCount <= 0) missing.push("Drone Count");
      if (!show.showAmount || show.showAmount <= 0) missing.push("Show Amount");

      if (missing.length > 0) {
        alert(`To confirm this booking, please complete the following compulsory details: ${missing.join(", ")}.`);
        if (onEdit) onEdit();
        return;
      }
    }
    if (to === "closed" && pending > 0) {
      if (!window.confirm(`${formatMoney(pending)} is still pending on this show. Close it anyway?`)) return;
    }
    if (to === "lost" && !window.confirm("Mark this inquiry as lost? You can reopen it later.")) return;
    if (to === "cancelled" && !window.confirm("Cancel this confirmed show? You can reinstate it later.")) return;
    onStage(to);
  }

  return (
    <Modal
      title={show.client || show.location || "Show"}
      subtitle={`${formatDate(show.showDate)} · ${formatTime(show.showStartTime)}–${formatTime(show.showEndTime)} · ${countdownLabel(show.showDate)}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {!booked
              ? show.showAmount > 0
                ? `Quoted ${formatMoney(show.showAmount)}`
                : "Not quoted yet"
              : pending > 0
                ? `${formatMoney(pending)} still to collect`
                : "Fully paid"}
          </span>
          <div className="ml-auto flex gap-2">
            {canDocuments && (
              <button
                type="button"
                onClick={onDocuments}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Documents
              </button>
            )}
            {canInvoice && booked && (
              <Link
                href={`/invoices?show=${show.id}`}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Invoice
              </Link>
            )}
            <button
              type="button"
              onClick={onPayments}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Payments
            </button>
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Edit show
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="grid max-h-[68vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <section className="flex flex-col gap-3 sm:col-span-2">
          <Stepper status={show.showStatus} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">
              <ShowStatusBadge status={show.showStatus} />{" "}
              <span className="ml-1">{STAGE_HINTS[show.showStatus]}</span>
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                {MOVES[show.showStatus].map((m) => (
                  <button
                    key={m.to}
                    type="button"
                    onClick={() => move(m.to)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${toneClass[m.tone]}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <Group title="Client & contact">
          <Row label="Client">
            <span className="inline-flex items-center gap-1.5">
              {show.client || "—"}
              {client && <ClientTypeBadge type={client.type} />}
            </span>
          </Row>
          <Row label="Contact">{contactLabel(show) || "—"}</Row>
          {client?.email && <Row label="Client email">{client.email}</Row>}
          <Row label="Booked on">{formatDate(show.bookingDate)}</Row>
          {show.b2b && !client && <Row label="B2B (older record)">{show.b2b}</Row>}
        </Group>

        <Group title="Where">
          <Row label="Place">{placeLabel(show) || "—"}</Row>
          <Row label="Venue">{show.venueAddress || "—"}</Row>
          <Row label="Coordinates">
            <span className="tnum font-mono text-xs">{show.coordinates || "—"}</span>
          </Row>
          <Row label="Zone">
            <ZoneBadge zone={show.zone} />
          </Row>
          <Row label="Zone means">
            <span className="text-xs text-neutral-500">{ZONES[show.zone].hint}</span>
          </Row>
          <Row label="Permission">
            <PermissionLabel status={show.permission} />
          </Row>
        </Group>

        <Group title="Flight crew">
          <Row label="Drones">
            <span className="tnum font-mono">{formatNumber(show.droneCount)}</span>
          </Row>
          {crew.length === 0 ? (
            <Row label="Pilots">{show.person || "None assigned"}</Row>
          ) : (
            crew.map((pilot, i) => (
              <Row key={pilot.id} label={i === 0 ? "Pilot (Annexure 3)" : "Pilot"}>
                <span className="inline-flex items-center gap-2">
                  {pilot.name}
                  <CertificateBadge state={certificateState(pilot)} />
                </span>
              </Row>
            ))
          )}
        </Group>

        <Group title="Money">
          <Row label={booked ? "Show amount" : "Quoted"}>
            <span className="tnum font-mono">{formatMoney(show.showAmount)}</span>
          </Row>
          {booked && (
            <>
              <Row label="Received">
                <span className="tnum font-mono">{formatMoney(margin.received)}</span>
              </Row>
              <Row label="Pending">
                <span className={`tnum font-mono ${pending > 0 ? "font-semibold" : ""}`}>
                  {formatMoney(pending)}
                </span>
              </Row>
            </>
          )}
          <Row label="Commission">
            <span className="tnum font-mono">{formatMoney(show.commission)}</span>
          </Row>
          <Row label="Linked expenses">
            <span className="tnum font-mono">{formatMoney(margin.expenses)}</span>
          </Row>
          <Row label="Margin">
            <span className="tnum font-mono font-semibold">{formatMoney(margin.margin)}</span>
          </Row>
          {booked && (
            <Row label="Payment status">{PAYMENT_STATE_LABELS[paymentStateOf(show, payments)]}</Row>
          )}
        </Group>

        <Group title={`Payments (${own.length})`}>
          {own.length === 0 ? (
            <p className="py-2 text-sm text-neutral-500">Nothing received yet.</p>
          ) : (
            own.map((payment) => (
              <div key={payment.id} className="row-line flex items-baseline justify-between gap-3 py-2">
                <span className="text-xs text-neutral-500">
                  {formatDate(payment.date)} · {PAYMENT_MODES[payment.mode]}
                </span>
                <span className="tnum font-mono text-sm">{formatMoney(payment.amount)}</span>
              </div>
            ))
          )}
        </Group>

        <Group title={`Expenses against this show (${linked.length})`}>
          {linked.length === 0 ? (
            <p className="py-2 text-sm text-neutral-500">None recorded.</p>
          ) : (
            linked.map((expense) => (
              <div key={expense.id} className="row-line flex items-baseline justify-between gap-3 py-2">
                <span className="text-xs text-neutral-500">
                  {EXPENSE_CATEGORIES[expense.category]}
                  {expense.description ? ` · ${expense.description}` : ""}
                </span>
                <span className="tnum font-mono text-sm">{formatMoney(expense.amount)}</span>
              </div>
            ))
          )}
        </Group>

        {show.notes && (
          <div className="sm:col-span-2">
            <Group title="Notes">
              <p className="py-2 text-sm text-neutral-700">{show.notes}</p>
            </Group>
          </div>
        )}
      </div>
    </Modal>
  );
}
