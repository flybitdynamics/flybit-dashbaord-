"use client";

import { useState } from "react";
import { Pilot, PilotStatus, certificateState, emptyPilot } from "../../lib/types";
import { CertificateBadge } from "../Badges";
import { Field, Modal, inputClass } from "../Modal";

type Draft = Omit<Pilot, "id">;

function toDraft(pilot: Pilot | null): Draft {
  if (!pilot) return emptyPilot();
  const { id: _id, ...rest } = pilot;
  void _id;
  return { ...emptyPilot(), ...rest };
}

export function PilotDialog({
  pilot,
  assignedCount,
  onSave,
  onDelete,
  onClose,
}: {
  pilot: Pilot | null;
  /** Shows the pilot is on, so removing them can say what happens. */
  assignedCount: number;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (pilot: Pilot) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(pilot));
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setProblem("Give the pilot a name.");
      return;
    }
    onSave(
      Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
      ) as Draft,
      pilot?.id ?? null,
    );
  }

  return (
    <Modal
      title={pilot ? "Edit pilot" : "Add pilot"}
      subtitle="The first pilot on a show is named in Annexure 3 of the MoCA paperwork."
      onClose={onClose}
      footer={
        <>
          <span className="flex items-center gap-2 text-xs text-neutral-500">
            Certificate <CertificateBadge state={certificateState(draft)} />
          </span>
          <div className="ml-auto flex gap-2">
            {pilot && (
              <button
                type="button"
                onClick={() => onDelete(pilot)}
                className="rounded-md bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="pilot-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save pilot
            </button>
          </div>
        </>
      }
    >
      <form
        id="pilot-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        {problem && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{problem}</p>
        )}

        <Field label="Name" htmlFor="p-name">
          <input
            id="p-name"
            required
            autoFocus
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Jehan Patel"
          />
        </Field>

        <Field label="Qualification" htmlFor="p-qual" hint="Printed in Annexure 3.">
          <input
            id="p-qual"
            className={inputClass}
            value={draft.qualification}
            onChange={(e) => set("qualification", e.target.value)}
            placeholder="Technical Head"
          />
        </Field>

        <Field label="Phone" htmlFor="p-phone">
          <input
            id="p-phone"
            type="tel"
            className={inputClass}
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="98250 00114"
          />
        </Field>

        <Field label="Email" htmlFor="p-email">
          <input
            id="p-email"
            type="email"
            className={inputClass}
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jehan@flybitdynamics.com"
          />
        </Field>

        <Field label="DGCA remote pilot certificate no." htmlFor="p-rpc">
          <input
            id="p-rpc"
            className={`${inputClass} uppercase`}
            value={draft.rpcNumber}
            onChange={(e) => set("rpcNumber", e.target.value)}
            placeholder="DGCA-RPC-000000"
          />
        </Field>

        <Field label="Certificate valid until" htmlFor="p-valid" hint="Flagged 30 days before it runs out.">
          <input
            id="p-valid"
            type="date"
            className={inputClass}
            value={draft.rpcValidUntil}
            onChange={(e) => set("rpcValidUntil", e.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="p-status" hint="Inactive pilots cannot be put on new shows.">
          <select
            id="p-status"
            className={inputClass}
            value={draft.status}
            onChange={(e) => set("status", e.target.value as PilotStatus)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <div />

        <Field label="Notes" htmlFor="p-notes" wide>
          <textarea
            id="p-notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Drones they are cleared on · emergency contact"
          />
        </Field>

        {pilot && assignedCount > 0 && (
          <p className="text-[11px] text-neutral-500 sm:col-span-2">
            On {assignedCount} show{assignedCount === 1 ? "" : "s"}. Removing this pilot takes them off
            those shows.
          </p>
        )}
      </form>
    </Modal>
  );
}
