/** Tax invoices, in the exact shape the printed sheet needs.
 *
 *  The layout in InvoiceSheet is measured off the company's existing
 *  invoice (INV-000002), so the fields here mirror that document: one
 *  place-of-supply line, a Bill To / Ship To pair, HSN-coded lines, and
 *  CGST + SGST split (or IGST when the client is in another state). */

import { Client, Settings, Show, todayISO } from "./types";

export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";

/** Within the same state the tax splits into CGST + SGST; across states it
 *  is a single IGST at the full rate. */
export type TaxMode = "intra" | "inter" | "none";

export const INVOICE_STATUSES: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const TAX_MODES: Record<TaxMode, string> = {
  intra: "CGST + SGST",
  inter: "IGST",
  none: "No tax",
};

export interface InvoiceParty {
  name: string;
  /** Free text, printed line for line under the name. */
  address: string;
  gstin: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  /** Service accounting code — 998387 for the drone shows. */
  hsn: string;
  quantity: number;
  rate: number;
  /** Full GST rate for the line; halved on the sheet when it splits. */
  taxRate: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  /** "Gujarat (24)" — the state name with its GST code. */
  placeOfSupply: string;
  taxMode: TaxMode;
  /** Optional link back to the booking this bills for. */
  showId: string;
  clientId: string;
  billTo: InvoiceParty;
  subject: string;
  lines: InvoiceLine[];
  paymentMade: number;
  notes: string;
  /** Prints the company stamp and signature over the signature line. */
  signature: boolean;
  /** Prints the computer-generated note under the frame. */
  fineprint: boolean;
  createdAt: string;
}

/** GST state codes — the number printed after the place of supply. */
export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04",
  "Uttarakhand": "05", "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09",
  "Bihar": "10", "Sikkim": "11", "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14",
  "Mizoram": "15", "Tripura": "16", "Meghalaya": "17", "Assam": "18", "West Bengal": "19",
  "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23", "Gujarat": "24",
  "Dadra and Nagar Haveli and Daman and Diu": "26", "Maharashtra": "27", "Karnataka": "29",
  "Goa": "30", "Lakshadweep": "31", "Kerala": "32", "Tamil Nadu": "33", "Puducherry": "34",
  "Andaman and Nicobar Islands": "35", "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38",
};

/** "Gujarat (24)" */
export function placeOfSupplyLabel(state: string): string {
  const name = state.trim();
  if (!name) return "";
  const code = STATE_CODES[name];
  return code ? `${name} (${code})` : name;
}

/** The state name out of "Gujarat (24)". */
export function stateOfPlace(place: string): string {
  return place.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/** The company's own state decides whether a sale splits into CGST + SGST. */
export const HOME_STATE = "Gujarat";

export function taxModeFor(place: string): TaxMode {
  const state = stateOfPlace(place);
  if (!state) return "intra";
  return state.toLowerCase() === HOME_STATE.toLowerCase() ? "intra" : "inter";
}

export const DEFAULT_HSN = "998387";
export const DEFAULT_TAX_RATE = 18;

export function emptyLine(id: string): InvoiceLine {
  return {
    id,
    description: "Drone Light Show Services",
    hsn: DEFAULT_HSN,
    quantity: 1,
    rate: 0,
    taxRate: DEFAULT_TAX_RATE,
  };
}

export function emptyInvoice(number: string, lineId: string): Omit<Invoice, "id"> {
  return {
    number,
    status: "draft",
    invoiceDate: todayISO(),
    dueDate: todayISO(),
    terms: "Custom",
    placeOfSupply: placeOfSupplyLabel(HOME_STATE),
    taxMode: "intra",
    showId: "",
    clientId: "",
    billTo: { name: "", address: "", gstin: "" },
    subject: "",
    lines: [emptyLine(lineId)],
    paymentMade: 0,
    notes: "Thanks for your business.",
    signature: true,
    fineprint: true,
    createdAt: new Date().toISOString(),
  };
}

/** Read a stored invoice whatever version wrote it. */
export function normalizeInvoice(id: string, raw: Record<string, unknown>): Invoice {
  const base = emptyInvoice("", "line-1");
  const merged = { ...base, ...raw } as Invoice;
  const party = (value: unknown): InvoiceParty => {
    const p = (value ?? {}) as Partial<InvoiceParty>;
    return { name: String(p.name ?? ""), address: String(p.address ?? ""), gstin: String(p.gstin ?? "") };
  };
  /* Older rows carry a Ship To block; the format no longer prints one. */
  delete (merged as Partial<Invoice> & { shipTo?: unknown }).shipTo;
  delete (merged as Partial<Invoice> & { sameAsBilling?: unknown }).sameAsBilling;

  return {
    ...merged,
    id,
    billTo: party(raw.billTo),
    lines: Array.isArray(raw.lines) && raw.lines.length > 0
      ? (raw.lines as InvoiceLine[]).map((line, index) => ({
          ...emptyLine(line?.id || `line-${index + 1}`),
          ...line,
        }))
      : [emptyLine("line-1")],
  };
}

/** The address block as the sheet prints it: name on top, then the address
 *  lines, then the GSTIN. */
export function partyFromClient(client: Client): InvoiceParty {
  const lines = [
    client.address,
    [client.city, client.state].filter(Boolean).join(" "),
    "India",
  ].filter((line) => line && line.trim());
  return {
    name: client.name,
    address: lines.join("\n"),
    gstin: client.gstin,
  };
}

/** The company's invoice series. */
export const NUMBER_PREFIX = "FBD";

/** India's financial year runs April to March, so a March and an April
 *  invoice belong to different books: "26-27". */
export function financialYear(iso: string): string {
  const [year, month] = (iso || todayISO()).split("-").map(Number);
  const starts = month >= 4 ? year : year - 1;
  const short = (value: number) => String(value % 100).padStart(2, "0");
  return `${short(starts)}-${short(starts + 1)}`;
}

/** "FBD/26-27/" — everything before the serial. */
export function numberPrefix(iso: string): string {
  return `${NUMBER_PREFIX}/${financialYear(iso)}/`;
}

/** Next in this year's series: FBD/26-27/0001 → FBD/26-27/0002. The count
 *  restarts each financial year, and numbers from another year are left
 *  out of the reckoning. */
export function nextInvoiceNumber(invoices: Invoice[], iso: string = todayISO()): string {
  const prefix = numberPrefix(iso);
  const highest = invoices.reduce((max, invoice) => {
    if (!invoice.number.startsWith(prefix)) return max;
    const serial = invoice.number.slice(prefix.length).match(/^(\d+)/);
    return serial ? Math.max(max, Number(serial[1])) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

/** A copy to work from: same client and items, its own number, today's
 *  dates, and nothing paid against it yet. */
export function duplicateOf(source: Omit<Invoice, "id">, number: string): Omit<Invoice, "id"> {
  return {
    ...source,
    number,
    status: "draft",
    invoiceDate: todayISO(),
    dueDate: todayISO(),
    paymentMade: 0,
    createdAt: new Date().toISOString(),
    lines: source.lines.map((line, index) => ({ ...line, id: `line-${index + 1}` })),
  };
}

/* ---------------- totals ---------------- */

export interface LineTotals {
  line: InvoiceLine;
  amount: number;
  /** Half the line's rate under CGST + SGST, the whole of it under IGST. */
  splitRate: number;
  splitAmount: number;
  tax: number;
}

export interface TaxGroup {
  /** "CGST9 (9%)" — the name Zoho prints, then the rate. */
  label: string;
  amount: number;
}

export interface InvoiceTotals {
  lines: LineTotals[];
  subTotal: number;
  groups: TaxGroup[];
  taxTotal: number;
  total: number;
  balance: number;
}

/** Rupees on the sheet are whole numbers — no paise. */
const rupee = (value: number) => Math.round(value || 0);

export function totalsFor(invoice: Invoice): InvoiceTotals {
  const split = invoice.taxMode === "intra";
  const taxed = invoice.taxMode !== "none";

  const lines: LineTotals[] = invoice.lines.map((line) => {
    const amount = rupee((line.quantity || 0) * (line.rate || 0));
    const rate = taxed ? line.taxRate || 0 : 0;
    const splitRate = split ? rate / 2 : rate;
    return {
      line,
      amount,
      splitRate,
      splitAmount: rupee((amount * splitRate) / 100),
      tax: rupee((amount * rate) / 100),
    };
  });

  const subTotal = rupee(lines.reduce((sum, row) => sum + row.amount, 0));

  /* One row per rate, so two lines at 18% print as a single CGST9 line. */
  const byRate = new Map<number, number>();
  for (const row of lines) {
    if (!row.splitRate) continue;
    byRate.set(row.splitRate, rupee((byRate.get(row.splitRate) ?? 0) + row.splitAmount));
  }

  const groups: TaxGroup[] = [];
  for (const [rate, amount] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const shown = Number.isInteger(rate) ? String(rate) : String(rate);
    if (split) {
      groups.push({ label: `CGST${shown} (${shown}%)`, amount });
      groups.push({ label: `SGST${shown} (${shown}%)`, amount });
    } else {
      groups.push({ label: `IGST${shown} (${shown}%)`, amount });
    }
  }

  const taxTotal = rupee(groups.reduce((sum, group) => sum + group.amount, 0));
  const total = rupee(subTotal + taxTotal);
  return {
    lines,
    subTotal,
    groups,
    taxTotal,
    total,
    balance: rupee(total - (invoice.paymentMade || 0)),
  };
}

/* ---------------- printing helpers ---------------- */

/** "5,00,000" — whole rupees, grouped the Indian way. The rupee sign
 *  only appears on the Total row. */
export function amountText(value: number): string {
  return rupee(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

/** "25/03/2026" */
export function invoiceDate(iso: string): string {
  const bits = iso?.split("-");
  if (!bits || bits.length !== 3) return "";
  return `${bits[2]}/${bits[1]}/${bits[0]}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(value: number): string {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(underHundred(rest));
  return parts.join(" ");
}

/** Indian grouping: crore, lakh, thousand, hundred. */
export function wordsForAmount(value: number): string {
  const whole = Math.floor(Math.abs(value || 0));
  if (whole === 0) return "Zero";

  const units: Array<[number, string]> = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1_000, "Thousand"],
  ];

  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(`${count >= 100 ? underThousand(count) : underHundred(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(underThousand(rest));
  return parts.join(" ");
}

/** "Indian Rupee Five Lakh Ninety Thousand Only" */
export function totalInWords(value: number): string {
  const amount = Math.abs(value || 0);
  const paise = Math.round((amount - Math.floor(amount)) * 100);
  const rupees = `Indian Rupee ${wordsForAmount(amount)}`;
  return paise > 0 ? `${rupees} and ${underHundred(paise)} Paise Only` : `${rupees} Only`;
}

/* ---------------- starting a new invoice ---------------- */

/** Bill the company address block the way the printed sheet wants it. */
export function companyParty(settings: Settings): InvoiceParty {
  return {
    name: settings.companyName,
    address: [settings.companyAddressLine1, settings.companyAddressLine2, "India"]
      .filter((line) => line && line.trim())
      .join("\n"),
    gstin: "",
  };
}

/** Pre-fill an invoice from a booking: its client, its money and a subject
 *  line naming the show. */
export function invoiceFromShow(
  draft: Omit<Invoice, "id">,
  show: Show,
  client: Client | null,
  lineId: string,
): Omit<Invoice, "id"> {
  const party = client ? partyFromClient(client) : { name: show.client, address: "", gstin: "" };
  const place = placeOfSupplyLabel(client?.state || show.state || HOME_STATE);
  const where = [show.area, show.location].filter(Boolean).join(", ");

  /* The show amount is the agreed fee before tax — GST is added on the
     sheet, exactly as on INV-000002 (5,00,000 + 18% = 5,90,000). */
  const rate = show.showAmount || 0;

  return {
    ...draft,
    showId: show.id,
    clientId: client?.id ?? "",
    billTo: party,
    placeOfSupply: place,
    taxMode: taxModeFor(place),
    subject: where ? `Drone Light Show Performance — ${where}` : "Drone Light Show Performance",
    invoiceDate: todayISO(),
    dueDate: todayISO(),
    lines: [{ ...emptyLine(lineId), rate }],
  };
}

/** "25/03/2026" back to "2026-03-25". Null when it is not a real date, so a
 *  half-typed value leaves the stored one alone. */
export function parseInvoiceDate(text: string): string | null {
  const bits = text.trim().match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})$/);
  if (!bits) return null;
  const [, d, m, y] = bits.map(Number) as unknown as [string, number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
