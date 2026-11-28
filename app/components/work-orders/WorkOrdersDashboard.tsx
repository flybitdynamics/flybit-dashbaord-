"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, removeWorkOrder, subscribe, upsertWorkOrder } from "../../lib/store";
import {
  WORK_ORDER_STATUSES,
  WorkOrder,
  WorkOrderDraft,
  WorkOrderStatus,
  duplicateOfWorkOrder,
  emptyWorkOrder,
  nextWorkOrderNumber,
  sampleWorkOrder,
} from "../../lib/work-orders";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { WorkOrderEditor } from "./WorkOrderEditor";

type Open = { kind: "none" } | { kind: "sheet"; order: WorkOrder | null; draft: WorkOrderDraft; key: number };

const STATUS_STYLE: Record<WorkOrderStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  issued: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-400",
};

/** Remounts the editor for each work order opened, so it starts from that draft. */
let opened = 0;

const detail = (order: WorkOrder, label: string) =>
  order.details.find((d) => d.label.trim().toLowerCase() === label)?.value ?? "";

/** Work orders sit under Finance, so the Finance permission opens them. */
export function WorkOrdersDashboard() {
  const { can } = useAuth();
  const canCreate = can("finance", "create");
  const canEdit = can("finance", "edit");
  const canDelete = can("finance", "delete");

  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkOrderStatus | "all">("all");

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const orders = useMemo(() => state?.workOrders ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const hasSample = orders.some((o) => o.clientName.trim().toUpperCase() === "PATEL FAMILY");

  function openDraft(draft: WorkOrderDraft, order: WorkOrder | null = null) {
    setOpen({ kind: "sheet", order, draft, key: ++opened });
  }

  function edit(order: WorkOrder) {
    const { id: _id, ...draft } = order;
    void _id;
    openDraft(draft, order);
  }

  function handleSave(draft: WorkOrderDraft, id: string | null) {
    const savedId = upsertWorkOrder(draft, id);
    setOpen((prev) => (prev.kind === "sheet" ? { ...prev, order: { ...draft, id: savedId }, draft } : prev));
  }

  function handleDelete(order: WorkOrder) {
    if (!window.confirm(`Delete work order ${order.number}? This cannot be undone.`)) return;
    removeWorkOrder(order.id);
    setOpen({ kind: "none" });
  }

  const visible = orders.filter((order) => {
    if (filter !== "all" && order.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [order.number, order.clientName, order.issuedBy, ...order.details.map((d) => d.value)].join(" ").toLowerCase().includes(q);
  });

  const filters: Array<WorkOrderStatus | "all"> = ["all", "draft", "issued", "accepted", "cancelled"];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Work Orders"
        subtitle="Work orders clients issue to Flybit for a show — typed on the page, saved here, downloaded as PDF."
        actions={
          canCreate && (
            <button
              type="button"
              onClick={() => openDraft(emptyWorkOrder(nextWorkOrderNumber(orders)))}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New work order
            </button>
          )
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">Loading work orders from Firebase…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by client, event or venue"
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
                  {key === "all" ? "All" : WORK_ORDER_STATUSES[key]}
                </button>
              ))}
            </div>
            {canCreate && !hasSample && (
              <button
                type="button"
                title="Put the Patel Family work order in the list, exactly as it went out"
                onClick={() => openDraft(sampleWorkOrder(nextWorkOrderNumber(orders)))}
                className="ml-auto rounded-md bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
              >
                Add Patel Family work order
              </button>
            )}
          </div>

          <section className="card overflow-hidden">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
                <p className="text-sm font-medium text-neutral-900">{orders.length === 0 ? "No work orders yet" : "Nothing matches that"}</p>
                <p className="text-sm text-neutral-500">
                  {orders.length === 0
                    ? "“+ New work order” opens the layout; “Fill from a show” fills in the event for you."
                    : "Clear the search, or pick another status."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-3 py-2.5">Event</th>
                      <th className="px-3 py-2.5">Show date</th>
                      <th className="px-3 py-2.5 text-right">Value</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((order) => (
                      <tr key={order.id} onClick={() => edit(order)} className="row-line cursor-pointer hover:bg-neutral-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-neutral-900">{order.issuedBy || order.clientName || "—"}</div>
                          <div className="font-mono text-xs text-neutral-500">
                            {order.number} · issued {order.issueDate || "—"}
                          </div>
                        </td>
                        <td className="max-w-64 px-3 py-2.5">
                          <div className="truncate">{detail(order, "event") || "—"}</div>
                          <div className="truncate text-xs text-neutral-500">{detail(order, "venue")}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-neutral-600">{detail(order, "show date") || "—"}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 text-right font-mono text-[13px] text-neutral-900">{order.value || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[order.status]}`}>
                            {WORK_ORDER_STATUSES[order.status]}
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
                                title="Start a new work order from this one"
                                onClick={() => {
                                  const { id: _id, ...source } = order;
                                  void _id;
                                  openDraft(duplicateOfWorkOrder(source, nextWorkOrderNumber(orders)));
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
        <WorkOrderEditor
          key={open.key}
          order={open.order}
          draft={open.draft}
          shows={shows}
          canEdit={open.order ? canEdit : canCreate}
          canDelete={canDelete}
          canCreate={canCreate}
          onSave={handleSave}
          onDuplicate={(source) => openDraft(duplicateOfWorkOrder(source, nextWorkOrderNumber(orders)))}
          onDelete={handleDelete}
          onClose={() => setOpen({ kind: "none" })}
        />
      )}
    </div>
  );
}
