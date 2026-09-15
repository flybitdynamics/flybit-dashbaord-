"use client";

import { useState } from "react";
import {
  PAYMENT_MODES,
  Payment,
  PaymentMode,
  Show,
  emptyPayment,
  formatDate,
  formatMoney,
  pendingFor,
  receivedFor,
} from "../lib/types";
import { Field, Modal, inputClass } from "./Modal";

export function PaymentsDialog({
  show,
  payments,
  canEdit,
  canRemove = canEdit,
  onAdd,
  onRemove,
  onClose,
}: {
  show: Show;
  payments: Payment[];
  canEdit: boolean;
  /** Defaults to the same as adding. */
  canRemove?: boolean;
  onAdd: (draft: Omit<Payment, "id">) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Omit<Payment, "id">>(() => emptyPayment(show.id));

  const rows = payments
    .filter((p) => p.showId === show.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const received = receivedFor(show.id, payments);
  const pending = pendingFor(show, payments);

  const set = <K extends keyof Omit<Payment, "id">>(
    key: K,
    value: Omit<Payment, "id">[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.amount || draft.amount <= 0) return;
    onAdd(draft);
    setDraft(emptyPayment(show.id));
  }

  return (
    <Modal
      title={`Payments — ${show.client || show.location}`}
      subtitle={`Show amount ${formatMoney(show.showAmount)} · ${formatMoney(received)} received · ${formatMoney(pending)} pending`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Done
        </button>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto p-5">
        <div className="overflow-hidden card">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                {["Date", "Amount", "Mode", "Notes", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-neutral-500">
                    {canEdit
                      ? "Nothing received yet. Log the first payment below."
                      : "Nothing received yet."}
                  </td>
                </tr>
              ) : (
                rows.map((payment) => (
                  <tr key={payment.id} className="row-line">
                    <td className="tnum whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-600">
                      {formatDate(payment.date)}
                    </td>
                    <td className="tnum px-3 py-2 font-mono font-semibold text-neutral-900">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{PAYMENT_MODES[payment.mode]}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{payment.notes || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => onRemove(payment.id)}
                          className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-500 hover:border-red-300 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
        <form
          onSubmit={submit}
          className="mt-5 grid grid-cols-1 gap-3.5 rounded-xl bg-neutral-50 p-4 sm:grid-cols-2"
        >
          <Field label="Payment received (₹)" htmlFor="p-amount">
            <input
              id="p-amount"
              type="number"
              min={0}
              step={1000}
              required
              className={inputClass}
              value={draft.amount || ""}
              onChange={(e) => set("amount", Number(e.target.value) || 0)}
              placeholder="60000"
            />
          </Field>

          <Field label="Date" htmlFor="p-date">
            <input
              id="p-date"
              type="date"
              className={inputClass}
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>

          <Field label="Mode" htmlFor="p-mode">
            <select
              id="p-mode"
              className={inputClass}
              value={draft.mode}
              onChange={(e) => set("mode", e.target.value as PaymentMode)}
            >
              {(Object.keys(PAYMENT_MODES) as PaymentMode[]).map((key) => (
                <option key={key} value={key}>
                  {PAYMENT_MODES[key]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes" htmlFor="p-notes">
            <input
              id="p-notes"
              className={inputClass}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Advance collected on site"
            />
          </Field>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Add payment
            </button>
          </div>
        </form>
        )}
      </div>
    </Modal>
  );
}
