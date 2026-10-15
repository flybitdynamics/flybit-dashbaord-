"use client";

import Link from "next/link";

import {
  Client,
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
  pendingFor,
  placeLabel,
  receivedFor,
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
  canEdit,
  canDocuments = true,
  canInvoice = false,
  canQuote = false,
  canExpense = false,
  onStage,
  onEdit,
  onPayments,
  onExpense,
  onDocuments,
  onClose,
}: {
  show: Show;
  clients: Client[];
  pilots: Pilot[];
  payments: Payment[];
  canEdit: boolean;
  canDocuments?: boolean;
  /** Shown on booked shows, for roles that may raise one. */
  canInvoice?: boolean;
  /** A quotation can go out before anything is booked. */
  canQuote?: boolean;
  /** Same expense form as Finance, linked to this show. */
  canExpense?: boolean;
  onStage: (status: ShowStatus) => void;
  /** Leave out where this screen has no edit form (the calendar). */
  onEdit?: () => void;
  onPayments: () => void;
  onExpense?: () => void;
  onDocuments: () => void;
  onClose: () => void;
}) {
  const pending = pendingFor(show, payments);
  const received = receivedFor(show.id, payments);
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
      if (show.droneCount === undefined || show.droneCount === null || show.droneCount < 0) missing.push("Drone Count");
      if (show.showAmount === undefined || show.showAmount === null || show.showAmount < 0) missing.push("Show Amount");

      if (missing.length > 0) {
        alert(`To confirm this booking, please complete the following compulsory details: ${missing.join(", ")}.`);
        if (onEdit) onEdit();
        return;
      }
    }
    if (to === "closed" && pending > 0) {
      if (!window.confirm("This show still has an outstanding balance. Close it anyway?")) return;
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
            {canQuote && (
              <Link
                href={`/quotations?show=${show.id}`}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Quote
              </Link>
            )}
            {canInvoice && booked && (
              <Link
                href={`/invoices?show=${show.id}`}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Invoice
              </Link>
            )}
            {booked && (
              <Link
                href={`/receipts?show=${show.id}`}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Receipt
              </Link>
            )}
            <button
              type="button"
              onClick={onPayments}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Payments
            </button>
            {canExpense && onExpense && (
              <button
                type="button"
                onClick={onExpense}
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Expense
              </button>
            )}
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

        <Group title="Money & payments">
          <Row label={booked ? "Show amount" : "Quoted amount"}>
            <span className="font-mono font-semibold text-neutral-900">
              {show.showAmount > 0
                ? formatMoney(show.showAmount)
                : booked
                ? "₹0 (Free / Internal)"
                : "Not quoted"}
            </span>
          </Row>
          {booked ? (
            <>
              {show.showAmount > 0 && (
                <>
                  <Row label="Payment received">
                    <span className="font-mono font-semibold text-emerald-700">
                      {formatMoney(received)}
                    </span>
                  </Row>
                  <Row label="Balance pending">
                    <span
                      className={`font-mono font-bold ${
                        pending > 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {pending > 0 ? `${formatMoney(pending)} pending` : "✓ Paid in full"}
                    </span>
                  </Row>
                </>
              )}
              {show.commission > 0 && (
                <Row label="Commission">
                  <span className="font-mono text-neutral-600">
                    {formatMoney(show.commission)}
                  </span>
                </Row>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onPayments}
                  className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200"
                >
                  View & log payments →
                </button>
              </div>
            </>
          ) : (
            <div className="mt-1.5 rounded-lg bg-neutral-50 p-2.5 text-[11px] text-neutral-500 border border-neutral-200/60">
              {show.showStatus === "lost"
                ? "Lost lead · Not counted in budget or pending balance."
                : show.showStatus === "cancelled"
                ? "Cancelled booking · Not counted in budget or pending balance."
                : "Inquiry lead · Not counted in budget or pending balance. Payments apply once confirmed."}
            </div>
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
