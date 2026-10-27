import { Client, PaymentMode, Settings, Show, todayISO } from "./types";
import { Invoice, totalsFor, wordsForAmount } from "./invoices";

export type ReceiptPaymentMode = "cash" | "upi" | "bank" | "cheque" | "other";

export const RECEIPT_PAYMENT_MODES: Record<ReceiptPaymentMode, string> = {
  cash: "Cash",
  upi: "UPI / Online",
  bank: "Bank Transfer / NEFT / IMPS",
  cheque: "Cheque / DD",
  other: "Other",
};

export interface Receipt {
  id: string;
  /** Receipt serial number, e.g. "REC-2026-001" */
  number: string;
  /** ISO date "2026-10-15" */
  receiptDate: string;
  /** Optional link to Invoice */
  invoiceId: string;
  /** Invoice Number, e.g. "INV-000002" */
  invoiceNumber: string;
  /** Optional link to Show / Booking */
  showId: string;
  /** Optional link to Client */
  clientId: string;
  /** Client or organization name: "Cash Received From" */
  receivedFrom: string;
  /** Client address if known */
  clientAddress: string;
  /** Client GSTIN if known */
  clientGstin: string;
  /** Client phone */
  clientPhone: string;
  /** What the payment was for: "For" */
  forReason: string;
  /** Total Amount Due */
  totalAmountDue: number;
  /** Amount Received in this receipt */
  amountReceived: number;
  /** Balance Due remaining */
  balanceDue: number;
  /** Mode of payment */
  paymentMode: ReceiptPaymentMode;
  /** Cheque / Transaction / UTR / Reference number */
  referenceNumber: string;
  /** Notes / remarks */
  notes: string;
  /** Title on document: "Cash Receipt" or "Payment Receipt" */
  title: string;
  /** Print digital signature and stamp from settings */
  signature: boolean;
  /** Print computer-generated fineprint footer */
  fineprint: boolean;
  createdAt: string;
}

export function receiptDate(iso: string): string {
  const bits = iso?.split("-");
  if (!bits || bits.length !== 3) return "";
  return `${bits[2]}/${bits[1]}/${bits[0]}`;
}

/** "Indian Rupee One Lakh Fifty Thousand Only" */
export function receiptAmountInWords(value: number): string {
  const amount = Math.abs(value || 0);
  const paise = Math.round((amount - Math.floor(amount)) * 100);
  const rupees = `Indian Rupee ${wordsForAmount(amount)}`;
  return paise > 0 ? `${rupees} and ${paise}/100 Only` : `${rupees} Only`;
}

/** "REC-2026-001" */
export function nextReceiptNumber(existing: Receipt[]): string {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  let highest = 0;

  for (const r of existing) {
    if (r.number?.startsWith(prefix)) {
      const numPart = parseInt(r.number.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > highest) {
        highest = numPart;
      }
    } else if (r.number?.startsWith("REC-")) {
      const match = r.number.match(/\d+$/);
      if (match) {
        const numPart = parseInt(match[0], 10);
        if (!isNaN(numPart) && numPart > highest) {
          highest = numPart;
        }
      }
    }
  }

  const next = highest + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function emptyReceipt(suggestedNumber = "REC-2026-001"): Omit<Receipt, "id"> {
  return {
    number: suggestedNumber,
    receiptDate: todayISO(),
    invoiceId: "",
    invoiceNumber: "",
    showId: "",
    clientId: "",
    receivedFrom: "",
    clientAddress: "",
    clientGstin: "",
    clientPhone: "",
    forReason: "",
    totalAmountDue: 0,
    amountReceived: 0,
    balanceDue: 0,
    paymentMode: "bank",
    referenceNumber: "",
    notes: "",
    title: "Payment Receipt",
    signature: true,
    fineprint: true,
    createdAt: new Date().toISOString(),
  };
}

/** Computes the payment standing of an invoice based on all issued receipts */
export function invoiceReceiptSummary(
  invoice: Invoice,
  receipts: Receipt[],
  excludeReceiptId?: string | null,
) {
  const totals = totalsFor(invoice);
  const relevantReceipts = receipts.filter(
    (r) =>
      (r.invoiceId === invoice.id ||
        (Boolean(r.invoiceNumber) && r.invoiceNumber.trim() === invoice.number.trim())) &&
      (!excludeReceiptId || (r.id !== excludeReceiptId && r.number !== excludeReceiptId)),
  );
  const totalReceived = relevantReceipts.reduce((sum, r) => sum + (r.amountReceived || 0), 0);

  // When invoice balance is 0 or status is paid or receipts cover total, balance is 0
  const isZeroBalance =
    totals.balance <= 0 ||
    invoice.status === "paid" ||
    (totals.total > 0 && totalReceived >= totals.total);

  const remainingPending = isZeroBalance
    ? 0
    : Math.max(0, Math.min(totals.balance, totals.total - totalReceived));
  const isFullyMatched = isZeroBalance;

  return {
    invoiceTotal: totals.total,
    invoiceBalance: totals.balance,
    totalReceived,
    remainingPending,
    isFullyMatched,
    isZeroBalance,
    receiptCount: relevantReceipts.length,
    receipts: relevantReceipts,
  };
}

/** Creates a receipt pre-filled directly from an Invoice and optional received amount.
 *  If prior receipts already exist for this invoice, defaults to the remaining pending amount. */
export function receiptFromInvoice(
  invoice: Invoice,
  suggestedNumber = "REC-2026-001",
  amountPaid?: number,
  mode: ReceiptPaymentMode = "bank",
  show?: Show | null,
  allReceipts: Receipt[] = [],
  excludeReceiptId?: string | null,
): Omit<Receipt, "id"> {
  const summary = invoiceReceiptSummary(invoice, allReceipts, excludeReceiptId);
  const totals = totalsFor(invoice);

  // Default to remaining pending balance if previous receipts exist, otherwise the full total
  const defaultAmount =
    amountPaid !== undefined && amountPaid > 0
      ? amountPaid
      : summary.receiptCount > 0
        ? summary.remainingPending
        : totals.total;


  const received = Math.max(0, defaultAmount);
  // Remaining balance after this receipt is issued
  const balance = Math.max(0, totals.total - (summary.totalReceived + received));

  const installmentLabel =
    summary.receiptCount > 0 ? ` (Part Payment #${summary.receiptCount + 1})` : "";

  const showDescription = show
    ? `Drone Light Show (${show.droneCount} drones) at ${show.location || show.state || "Venue"}${show.showDate ? ` on ${receiptDate(show.showDate)}` : ""}`
    : invoice.subject || (invoice.lines[0]?.description ?? "Drone Show Services");

  return {
    number: suggestedNumber,
    receiptDate: todayISO(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    showId: invoice.showId || (show?.id ?? ""),
    clientId: invoice.clientId || "",
    receivedFrom: invoice.billTo.name || "",
    clientAddress: invoice.billTo.address || "",
    clientGstin: invoice.billTo.gstin || "",
    clientPhone: "",
    forReason: showDescription,
    totalAmountDue: totals.total,
    amountReceived: received,
    balanceDue: balance,
    paymentMode: mode,
    referenceNumber: "",
    notes: `Issued against Tax Invoice ${invoice.number}${installmentLabel}`,
    title: mode === "cash" ? "Cash Receipt" : "Payment Receipt",
    signature: true,
    fineprint: true,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeReceipt(id: string, raw: any): Receipt {
  const r = raw || {};
  const total = Number(r.totalAmountDue) || 0;
  const received = Number(r.amountReceived) || 0;
  const balance = r.balanceDue !== undefined ? Number(r.balanceDue) : Math.max(0, total - received);

  return {
    id,
    number: String(r.number || "REC-001"),
    receiptDate: String(r.receiptDate || todayISO()),
    invoiceId: String(r.invoiceId || ""),
    invoiceNumber: String(r.invoiceNumber || ""),
    showId: String(r.showId || ""),
    clientId: String(r.clientId || ""),
    receivedFrom: String(r.receivedFrom || ""),
    clientAddress: String(r.clientAddress || ""),
    clientGstin: String(r.clientGstin || ""),
    clientPhone: String(r.clientPhone || ""),
    forReason: String(r.forReason || ""),
    totalAmountDue: total,
    amountReceived: received,
    balanceDue: balance,
    paymentMode: (["cash", "upi", "bank", "cheque", "other"].includes(r.paymentMode)
      ? r.paymentMode
      : "bank") as ReceiptPaymentMode,
    referenceNumber: String(r.referenceNumber || ""),
    notes: String(r.notes || ""),
    title: String(r.title || (r.paymentMode === "cash" ? "Cash Receipt" : "Payment Receipt")),
    signature: r.signature !== false,
    fineprint: r.fineprint !== false,
    createdAt: String(r.createdAt || new Date().toISOString()),
  };
}
