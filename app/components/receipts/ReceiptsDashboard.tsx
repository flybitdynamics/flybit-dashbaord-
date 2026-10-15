"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  removeReceipt,
  subscribe,
  upsertReceipt,
} from "../../lib/store";
import {
  RECEIPT_PAYMENT_MODES,
  Receipt,
  ReceiptPaymentMode,
  emptyReceipt,
  nextReceiptNumber,
  receiptDate,
  receiptFromInvoice,
} from "../../lib/receipts";
import {
  DEFAULT_SETTINGS,
  formatDate,
  formatMoney,
  todayISO,
} from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { ReceiptEditor } from "./ReceiptEditor";

type Open =
  | { kind: "none" }
  | { kind: "sheet"; receipt: Receipt | null; draft: Omit<Receipt, "id"> };

export function ReceiptsDashboard({
  fromInvoiceId = "",
  fromShowId = "",
}: {
  fromInvoiceId?: string;
  fromShowId?: string;
}) {
  const { can } = useAuth();
  const canCreate = can("receipts", "create");
  const canEdit = can("receipts", "edit");
  const canDelete = can("receipts", "delete");

  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [linkHandled, setLinkHandled] = useState(false);
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<ReceiptPaymentMode | "all">("all");

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const receipts = useMemo(() => state?.receipts ?? [], [state]);
  const invoices = useMemo(() => state?.invoices ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const settings = state?.settings ?? DEFAULT_SETTINGS;

  function blank(): Omit<Receipt, "id"> {
    return emptyReceipt(nextReceiptNumber(receipts));
  }

  // Pre-fill from invoice query param if passed in URL
  useEffect(() => {
    if (!ready || linkHandled) return;
    if (fromInvoiceId) {
      const inv = invoices.find((i) => i.id === fromInvoiceId);
      if (inv) {
        const matchedShow = shows.find((s) => s.id === inv.showId);
        const draft = receiptFromInvoice(inv, nextReceiptNumber(receipts), undefined, "bank", matchedShow);
        setOpen({ kind: "sheet", receipt: null, draft });
        setLinkHandled(true);
      }
    } else if (fromShowId) {
      const show = shows.find((s) => s.id === fromShowId);
      if (show) {
        const inv = invoices.find((i) => i.showId === fromShowId);
        if (inv) {
          const draft = receiptFromInvoice(inv, nextReceiptNumber(receipts), undefined, "bank", show);
          setOpen({ kind: "sheet", receipt: null, draft });
        } else {
          const draft: Omit<Receipt, "id"> = {
            ...blank(),
            showId: show.id,
            clientId: show.clientId || "",
            receivedFrom: show.client || "",
            forReason: `Drone Light Show (${show.droneCount} drones) at ${show.location || show.state || "Venue"}`,
            totalAmountDue: show.showAmount || 0,
            amountReceived: show.showAmount || 0,
            balanceDue: 0,
          };
          setOpen({ kind: "sheet", receipt: null, draft });
        }
        setLinkHandled(true);
      }
    }
  }, [ready, fromInvoiceId, fromShowId, invoices, shows, receipts, linkHandled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return receipts.filter((r) => {
      if (modeFilter !== "all" && r.paymentMode !== modeFilter) return false;
      if (!q) return true;
      const haystack = [
        r.number,
        r.invoiceNumber,
        r.receivedFrom,
        r.forReason,
        r.referenceNumber,
        r.notes,
        RECEIPT_PAYMENT_MODES[r.paymentMode],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [receipts, query, modeFilter]);

  // Aggregate stats
  const totalAmountReceived = useMemo(
    () => receipts.reduce((sum, r) => sum + (r.amountReceived || 0), 0),
    [receipts],
  );
  const totalBalanceDue = useMemo(
    () => receipts.reduce((sum, r) => sum + (r.balanceDue || 0), 0),
    [receipts],
  );
  const linkedInvoiceCount = useMemo(
    () => receipts.filter((r) => r.invoiceNumber || r.invoiceId).length,
    [receipts],
  );

  const tiles = [
    {
      label: "Receipts Issued",
      value: String(receipts.length),
      note: `${linkedInvoiceCount} linked to tax invoices`,
    },
    {
      label: "Total Collected",
      value: formatMoney(totalAmountReceived),
      note: "total payment recorded on receipts",
    },
    {
      label: "Outstanding Balance",
      value: formatMoney(totalBalanceDue),
      note: "remaining across issued receipts",
    },
    {
      label: "Cash Vouchers",
      value: String(receipts.filter((r) => r.paymentMode === "cash").length),
      note: `${receipts.filter((r) => r.paymentMode === "upi" || r.paymentMode === "bank").length} bank/online transfers`,
    },
  ];

  function handleSave(draft: Omit<Receipt, "id">, id: string | null) {
    upsertReceipt(draft, id);
    setOpen({ kind: "none" });
  }

  function handleDelete(r: Receipt) {
    removeReceipt(r.id);
  }

  function handleDuplicate(draft: Omit<Receipt, "id">) {
    setOpen({
      kind: "sheet",
      receipt: null,
      draft: {
        ...draft,
        number: nextReceiptNumber(receipts),
        receiptDate: todayISO(),
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Payment Receipts"
        subtitle="Official cash & payment vouchers with invoice references, payment modes, and signatures"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => setOpen({ kind: "sheet", receipt: null, draft: blank() })}
                className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800 shadow-xs"
              >
                + New receipt
              </button>
            )}
          </div>
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading receipts from Firebase…
        </div>
      ) : (
        <>
          {/* Summary Metric Tiles */}
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div className="tnum mt-1 font-mono text-lg font-semibold text-neutral-900">
                  {tile.value}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          {/* Search & Mode Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by receipt #, invoice #, client or note…"
                className="w-full max-w-80 rounded-md bg-white px-3 py-2 text-sm shadow-xs outline-none ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:ring-neutral-900"
              />
              <select
                aria-label="Filter by payment mode"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value as any)}
                className="rounded-md bg-white px-3 py-2 text-sm shadow-xs outline-none ring-1 ring-neutral-200 focus-visible:ring-neutral-900"
              >
                <option value="all">All Payment Modes</option>
                <option value="cash">Cash Only</option>
                <option value="upi">UPI / Online</option>
                <option value="bank">Bank Transfer / NEFT</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="text-xs text-neutral-500 font-mono">
              {visible.length} of {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
            </div>
          </div>

          {/* Receipts Table */}
          <section className="overflow-hidden card">
            {receipts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-semibold text-neutral-900">No receipts issued yet</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Generate a payment receipt from any invoice, or create a new one directly.
                </p>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setOpen({ kind: "sheet", receipt: null, draft: blank() })}
                    className="mt-4 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    + Create first receipt
                  </button>
                )}
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No receipts match your search or filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500 border-b border-neutral-100 bg-neutral-50">
                      <th className="px-4 py-2.5">Receipt #</th>
                      <th className="px-3 py-2.5">Invoice #</th>
                      <th className="px-3 py-2.5">Received From</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Mode</th>
                      <th className="px-3 py-2.5 text-right">Amount Received</th>
                      <th className="px-3 py-2.5 text-right">Total Due</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setOpen({ kind: "sheet", receipt: r, draft: r })}
                        className="row-line cursor-pointer hover:bg-neutral-50"
                      >
                        <td className="px-4 py-2.5 font-mono text-[13px] font-bold text-neutral-900">
                          {r.number}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.invoiceNumber ? (
                            <span className="font-mono text-xs font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {r.invoiceNumber}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-56">
                          <div className="truncate font-medium text-neutral-900">
                            {r.receivedFrom || "—"}
                          </div>
                          {r.forReason && (
                            <div className="truncate text-xs text-neutral-500">{r.forReason}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-neutral-600 whitespace-nowrap">
                          {formatDate(r.receiptDate)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              r.paymentMode === "cash"
                                ? "bg-amber-50 text-amber-800 border border-amber-200/60"
                                : r.paymentMode === "upi"
                                ? "bg-purple-50 text-purple-800 border border-purple-200/60"
                                : "bg-emerald-50 text-emerald-800 border border-emerald-200/60"
                            }`}
                          >
                            {RECEIPT_PAYMENT_MODES[r.paymentMode]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 text-[13px]">
                          {formatMoney(r.amountReceived)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-neutral-600">
                          {formatMoney(r.totalAmountDue)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          {r.balanceDue > 0 ? (
                            <span className="font-semibold text-amber-700">
                              {formatMoney(r.balanceDue)}
                            </span>
                          ) : (
                            <span className="text-neutral-400">₹0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setOpen({ kind: "sheet", receipt: r, draft: r })}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                              Open / Print
                            </button>
                            {canCreate && (
                              <button
                                type="button"
                                onClick={() => handleDuplicate(r)}
                                className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                                title="Duplicate this receipt"
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

      {/* Full-screen Sheet Editor / Viewer */}
      {open.kind === "sheet" && (
        <ReceiptEditor
          receipt={open.receipt}
          draft={open.draft}
          settings={settings}
          invoices={invoices}
          shows={shows}
          clients={clients}
          canEdit={open.receipt ? canEdit : canCreate}
          canDelete={canDelete}
          canCreate={canCreate}
          onSave={handleSave}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onClose={() => setOpen({ kind: "none" })}
        />
      )}
    </div>
  );
}
