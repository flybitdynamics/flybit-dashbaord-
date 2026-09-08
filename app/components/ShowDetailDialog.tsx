"use client";

import { EXPENSE_CATEGORIES, Expense, showMargin } from "../lib/finance";
import {
  PAYMENT_MODES,
  PAYMENT_STATE_LABELS,
  PERMISSION_STATUSES,
  Payment,
  SHOW_STATUSES,
  Show,
  ZONES,
  countdownLabel,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  paymentStateOf,
  pendingFor,
} from "../lib/types";
import { Modal } from "./Modal";
import { PermissionLabel, ShowStatusBadge, ZoneBadge } from "./Badges";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs text-neutral-500">{label}</span>
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

export function ShowDetailDialog({
  show,
  payments,
  expenses,
  canEdit,
  onEdit,
  onPayments,
  onDocuments,
  onClose,
}: {
  show: Show;
  payments: Payment[];
  expenses: Expense[];
  canEdit: boolean;
  onEdit: () => void;
  onPayments: () => void;
  onDocuments: () => void;
  onClose: () => void;
}) {
  const own = payments.filter((p) => p.showId === show.id).sort((a, b) => a.date.localeCompare(b.date));
  const linked = expenses.filter((e) => e.showId === show.id);
  const margin = showMargin(show, payments, expenses);
  const pending = pendingFor(show, payments);

  return (
    <Modal
      title={show.client || show.location || "Show"}
      subtitle={`${formatDate(show.showDate)} · ${formatTime(show.showStartTime)}–${formatTime(show.showEndTime)} · ${countdownLabel(show.showDate)}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {pending > 0 ? `${formatMoney(pending)} still to collect` : "Fully paid"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onDocuments}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Documents
            </button>
            <button
              type="button"
              onClick={onPayments}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Payments
            </button>
            {canEdit && (
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
      <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <Group title="Booking">
          <Row label="Location">{show.location || "—"}</Row>
          <Row label="Client">{show.client || "—"}</Row>
          <Row label="Contact">{show.contact || "—"}</Row>
          <Row label="Person">{show.person || "—"}</Row>
          <Row label="B2B">{show.b2b || "Direct"}</Row>
          <Row label="Booked on">{formatDate(show.bookingDate)}</Row>
          <Row label="Status">
            <ShowStatusBadge status={show.showStatus} />
          </Row>
        </Group>

        <Group title="Flight">
          <Row label="Drones">
            <span className="tnum font-mono">{formatNumber(show.droneCount)}</span>
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
          <Row label="Venue">{show.venueAddress || "—"}</Row>
          <Row label="Coordinates">
            <span className="tnum font-mono text-xs">{show.coordinates || "—"}</span>
          </Row>
        </Group>

        <Group title="Money">
          <Row label="Show amount">
            <span className="tnum font-mono">{formatMoney(show.showAmount)}</span>
          </Row>
          <Row label="Received">
            <span className="tnum font-mono">{formatMoney(margin.received)}</span>
          </Row>
          <Row label="Pending">
            <span className={`tnum font-mono ${pending > 0 ? "font-semibold" : ""}`}>
              {formatMoney(pending)}
            </span>
          </Row>
          <Row label="Commission">
            <span className="tnum font-mono">{formatMoney(show.commission)}</span>
          </Row>
          <Row label="Linked expenses">
            <span className="tnum font-mono">{formatMoney(margin.expenses)}</span>
          </Row>
          <Row label="Margin">
            <span className="tnum font-mono font-semibold">{formatMoney(margin.margin)}</span>
          </Row>
          <Row label="Payment status">{PAYMENT_STATE_LABELS[paymentStateOf(show, payments)]}</Row>
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

          {linked.length > 0 && (
            <>
              <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Expenses against this show
              </h4>
              {linked.map((expense) => (
                <div key={expense.id} className="row-line flex items-baseline justify-between gap-3 py-2">
                  <span className="text-xs text-neutral-500">
                    {EXPENSE_CATEGORIES[expense.category]}
                    {expense.description ? ` · ${expense.description}` : ""}
                  </span>
                  <span className="tnum font-mono text-sm">{formatMoney(expense.amount)}</span>
                </div>
              ))}
            </>
          )}
        </Group>

        {show.notes && (
          <div className="sm:col-span-2">
            <Group title="Notes">
              <p className="py-2 text-sm text-neutral-700">{show.notes}</p>
            </Group>
          </div>
        )}

        <div className="sm:col-span-2 text-[11px] text-neutral-400">
          Booking status: {SHOW_STATUSES[show.showStatus]} · Permission:{" "}
          {PERMISSION_STATUSES[show.permission]}
        </div>
      </div>
    </Modal>
  );
}
