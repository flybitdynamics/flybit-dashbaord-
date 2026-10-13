"use client";

import {
  Client,
  Payment,
  Pilot,
  Show,
  contactLabel,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  isBooked,
  isOverdue,
  paymentStateOf,
  pendingFor,
  placeLabel,
  receivedFor,
} from "../lib/types";
import {
  ClientTypeBadge,
  PermissionLabel,
  ShowStatusBadge,
  ZoneBadge,
  ZoneBar,
} from "./Badges";

const headers = [
  "",
  "Sr",
  "Client / place",
  "Stage",
  "Zone",
  "Drones",
  "Booking date",
  "Show date & crew",
  "Payment & amount",
  "Permission",
  "",
];

export function ShowTable({
  shows,
  clients,
  pilots,
  payments,
  total,
  canEdit,
  canDelete,
  canDocuments,
  onOpen,
  onEdit,
  onDelete,
  onPayments,
  onExpense,
  canExpense = false,
  onDocuments,
}: {
  shows: Show[];
  clients: Client[];
  pilots: Pilot[];
  payments: Payment[];
  total: number;
  canEdit: boolean;
  canDelete: boolean;
  canDocuments: boolean;
  onOpen: (show: Show) => void;
  onEdit: (show: Show) => void;
  onDelete: (show: Show) => void;
  onPayments: (show: Show) => void;
  onExpense?: (show: Show) => void;
  canExpense?: boolean;
  onDocuments: (show: Show) => void;
}) {
  return (
    <div className="overflow-hidden card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left">
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
                      ? "Add your first inquiry to get started."
                      : "Widen the search, or pick another stage."}
                  </p>
                </td>
              </tr>
            ) : (
              shows.map((show, index) => {
                const client = clients.find((c) => c.id === show.clientId);
                const dimmed =
                  show.showStatus === "closed" ||
                  show.showStatus === "lost" ||
                  show.showStatus === "cancelled";
                const place = placeLabel(show);
                const contact = contactLabel(show);
                const crew = pilots.filter((p) => show.pilotIds.includes(p.id));
                const received = receivedFor(show.id, payments);
                const pending = pendingFor(show, payments);
                const state = paymentStateOf(show, payments);
                const overdue = isOverdue(show, payments);

                return (
                  <tr
                    key={show.id}
                    onClick={() => onOpen(show)}
                    className={`row-line cursor-pointer hover:bg-neutral-50 ${dimmed ? "text-neutral-500" : ""}`}
                  >
                    <td className="w-1 py-2 pl-3 pr-0">
                      <ZoneBar zone={show.zone} />
                    </td>

                    <td className="tnum px-3 py-2.5 font-mono text-xs text-neutral-400">
                      {index + 1}
                    </td>

                    <td className="max-w-72 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-neutral-900">
                          {show.client || show.location || "—"}
                        </span>
                        {client && <ClientTypeBadge type={client.type} />}
                      </div>
                      {place && <div className="truncate text-xs text-neutral-500">{place}</div>}
                      {contact && (
                        <div className="tnum truncate text-[11px] text-neutral-400">{contact}</div>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <ShowStatusBadge status={show.showStatus} />
                    </td>

                    <td className="px-3 py-2.5">
                      <ZoneBadge zone={show.zone} />
                    </td>

                    <td className="tnum px-3 py-2.5 font-mono text-sm">
                      {formatNumber(show.droneCount)}
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
                      {(crew.length > 0 || show.person) && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-neutral-700">
                          <span className="text-neutral-400">👤</span>
                          <span className="max-w-40 truncate">
                            {crew.length > 0 ? crew.map((p) => p.name).join(", ") : show.person}
                          </span>
                        </div>
                      )}
                    </td>

                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isBooked(show)) {
                          onPayments(show);
                        } else {
                          onOpen(show);
                        }
                      }}
                    >
                      <div
                        className="group flex flex-col gap-1 cursor-pointer"
                        title={isBooked(show) ? "Click to view & log payments" : "Click to view lead details"}
                      >
                        {isBooked(show) ? (
                          show.showAmount > 0 ? (
                            <>
                              <div className="tnum font-mono text-sm font-semibold text-neutral-900 group-hover:text-neutral-600">
                                {formatMoney(show.showAmount)}
                              </div>
                              {state === "paid" ? (
                                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  ✓ Paid in full
                                </span>
                              ) : state === "partial" ? (
                                <div className="tnum flex flex-wrap items-center gap-1 font-mono text-[11px]">
                                  <span className="font-medium text-emerald-700">{formatMoney(received)} rec</span>
                                  <span className="text-neutral-300">·</span>
                                  <span className="rounded bg-amber-50 px-1 font-semibold text-amber-800">
                                    {formatMoney(pending)} pending
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                                    overdue
                                      ? "border-rose-200 bg-rose-50 text-rose-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  {overdue ? "⚠️ " : "⏳ "}
                                  {formatMoney(pending)} pending
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-mono text-xs text-neutral-500">₹0 (Free / Internal)</span>
                          )
                        ) : (
                          // Inquiries, lost, and cancelled leads owe nothing and are not in pending budget
                          show.showAmount > 0 ? (
                            <>
                              <div className="tnum font-mono text-sm font-medium text-neutral-400">
                                {formatMoney(show.showAmount)}
                              </div>
                              <span className="inline-flex w-fit items-center rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                                {show.showStatus === "lost"
                                  ? "Lost lead (₹0 due)"
                                  : show.showStatus === "cancelled"
                                  ? "Cancelled (₹0 due)"
                                  : "Quoted lead (₹0 due)"}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400">
                              {show.showStatus === "lost"
                                ? "Lost"
                                : show.showStatus === "cancelled"
                                ? "Cancelled"
                                : "Unquoted inquiry"}
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <PermissionLabel status={show.permission} />
                    </td>

                    <td className="px-3 py-2.5">
                      <div
                        className="flex justify-end gap-1 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canDocuments && (
                          <button
                            type="button"
                            onClick={() => onDocuments(show)}
                            className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-200"
                          >
                            Permission
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPayments(show)}
                          className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                        >
                          Payments
                        </button>
                        {canExpense && onExpense && (
                          <button
                            type="button"
                            onClick={() => onExpense(show)}
                            className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                          >
                            Expense
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(show)}
                            className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(show)}
                            className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600"
                          >
                            Delete
                          </button>
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
    </div>
  );
}
