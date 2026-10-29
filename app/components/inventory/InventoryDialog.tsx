"use client";

import { useState } from "react";
import {
  INVENTORY_CATEGORIES,
  InventoryItem,
  InventoryUnit,
  UNIT_STATUSES,
  UnitStatus,
  emptyInventoryItem,
  emptyUnit,
  itemValue,
  unitCounts,
} from "../../lib/inventory";
import { formatMoney } from "../../lib/types";
import { Field, Modal, inputClass } from "../Modal";

type Draft = Omit<InventoryItem, "id" | "updatedAt">;

function toDraft(item: InventoryItem | null): Draft {
  const { updatedAt: _updatedAt, ...base } = emptyInventoryItem();
  void _updatedAt;
  if (!item) return base;
  const { id: _id, updatedAt: _u, ...rest } = item;
  void _id;
  void _u;
  return { ...base, ...rest };
}

/** A number box that can be cleared while typing; empty saves as 0. */
function toNumber(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function InventoryDialog({
  item,
  categories,
  canDelete = true,
  onSave,
  onDelete,
  onClose,
}: {
  item: InventoryItem | null;
  /** Categories already in use, offered alongside the standard ones. */
  categories: string[];
  canDelete?: boolean;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [problem, setProblem] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const options = [...new Set([...INVENTORY_CATEGORIES, ...categories])];
  const tracked = draft.units.length > 0;
  const counts = unitCounts(draft.units);

  const setUnit = (index: number, patch: Partial<InventoryUnit>) =>
    setDraft((prev) => ({
      ...prev,
      units: prev.units.map((u, k) => (k === index ? { ...u, ...patch } : u)),
    }));

  const removeUnit = (index: number) =>
    setDraft((prev) => ({ ...prev, units: prev.units.filter((_, k) => k !== index) }));

  /** One UIN per line (or comma separated), each added as active. */
  function addPasted() {
    const known = new Set(draft.units.map((u) => u.uin.trim().toUpperCase()));
    const fresh: InventoryUnit[] = [];
    for (const raw of pasted.split(/[\n,;]+/)) {
      const uin = raw.trim().toUpperCase();
      if (!uin || known.has(uin)) continue;
      known.add(uin);
      fresh.push({ ...emptyUnit(), uin });
    }
    setDraft((prev) => ({ ...prev, units: [...prev.units, ...fresh] }));
    setPasted("");
    setPasting(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setProblem("Give the item a name.");
      return;
    }
    const units = draft.units
      .map((u) => ({ ...u, uin: u.uin.trim().toUpperCase(), notes: u.notes.trim() }))
      .filter((u) => u.uin);
    const seen = new Set<string>();
    const repeated = units.find((u) => (seen.has(u.uin) ? true : (seen.add(u.uin), false)));
    if (repeated) {
      setProblem(`UIN ${repeated.uin} is listed twice.`);
      return;
    }
    const trimmed = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    ) as Draft;
    onSave(
      { ...trimmed, units, quantity: units.length ? units.length : trimmed.quantity },
      item?.id ?? null,
    );
  }

  return (
    <Modal
      title={item ? "Edit item" : "Add item"}
      subtitle="Equipment the company owns, how many there are and what each one costs."
      onClose={onClose}
      footer={
        <>
          <span className="text-xs text-neutral-500">
            Total value <span className="tnum font-semibold text-neutral-900">{formatMoney(itemValue({ ...draft, quantity: tracked ? draft.units.length : draft.quantity }))}</span>
          </span>
          <div className="ml-auto flex gap-2">
            {item && canDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
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
              form="inventory-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save item
            </button>
          </div>
        </>
      }
    >
      <form
        id="inventory-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        {problem && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{problem}</p>
        )}

        <Field label="Item name" htmlFor="i-name" wide>
          <input
            id="i-name"
            required
            autoFocus
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Show drone, LiPo battery 5200 mAh, RTK base station"
          />
        </Field>

        <Field label="Category" htmlFor="i-category" hint="Pick one or type your own.">
          <input
            id="i-category"
            list="i-category-options"
            className={inputClass}
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="Batteries"
          />
          <datalist id="i-category-options">
            {options.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Location" htmlFor="i-location" hint="Where it is kept.">
          <input
            id="i-location"
            className={inputClass}
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Ahmedabad office"
          />
        </Field>

        <Field
          label="Quantity"
          htmlFor="i-qty"
          hint={tracked ? "Counted from the UIN list below." : undefined}
        >
          <div className="flex gap-2">
            <input
              id="i-qty"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              disabled={tracked}
              className={`${inputClass} tnum disabled:bg-neutral-50 disabled:text-neutral-500`}
              value={tracked ? draft.units.length : draft.quantity || ""}
              onChange={(e) => set("quantity", toNumber(e.target.value))}
              placeholder="0"
            />
            <input
              aria-label="Unit"
              className={`${inputClass} w-24`}
              value={draft.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="pcs"
            />
          </div>
        </Field>

        <Field label="Price per unit (₹)" htmlFor="i-price">
          <input
            id="i-price"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className={`${inputClass} tnum`}
            value={draft.unitPrice || ""}
            onChange={(e) => set("unitPrice", toNumber(e.target.value))}
            placeholder="0"
          />
        </Field>

        <Field label="Low-stock alert at" htmlFor="i-reorder" hint="Flagged when quantity falls to this. Leave empty for no alert.">
          <input
            id="i-reorder"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className={`${inputClass} tnum`}
            value={draft.reorderAt || ""}
            onChange={(e) => set("reorderAt", toNumber(e.target.value))}
            placeholder="—"
          />
        </Field>

        <div />

        <section className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                Units by UIN
              </div>
              <div className="text-xs text-neutral-500">
                {tracked
                  ? `${draft.units.length} listed · ${counts.active} active · ${counts.inactive} inactive · ${counts.repair} under repair`
                  : "For drones: list each one with its UIN and whether it is active."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPasting((v) => !v)}
              className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              Paste UINs
            </button>
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, units: [...prev.units, emptyUnit()] }))}
              className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              + Add unit
            </button>
          </div>

          {pasting && (
            <div className="flex flex-col gap-2">
              <textarea
                rows={4}
                autoFocus
                aria-label="UINs to add, one per line"
                className={`${inputClass} resize-y font-mono uppercase`}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"One UIN per line, e.g.\nUA00000001\nUA00000002"}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasting(false);
                    setPasted("");
                  }}
                  className="rounded-md bg-white px-2.5 py-1.5 text-xs text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addPasted}
                  disabled={!pasted.trim()}
                  className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  Add as active
                </button>
              </div>
            </div>
          )}

          {tracked && (
            <div className="flex flex-col gap-1.5">
              {draft.units.map((unit, k) => (
                <div key={k} className="grid grid-cols-[2rem_1fr_8.5rem_2rem] items-center gap-2 sm:grid-cols-[2rem_1fr_8.5rem_1fr_2rem]">
                  <span className="tnum text-right font-mono text-xs text-neutral-400">{k + 1}</span>
                  <input
                    aria-label={`UIN of unit ${k + 1}`}
                    className={`${inputClass} font-mono uppercase`}
                    value={unit.uin}
                    onChange={(e) => setUnit(k, { uin: e.target.value })}
                    placeholder="UIN"
                  />
                  <select
                    aria-label={`Status of unit ${k + 1}`}
                    className={`${inputClass} ${
                      unit.status === "active"
                        ? "text-emerald-700"
                        : unit.status === "repair"
                          ? "text-amber-700"
                          : "text-red-600"
                    }`}
                    value={unit.status}
                    onChange={(e) => setUnit(k, { status: e.target.value as UnitStatus })}
                  >
                    {(Object.keys(UNIT_STATUSES) as UnitStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {UNIT_STATUSES[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Note on unit ${k + 1}`}
                    className={`${inputClass} hidden sm:block`}
                    value={unit.notes}
                    onChange={(e) => setUnit(k, { notes: e.target.value })}
                    placeholder="Note (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => removeUnit(k)}
                    aria-label={`Remove unit ${k + 1}`}
                    className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <Field label="Notes" htmlFor="i-notes" wide>
          <textarea
            id="i-notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Model, serial numbers, supplier, warranty"
          />
        </Field>
      </form>
    </Modal>
  );
}
