"use client";

import {
  Client,
  Pilot,
  Show,
  contactLabel,
  formatDate,
  formatNumber,
  formatTime,
  placeLabel,
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
  "Show date",
  "Permission",
  "",
];

export function ShowTable({
  shows,
  clients,
  pilots,
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
                      {crew.length > 0 && (
                        <div className="max-w-40 truncate text-[11px] text-neutral-500">
                          {crew.map((p) => p.name).join(", ")}
                        </div>
                      )}
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
