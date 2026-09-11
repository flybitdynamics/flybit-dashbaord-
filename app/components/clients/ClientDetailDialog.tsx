"use client";

import {
  Client,
  Payment,
  Show,
  formatDate,
  formatMoney,
  isBooked,
  pendingFor,
  placeLabel,
  receivedFor,
} from "../../lib/types";
import { ClientTypeBadge, ShowStatusBadge } from "../Badges";
import { Modal } from "../Modal";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-xs text-neutral-500">{label}</span>
      <span className="text-right text-sm text-neutral-900">{children}</span>
    </div>
  );
}

/** One client's whole relationship: who they are and every show they booked. */
export function ClientDetailDialog({
  client,
  shows,
  payments,
  canEdit,
  onEdit,
  onClose,
}: {
  client: Client;
  shows: Show[];
  payments: Payment[];
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const own = shows
    .filter((s) => s.clientId === client.id)
    .sort((a, b) => b.showDate.localeCompare(a.showDate));
  const booked = own.filter(isBooked);
  const business = booked.reduce((sum, s) => sum + (s.showAmount || 0), 0);
  const received = booked.reduce((sum, s) => sum + receivedFor(s.id, payments), 0);
  const outstanding = booked.reduce((sum, s) => sum + pendingFor(s, payments), 0);
  const inquiries = own.filter((s) => s.showStatus === "inquiry").length;

  return (
    <Modal
      title={client.name}
      subtitle={[client.city, client.state].filter(Boolean).join(", ") || "No place recorded"}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {outstanding > 0 ? `${formatMoney(outstanding)} outstanding` : "Nothing outstanding"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Close
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Edit client
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Details
          </h3>
          <div className="mt-1">
            <Row label="Type">
              <ClientTypeBadge type={client.type} />
            </Row>
            <Row label="Contact">
              {[client.contactName, client.contactPhone].filter(Boolean).join(" · ") || "—"}
            </Row>
            <Row label="Email">{client.email || "—"}</Row>
            <Row label="GSTIN">
              <span className="tnum font-mono text-xs">{client.gstin || "—"}</span>
            </Row>
            <Row label="Address">{client.address || "—"}</Row>
          </div>
          {client.notes && (
            <p className="mt-3 rounded-xl bg-neutral-100/70 p-3 text-sm text-neutral-600">{client.notes}</p>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Business
          </h3>
          <div className="mt-1">
            <Row label="Shows booked">
              <span className="tnum font-mono">{booked.length}</span>
            </Row>
            <Row label="Open inquiries">
              <span className="tnum font-mono">{inquiries}</span>
            </Row>
            <Row label="Booked value">
              <span className="tnum font-mono">{formatMoney(business)}</span>
            </Row>
            <Row label="Received">
              <span className="tnum font-mono">{formatMoney(received)}</span>
            </Row>
            <Row label="Outstanding">
              <span className={`tnum font-mono ${outstanding > 0 ? "font-semibold" : ""}`}>
                {formatMoney(outstanding)}
              </span>
            </Row>
          </div>
        </section>

        <section className="sm:col-span-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Shows ({own.length})
          </h3>
          {own.length === 0 ? (
            <p className="py-3 text-sm text-neutral-500">No shows for this client yet.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl bg-neutral-50">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/70">
                    {["Show date", "Place", "Stage", "Amount", "Pending"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {own.map((show) => (
                    <tr key={show.id} className="row-line">
                      <td className="tnum whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {formatDate(show.showDate)}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{placeLabel(show) || "—"}</td>
                      <td className="px-3 py-2">
                        <ShowStatusBadge status={show.showStatus} />
                      </td>
                      <td className="tnum px-3 py-2 font-mono text-xs">{formatMoney(show.showAmount)}</td>
                      <td className="tnum px-3 py-2 font-mono text-xs">
                        {isBooked(show) ? formatMoney(pendingFor(show, payments)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
