"use client";

import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  removeInventoryItem,
  subscribe,
  upsertInventoryItem,
} from "../../lib/inventory-store";
import { InventoryItem, UNIT_STATUSES, isLowStock, itemValue, unitCounts } from "../../lib/inventory";
import { formatCompactMoney, formatMoney, formatNumber } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { InventoryDialog } from "./InventoryDialog";

type Dialog = { kind: "none" } | { kind: "edit"; item: InventoryItem | null };

const updated = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** The list as a spreadsheet, for counting stock or sending to accounts. */
function downloadCsv(rows: InventoryItem[]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["Item", "Category", "Quantity", "Unit", "Active", "Inactive", "Under repair", "Price per unit", "Total value", "Location", "UINs", "Notes"],
    ...rows.map((i) => {
      const counts = unitCounts(i.units);
      return [
        i.name, i.category, i.quantity, i.unit,
        i.units.length ? counts.active : "", i.units.length ? counts.inactive : "", i.units.length ? counts.repair : "",
        i.unitPrice, itemValue(i), i.location,
        i.units.map((u) => `${u.uin} (${UNIT_STATUSES[u.status]})`).join("; "), i.notes,
      ];
    }),
  ];
  const blob = new Blob([lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function InventoryDashboard() {
  const { can } = useAuth();
  const canCreate = can("inventory", "create");
  const canEdit = can("inventory", "edit");
  const canDelete = can("inventory", "delete");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const items = useMemo(() => state?.items ?? [], [state]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (lowOnly && !isLowStock(i)) return false;
      if (!q) return true;
      return [i.name, i.category, i.location, i.notes, ...i.units.map((u) => u.uin)].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [items, query, category, lowOnly]);

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalValue = items.reduce((sum, i) => sum + itemValue(i), 0);
  const low = items.filter(isLowStock).length;
  const allUnits = items.flatMap((i) => i.units);
  const fleet = unitCounts(allUnits);
  const visibleUnits = visible.reduce((sum, i) => sum + i.quantity, 0);
  const visibleValue = visible.reduce((sum, i) => sum + itemValue(i), 0);

  function handleDelete(item: InventoryItem) {
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
    removeInventoryItem(item.id);
    setDialog({ kind: "none" });
  }

  const tiles = [
    { label: "Items", value: formatNumber(items.length), note: `${categories.length} categor${categories.length === 1 ? "y" : "ies"}` },
    { label: "Total quantity", value: formatNumber(totalUnits), note: "units across all items" },
    {
      label: "Active units",
      value: allUnits.length ? `${fleet.active} / ${allUnits.length}` : "—",
      note: allUnits.length
        ? `${fleet.inactive} inactive · ${fleet.repair} under repair`
        : "add UINs to an item to track each unit",
    },
    { label: "Stock value", value: formatCompactMoney(totalValue), note: formatMoney(totalValue) },
    { label: "Low stock", value: String(low), note: "at or below their alert level", warn: low > 0 },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Inventory"
        subtitle="Every piece of equipment, how many you have and what it is worth"
        actions={
          <>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => downloadCsv(visible)}
                className="rounded-md bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
              >
                Export CSV
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "edit", item: null })}
                className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                + Add item
              </button>
            )}
          </>
        }
      />

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading inventory from Firebase…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-5">
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

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search item, UIN, category, location or notes"
              aria-label="Search inventory"
              className="min-w-52 flex-1 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={lowOnly}
              onClick={() => setLowOnly((v) => !v)}
              className={`rounded-md px-3 py-2 text-sm ring-1 ring-neutral-200 ${
                lowOnly ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Low stock only
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70">
                    {["Item name", "Category", "Quantity", "Price per unit", "Total value", "Location", "Updated", ""].map(
                      (h, k) => (
                        <th
                          key={h || k}
                          className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 ${
                            k >= 2 && k <= 4 ? "text-right" : ""
                          }`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <p className="font-medium text-neutral-900">
                          {items.length === 0 ? "No equipment yet" : "Nothing matches"}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {items.length === 0
                            ? "Add drones, batteries, chargers and the rest of your kit with quantity and price."
                            : "Try another search or category."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    visible.map((item) => {
                      const lowStock = isLowStock(item);
                      const counts = unitCounts(item.units);
                      const expanded = open.has(item.id);
                      return (
                        <Fragment key={item.id}>
                        <tr
                          onClick={canEdit ? () => setDialog({ kind: "edit", item }) : undefined}
                          className={`row-line ${canEdit ? "cursor-pointer hover:bg-neutral-50" : ""}`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-neutral-900">{item.name}</div>
                            {item.notes && (
                              <div className="max-w-xs truncate text-xs text-neutral-500">{item.notes}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-neutral-700">{item.category || "—"}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`tnum font-mono text-sm ${lowStock ? "font-semibold text-red-600" : ""}`}>
                              {formatNumber(item.quantity)}
                            </span>
                            <span className="ml-1 text-xs text-neutral-500">{item.unit}</span>
                            {lowStock && (
                              <div className="text-[11px] font-medium text-red-600">Low — alert at {item.reorderAt}</div>
                            )}
                            {item.units.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(item.id);
                                }}
                                aria-expanded={expanded}
                                className="mt-0.5 whitespace-nowrap rounded text-[11px] hover:underline"
                              >
                                <span className="font-medium text-emerald-700">{counts.active} active</span>
                                {counts.inactive > 0 && <span className="text-red-600"> · {counts.inactive} inactive</span>}
                                {counts.repair > 0 && <span className="text-amber-700"> · {counts.repair} repair</span>}
                                <span className="text-neutral-400"> {expanded ? "▴" : "▾"}</span>
                              </button>
                            )}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right font-mono text-sm">
                            {item.unitPrice ? formatMoney(item.unitPrice) : "—"}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right font-mono text-sm font-semibold text-neutral-900">
                            {itemValue(item) ? formatMoney(itemValue(item)) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-neutral-700">{item.location || "—"}</td>
                          <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-xs text-neutral-500">
                            {item.updatedAt ? updated.format(new Date(item.updatedAt)) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "edit", item })}
                                className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-neutral-50/60">
                            <td colSpan={8} className="px-3 pb-3 pt-1">
                              <div className="flex flex-wrap gap-1.5">
                                {item.units.map((unit) => (
                                  <span
                                    key={unit.uin}
                                    title={[UNIT_STATUSES[unit.status], unit.notes].filter(Boolean).join(" · ")}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ${
                                      unit.status === "active"
                                        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                        : unit.status === "repair"
                                          ? "bg-amber-50 text-amber-800 ring-amber-200"
                                          : "bg-red-50 text-red-700 ring-red-200"
                                    }`}
                                  >
                                    <span
                                      className={`size-1.5 rounded-full ${
                                        unit.status === "active"
                                          ? "bg-emerald-500"
                                          : unit.status === "repair"
                                            ? "bg-amber-500"
                                            : "bg-red-500"
                                      }`}
                                    />
                                    {unit.uin}
                                    {unit.status !== "active" && (
                                      <span className="font-sans">· {UNIT_STATUSES[unit.status]}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
                {visible.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-neutral-200 bg-neutral-50/70 text-sm">
                      <td className="px-3 py-2.5 font-semibold text-neutral-900" colSpan={2}>
                        Total · {visible.length} item{visible.length === 1 ? "" : "s"}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right font-mono font-semibold">{formatNumber(visibleUnits)}</td>
                      <td />
                      <td className="tnum px-3 py-2.5 text-right font-mono font-semibold text-neutral-900">
                        {formatMoney(visibleValue)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {dialog.kind === "edit" && (
        <InventoryDialog
          key={dialog.item?.id ?? "new"}
          item={dialog.item}
          categories={categories}
          canDelete={canDelete}
          onSave={(draft, id) => {
            upsertInventoryItem(draft, id);
            setDialog({ kind: "none" });
          }}
          onDelete={handleDelete}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
