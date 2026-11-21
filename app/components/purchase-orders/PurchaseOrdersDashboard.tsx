"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, removePurchaseOrder, subscribe, upsertPurchaseOrder } from "../../lib/store";
import {
  PURCHASE_ORDER_STATUSES,
  PurchaseOrder,
  PurchaseOrderDraft,
  PurchaseOrderStatus,
  currencySymbol,
  duplicateOfPurchaseOrder,
  emptyPurchaseOrder,
  money,
  nextPurchaseOrderNumber,
  poDate,
  samplePurchaseOrder,
  totalsFor,
} from "../../lib/purchase-orders";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { PurchaseOrderEditor } from "./PurchaseOrderEditor";

type Open = { kind: "none" } | { kind: "sheet"; order: PurchaseOrder | null; draft: PurchaseOrderDraft; key: number };

const STATUS_STYLE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  issued: "bg-blue-50 text-blue-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-400",
};

/** Remounts the editor for each PO opened, so it starts from that draft. */
let opened = 0;

/** Purchase orders sit under Finance, so the Finance permission opens them. */
export function PurchaseOrdersDashboard() {
  const { can } = useAuth();
  const canCreate = can("finance", "create");
  const canEdit = can("finance", "edit");
  const canDelete = can("finance", "delete");

  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PurchaseOrderStatus | "all">("all");

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const orders = useMemo(() => state?.purchaseOrders ?? [], [state]);
  const settings = state?.settings ?? DEFAULT_SETTINGS;
  const hasSample = orders.some((o) => o.number === "FBD/PO/26-27/001");

  function openDraft(draft: PurchaseOrderDraft, order: PurchaseOrder | null = null) {
    setOpen({ kind: "sheet", order, draft, key: ++opened });
  }

  function edit(order: PurchaseOrder) {
    const { id: _id, ...draft } = order;
    void _id;
    openDraft(draft, order);
  }

  function handleSave(draft: PurchaseOrderDraft, id: string | null) {
    const savedId = upsertPurchaseOrder(draft, id);
    setOpen((prev) => (prev.kind === "sheet" ? { ...prev, order: { ...draft, id: savedId }, draft } : prev));
  }

  function handleDelete(order: PurchaseOrder) {
    if (!window.confirm(`Delete purchase order ${order.number}? This cannot be undone.`)) return;
    removePurchaseOrder(order.id);
    setOpen({ kind: "none" });
  }

  const visible = orders.filter((order) => {
    if (filter !== "all" && order.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [order.number, order.vendorName, ...order.rows.map((r) => r.description)].join(" ").toLowerCase().includes(q);
  });

  const filters: Array<PurchaseOrderStatus | "all"> = ["all", "draft", "issued", "received", "cancelled"];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Purchase Orders"
        subtitle="Orders to suppliers, on the company letterhead, numbered FBD/PO/26-27/001, 002, 003…"
        actions={
          canCreate && (
            <button
              type="button"
              onClick={() => openDraft(emptyPurchaseOrder(nextPurchaseOrderNumber(orders)))}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New PO
            </button>
          )
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">Loading purchase orders from Firebase…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, vendor or item"
              className="w-full max-w-72 rounded-md bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:ring-neutral-900"
            />
            <div className="flex flex-wrap gap-1">
              {filters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === key ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 shadow-sm hover:bg-neutral-100"
                  }`}
                >
                  {key === "all" ? "All" : PURCHASE_ORDER_STATUSES[key]}
                </button>
              ))}
            </div>
            {canCreate && !hasSample && (
              <button
                type="button"
                title="Put PO 001 (the GNSS receiver order) in the list, exactly as it went out"
                onClick={() => openDraft(samplePurchaseOrder())}
                className="ml-auto rounded-md bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
              >
                Add PO 001 (GNSS receiver)
              </button>
            )}
          </div>

          <section className="card overflow-hidden">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
                <p className="text-sm font-medium text-neutral-900">{orders.length === 0 ? "No purchase orders yet" : "Nothing matches that"}</p>
                <p className="text-sm text-neutral-500">
                  {orders.length === 0
                    ? "“+ New PO” starts the next number on the company's PO layout."
                    : "Clear the search, or pick another status."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      <th className="px-4 py-2.5">PO number</th>
                      <th className="px-3 py-2.5">Vendor</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((order) => (
                      <tr key={order.id} onClick={() => edit(order)} className="row-line cursor-pointer hover:bg-neutral-50">
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-[13px] font-semibold text-neutral-900">{order.number}</div>
                          <div className="max-w-64 truncate text-xs text-neutral-500">{order.rows[0]?.description}</div>
                        </td>
                        <td className="max-w-56 px-3 py-2.5">
                          <div className="truncate">{order.vendorName || "—"}</div>
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-neutral-600">{poDate(order.date)}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 text-right font-mono text-[13px] text-neutral-900">
                          {currencySymbol(order.currency)} {money(totalsFor(order).grandTotal)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[order.status]}`}>
                            {PURCHASE_ORDER_STATUSES[order.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => edit(order)} className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                              {canEdit ? "Open" : "View"}
                            </button>
                            {canCreate && (
                              <button
                                type="button"
                                title="Start a new PO from this one, with the next number"
                                onClick={() => {
                                  const { id: _id, ...source } = order;
                                  void _id;
                                  openDraft(duplicateOfPurchaseOrder(source, nextPurchaseOrderNumber(orders)));
                                }}
                                className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                              >
                                Duplicate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {open.kind === "sheet" && (
        <PurchaseOrderEditor
          key={open.key}
          order={open.order}
          draft={open.draft}
          settings={settings}
          canEdit={open.order ? canEdit : canCreate}
          canDelete={canDelete}
          canCreate={canCreate}
          onSave={handleSave}
          onDuplicate={(source) => openDraft(duplicateOfPurchaseOrder(source, nextPurchaseOrderNumber(orders)))}
          onDelete={handleDelete}
          onClose={() => setOpen({ kind: "none" })}
        />
      )}
    </div>
  );
}
