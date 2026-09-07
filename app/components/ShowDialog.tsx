"use client";

import { useState } from "react";
import {
  DEFAULT_PERSON,
  PERMISSION_STATUSES,
  PermissionStatus,
  SHOW_STATUSES,
  Show,
  ShowStatus,
  Zone,
  ZONES,
  emptyShow,
  formatMoney,
} from "../lib/types";
import { Field, Modal, inputClass } from "./Modal";

type Draft = Omit<Show, "id">;

const zoneActive: Record<Zone, string> = {
  green: "border-emerald-500 bg-emerald-50 text-emerald-800",
  yellow: "border-amber-500 bg-amber-50 text-amber-800",
  red: "border-red-500 bg-red-50 text-red-800",
};

const zoneDot: Record<Zone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function toDraft(show: Show | null): Draft {
  if (!show) return emptyShow();
  const { id: _id, ...rest } = show;
  void _id;
  return rest;
}

export function ShowDialog({
  show,
  onSave,
  onDelete,
  onClose,
}: {
  show: Show | null;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (show: Show) => void;
  onClose: () => void;
}) {
  /* Mounted fresh per show (see the key in Dashboard), so the draft is
     seeded once instead of synced in an effect. */
  const [draft, setDraft] = useState<Draft>(() => toDraft(show));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const netNote =
    draft.showAmount === 0
      ? "Show amount not set"
      : draft.commission > 0
        ? `${formatMoney(draft.showAmount)} less ${formatMoney(draft.commission)} commission = ${formatMoney(draft.showAmount - draft.commission)}`
        : formatMoney(draft.showAmount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.location.trim() || !draft.showDate) return;
    onSave({ ...draft, location: draft.location.trim(), client: draft.client.trim() }, show?.id ?? null);
  }

  return (
    <Modal
      title={show ? "Edit show" : "New show"}
      subtitle="Payments are logged separately, under Payments."
      onClose={onClose}
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">{netNote}</span>
          <div className="ml-auto flex gap-2">
            {show && (
              <button
                type="button"
                onClick={() => onDelete(show)}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:border-red-400"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="show-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save show
            </button>
          </div>
        </>
      }
    >
      <form
        id="show-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        <Field
          label="Location"
          htmlFor="f-location"
          hint="City only. Printed in the MoCA letter subject and Annexure 4."
        >
          <input
            id="f-location"
            required
            className={inputClass}
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Bharuch"
          />
        </Field>

        <Field
          label="Client"
          htmlFor="f-client"
          hint="Who is paying you. Not printed on the permission documents."
        >
          <input
            id="f-client"
            className={inputClass}
            value={draft.client}
            onChange={(e) => set("client", e.target.value)}
            placeholder="Jai Sindhi"
          />
        </Field>

        <Field
          label="Contact number"
          htmlFor="f-contact"
          hint="The client's number, for your records."
        >
          <input
            id="f-contact"
            className={inputClass}
            value={draft.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="9722455898"
          />
        </Field>

        <Field
          label="Drone count"
          htmlFor="f-drones"
          hint="Printed in the MoCA letter as Number of Drones."
        >
          <input
            id="f-drones"
            type="number"
            min={0}
            step={10}
            className={inputClass}
            value={draft.droneCount || ""}
            onChange={(e) => set("droneCount", Number(e.target.value) || 0)}
            placeholder="120"
          />
        </Field>

        <Field
          label="Person"
          htmlFor="f-person"
          hint="Your point person running this show."
        >
          <input
            id="f-person"
            className={inputClass}
            value={draft.person}
            onChange={(e) => set("person", e.target.value)}
            placeholder={DEFAULT_PERSON}
          />
        </Field>

        <Field
          label="B2B"
          htmlFor="f-b2b"
          hint="The partner or agency the booking came through. Leave blank for a direct booking."
        >
          <input
            id="f-b2b"
            className={inputClass}
            value={draft.b2b}
            onChange={(e) => set("b2b", e.target.value)}
            placeholder="Partner or agency"
          />
        </Field>

        <Field label="Booking date" htmlFor="f-booking">
          <input
            id="f-booking"
            type="date"
            className={inputClass}
            value={draft.bookingDate}
            onChange={(e) => set("bookingDate", e.target.value)}
          />
        </Field>

        <Field label="Show date" htmlFor="f-showdate">
          <input
            id="f-showdate"
            type="date"
            required
            className={inputClass}
            value={draft.showDate}
            onChange={(e) => set("showDate", e.target.value)}
          />
        </Field>

        <Field label="Start time" htmlFor="f-start">
          <input
            id="f-start"
            type="time"
            className={inputClass}
            value={draft.showStartTime}
            onChange={(e) => set("showStartTime", e.target.value)}
          />
        </Field>

        <Field label="End time" htmlFor="f-end">
          <input
            id="f-end"
            type="time"
            className={inputClass}
            value={draft.showEndTime}
            onChange={(e) => set("showEndTime", e.target.value)}
          />
        </Field>

        <Field
          label="Zone"
          wide
          hint="From the DGCA airspace map for this venue — check digitalsky.dgca.gov.in. It describes the airspace, not your paperwork."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ZONES) as Zone[]).map((zone) => {
              const active = draft.zone === zone;
              return (
                <label
                  key={zone}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    active
                      ? zoneActive[zone]
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="zone"
                    className="sr-only"
                    checked={active}
                    onChange={() => set("zone", zone)}
                  />
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${zoneDot[zone]}`} />
                  <span>
                    <span className="block font-medium">{ZONES[zone].label}</span>
                    <span className="block text-xs opacity-80">{ZONES[zone].hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Field>

        <Field label="Show amount (₹)" htmlFor="f-amount">
          <input
            id="f-amount"
            type="number"
            min={0}
            step={1000}
            className={inputClass}
            value={draft.showAmount || ""}
            onChange={(e) => set("showAmount", Number(e.target.value) || 0)}
            placeholder="151000"
          />
        </Field>

        <Field label="Commission (₹)" htmlFor="f-commission">
          <input
            id="f-commission"
            type="number"
            min={0}
            step={500}
            className={inputClass}
            value={draft.commission || ""}
            onChange={(e) => set("commission", Number(e.target.value) || 0)}
            placeholder="0"
          />
        </Field>

        <Field label="Show status" htmlFor="f-status">
          <select
            id="f-status"
            className={inputClass}
            value={draft.showStatus}
            onChange={(e) => set("showStatus", e.target.value as ShowStatus)}
          >
            {(Object.keys(SHOW_STATUSES) as ShowStatus[]).map((key) => (
              <option key={key} value={key}>
                {SHOW_STATUSES[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Permission"
          htmlFor="f-permission"
          hint="Your filing status. Green-zone shows normally need none — leave NA."
        >
          <select
            id="f-permission"
            className={inputClass}
            value={draft.permission}
            onChange={(e) => set("permission", e.target.value as PermissionStatus)}
          >
            {(Object.keys(PERMISSION_STATUSES) as PermissionStatus[]).map((key) => (
              <option key={key} value={key}>
                {PERMISSION_STATUSES[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Venue address"
          htmlFor="f-venue"
          wide
          hint="Full address including the city — goes into the MoCA letter as the event location."
        >
          <input
            id="f-venue"
            className={inputClass}
            value={draft.venueAddress}
            onChange={(e) => set("venueAddress", e.target.value)}
            placeholder="Golden Chowkdi Ground, Station Road, Bharuch, Gujarat 392001"
          />
        </Field>

        <Field
          label="Coordinates"
          htmlFor="f-coords"
          hint="Latitude, longitude of the takeoff point."
        >
          <input
            id="f-coords"
            className={inputClass}
            value={draft.coordinates}
            onChange={(e) => set("coordinates", e.target.value)}
            placeholder="21.702900, 72.997100"
          />
        </Field>

        <Field label="Notes" htmlFor="f-notes" wide>
          <textarea
            id="f-notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Wind call at 17:00 · backup date 12 Oct"
          />
        </Field>
      </form>
    </Modal>
  );
}
