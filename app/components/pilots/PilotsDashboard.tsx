"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, removePilot, subscribe, upsertPilot } from "../../lib/store";
import {
  Pilot,
  certificateState,
  daysAway,
  formatDate,
} from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { CertificateBadge } from "../Badges";
import { SiteHeader } from "../SiteHeader";
import { PilotDetailDialog } from "./PilotDetailDialog";
import { PilotDialog } from "./PilotDialog";

type Dialog =
  | { kind: "none" }
  | { kind: "detail"; pilot: Pilot }
  | { kind: "edit"; pilot: Pilot | null };

export function PilotsDashboard() {
  const { canEdit } = useAuth();
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const pilots = useMemo(() => state?.pilots ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);

  const live = (pilot: Pilot) => pilots.find((p) => p.id === pilot.id) ?? pilot;

  const roster = useMemo(
    () =>
      pilots.map((pilot) => {
        const assigned = shows.filter((s) => s.pilotIds.includes(pilot.id));
        const ahead = assigned
          .filter((s) => (daysAway(s.showDate) ?? -1) >= 0 && (s.showStatus === "confirmed" || s.showStatus === "inquiry"))
          .sort((a, b) => a.showDate.localeCompare(b.showDate));
        const flown = assigned.filter((s) => s.showStatus === "completed" || s.showStatus === "closed").length;
        return { pilot, assigned: assigned.length, ahead, flown, cert: certificateState(pilot) };
      }),
    [pilots, shows],
  );

  const active = roster.filter((r) => r.pilot.status === "active");
  const expiring = active.filter((r) => r.cert === "expiring").length;
  const grounded = active.filter((r) => r.cert === "expired" || r.cert === "missing").length;
  /** A confirmed show crewed by someone whose certificate lapses first. */
  const atRisk = active.filter((r) =>
    r.ahead.some(
      (s) =>
        s.showStatus === "confirmed" &&
        (r.cert === "expired" || r.cert === "missing" || (r.pilot.rpcValidUntil && r.pilot.rpcValidUntil < s.showDate)),
    ),
  ).length;

  function handleDelete(pilot: Pilot) {
    const count = roster.find((r) => r.pilot.id === pilot.id)?.assigned ?? 0;
    const note = count ? ` They come off ${count} show${count === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`Remove ${pilot.name}?${note}`)) return;
    removePilot(pilot.id);
    setDialog({ kind: "none" });
  }

  const tiles = [
    { label: "Active pilots", value: String(active.length), note: `${roster.length - active.length} inactive` },
    { label: "Expiring", value: String(expiring), note: "certificate runs out within 30 days", warn: expiring > 0 },
    { label: "Grounded", value: String(grounded), note: "certificate expired or not on file", warn: grounded > 0 },
    { label: "Shows at risk", value: String(atRisk), note: "confirmed, crew not certified by show day", warn: atRisk > 0 },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Pilots"
        subtitle="Remote pilots, their DGCA certificates, and the shows they fly"
        actions={
          canEdit && (
            <button
              type="button"
              onClick={() => setDialog({ kind: "edit", pilot: null })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + Add pilot
            </button>
          )
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading pilots from Firebase…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div
                  className={`tnum mt-1 text-2xl font-semibold tracking-tight ${
                    tile.warn ? "text-red-600" : "text-neutral-900"
                  }`}
                >
                  {tile.value}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70">
                    {["Pilot", "Contact", "DGCA certificate", "Valid until", "Next show", "Flown", "Status", ""].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <p className="font-medium text-neutral-900">No pilots yet</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          Add your remote pilots to assign them to shows and fill Annexure 3.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    roster.map(({ pilot, ahead, flown, cert }) => (
                      <tr
                        key={pilot.id}
                        onClick={() => setDialog({ kind: "detail", pilot })}
                        className={`row-line cursor-pointer hover:bg-neutral-50 ${
                          pilot.status === "inactive" ? "text-neutral-400" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-neutral-900">{pilot.name}</div>
                          <div className="text-xs text-neutral-500">{pilot.qualification || "—"}</div>
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          <div className="tnum font-mono text-xs">{pilot.phone || "—"}</div>
                          <div className="text-xs text-neutral-500">{pilot.email}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="tnum font-mono text-xs text-neutral-700">{pilot.rpcNumber || "—"}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <CertificateBadge state={cert} />
                            {pilot.rpcValidUntil && (
                              <span className="tnum font-mono text-xs text-neutral-500">
                                {formatDate(pilot.rpcValidUntil)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          {ahead[0] ? (
                            <>
                              <div className="tnum font-mono text-xs">{formatDate(ahead[0].showDate)}</div>
                              <div className="text-xs text-neutral-500">
                                {ahead[0].client || ahead[0].location}
                                {ahead.length > 1 ? ` · +${ahead.length - 1} more` : ""}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2.5 font-mono text-sm">{flown}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {pilot.status === "active" ? "Active" : "Inactive"}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setDialog({ kind: "edit", pilot })}
                              className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {dialog.kind === "detail" && (
        <PilotDetailDialog
          key={dialog.pilot.id}
          pilot={live(dialog.pilot)}
          shows={shows}
          canEdit={canEdit}
          onEdit={() => setDialog({ kind: "edit", pilot: live(dialog.pilot) })}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "edit" && (
        <PilotDialog
          key={dialog.pilot?.id ?? "new"}
          pilot={dialog.pilot}
          assignedCount={dialog.pilot ? roster.find((r) => r.pilot.id === dialog.pilot?.id)?.assigned ?? 0 : 0}
          onSave={(draft, id) => {
            upsertPilot(draft, id);
            setDialog({ kind: "none" });
          }}
          onDelete={handleDelete}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
