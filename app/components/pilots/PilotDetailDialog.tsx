"use client";

import {
  Pilot,
  Show,
  certificateState,
  countdownLabel,
  daysAway,
  formatDate,
  formatNumber,
  formatTime,
  placeLabel,
} from "../../lib/types";
import { CertificateBadge, ShowStatusBadge } from "../Badges";
import { Modal } from "../Modal";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-xs text-neutral-500">{label}</span>
      <span className="text-right text-sm text-neutral-900">{children}</span>
    </div>
  );
}

function ShowList({ shows, empty }: { shows: Show[]; empty: string }) {
  if (shows.length === 0) return <p className="py-2 text-sm text-neutral-500">{empty}</p>;
  return (
    <div className="mt-1">
      {shows.map((show) => (
        <div key={show.id} className="row-line flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-900">
              {show.client || show.location || "Show"}
            </div>
            <div className="tnum truncate font-mono text-[11px] text-neutral-500">
              {formatDate(show.showDate)} · {formatTime(show.showStartTime)} ·{" "}
              {formatNumber(show.droneCount)} drones · {placeLabel(show)}
            </div>
          </div>
          <ShowStatusBadge status={show.showStatus} />
        </div>
      ))}
    </div>
  );
}

/** A pilot's certificate and every show they are on. */
export function PilotDetailDialog({
  pilot,
  shows,
  canEdit,
  onEdit,
  onClose,
}: {
  pilot: Pilot;
  shows: Show[];
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const assigned = shows.filter((s) => s.pilotIds.includes(pilot.id));
  const ahead = assigned
    .filter((s) => (daysAway(s.showDate) ?? -1) >= 0 && (s.showStatus === "confirmed" || s.showStatus === "inquiry"))
    .sort((a, b) => a.showDate.localeCompare(b.showDate));
  const flown = assigned
    .filter((s) => s.showStatus === "completed" || s.showStatus === "closed")
    .sort((a, b) => b.showDate.localeCompare(a.showDate));
  const cert = certificateState(pilot);

  return (
    <Modal
      title={pilot.name}
      subtitle={pilot.qualification || "No qualification recorded"}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="text-xs text-neutral-500">
            {flown.length} flown · {ahead.length} ahead
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
                Edit pilot
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            DGCA certificate
          </h3>
          <div className="mt-1">
            <Row label="Status">
              <CertificateBadge state={cert} />
            </Row>
            <Row label="Certificate no.">
              <span className="tnum font-mono text-xs">{pilot.rpcNumber || "—"}</span>
            </Row>
            <Row label="Valid until">
              {pilot.rpcValidUntil ? (
                <span className="tnum font-mono">
                  {formatDate(pilot.rpcValidUntil)}{" "}
                  <span className="text-xs text-neutral-500">({countdownLabel(pilot.rpcValidUntil)})</span>
                </span>
              ) : (
                "—"
              )}
            </Row>
          </div>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Contact
          </h3>
          <div className="mt-1">
            <Row label="Phone">{pilot.phone || "—"}</Row>
            <Row label="Email">{pilot.email || "—"}</Row>
            <Row label="Status">{pilot.status === "active" ? "Active" : "Inactive"}</Row>
          </div>
          {pilot.notes && (
            <p className="mt-3 rounded-xl bg-neutral-100/70 p-3 text-sm text-neutral-600">{pilot.notes}</p>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Coming up ({ahead.length})
          </h3>
          <ShowList shows={ahead} empty="Nothing assigned ahead." />
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Flown ({flown.length})
          </h3>
          <ShowList shows={flown} empty="No completed shows yet." />
        </section>
      </div>
    </Modal>
  );
}
