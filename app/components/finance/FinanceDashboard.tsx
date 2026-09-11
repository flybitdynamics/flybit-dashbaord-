"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  EXPENSE_CATEGORIES,
  Expense,
  expensesByCategory,
  salariesInMonth,
  showMargin,
  summariseMonth,
} from "../../lib/finance";
import {
  getServerSnapshot,
  getSnapshot,
  removeExpense,
  subscribe,
  upsertExpense,
} from "../../lib/store";
import {
  getServerSnapshot as teamServerSnapshot,
  getSnapshot as teamSnapshot,
  subscribe as teamSubscribe,
} from "../../lib/team-store";
import { formatMonth, payableThisMonth, recentMonths, currentMonth } from "../../lib/team";
import { formatCompactMoney, formatDate, formatMoney, isBooked } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { ExpenseDialog } from "./ExpenseDialog";

/** A plain horizontal bar. Everything shares one scale so the lengths can
 *  be compared by eye. */
function Bar({ value, max, tone }: { value: number; max: number; tone: "in" | "out" }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className={`h-full rounded-full ${tone === "in" ? "bg-neutral-900" : "bg-neutral-300"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function FinanceDashboard() {
  const { canEdit } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [dialog, setDialog] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  });

  const desk = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const team = useSyncExternalStore(teamSubscribe, teamSnapshot, teamServerSnapshot);
  const ready = desk !== null && team !== null;

  const shows = useMemo(() => desk?.shows ?? [], [desk]);
  const payments = useMemo(() => desk?.payments ?? [], [desk]);
  const expenses = useMemo(() => desk?.expenses ?? [], [desk]);
  const members = useMemo(() => team?.members ?? [], [team]);
  const requests = useMemo(() => team?.requests ?? [], [team]);

  const summary = useMemo(
    () => summariseMonth(month, shows, payments, expenses, members, requests),
    [month, shows, payments, expenses, members, requests],
  );

  const trend = useMemo(
    () =>
      recentMonths(6)
        .slice()
        .reverse()
        .map((m) => summariseMonth(m, shows, payments, expenses, members, requests)),
    [shows, payments, expenses, members, requests],
  );
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.received, t.outgoings]));

  const salary = salariesInMonth(members, requests, month);
  const byCategory = expensesByCategory(expenses, month);
  const monthExpenses = expenses
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));

  const monthShows = shows.filter(
    (s) => isBooked(s) && s.showDate.startsWith(month),
  );
  const margins = monthShows.map((s) => showMargin(s, payments, expenses));

  const outRows = [
    { label: "Salaries", value: summary.salaries, note: salary.deduction > 0 ? `${formatCompactMoney(salary.gross)} gross less ${formatCompactMoney(salary.deduction)} unpaid leave` : "no deductions" },
    { label: "Commission", value: summary.commission, note: `${monthShows.length} show${monthShows.length === 1 ? "" : "s"} this month` },
    { label: "Expenses", value: summary.expenses, note: `${monthExpenses.length} recorded` },
  ];
  const outMax = Math.max(1, ...outRows.map((r) => r.value));

  function handleDelete(expense: Expense) {
    if (!window.confirm(`Delete this ${formatMoney(expense.amount)} expense?`)) return;
    removeExpense(expense.id);
    setDialog({ open: false, expense: null });
  }

  const tiles = [
    { label: "Received", value: formatCompactMoney(summary.received), note: "collected this month" },
    { label: "Booked", value: formatCompactMoney(summary.booked), note: "shows scheduled this month" },
    { label: "Money out", value: formatCompactMoney(summary.outgoings), note: "salary + commission + expenses" },
    {
      label: "Net",
      value: formatCompactMoney(Math.abs(summary.net)),
      note: summary.net < 0 ? "more went out than came in" : "received less money out",
      negative: summary.net < 0,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Finance"
        subtitle="What came in, what went out, and what each show actually earned"
        actions={
          <>
            <select
              aria-label="Month"
              className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {recentMonths().map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            {canEdit && (
              <button
                type="button"
                onClick={() => setDialog({ open: true, expense: null })}
                className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                + Add expense
              </button>
            )}
          </>
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading finance from Firebase…
        </div>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4"
          >
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div
                  className={`tnum mt-1 text-2xl font-semibold tracking-tight ${
                    tile.negative ? "text-red-600" : "text-neutral-900"
                  }`}
                >
                  {tile.negative ? "−" : ""}
                  {tile.value}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Where the money went — {formatMonth(month)}
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {outRows.map((row) => (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-neutral-800">{row.label}</span>
                      <span className="tnum font-mono text-sm text-neutral-900">
                        {formatMoney(row.value)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={row.value} max={outMax} tone="out" />
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500">{row.note}</p>
                  </div>
                ))}
              </div>

              {byCategory.length > 0 && (
                <div className="mt-5 border-t border-neutral-100 pt-4">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    Expenses by category
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {byCategory.map((row) => (
                      <li key={row.category} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-neutral-700">{EXPENSE_CATEGORIES[row.category]}</span>
                        <span className="tnum font-mono text-neutral-900">
                          {formatMoney(row.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Last six months
              </h2>
              <div className="mt-4 flex flex-col gap-3.5">
                {trend.map((row) => (
                  <button
                    key={row.month}
                    type="button"
                    onClick={() => setMonth(row.month)}
                    className={`rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-50 ${
                      row.month === month ? "bg-neutral-50" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-neutral-700">{formatMonth(row.month)}</span>
                      <span
                        className={`tnum font-mono text-xs ${
                          row.net < 0 ? "text-red-600" : "text-neutral-500"
                        }`}
                      >
                        {row.net < 0 ? "−" : "+"}
                        {formatCompactMoney(Math.abs(row.net))}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      <Bar value={row.received} max={trendMax} tone="in" />
                      <Bar value={row.outgoings} max={trendMax} tone="out" />
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-4 text-[11px] text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-neutral-900" /> received
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-neutral-300" /> money out
                </span>
              </p>
            </section>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
              What each show earned — {formatMonth(month)}
            </h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/70">
                      {["Show", "Show amount", "Received", "Commission", "Linked expenses", "Margin"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {margins.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                          No shows scheduled in {formatMonth(month)}.
                        </td>
                      </tr>
                    ) : (
                      margins.map((row) => (
                        <tr key={row.show.id} className="row-line hover:bg-neutral-50">
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-neutral-900">{row.show.location}</div>
                            <div className="text-xs text-neutral-500">
                              {row.show.client || "—"} · {formatDate(row.show.showDate)}
                            </div>
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm">
                            {formatMoney(row.show.showAmount)}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                            {formatMoney(row.received)}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                            {row.commission > 0 ? formatMoney(row.commission) : "—"}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                            {row.expenses > 0 ? formatMoney(row.expenses) : "—"}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm font-semibold text-neutral-900">
                            {formatMoney(row.margin)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Expenses — {formatMonth(month)}
              </h2>
              <span className="text-xs text-neutral-500">{formatMoney(summary.expenses)} total</span>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/70">
                      {["Date", "Category", "Description", "Paid to", "Against", "Receipt", "Amount", ""].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-500">
                          Nothing recorded for {formatMonth(month)}.
                          {canEdit && " Use Add expense above."}
                        </td>
                      </tr>
                    ) : (
                      monthExpenses.map((expense) => {
                        const show = shows.find((s) => s.id === expense.showId);
                        return (
                          <tr key={expense.id} className="row-line hover:bg-neutral-50">
                            <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-sm text-neutral-600">
                              {formatDate(expense.date)}
                            </td>
                            <td className="px-3 py-2.5 text-sm">
                              {EXPENSE_CATEGORIES[expense.category]}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-neutral-600">
                              {expense.description || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-sm font-medium text-neutral-800">
                              {expense.paidTo || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-neutral-500">
                              {show ? `${show.location} · ${formatDate(show.showDate)}` : "General"}
                            </td>
                            <td className="px-3 py-2.5 text-xs">
                              {expense.receiptUrl ? (
                                <a
                                  href={expense.receiptUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                                >
                                  📄 Document
                                </a>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="tnum px-3 py-2.5 font-mono text-sm font-medium">
                              {formatMoney(expense.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setDialog({ open: true, expense })}
                                  className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Salary run — {formatMonth(month)}
            </h2>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/70">
                      {["Member", "Monthly salary", "Unpaid days", "Deduction", "Payable"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.filter((m) => m.status === "active").length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                          No active team members.
                        </td>
                      </tr>
                    ) : (
                      members
                        .filter((m) => m.status === "active")
                        .map((member) => {
                          const pay = payableThisMonth(member, requests, month);
                          return (
                            <tr key={member.id} className="row-line hover:bg-neutral-50">
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-neutral-900">{member.name}</div>
                                <div className="text-xs text-neutral-500">{member.role}</div>
                              </td>
                              <td className="tnum px-3 py-2.5 font-mono text-sm">
                                {formatMoney(member.monthlySalary)}
                              </td>
                              <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                                {pay.unpaidDays || "—"}
                              </td>
                              <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                                {pay.deduction > 0 ? `−${formatMoney(pay.deduction)}` : "—"}
                              </td>
                              <td className="tnum px-3 py-2.5 font-mono text-sm font-semibold text-neutral-900">
                                {formatMoney(pay.payable)}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="tnum border-t border-neutral-100 bg-neutral-50/70 px-3 py-2 text-right font-mono text-xs text-neutral-600">
                Payable this month:{" "}
                <span className="font-semibold text-neutral-900">{formatMoney(salary.payable)}</span>
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="pt-3 text-xs text-neutral-500">
        Received is cash logged against payments · Salary follows unpaid leave · Amounts in INR
      </footer>

      {dialog.open && (
        <ExpenseDialog
          key={dialog.expense?.id ?? "new"}
          expense={dialog.expense}
          shows={shows}
          team={members}
          onSave={(draft, id) => {
            upsertExpense(draft, id);
            setDialog({ open: false, expense: null });
          }}
          onDelete={handleDelete}
          onClose={() => setDialog({ open: false, expense: null })}
        />
      )}
    </div>
  );
}
