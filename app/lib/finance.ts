import { Invoice, totalsFor } from "./invoices";
import { Payment, Show, isBooked, todayISO } from "./types";
import { LeaveRequest, TeamMember, payableThisMonth } from "./team";

export type ExpenseCategory =
  | "travel"
  | "equipment"
  | "permits"
  | "logistics"
  | "marketing"
  | "other";

/** Money out that is not salary or commission — those two are worked out
 *  from the team and the shows, so recording them here would double count. */
export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  /** Optional link to a show; blank means general overhead. */
  showId: string;
  /** Employee / Team member or recipient the money was paid to. */
  paidTo?: string;
  /** Attachment document or receipt image URL (stored in R2). */
  receiptUrl?: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  travel: "Travel",
  equipment: "Equipment",
  permits: "Permits & fees",
  logistics: "Logistics",
  marketing: "Marketing",
  other: "Other",
};

export function emptyExpense(): Omit<Expense, "id"> {
  return {
    date: todayISO(),
    category: "travel",
    amount: 0,
    description: "",
    showId: "",
    paidTo: "",
    receiptUrl: "",
  };
}

const inMonth = (iso: string, month: string) => iso?.startsWith(month);

/* ---------------- money in ---------------- */

/** Cash actually collected in the month, from the payment log. */
export function receivedInMonth(payments: Payment[], month: string): number {
  return payments
    .filter((p) => inMonth(p.date, month))
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

/** Value of shows scheduled in the month, whether or not it is collected. */
export function bookedInMonth(shows: Show[], month: string): number {
  return shows
    .filter((s) => isBooked(s) && inMonth(s.showDate, month))
    .reduce((sum, s) => sum + (s.showAmount || 0), 0);
}

/* ---------------- money out ---------------- */

export function commissionInMonth(shows: Show[], month: string): number {
  return shows
    .filter((s) => isBooked(s) && inMonth(s.showDate, month))
    .reduce((sum, s) => sum + (s.commission || 0), 0);
}

export function salariesInMonth(
  members: TeamMember[],
  requests: LeaveRequest[],
  month: string,
): { gross: number; deduction: number; payable: number } {
  return members
    // Nobody is paid for a month before they joined.
    .filter((m) => m.status === "active" && m.joiningDate.slice(0, 7) <= month)
    .reduce(
      (acc, m) => {
        const pay = payableThisMonth(m, requests, month);
        return {
          gross: acc.gross + m.monthlySalary,
          deduction: acc.deduction + pay.deduction,
          payable: acc.payable + pay.payable,
        };
      },
      { gross: 0, deduction: 0, payable: 0 },
    );
}

export function expensesInMonth(expenses: Expense[], month: string): number {
  return expenses
    .filter((e) => inMonth(e.date, month))
    .reduce((sum, e) => sum + (e.amount || 0), 0);
}

export function expensesByCategory(
  expenses: Expense[],
  month: string,
): { category: ExpenseCategory; amount: number }[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!inMonth(expense.date, month)) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + (expense.amount || 0));
  }
  return (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[])
    .map((category) => ({ category, amount: totals.get(category) ?? 0 }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/* ---------------- invoices and GST ---------------- */

/** Tax and billing for one month, taken from invoices dated in that month.
 *  Cancelled invoices are left out. Drafts stay in, so an unsent bill is
 *  still visible before it goes to the client. */
export interface GstMonth {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  invoiced: number;
  paidOnInvoice: number;
  outstanding: number;
  count: number;
}

export function gstForMonth(invoices: Invoice[], month: string): GstMonth {
  const empty: GstMonth = {
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    tax: 0,
    invoiced: 0,
    paidOnInvoice: 0,
    outstanding: 0,
    count: 0,
  };

  return invoices
    .filter((invoice) => invoice.status !== "cancelled" && inMonth(invoice.invoiceDate, month))
    .reduce((acc, invoice) => {
      const totals = totalsFor(invoice);
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      for (const group of totals.groups) {
        if (group.label.startsWith("CGST")) cgst += group.amount;
        else if (group.label.startsWith("SGST")) sgst += group.amount;
        else if (group.label.startsWith("IGST")) igst += group.amount;
      }
      return {
        taxable: acc.taxable + totals.subTotal,
        cgst: acc.cgst + cgst,
        sgst: acc.sgst + sgst,
        igst: acc.igst + igst,
        tax: acc.tax + totals.taxTotal,
        invoiced: acc.invoiced + totals.total,
        paidOnInvoice: acc.paidOnInvoice + Math.min(invoice.paymentMade || 0, totals.total),
        outstanding: acc.outstanding + Math.max(0, totals.balance),
        count: acc.count + 1,
      };
    }, empty);
}

/* ---------------- the month as a whole ---------------- */

export interface MonthSummary {
  month: string;
  received: number;
  booked: number;
  salaries: number;
  salaryDeduction: number;
  commission: number;
  expenses: number;
  outgoings: number;
  net: number;
}

export function summariseMonth(
  month: string,
  shows: Show[],
  payments: Payment[],
  expenses: Expense[],
  members: TeamMember[],
  requests: LeaveRequest[],
): MonthSummary {
  const received = receivedInMonth(payments, month);
  const booked = bookedInMonth(shows, month);
  const salary = salariesInMonth(members, requests, month);
  const commission = commissionInMonth(shows, month);
  const spend = expensesInMonth(expenses, month);
  const outgoings = salary.payable + commission + spend;

  return {
    month,
    received,
    booked,
    salaries: salary.payable,
    salaryDeduction: salary.deduction,
    commission,
    expenses: spend,
    outgoings,
    net: received - outgoings,
  };
}

/** What one show earned once its commission and linked costs come out. */
export interface ShowMargin {
  show: Show;
  received: number;
  commission: number;
  expenses: number;
  margin: number;
}

export function showMargin(show: Show, payments: Payment[], expenses: Expense[]): ShowMargin {
  const received = payments
    .filter((p) => p.showId === show.id)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const linked = expenses
    .filter((e) => e.showId === show.id)
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  return {
    show,
    received,
    commission: show.commission || 0,
    expenses: linked,
    margin: (show.showAmount || 0) - (show.commission || 0) - linked,
  };
}
