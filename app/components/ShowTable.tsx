"use client";

import {
  PAYMENT_STATE_LABELS,
  Payment,
  Show,
  daysAway,
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  isOverdue,
  paymentStateOf,
  pendingFor,
  receivedFor,
} from "../lib/types";
import { PaymentMeter, PermissionLabel, ShowStatusBadge, ZoneBadge, ZoneBar } from "./Badges";

const headers = [
  "",
  "Sr",
  "Location / client",
  "Zone",
  "Drones",
  "Person / B2B",
  "Booking date",
  "Show date",
  "Payment",
  "Show status",
  "Permission",
  "Commission",
  "Notes",
  "",
];

export function ShowTable({
  shows,
  payments,
  total,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
  onPayments,
  onDocuments,
}: {
  shows: Show[];
  payments: Payment[];
  total: number;
  canEdit: boolean;
  onOpen: (show: Show) => void;
  onEdit: (show: Show) => void;
  onDelete: (show: Show) => void;
  onPayments: (show: Show) => void;
  onDocuments: (show: Show) => void;
}) {
  const pendingTotal = shows.reduce((sum, s) => sum + pendingFor(s, payments), 0);

  return (
    <div className="overflow-hidden card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              {headers.map((header, i) => (
                <th
                  key={i}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {shows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-12 text-center">
                  <p className="font-medium text-neutral-900">
                    {total === 0 ? "No shows yet" : "Nothing matches these filters"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {total === 0
                      ? "Add your first booking to get started."
                      : "Widen the search, or add the show you are looking for."}
                  </p>
                </td>
              </tr>
            ) : (
              shows.map((show, index) => {
                const received = receivedFor(show.id, payments);
                const state = paymentStateOf(show, payments);
                const overdue = isOverdue(show, payments);
                const dimmed =
                  show.showStatus === "completed" || show.showStatus === "cancelled";

                return (
                  <tr
                    key={show.id}
                    onClick={() => onOpen(show)}
                    className={`row-line cursor-pointer hover:bg-neutral-50 ${dimmed ? "text-neutral-500" : ""
                      }`}
                  >
                    <td className="w-1 py-2 pl-3 pr-0">
                      <ZoneBar zone={show.zone} />
                    </td>

                    <td className="tnum px-3 py-2.5 font-mono text-xs text-neutral-400">
                      {index + 1}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-neutral-900">
                        {show.location || "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {show.client || show.contact || ""}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <ZoneBadge zone={show.zone} />
                    </td>

                    <td className="tnum px-3 py-2.5 font-mono text-sm">
                      {formatNumber(show.droneCount)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="text-sm">{show.person || "—"}</div>
                      <div className="text-xs text-neutral-500">{show.b2b || "Direct"}</div>
                    </td>

                    <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-sm text-neutral-600">
                      {formatDate(show.bookingDate)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="tnum whitespace-nowrap font-mono text-sm text-neutral-800">
                        {formatDate(show.showDate)}
                      </div>
                      <div className="tnum font-mono text-xs text-neutral-500">
                        {formatTime(show.showStartTime)}–{formatTime(show.showEndTime)}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <PaymentMeter amount={show.showAmount} received={received} state={state} />
                      <div
                        className={`mt-0.5 text-[11px] ${overdue ? "font-semibold text-red-600" : "text-neutral-500"}`}
                      >
                        {overdue
                          ? `Overdue by ${Math.abs(daysAway(show.showDate) ?? 0)} days`
                          : PAYMENT_STATE_LABELS[state]}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <ShowStatusBadge status={show.showStatus} />
                    </td>

                    <td className="px-3 py-2.5">
                      <PermissionLabel status={show.permission} />
                    </td>

                    <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                      {show.commission > 0 ? formatCompactMoney(show.commission) : "—"}
                    </td>

                    <td className="max-w-56 px-3 py-2.5">
                      <p className="truncate text-xs text-neutral-500" title={show.notes}>
                        {show.notes || "—"}
                      </p>
                    </td>

                    <td className="px-3 py-2.5">
                      <div
                        className="flex justify-end gap-1 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onDocuments(show)}
                          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
                        >
                          Permission
                        </button>
                        <button
                          type="button"
                          onClick={() => onPayments(show)}
                          className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-600 hover:border-neutral-300 hover:bg-white"
                        >
                          Payments
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(show)}
                              className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-600 hover:border-neutral-300 hover:bg-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(show)}
                              className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-500 hover:border-red-300 hover:bg-white hover:text-red-600"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pendingTotal > 0 && (
        <div className="tnum border-t border-neutral-100 bg-neutral-50 px-3 py-2 text-right font-mono text-xs text-neutral-600">
          Amount pending across these {shows.length} shows:{" "}
          <span className="font-semibold text-neutral-900">{formatMoney(pendingTotal)}</span>
        </div>
      )}
    </div>
  );
}
