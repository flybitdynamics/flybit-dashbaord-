"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getServerSnapshot,
  getSnapshot,
  removeInvoice,
  subscribe,
  upsertInvoice,
} from "../../lib/store";
import {
  INVOICE_STATUSES,
  Invoice,
  InvoiceStatus,
  duplicateOf,
  emptyInvoice,
  invoiceFromShow,
  nextInvoiceNumber,
  totalsFor,
} from "../../lib/invoices";
import {
  DEFAULT_SETTINGS,
  ListSort,
  byLastChanged,
  daysAway,
  formatDate,
  formatMoney,
  latestLogTimes,
  todayISO,
} from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { InvoiceEditor } from "./InvoiceEditor";

type Open =
  | { kind: "none" }
  /** `invoice` is null while a new one has not been saved yet. */
  | { kind: "sheet"; invoice: Invoice | null; draft: Omit<Invoice, "id"> };

/** What the row should say, which is not always the stored status: an
 *  invoice that is fully paid reads Paid, and an unpaid one past its due
 *  date reads Overdue. */
type Standing = InvoiceStatus;

function standingOf(invoice: Invoice, balance: number): Standing {
  if (invoice.status === "cancelled") return "cancelled";
  if (invoice.status === "paid" || balance <= 0) return "paid";
  if (invoice.status === "draft") return "draft";
  if (invoice.status === "overdue") return "overdue";
  const days = daysAway(invoice.dueDate);
  if (days !== null && days < 0 && balance > 0) return "overdue";
  return invoice.status;
}

const STANDING_STYLE: Record<Standing, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-400",
};

const STANDING_LABEL: Record<Standing, string> = INVOICE_STATUSES;

function StatusPill({ standing }: { standing: Standing }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STANDING_STYLE[standing]}`}
    >
      {STANDING_LABEL[standing]}
    </span>
  );
}

export function InvoicesDashboard({ fromShowId = "" }: { fromShowId?: string }) {
  const { can } = useAuth();
  const canCreate = can("invoices", "create");
  const canEdit = can("invoices", "edit");
  const canDelete = can("invoices", "delete");

  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [linkUsed, setLinkUsed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Standing | "all">("all");
  const [sort, setSort] = useState<ListSort>("updated");

  const [driveStatus, setDriveStatus] = useState<{
    configured: boolean;
    connected: boolean;
    folderId: string | null;
  } | null>(null);
  const [driveBanner, setDriveBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/drive/status")
      .then((res) => res.json())
      .then((data) => setDriveStatus(data))
      .catch(() => {});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("drive") === "connected") {
        setDriveBanner({
          type: "success",
          message:
            "Google Drive connected successfully! Invoices can now be uploaded directly to the 'Invoice 26-27' folder.",
        });
        window.history.replaceState({}, "", window.location.pathname);
      } else if (params.get("drive_error")) {
        setDriveBanner({
          type: "error",
          message: `Google Drive connection failed: ${params.get("drive_error")}`,
        });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const invoices = useMemo(() => state?.invoices ?? [], [state]);
  const loggedAt = useMemo(() => latestLogTimes(state?.logs ?? []), [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const receipts = useMemo(() => state?.receipts ?? [], [state]);
  const settings = state?.settings ?? DEFAULT_SETTINGS;

  /* Totals once, for both the tiles and the rows. */
  const rows = useMemo(
    () =>
      invoices.map((invoice) => {
        const totals = totalsFor(invoice);
        return { invoice, totals, standing: standingOf(invoice, totals.balance) };
      }),
    [invoices],
  );

  function blank(): Omit<Invoice, "id"> {
    return emptyInvoice(nextInvoiceNumber(invoices), "line-1");
  }

  /** A new invoice already filled in from a booking. */
  function fromShow(showId: string): Omit<Invoice, "id"> {
    const base = blank();
    const show = shows.find((s) => s.id === showId);
    if (!show) return base;
    const client = clients.find((c) => c.id === show.clientId) ?? null;
    return invoiceFromShow(base, show, client, base.lines[0].id);
  }

  /** A copy of an invoice, opened as a new unsaved one. */
  function duplicate(source: Omit<Invoice, "id">) {
    setLinkUsed(true);
    setOpen({
      kind: "sheet",
      invoice: null,
      draft: duplicateOf(source, nextInvoiceNumber(invoices)),
    });
  }

  function edit(invoice: Invoice) {
    const { id: _id, ...draft } = invoice;
    void _id;
    setOpen({ kind: "sheet", invoice, draft });
  }

  /* Arriving from a show's Invoice button opens one as soon as the desk has
     loaded, without needing an effect to do it. */
  const linked =
    !linkUsed && fromShowId && canCreate && ready && open.kind === "none"
      ? fromShow(fromShowId)
      : null;
  const sheet: Open = linked ? { kind: "sheet", invoice: null, draft: linked } : open;

  function close() {
    setLinkUsed(true);
    setOpen({ kind: "none" });
  }

  const summary = rows.reduce(
    (acc, row) => {
      if (row.standing === "cancelled") return acc;
      acc.invoiced += row.totals.total;
      acc.taxTotal += row.totals.taxTotal;
      acc.subTotal += row.totals.subTotal;
      acc.received += Math.min(row.invoice.paymentMade, row.totals.total);
      acc.outstanding += Math.max(0, row.totals.balance);
      if (row.standing === "overdue") acc.overdue += 1;
      return acc;
    },
    { invoiced: 0, received: 0, outstanding: 0, overdue: 0, taxTotal: 0, subTotal: 0 },
  );

  // The store keeps invoices newest number first already.
  const order = new Map(
    (sort === "updated" ? byLastChanged(invoices, loggedAt) : invoices).map((invoice, i) => [invoice.id, i]),
  );
  const visible = [...rows]
    .sort((a, b) => (order.get(a.invoice.id) ?? 0) - (order.get(b.invoice.id) ?? 0))
    .filter(({ invoice, standing }) => {
    if (filter !== "all" && standing !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [invoice.number, invoice.billTo.name, invoice.subject, invoice.placeOfSupply]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  /** Saving keeps the sheet open on the record it just wrote, so the next
   *  save updates it instead of raising a second invoice. */
  function handleSave(draft: Omit<Invoice, "id">, id: string | null) {
    const savedId = upsertInvoice(draft, id);
    setLinkUsed(true);
    setOpen({ kind: "sheet", invoice: { ...draft, id: savedId }, draft });
  }

  function handleStatusChange(invoice: Invoice, nextStatus: InvoiceStatus) {
    const totals = totalsFor(invoice);
    const patch: Partial<Omit<Invoice, "id">> = { status: nextStatus };
    if (nextStatus === "paid" && invoice.paymentMade < totals.total) {
      patch.paymentMade = totals.total;
    } else if (nextStatus === "sent") {
      const days = daysAway(invoice.dueDate);
      if (days !== null && days < 0) {
        patch.dueDate = todayISO();
      }
    }
    const updated: Omit<Invoice, "id"> = { ...invoice, ...patch };
    upsertInvoice(updated, invoice.id);
  }

  function handleDelete(invoice: Invoice) {
    if (!window.confirm(`Delete invoice ${invoice.number}? This cannot be undone.`)) return;
    removeInvoice(invoice.id);
    close();
  }

  const tiles = [
    {
      label: "Invoiced",
      value: formatMoney(summary.invoiced),
      note: `${rows.length} invoice${rows.length === 1 ? "" : "s"} · incl. ${formatMoney(summary.taxTotal)} GST`,
    },
    {
      label: "Received",
      value: formatMoney(summary.received),
      note: "marked as paid on the invoices",
    },
    {
      label: "Outstanding",
      value: formatMoney(summary.outstanding),
      note: "still to collect (incl. GST)",
    },
    {
      label: "Overdue",
      value: String(summary.overdue),
      note: "past the due date and unpaid",
    },
  ];

  const filters: Array<Standing | "all"> = ["all", "draft", "sent", "overdue", "paid", "cancelled"];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Invoices"
        subtitle="Tax invoices in the company's own format — raise one from a show, then print or save as PDF"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {driveStatus?.connected ? (
              <a
                href={`https://drive.google.com/drive/folders/${driveStatus.folderId || "1elc_ysRL4UuEt_49JuspIO5Cc7hq6eBv"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                title="Open Invoice 26-27 folder in Google Drive"
              >
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Drive Folder</span>
                <span className="text-[10px] text-neutral-400">↗</span>
              </a>
            ) : (
              <a
                href="/api/drive/auth"
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100"
                title="Connect Google Drive for invoice auto-uploads"
              >
                <svg className="size-3.5 text-amber-700" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                </svg>
                <span>Connect Drive</span>
              </a>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => setOpen({ kind: "sheet", invoice: null, draft: blank() })}
                className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                + New invoice
              </button>
            )}
          </div>
        }
      />

      {driveBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-xs ${
            driveBanner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">{driveBanner.type === "success" ? "✓" : "⚠️"}</span>
            <span>{driveBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDriveBanner(null)}
            className="text-xs font-semibold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading invoices from Firebase…
        </div>
      ) : (
        <>
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

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, client or subject"
              className="w-full max-w-72 rounded-md bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:ring-neutral-900"
            />
            <select
              aria-label="Sort invoices"
              value={sort}
              onChange={(e) => setSort(e.target.value as ListSort)}
              className="rounded-md bg-white px-2.5 py-2 text-sm text-neutral-700 shadow-sm outline-none ring-1 ring-neutral-200 focus-visible:ring-neutral-900"
            >
              <option value="updated">Recently updated first</option>
              <option value="number">By number</option>
            </select>
            <div className="flex flex-wrap gap-1">
              {filters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === key
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-600 shadow-sm hover:bg-neutral-100"
                    }`}
                >
                  {key === "all" ? "All" : STANDING_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          <section className="card overflow-hidden">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
                <p className="text-sm font-medium text-neutral-900">
                  {rows.length === 0 ? "No invoices yet" : "Nothing matches that"}
                </p>
                <p className="text-sm text-neutral-500">
                  {rows.length === 0
                    ? "Raise one from a completed show and it prints on your usual format."
                    : "Clear the search, or pick another status."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      <th className="px-4 py-2.5">Invoice</th>
                      <th className="px-3 py-2.5">Bill to</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Due</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ invoice, totals, standing }) => (
                      <tr
                        key={invoice.id}
                        onClick={() => edit(invoice)}
                        className={`row-line cursor-pointer hover:bg-neutral-50 ${standing === "cancelled" ? "text-neutral-400" : ""
                          }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-[13px] font-semibold text-neutral-900">
                            {invoice.number}
                          </div>
                          {invoice.subject && (
                            <div className="max-w-64 truncate text-xs text-neutral-500">
                              {invoice.subject}
                            </div>
                          )}
                        </td>
                        <td className="max-w-56 px-3 py-2.5">
                          <div className="truncate">{invoice.billTo.name || "—"}</div>
                          {invoice.placeOfSupply && (
                            <div className="truncate text-xs text-neutral-500">
                              {invoice.placeOfSupply}
                            </div>
                          )}
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-neutral-600">
                          {formatDate(invoice.invoiceDate)}
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-neutral-600">
                          {formatDate(invoice.dueDate)}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-mono text-[13px] text-neutral-900">
                          <div>{formatMoney(totals.total)}</div>
                          {totals.taxTotal > 0 && (
                            <div className="font-sans text-[11px] text-neutral-400">
                              incl. {formatMoney(totals.taxTotal)} GST
                            </div>
                          )}
                        </td>
                        <td
                          className={`tnum px-3 py-2.5 text-right font-mono text-[13px] ${totals.balance > 0 ? "text-neutral-900" : "text-neutral-400"
                            }`}
                        >
                          {formatMoney(Math.max(0, totals.balance))}
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          {canEdit ? (
                            <div className="relative inline-flex items-center">
                              <select
                                value={standing}
                                onChange={(e) =>
                                  handleStatusChange(invoice, e.target.value as InvoiceStatus)
                                }
                                className={`cursor-pointer appearance-none rounded-full py-0.5 pl-2.5 pr-5 text-[11px] font-medium transition-colors hover:opacity-85 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${STANDING_STYLE[standing]}`}
                              >
                                {(Object.keys(INVOICE_STATUSES) as InvoiceStatus[]).map((key) => (
                                  <option key={key} value={key}>
                                    {INVOICE_STATUSES[key]}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-1.5 text-[8px] opacity-50">
                                ▼
                              </span>
                            </div>
                          ) : (
                            <StatusPill standing={standing} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => edit(invoice)}
                              className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                            >
                              {canEdit ? "Open" : "Print"}
                            </button>
                            {(() => {
                              const invReceipts = receipts.filter(
                                (r) =>
                                  r.invoiceId === invoice.id ||
                                  (Boolean(r.invoiceNumber) && r.invoiceNumber.trim() === invoice.number.trim()),
                              );
                              const totalPaid = invReceipts.reduce((sum, r) => sum + (r.amountReceived || 0), 0);
                              const isZeroBalance =
                                totals.balance <= 0 ||
                                invoice.status === "paid" ||
                                (totals.total > 0 && totalPaid >= totals.total);

                              if (isZeroBalance) {
                                if (invReceipts.length > 0) {
                                  return (
                                    <Link
                                      href={`/receipts?invoice=${invoice.id}${invReceipts.length > 1 ? "&view=all" : ""}`}
                                      className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1"
                                      title={
                                        invReceipts.length > 1
                                          ? `Balance is ₹0 (Fully Paid). Click to view all ${invReceipts.length} receipts side by side`
                                          : "Balance is ₹0 (Fully Paid). Click to view receipt"
                                      }
                                    >
                                      <span>✓ View Receipt</span>
                                      {invReceipts.length > 1 && (
                                        <span className="opacity-70 text-[10px]">({invReceipts.length})</span>
                                      )}
                                    </Link>
                                  );
                                }
                                return (
                                  <span
                                    className="rounded-md px-2 py-1 text-xs font-medium text-neutral-400 bg-neutral-100 select-none cursor-default"
                                    title="Balance is ₹0. No receipt to create."
                                  >
                                    Settled
                                  </span>
                                );
                              }

                              const pending = Math.max(0, totals.balance);
                              return (
                                <div className="flex items-center gap-1">
                                  {invReceipts.length > 0 && (
                                    <Link
                                      href={`/receipts?invoice=${invoice.id}&view=all`}
                                      className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1"
                                      title={`View ${invReceipts.length} existing receipt${invReceipts.length > 1 ? "s" : ""} side by side`}
                                    >
                                      <span>Receipt</span>
                                      <span className="opacity-70 text-[10px]">({invReceipts.length})</span>
                                    </Link>
                                  )}
                                  <Link
                                    href={`/receipts?invoice=${invoice.id}`}
                                    className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1"
                                    title={`Pending balance: ₹${pending.toLocaleString("en-IN")}. Click to add receipt`}
                                  >
                                    <span>+ Receipt</span>
                                    {invReceipts.length > 0 && (
                                      <span className="text-[10px] text-blue-600 font-mono">
                                        (Part #{invReceipts.length + 1})
                                      </span>
                                    )}
                                  </Link>
                                </div>
                              );
                            })()}
                            {canCreate && (
                              <button
                                type="button"
                                title="Start a new invoice from this one"
                                onClick={() => {
                                  const { id: _id, ...source } = invoice;
                                  void _id;
                                  duplicate(source);
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

      {sheet.kind === "sheet" && (
        <InvoiceEditor
          invoice={sheet.invoice}
          draft={sheet.draft}
          settings={settings}
          shows={shows}
          clients={clients}
          payments={payments}
          canEdit={sheet.invoice ? canEdit : canCreate}
          canDelete={canDelete}
          canCreate={canCreate}
          onSave={handleSave}
          onDuplicate={duplicate}
          onDelete={handleDelete}
          onClose={close}
        />
      )}
    </div>
  );
}
