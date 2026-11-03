"use client";

import { Fragment, useMemo, useState } from "react";
import { Expense, MonthSummary } from "../../lib/finance";
import { Invoice, totalsFor } from "../../lib/invoices";
import { RECEIPT_PAYMENT_MODES, Receipt, TDS_DEFAULT_RATE } from "../../lib/receipts";
import { formatMonth } from "../../lib/team";
import { Payment, Show, formatDate, formatMoney, isBooked, placeLabel } from "../../lib/types";

type Scope = "month" | "all";
/** Which money counts as received: everything, only cash, or everything but cash. */
type Mode = "all" | "cash" | "other";

interface Row {
  key: string;
  show: Show | null;
  /** Receipts in the chosen period. */
  receipts: Receipt[];
  /** Cash payments logged on the show in the chosen period. */
  cash: Payment[];
  received: number;
  /** TDS the client kept back on those receipts. */
  tds: number;
  /** What the client owes in all: the show's invoices with GST, else the show amount. */
  billed: number;
  billedFromInvoices: boolean;
  /** Everything received for the show, whatever the period, TDS included. */
  receivedToDate: number;
}

const sum = (receipts: Receipt[]) => receipts.reduce((total, r) => total + (r.amountReceived || 0), 0);
const sumTds = (receipts: Receipt[]) => receipts.reduce((total, r) => total + (r.tdsAmount || 0), 0);
const sumCash = (payments: Payment[]) => payments.reduce((total, p) => total + (p.amount || 0), 0);

/** Every receipt, grouped under the show it was for: what each show has
 *  brought in, and what is still to come. A receipt names its show directly
 *  or through its invoice; any that do neither are listed on their own.
 *  Cash logged on a show as a payment counts as received too. The payment
 *  mode filter narrows what counts as received; the balance always uses
 *  everything received, so it stays true whichever filter is on. */
export function ReceiptsByShow({
  shows,
  receipts,
  payments,
  invoices,
  expenses,
  monthSpend,
  month,
}: {
  shows: Show[];
  receipts: Receipt[];
  payments: Payment[];
  invoices: Invoice[];
  expenses: Expense[];
  /** The month's outgoings, salaries included, as the month view works them out. */
  monthSpend: Pick<MonthSummary, "outgoings" | "salaries" | "commission" | "expenses">;
  month: string;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [mode, setMode] = useState<Mode>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => {
    const showOf = (r: Receipt) => r.showId || invoices.find((i) => i.id === r.invoiceId)?.showId || "";
    const byShow = new Map<string, Receipt[]>();
    for (const r of receipts) {
      const key = showOf(r);
      byShow.set(key, [...(byShow.get(key) ?? []), r]);
    }
    const modeOk = (paymentMode: string) =>
      mode === "all" || (mode === "cash" ? paymentMode === "cash" : paymentMode !== "cash");
    const inScope = (r: Receipt) => (scope === "all" || r.receiptDate?.startsWith(month)) && modeOk(r.paymentMode);
    const cashOf = (showId: string) => payments.filter((p) => p.mode === "cash" && p.showId === showId);
    /* Cash logged on a show counts unless only non-cash money is asked for. */
    const cashInScope = (p: Payment) => mode !== "other" && (scope === "all" || p.date?.startsWith(month));

    const keys = new Set([...byShow.keys()].filter((k) => k && byShow.get(k)?.some(inScope)));
    for (const p of payments) if (p.mode === "cash" && p.showId && cashInScope(p)) keys.add(p.showId);
    /* For the full picture, booked shows with nothing received yet belong too. */
    if (scope === "all" && mode === "all") for (const s of shows) if (isBooked(s)) keys.add(s.id);

    const out: Row[] = [...keys].map((key) => {
      const show = shows.find((s) => s.id === key) ?? null;
      const all = byShow.get(key) ?? [];
      const showInvoices = invoices.filter((i) => i.showId === key && i.status !== "cancelled");
      const invoiced = showInvoices.reduce((total, i) => total + totalsFor(i).total, 0);
      const chosen = all.filter(inScope).sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));
      const allCash = cashOf(key);
      const cash = allCash.filter(cashInScope).sort((a, b) => b.date.localeCompare(a.date));
      return {
        key,
        show,
        receipts: chosen,
        cash,
        received: sum(chosen) + sumCash(cash),
        tds: sumTds(chosen),
        billed: invoiced || show?.showAmount || 0,
        billedFromInvoices: invoiced > 0,
        receivedToDate: sum(all) + sumTds(all) + sumCash(allCash),
      };
    });

    const loose = (byShow.get("") ?? []).filter(inScope);
    if (loose.length) {
      out.push({
        key: "",
        show: null,
        receipts: loose.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)),
        cash: [],
        received: sum(loose),
        tds: sumTds(loose),
        billed: 0,
        billedFromInvoices: false,
        receivedToDate: sum(loose) + sumTds(loose),
      });
    }

    const q = query.trim().toLowerCase();
    return out
      .filter((row) => {
        if (!q) return true;
        const words = [
          row.show?.client,
          row.show ? placeLabel(row.show) : "",
          ...row.receipts.flatMap((r) => [r.number, r.receivedFrom, r.referenceNumber]),
        ];
        return words.some((w) => w?.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (!a.show) return 1;
        if (!b.show) return -1;
        return b.received - a.received || (b.show.showDate || "").localeCompare(a.show.showDate || "");
      });
  }, [shows, receipts, payments, invoices, month, scope, mode, query]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const totalReceived = rows.reduce((total, r) => total + r.received, 0);
  const totalTds = rows.reduce((total, r) => total + r.tds, 0);
  const totalBilled = rows.reduce((total, r) => total + r.billed, 0);
  const totalBalance = rows.reduce((total, r) => total + Math.max(0, r.billed - r.receivedToDate), 0);
  const receiptCount = rows.reduce((total, r) => total + r.receipts.length, 0);
  const cashCount = rows.reduce((total, r) => total + r.cash.length, 0);

  /* Invoiced and spent follow the period only; the payment filter is about money in. */
  const periodInvoices = invoices
    .filter((i) => i.status !== "cancelled" && (scope === "all" || i.invoiceDate?.startsWith(month)))
    .map(totalsFor);
  const invoiced = periodInvoices.reduce((total, t) => total + t.total, 0);
  const invoicedTax = periodInvoices.reduce((total, t) => total + t.taxTotal, 0);
  const allExpenses = expenses.reduce((total, e) => total + (e.amount || 0), 0);
  const allCommission = shows.filter(isBooked).reduce((total, s) => total + (s.commission || 0), 0);
  const spent =
    scope === "month"
      ? {
          total: monthSpend.outgoings,
          note: `${formatMoney(monthSpend.salaries)} salary · ${formatMoney(monthSpend.commission)} commission · ${formatMoney(monthSpend.expenses)} expenses`,
        }
      : {
          total: allExpenses + allCommission,
          note: `${formatMoney(allExpenses)} expenses · ${formatMoney(allCommission)} commission · salaries in the month view`,
        };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-wider text-neutral-600">
          Receipts by show
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, place or receipt no."
          aria-label="Search receipts"
          className="w-60 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-900"
        />
        <div role="group" aria-label="Payment mode" className="flex overflow-hidden rounded-md bg-white ring-1 ring-neutral-200">
          {([
            ["all", "All payments"],
            ["cash", "Cash only"],
            ["other", "Bank, UPI & cheque"],
          ] as const).map(([option, label]) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={`px-3 py-1.5 text-sm ${mode === option ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Period" className="flex overflow-hidden rounded-md bg-white ring-1 ring-neutral-200">
          {(["all", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={scope === option}
              onClick={() => setScope(option)}
              className={`px-3 py-1.5 text-sm ${scope === option ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {option === "all" ? "All time" : formatMonth(month)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-5">
        {[
          { label: mode === "cash" ? "Received in cash" : mode === "other" ? "Received by bank, UPI & cheque" : "Received", value: formatMoney(totalReceived), note: `${receiptCount} receipt${receiptCount === 1 ? "" : "s"}${cashCount ? ` · ${cashCount} cash payment${cashCount === 1 ? "" : "s"}` : ""}` },
          { label: "Invoiced", value: formatMoney(invoiced), note: invoicedTax ? `includes ${formatMoney(invoicedTax)} GST` : "nothing invoiced" },
          { label: "Spent", value: formatMoney(spent.total), note: spent.note },
          { label: "TDS deducted", value: formatMoney(totalTds), note: `kept back by clients, ${TDS_DEFAULT_RATE}% before GST` },
          { label: "Still to receive", value: formatMoney(totalBalance), note: "billed minus received and TDS", warn: totalBalance > 0 },
        ].map((tile) => (
          <div key={tile.label} className="bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{tile.label}</div>
            <div className={`tnum mt-0.5 text-lg font-semibold tracking-tight ${tile.warn ? "text-amber-700" : "text-neutral-900"}`}>
              {tile.value}
            </div>
            <div className="text-xs text-neutral-500">{tile.note}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/70">
                {["Show", "Show date", "Billed", `${mode === "cash" ? "Cash received" : "Received"}${scope === "month" ? " this month" : ""}`, "TDS", "Balance", "Receipts"].map(
                  (h, k) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 ${
                        k >= 2 && k <= 5 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
                    {query
                      ? "Nothing matches."
                      : mode === "cash"
                        ? `No cash received${scope === "month" ? ` in ${formatMonth(month)}` : ""}.`
                        : scope === "month"
                        ? `No receipts in ${formatMonth(month)}.`
                        : "No receipts or booked shows yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const balance = row.billed - row.receivedToDate;
                  const expanded = open.has(row.key);
                  const entries = row.receipts.length + row.cash.length;
                  return (
                    <Fragment key={row.key || "loose"}>
                      <tr
                        onClick={entries ? () => toggle(row.key) : undefined}
                        className={`row-line ${entries ? "cursor-pointer hover:bg-neutral-50" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-neutral-900">
                            {row.show ? row.show.client || row.show.location || "Show" : "Not linked to a show"}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {row.show ? placeLabel(row.show) || "—" : "receipts with no show or invoice"}
                          </div>
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-xs text-neutral-600">
                          {row.show?.showDate ? formatDate(row.show.showDate) : "—"}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-mono text-sm">
                          {row.billed ? formatMoney(row.billed) : "—"}
                          {row.billed > 0 && !row.billedFromInvoices && (
                            <div className="text-[10px] text-neutral-400">show amount</div>
                          )}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-mono text-sm font-semibold text-emerald-700">
                          {row.received ? formatMoney(row.received) : <span className="font-normal text-neutral-400">—</span>}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-mono text-sm text-neutral-600">
                          {row.tds ? formatMoney(row.tds) : <span className="text-neutral-400">—</span>}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-mono text-sm">
                          {!row.show || !row.billed ? (
                            <span className="text-neutral-400">—</span>
                          ) : balance > 0 ? (
                            <span className="font-semibold text-amber-700">{formatMoney(balance)}</span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700">Paid in full</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-neutral-600">
                          {entries ? (
                            <span className="whitespace-nowrap">
                              {[
                                row.receipts.length && `${row.receipts.length} receipt${row.receipts.length === 1 ? "" : "s"}`,
                                row.cash.length && `${row.cash.length} cash`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}{" "}
                              <span className="text-neutral-400">{expanded ? "▴" : "▾"}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-400">None yet</span>
                          )}
                        </td>
                      </tr>
                      {expanded &&
                        row.receipts.map((r) => (
                          <tr key={r.id} className="bg-neutral-50/70 text-xs text-neutral-600">
                            <td className="py-1.5 pl-8 pr-3">
                              <span className="font-mono font-medium text-neutral-800">{r.number || "—"}</span>
                              {r.receivedFrom && <span className="text-neutral-500"> · {r.receivedFrom}</span>}
                            </td>
                            <td className="tnum px-3 py-1.5 font-mono">{r.receiptDate ? formatDate(r.receiptDate) : "—"}</td>
                            <td className="px-3 py-1.5 text-right" colSpan={1}>
                              {RECEIPT_PAYMENT_MODES[r.paymentMode] ?? r.paymentMode}
                            </td>
                            <td className="tnum px-3 py-1.5 text-right font-mono font-semibold text-emerald-700">
                              {formatMoney(r.amountReceived)}
                            </td>
                            <td className="tnum px-3 py-1.5 text-right font-mono">
                              {r.tdsAmount ? formatMoney(r.tdsAmount) : ""}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500" colSpan={2}>
                              {r.referenceNumber ? `Ref ${r.referenceNumber}` : ""}
                              {r.invoiceNumber ? `${r.referenceNumber ? " · " : ""}${r.invoiceNumber}` : ""}
                            </td>
                          </tr>
                        ))}
                      {expanded &&
                        row.cash.map((p) => (
                          <tr key={p.id} className="bg-neutral-50/70 text-xs text-neutral-600">
                            <td className="py-1.5 pl-8 pr-3">
                              <span className="font-medium text-neutral-800">Cash payment</span>
                              <span className="text-neutral-500"> · logged on the show</span>
                            </td>
                            <td className="tnum px-3 py-1.5 font-mono">{p.date ? formatDate(p.date) : "—"}</td>
                            <td className="px-3 py-1.5 text-right">Cash</td>
                            <td className="tnum px-3 py-1.5 text-right font-mono font-semibold text-emerald-700">
                              {formatMoney(p.amount)}
                            </td>
                            <td />
                            <td className="px-3 py-1.5 text-[11px] text-neutral-500" colSpan={2}>
                              {p.notes}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-200 bg-neutral-50/70 text-sm">
                  <td className="px-3 py-2.5 font-semibold text-neutral-900" colSpan={2}>
                    Total
                  </td>
                  <td className="tnum px-3 py-2.5 text-right font-mono font-semibold">{formatMoney(totalBilled)}</td>
                  <td className="tnum px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                    {formatMoney(totalReceived)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right font-mono font-semibold text-neutral-700">{formatMoney(totalTds)}</td>
                  <td className="tnum px-3 py-2.5 text-right font-mono font-semibold text-amber-700">
                    {formatMoney(totalBalance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
