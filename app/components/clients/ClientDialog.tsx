"use client";

import { useMemo, useState } from "react";
import { CLIENT_TYPES, Client, ClientType, INDIAN_STATES, Place, emptyClient } from "../../lib/types";
import { Field, Modal, inputClass } from "../Modal";

type Draft = Omit<Client, "id">;

function toDraft(client: Client | null): Draft {
  if (!client) return emptyClient();
  const { id: _id, ...rest } = client;
  void _id;
  return { ...emptyClient(), ...rest };
}

const unique = (values: string[]) =>
  Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export function ClientDialog({
  client,
  places,
  showCount,
  canDelete = true,
  onSave,
  onDelete,
  onClose,
}: {
  client: Client | null;
  places: Place[];
  /** Shows that name this client, so deleting can say what happens to them. */
  showCount: number;
  canDelete?: boolean;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (client: Client) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(client));
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const states = useMemo(() => unique([...INDIAN_STATES, ...places.map((p) => p.state)]), [places]);
  const cities = useMemo(
    () =>
      unique(
        places
          .filter((p) => !draft.state || p.state.toLowerCase() === draft.state.toLowerCase())
          .map((p) => p.city),
      ),
    [places, draft.state],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setProblem("Give the client a name.");
      return;
    }
    onSave(
      Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
      ) as Draft,
      client?.id ?? null,
    );
  }

  return (
    <Modal
      title={client ? "Edit client" : "New client"}
      subtitle="Direct customers and B2B agencies live in one list — the type tells them apart."
      onClose={onClose}
      footer={
        <>
          <span className="text-xs text-neutral-500">
            {client ? `${showCount} show${showCount === 1 ? "" : "s"} booked` : "Not on any show yet"}
          </span>
          <div className="ml-auto flex gap-2">
            {client && canDelete && (
              <button
                type="button"
                onClick={() => onDelete(client)}
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
              form="client-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save client
            </button>
          </div>
        </>
      }
    >
      <form
        id="client-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        {problem && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{problem}</p>
        )}

        <Field label="Client name" htmlFor="c-name">
          <input
            id="c-name"
            required
            autoFocus
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Sahara Weddings"
          />
        </Field>

        <Field label="Type" hint="B2B is an agency or partner that books on a client's behalf.">
          <div className="flex overflow-hidden rounded-md bg-white ring-1 ring-neutral-300">
            {(Object.keys(CLIENT_TYPES) as ClientType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={draft.type === type}
                onClick={() => set("type", type)}
                className={`flex-1 px-3.5 py-2 text-sm ${
                  draft.type === type ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {CLIENT_TYPES[type]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Contact person" htmlFor="c-contact">
          <input
            id="c-contact"
            className={inputClass}
            value={draft.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Meera Patel"
          />
        </Field>

        <Field label="Contact number" htmlFor="c-phone">
          <input
            id="c-phone"
            type="tel"
            className={inputClass}
            value={draft.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
            placeholder="98250 00114"
          />
        </Field>

        <Field label="Email" htmlFor="c-email">
          <input
            id="c-email"
            type="email"
            className={inputClass}
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="events@saharaweddings.in"
          />
        </Field>

        <Field label="GSTIN" htmlFor="c-gst" hint="For invoices, if they have one.">
          <input
            id="c-gst"
            className={`${inputClass} uppercase`}
            value={draft.gstin}
            onChange={(e) => set("gstin", e.target.value)}
            placeholder="24ABCDE1234F1Z5"
          />
        </Field>

        <datalist id="dl-client-states">
          {states.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="dl-client-cities">
          {cities.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <Field label="State" htmlFor="c-state">
          <input
            id="c-state"
            list="dl-client-states"
            className={inputClass}
            value={draft.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder="Gujarat"
          />
        </Field>

        <Field label="District / city" htmlFor="c-city">
          <input
            id="c-city"
            list="dl-client-cities"
            className={inputClass}
            value={draft.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Ahmedabad"
          />
        </Field>

        <Field label="Address" htmlFor="c-address" wide>
          <input
            id="c-address"
            className={inputClass}
            value={draft.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Office or billing address"
          />
        </Field>

        <Field label="Notes" htmlFor="c-notes" wide>
          <textarea
            id="c-notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Prefers WhatsApp · pays 50% advance"
          />
        </Field>
      </form>
    </Modal>
  );
}
