"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
  daysAway,
  formatCompactMoney,
  formatDate,
  formatMoney,
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
type Standing = InvoiceStatus | "overdue";

function standingOf(invoice: Invoice, balance: number): Standing {
  if (invoice.status === "cancelled") return "cancelled";
  if (balance <= 0) return "paid";
  const days = daysAway(invoice.dueDate);
  if (days !== null && days < 0) return "overdue";
  return invoice.status === "paid" ? "sent" : invoice.status;
}

const STANDING_STYLE: Record<Standing, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-400",
};

const STANDING_LABEL: Record<Standing, string> = { ...INVOICE_STATUSES, overdue: "Overdue" };

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

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const invoices = useMemo(() => state?.invoices ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
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
      acc.received += Math.min(row.invoice.paymentMade, row.totals.total);
      acc.outstanding += Math.max(0, row.totals.balance);
      if (row.standing === "overdue") acc.overdue += 1;
      return acc;
    },
    { invoiced: 0, received: 0, outstanding: 0, overdue: 0 },
  );

  const visible = rows.filter(({ invoice, standing }) => {
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

  function handleDelete(invoice: Invoice) {
    if (!window.confirm(`Delete invoice ${invoice.number}? This cannot be undone.`)) return;
    removeInvoice(invoice.id);
    close();
  }

  const tiles = [
    { label: "Invoiced", value: formatCompactMoney(summary.invoiced), note: `${rows.length} invoice${rows.length === 1 ? "" : "s"}` },
    { label: "Received", value: formatCompactMoney(summary.received), note: "marked as paid on the invoices" },
    { label: "Outstanding", value: formatCompactMoney(summary.outstanding), note: "still to collect" },
    { label: "Overdue", value: String(summary.overdue), note: "past the due date and unpaid" },
  ];

  const filters: Array<Standing | "all"> = ["all", "draft", "sent", "overdue", "paid", "cancelled"];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Invoices"
        subtitle="Tax invoices in the company's own format — raise one from a show, then print or save as PDF"
        actions={
          canCreate && (
            <button
              type="button"
              onClick={() => setOpen({ kind: "sheet", invoice: null, draft: blank() })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New invoice
            </button>
          )
        }
      />

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
            <div className="flex flex-wrap gap-1">
              {filters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === key
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
                        className={`row-line cursor-pointer hover:bg-neutral-50 ${
                          standing === "cancelled" ? "text-neutral-400" : ""
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
                          {formatMoney(totals.total)}
                        </td>
                        <td
                          className={`tnum px-3 py-2.5 text-right font-mono text-[13px] ${
                            totals.balance > 0 ? "text-neutral-900" : "text-neutral-400"
                          }`}
                        >
                          {formatMoney(Math.max(0, totals.balance))}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill standing={standing} />
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
