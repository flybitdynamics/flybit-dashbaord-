/** Purchase orders, in the shape of the one the company already sends.
 *
 *  Modelled on PO FBD/PO/26-27/001 (the GNSS receiver order): a letterhead
 *  page with the parties, the item table, the totals and tax, the order
 *  details and the sign-off, then a second page of terms and conditions.
 *  Every printed value is editable on the page; item rows, tax rows, order
 *  details and terms can all be added to and taken away. */

import { formatDate, todayISO } from "./types";
import { financialYear, wordsForAmount } from "./invoices";

export type PurchaseOrderStatus = "draft" | "issued" | "received" | "cancelled";

export const PURCHASE_ORDER_STATUSES: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  received: "Received",
  cancelled: "Cancelled",
};

export interface PurchaseOrderRow {
  id: string;
  description: string;
  hsn: string;
  /** Printed as typed: "NA", "18%". */
  gst: string;
  qty: string;
  unit: string;
  rate: string;
  /** Used only when qty × rate cannot be worked out — e.g. a Freight line. */
  amount: string;
}

export interface PurchaseOrderTax {
  id: string;
  label: string;
  /** A percentage of the subtotal, or "NA". */
  rate: string;
}

export interface PurchaseOrderDetail {
  id: string;
  label: string;
  value: string;
}

export interface PurchaseOrderTerm {
  id: string;
  title: string;
  body: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  /** ISO when it is a date; any other wording is kept as typed. */
  date: string;
  vendorName: string;
  vendorAddress: string;
  vendorGstin: string;
  vendorContact: string;
  vendorPhoneEmail: string;
  /** The Bill to / Ship to block, line by line. */
  shipTo: string;
  greeting: string;
  intro: string;
  /** "USD", "INR"… drives the symbol in the headings and totals. */
  currency: string;
  rows: PurchaseOrderRow[];
  taxes: PurchaseOrderTax[];
  /** Blank means "work it out from the total". */
  amountWords: string;
  details: PurchaseOrderDetail[];
  forCompany: string;
  signerName: string;
  signerRole: string;
  termsTitle: string;
  termsSubtitle: string;
  terms: PurchaseOrderTerm[];
  termsNote: string;
  createdAt: string;
  updatedAt?: string;
}

export type PurchaseOrderDraft = Omit<PurchaseOrder, "id">;

/* ---------------- numbering ---------------- */

/** "FBD/PO/26-27/" — everything before the serial. */
export function poPrefix(iso: string = todayISO()): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : todayISO();
  return `FBD/PO/${financialYear(date)}/`;
}

/** Next in this financial year's series: 001 → 002 → 003, counted from the
 *  POs saved here. Restarts each April, as the invoice series does. */
export function nextPurchaseOrderNumber(orders: Pick<PurchaseOrder, "number">[], iso: string = todayISO()): string {
  const prefix = poPrefix(iso);
  const highest = orders.reduce((max, order) => {
    if (!order.number.startsWith(prefix)) return max;
    const serial = order.number.slice(prefix.length).match(/^(\d+)/);
    return serial ? Math.max(max, Number(serial[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

/* ---------------- money ---------------- */

const SYMBOLS: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£", AED: "AED", CNY: "¥", JPY: "¥", HKD: "HK$" };

export function currencySymbol(code: string): string {
  const key = code.trim().toUpperCase();
  return SYMBOLS[key] ?? key;
}

export function parseNumber(text: string): number | null {
  const cleaned = String(text ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Plain figures, as on the sample: 5400, 5592, 12.5. */
export function money(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/** qty × rate when both are numbers; otherwise whatever amount was typed. */
export function rowAmount(row: PurchaseOrderRow): number | null {
  const qty = parseNumber(row.qty);
  const rate = parseNumber(row.rate);
  if (qty !== null && rate !== null) return qty * rate;
  return parseNumber(row.amount);
}

export function rowIsComputed(row: PurchaseOrderRow): boolean {
  return parseNumber(row.qty) !== null && parseNumber(row.rate) !== null;
}

export interface PurchaseOrderTotals {
  subtotal: number;
  taxes: Array<{ id: string; amount: number | null }>;
  grandTotal: number;
}

export function totalsFor(order: Pick<PurchaseOrder, "rows" | "taxes">): PurchaseOrderTotals {
  const subtotal = order.rows.reduce((sum, row) => sum + (rowAmount(row) ?? 0), 0);
  const taxes = order.taxes.map((tax) => {
    const rate = parseNumber(tax.rate);
    return { id: tax.id, amount: rate === null ? null : (subtotal * rate) / 100 };
  });
  const grandTotal = subtotal + taxes.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  return { subtotal, taxes, grandTotal };
}

/* ---------------- amount in words ---------------- */

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
  if (n % 100) parts.push(underHundred(n % 100));
  return parts.join(" ");
}

/** International grouping, as the sample reads: "Five thousand Five hundred
 *  ninety-two". */
function internationalWords(whole: number): string {
  if (whole === 0) return "Zero";
  const scales: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of scales) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(`${underThousand(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(underThousand(rest));
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/** "USD Five thousand Five hundred ninety-two Only". Rupees use lakh and
 *  crore, as the invoices do. */
export function amountInWords(value: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "USD";
  const amount = Math.abs(value || 0);
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const words = code === "INR" ? wordsForAmount(whole) : internationalWords(whole);
  const fraction = cents
    ? ` and ${underHundred(cents)} ${code === "INR" ? "paise" : "cents"}`
    : "";
  return `${words}${fraction} Only`;
}

/* ---------------- templates ---------------- */

export function emptyRow(id: string): PurchaseOrderRow {
  return { id, description: "", hsn: "", gst: "", qty: "", unit: "", rate: "", amount: "" };
}

const DEFAULT_SHIP_TO = [
  "Flybit Dynamics Private Limited",
  "511, Satyamev Eminence, Sola, Science City Road",
  "Ahmedabad, Gujarat 380060, India",
  "GSTIN: 24AAGCF1802L1ZU",
  "Contact Person: Vivek Patel",
  "Phone / Email: +91 9227428262",
].join("\n");

export const DEFAULT_TERMS: Array<Omit<PurchaseOrderTerm, "id">> = [
  {
    title: "Purchase Order Reference",
    body: "The Supplier shall mention the Purchase Order number on all invoices, delivery challans, correspondence and documents related to this order.",
  },
  {
    title: "Scope and Specifications",
    body: "Goods and/or services supplied must conform to the description, quantity, specifications, quality standards and other requirements stated in this Purchase Order and mutually agreed in writing.",
  },
  {
    title: "Price and Taxes",
    body: "Prices shall be as stated in this Purchase Order. Applicable GST and other statutory taxes shall be charged in accordance with prevailing law and the agreed tax treatment.",
  },
  {
    title: "Delivery and Schedule",
    body: "The Supplier shall meet the delivery date, service schedule and delivery location stated in this Purchase Order. Any anticipated delay must be communicated to Flybit Dynamics Private Limited promptly.",
  },
  {
    title: "Changes to Order",
    body: "Any change to price, scope, quantity, specifications or delivery schedule must be approved in writing by an authorized representative of Flybit Dynamics Private Limited.",
  },
  {
    title: "Inspection and Acceptance",
    body: "Goods or services may be inspected by Flybit Dynamics Private Limited. Any supply that does not meet agreed requirements may be rejected or required to be corrected or replaced, as applicable.",
  },
  {
    title: "Invoicing and Payment",
    body: "The Supplier shall submit a valid tax invoice quoting this Purchase Order number and all required supporting documents. Payment shall be processed according to the payment terms on page 1, subject to receipt and acceptance of the supply and applicable documentation.",
  },
  {
    title: "Compliance",
    body: "The Supplier shall comply with all applicable laws, rules, regulations and statutory requirements relevant to the supply of goods or services under this Purchase Order.",
  },
  {
    title: "Confidentiality",
    body: "Non-public business, technical, project or commercial information shared in connection with this Purchase Order shall be treated as confidential and shall not be disclosed without prior written consent, except where required by law.",
  },
  {
    title: "Cancellation or Termination",
    body: "Any cancellation, suspension or termination of this Purchase Order shall be communicated in writing. The parties shall settle obligations for goods or services duly supplied and accepted up to the effective date, subject to applicable law and written agreement.",
  },
  {
    title: "Force Majeure",
    body: "Neither party shall be responsible for delay or failure caused by events beyond its reasonable control, provided the affected party promptly notifies the other party and takes reasonable steps to minimize the impact.",
  },
  {
    title: "Order Confirmation",
    body: "Commencement of supply or performance against this Purchase Order constitutes acceptance of the order and these terms, unless the parties agree otherwise in writing.",
  },
];

/** A new PO: the company's own side, the wording and the terms filled in;
 *  the vendor and the items left for you. */
export function emptyPurchaseOrder(number: string): PurchaseOrderDraft {
  return {
    number,
    status: "draft",
    date: todayISO(),
    vendorName: "",
    vendorAddress: "",
    vendorGstin: "",
    vendorContact: "",
    vendorPhoneEmail: "",
    shipTo: DEFAULT_SHIP_TO,
    greeting: "Dear Sir / Madam,",
    intro:
      "Please supply the goods and/or services listed below in accordance with this Purchase Order and the agreed specifications, schedule and terms.",
    currency: "USD",
    rows: [emptyRow("row-1")],
    taxes: [
      { id: "tax-1", label: "CGST", rate: "NA" },
      { id: "tax-2", label: "SGST", rate: "NA" },
      { id: "tax-3", label: "IGST", rate: "NA" },
    ],
    amountWords: "",
    details: [
      { id: "d-1", label: "Currency", value: "USD" },
      { id: "d-2", label: "Delivery / Service Location", value: "Ahmedabad, Gujarat, India" },
      { id: "d-3", label: "Other Instructions", value: "NA" },
    ],
    forCompany: "For FLYBIT DYNAMICS PRIVATE LIMITED",
    signerName: "Vivekkumar Patel",
    signerRole: "Director",
    termsTitle: "TERMS & CONDITIONS",
    termsSubtitle: "FLYBIT DYNAMICS PRIVATE LIMITED  |  PURCHASE ORDER",
    terms: DEFAULT_TERMS.map((t, i) => ({ ...t, id: `t-${i + 1}` })),
    termsNote:
      "Project-specific conditions or deviations must be recorded in the Purchase Order or separately agreed in writing by both parties.",
    createdAt: new Date().toISOString(),
  };
}

/** PO 001 exactly as it went out, so it can sit in the list with the rest. */
export function samplePurchaseOrder(): PurchaseOrderDraft {
  return {
    ...emptyPurchaseOrder("FBD/PO/26-27/001"),
    status: "issued",
    date: "2026-11-12",
    vendorName: "Hong Kong Data Source Limited, DATAGNSS",
    vendorAddress: "Unit 3, 9/F, One Midtown, 11 Hoi Shing Road, Tauren Wan, N.T.,Hong Kong",
    vendorGstin: "NA",
    vendorContact: "info@datasource.ltd",
    vendorPhoneEmail: "+8523795 5700",
    rows: [
      { ...emptyRow("row-1"), description: "GNSS Receiver, NANO Helix RTK w/o antenna", hsn: "8526 91 90", gst: "NA", qty: "120", rate: "45" },
      { ...emptyRow("row-2"), description: "Freight", amount: "192" },
    ],
  };
}

/** Read a stored PO whatever version wrote it. */
export function normalizePurchaseOrder(id: string, raw: Record<string, unknown>): PurchaseOrder {
  const base = emptyPurchaseOrder("");
  const merged = { ...base, ...raw } as PurchaseOrder;
  const list = <T extends { id: string }>(value: unknown, fallback: T[], blank: (id: string) => T): T[] =>
    Array.isArray(value)
      ? (value as T[]).map((item, i) => ({ ...blank(`${i + 1}`), ...item, id: item?.id || `item-${i + 1}` }))
      : fallback;
  return {
    ...merged,
    id,
    rows: list(raw.rows, base.rows, emptyRow),
    taxes: list(raw.taxes, base.taxes, (i) => ({ id: i, label: "", rate: "" })),
    details: list(raw.details, base.details, (i) => ({ id: i, label: "", value: "" })),
    terms: list(raw.terms, base.terms, (i) => ({ id: i, title: "", body: "" })),
  };
}

/** A copy to work from: same vendor and items, its own number and today. */
export function duplicateOfPurchaseOrder(source: PurchaseOrderDraft, number: string): PurchaseOrderDraft {
  const stamp = Date.now();
  return {
    ...source,
    number,
    status: "draft",
    date: todayISO(),
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
    rows: source.rows.map((row, i) => ({ ...row, id: `row-${stamp}-${i}` })),
  };
}

/** "2026-11-12" → "12-Nov-2026", as printed on the sample. */
export function poDate(value: string): string {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const formatted = formatDate(raw);
  if (formatted === "—") return raw;
  const [day, month, year] = formatted.split(" ");
  return `${day.padStart(2, "0")}-${month.charAt(0).toUpperCase()}${month.slice(1, 3).toLowerCase()}-${year}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "12-Nov-2026", "12 Nov 2026", "12/11/2026" → ISO. Anything else: null. */
export function readPoDate(text: string): string | null {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const named = value.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,})[\s/-]+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    return month < 0 ? null : `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  const numeric = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (numeric && Number(numeric[2]) >= 1 && Number(numeric[2]) <= 12) {
    return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }
  return null;
}

/** "01 Flybit_Dynamics_Purchase_Order_GNSS Receiver" — the sample's own
 *  file name, with the serial and the first item. */
export function purchaseOrderFileName(order: Pick<PurchaseOrder, "number" | "rows">): string {
  const serial = order.number.match(/(\d+)\s*$/)?.[1] ?? "";
  const first = order.rows.find((r) => r.description.trim())?.description.split(",")[0].trim() ?? "";
  const name = `${serial.slice(-2).padStart(2, "0")} Flybit_Dynamics_Purchase_Order${first ? `_${first}` : ""}`;
  return name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
