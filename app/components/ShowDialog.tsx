"use client";

import { useMemo, useState } from "react";
import {
  CLIENT_TYPES,
  Client,
  ClientType,
  DEFAULT_PERSON,
  INDIAN_STATES,
  PERMISSION_STATUSES,
  PermissionStatus,
  Pilot,
  Place,
  SHOW_STATUSES,
  STAGE_HINTS,
  Show,
  ShowStatus,
  Zone,
  ZONES,
  certificateState,
  emptyClient,
  emptyShow,
  formatMoney,
} from "../lib/types";
import { Field, Modal, inputClass } from "./Modal";

type Draft = Omit<Show, "id">;

/** Sentinel in the client picker for "make a new client record". */
const NEW_CLIENT = "__new";

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

function toDraft(show: Show | null, pilots: Pilot[]): Draft {
  if (!show) {
    const draft = emptyShow();
    const usual = pilots.find(
      (p) => p.status === "active" && p.name.trim().toLowerCase() === DEFAULT_PERSON.toLowerCase(),
    );
    return usual ? { ...draft, pilotIds: [usual.id] } : draft;
  }
  const { id: _id, ...rest } = show;
  void _id;
  return rest;
}

const unique = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Section({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-1.5 pt-2 sm:col-span-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
        {title}
      </h3>
      {hint && <span className="text-[11px] text-neutral-400">{hint}</span>}
    </div>
  );
}

export function ShowDialog({
  show,
  clients,
  pilots,
  places,
  onSave,
  onCreateClient,
  onDelete,
  onClose,
}: {
  show: Show | null;
  clients: Client[];
  pilots: Pilot[];
  places: Place[];
  onSave: (draft: Draft, id: string | null) => void;
  /** Makes the client record and returns its id. */
  onCreateClient: (draft: Omit<Client, "id">) => string;
  onDelete: (show: Show) => void;
  onClose: () => void;
}) {
  /* Mounted fresh per show (see the key in Dashboard), so the draft is
     seeded once instead of synced in an effect. */
  const [draft, setDraft] = useState<Draft>(() => toDraft(show, pilots));
  const [choice, setChoice] = useState<string>(() =>
    show && clients.some((c) => c.id === show.clientId) ? show.clientId : "",
  );
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ClientType>(() => (show?.b2b ? "b2b" : "direct"));
  const [problem, setProblem] = useState<string | null>(null);

  /** A show saved before clients were records names one in plain text. */
  const legacyName =
    show && !clients.some((c) => c.id === show.clientId) ? show.client.trim() : "";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function chooseClient(value: string) {
    setChoice(value);
    setProblem(null);
    if (value === NEW_CLIENT) {
      if (!newName && legacyName) setNewName(legacyName);
      return;
    }
    const picked = clients.find((c) => c.id === value);
    if (!picked) {
      setDraft((prev) => ({ ...prev, clientId: "" }));
      return;
    }
    // Bring the client's details in, but never overwrite what was typed.
    setDraft((prev) => ({
      ...prev,
      clientId: picked.id,
      client: picked.name,
      contactName: prev.contactName || picked.contactName,
      contactPhone: prev.contactPhone || picked.contactPhone,
      state: prev.state || picked.state,
      location: prev.location || picked.city,
    }));
  }

  function togglePilot(id: string) {
    setDraft((prev) => ({
      ...prev,
      pilotIds: prev.pilotIds.includes(id)
        ? prev.pilotIds.filter((p) => p !== id)
        : [...prev.pilotIds, id],
    }));
  }

  const states = useMemo(
    () => unique([...INDIAN_STATES, ...places.map((p) => p.state)]),
    [places],
  );
  const cities = useMemo(() => {
    const inState = places.filter((p) => !draft.state || same(p.state, draft.state));
    return unique((inState.length ? inState : places).map((p) => p.city));
  }, [places, draft.state]);
  const areas = useMemo(
    () =>
      unique(
        places
          .filter(
            (p) =>
              (!draft.state || same(p.state, draft.state)) &&
              (!draft.location || same(p.city, draft.location)),
          )
          .map((p) => p.area),
      ),
    [places, draft.state, draft.location],
  );

  // Active pilots, plus anyone already on this show who has since left.
  const pilotChoices = pilots.filter(
    (p) => p.status === "active" || draft.pilotIds.includes(p.id),
  );

  const netNote =
    draft.showAmount === 0
      ? "Show amount not set"
      : draft.commission > 0
        ? `${formatMoney(draft.showAmount)} less ${formatMoney(draft.commission)} commission = ${formatMoney(draft.showAmount - draft.commission)}`
        : formatMoney(draft.showAmount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.location.trim()) {
      setProblem("Add the district or city — the MoCA letter needs it.");
      return;
    }

    let clientId = draft.clientId;
    let clientName = draft.client;

    if (choice === NEW_CLIENT) {
      if (!newName.trim()) {
        setProblem("Give the new client a name, or pick an existing one.");
        return;
      }
      clientId = onCreateClient({
        ...emptyClient(),
        name: newName.trim(),
        type: newType,
        contactName: draft.contactName.trim(),
        contactPhone: draft.contactPhone.trim(),
        state: draft.state.trim(),
        city: draft.location.trim(),
      });
      clientName = newName.trim();
    } else if (!choice) {
      clientId = "";
    }

    onSave(
      {
        ...draft,
        clientId,
        client: clientName.trim(),
        contactName: draft.contactName.trim(),
        contactPhone: draft.contactPhone.trim(),
        state: draft.state.trim(),
        location: draft.location.trim(),
        area: draft.area.trim(),
      },
      show?.id ?? null,
    );
  }

  const selected = clients.find((c) => c.id === choice);

  return (
    <Modal
      title={show ? "Edit show" : "New show"}
      subtitle="Starts as an inquiry — confirm it when the client books. Payments are logged separately."
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">{netNote}</span>
          <div className="ml-auto flex gap-2">
            {show && (
              <button
                type="button"
                onClick={() => onDelete(show)}
                className="rounded-md bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete
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
        className="grid max-h-[68vh] grid-cols-1 gap-x-3.5 gap-y-3 overflow-y-auto p-5 sm:grid-cols-2"
      >
        {problem && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {problem}
          </p>
        )}

        <Section title="Stage & client" />

        <Field label="Stage" htmlFor="f-status" hint={STAGE_HINTS[draft.showStatus]}>
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
          label="Client"
          htmlFor="f-client"
          hint={
            selected
              ? `${CLIENT_TYPES[selected.type]} client${selected.city ? ` · ${selected.city}` : ""}`
              : "Direct customers and B2B agencies both live in Clients."
          }
        >
          <select
            id="f-client"
            className={inputClass}
            value={choice}
            onChange={(e) => chooseClient(e.target.value)}
          >
            <option value="">— Pick a client —</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.type === "b2b" ? " · B2B" : ""}
              </option>
            ))}
            <option value={NEW_CLIENT}>＋ New client…</option>
          </select>
        </Field>

        {legacyName && !choice && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:col-span-2">
            Saved before clients had records, as “{legacyName}”. Pick the matching client, or
            choose <strong>＋ New client</strong> — the name is filled in for you.
          </p>
        )}

        {choice === NEW_CLIENT && (
          <div className="grid gap-3 rounded-xl bg-neutral-50 p-3 sm:col-span-2 sm:grid-cols-[1fr_auto]">
            <Field label="New client name" htmlFor="f-new-client">
              <input
                id="f-new-client"
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Sahara Weddings"
                autoFocus
              />
            </Field>
            <Field label="Type">
              <div className="flex overflow-hidden rounded-md bg-white ring-1 ring-neutral-300">
                {(Object.keys(CLIENT_TYPES) as ClientType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={newType === type}
                    onClick={() => setNewType(type)}
                    className={`px-3.5 py-2 text-sm ${
                      newType === type ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {CLIENT_TYPES[type]}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[11px] text-neutral-500 sm:col-span-2">
              Saved to Clients when you save this show, with the contact below.
            </p>
          </div>
        )}

        <Field label="Contact person" htmlFor="f-contact-name">
          <input
            id="f-contact-name"
            className={inputClass}
            value={draft.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Meera Patel"
          />
        </Field>

        <Field label="Contact number" htmlFor="f-contact-phone">
          <input
            id="f-contact-phone"
            type="tel"
            className={inputClass}
            value={draft.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
            placeholder="98250 00114"
          />
        </Field>

        <Section title="Where" hint="Places are remembered for next time" />

        <datalist id="dl-states">
          {states.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="dl-cities">
          {cities.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="dl-areas">
          {areas.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <Field label="State" htmlFor="f-state">
          <input
            id="f-state"
            list="dl-states"
            className={inputClass}
            value={draft.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder="Gujarat"
          />
        </Field>

        <Field
          label="District / city"
          htmlFor="f-location"
          hint="Printed as the city in the MoCA letter and Annexure 4."
        >
          <input
            id="f-location"
            list="dl-cities"
            required
            className={inputClass}
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Ahmedabad"
          />
        </Field>

        <Field label="Area / locality" htmlFor="f-area">
          <input
            id="f-area"
            list="dl-areas"
            className={inputClass}
            value={draft.area}
            onChange={(e) => set("area", e.target.value)}
            placeholder="Satellite"
          />
        </Field>

        <Field label="Coordinates" htmlFor="f-coords" hint="Latitude, longitude of the takeoff point.">
          <input
            id="f-coords"
            className={inputClass}
            value={draft.coordinates}
            onChange={(e) => set("coordinates", e.target.value)}
            placeholder="23.036500, 72.507400"
          />
        </Field>

        <Field
          label="Venue address"
          htmlFor="f-venue"
          wide
          hint="Full address — goes into the MoCA letter as the event location."
        >
          <input
            id="f-venue"
            className={inputClass}
            value={draft.venueAddress}
            onChange={(e) => set("venueAddress", e.target.value)}
            placeholder="Riverfront Event Ground, Ellis Bridge, Ahmedabad, Gujarat 380006"
          />
        </Field>

        <Field
          label="Zone"
          wide
          hint="From the DGCA airspace map for this venue — digitalsky.dgca.gov.in."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ZONES) as Zone[]).map((zone) => {
              const active = draft.zone === zone;
              return (
                <label
                  key={zone}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                    active ? zoneActive[zone] : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
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

        <Section title="When & who" />

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

        <Field label="Drone count" htmlFor="f-drones" hint="Printed in the MoCA letter.">
          <input
            id="f-drones"
            type="number"
            min={0}
            step={10}
            className={inputClass}
            value={draft.droneCount || ""}
            onChange={(e) => set("droneCount", Number(e.target.value) || 0)}
            placeholder="150"
          />
        </Field>

        <div />

        <Field
          label="Pilots"
          wide
          hint="The first one selected is named in Annexure 3 of the permission documents."
        >
          {pilotChoices.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-500">
              No pilots yet — add them in the Pilots section.
              {show?.person ? ` This show was saved with “${show.person}”.` : ""}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pilotChoices.map((pilot) => {
                const on = draft.pilotIds.includes(pilot.id);
                const cert = certificateState(pilot);
                const warn = cert === "expired" || cert === "expiring" || cert === "missing";
                return (
                  <button
                    key={pilot.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePilot(pilot.id)}
                    title={
                      cert === "expired"
                        ? "DGCA certificate has expired"
                        : cert === "expiring"
                          ? "DGCA certificate expires within 30 days"
                          : cert === "missing"
                            ? "No DGCA certificate on file"
                            : pilot.qualification
                    }
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${
                      on
                        ? "bg-neutral-900 text-white ring-neutral-900"
                        : "bg-white text-neutral-700 ring-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    {on && (
                      <span className="tnum text-[10px] font-semibold opacity-70">
                        {draft.pilotIds.indexOf(pilot.id) + 1}
                      </span>
                    )}
                    {pilot.name}
                    {warn && (
                      <span
                        className={`size-1.5 rounded-full ${
                          cert === "expired" ? "bg-red-500" : cert === "expiring" ? "bg-amber-500" : "bg-neutral-400"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <Section title="Money & permission" />

        <Field label="Show amount (₹)" htmlFor="f-amount" hint="For an inquiry, the amount quoted.">
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

        <div />

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
