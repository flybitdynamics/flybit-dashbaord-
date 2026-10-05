/** Quotations, in the shape of the letter the company already sends.
 *
 *  Modelled on quotation #FD00069: a letterhead page with the priced table
 *  and the sign-off, then a second page carrying the payment terms, the
 *  benefits and the confidentiality note. Every printed value is editable
 *  on the page; the rows can be added to and taken away. */

import { Client, Show, formatDate, todayISO } from "./types";

export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export const QUOTATION_STATUSES: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export interface QuotationRow {
  id: string;
  /** Blank on a continuation row, as on #FD00069. */
  serial: string;
  /** Free text — several lines allowed. */
  description: string;
  /** Free text too: "₹ 4,50,000" on one row, a list of inclusions on the next. */
  price: string;
}

export interface Quotation {
  id: string;
  number: string;
  status: QuotationStatus;
  date: string;
  /** Who it is addressed to, printed under "To,". */
  to: string;
  subject: string;
  /** The third column's heading, which names the event. */
  priceHeading: string;
  rows: QuotationRow[];
  /** The two notes under the table. */
  taxNote: string;
  scopeNote: string;
  /** The sign-off. */
  closing: string;
  signerName: string;
  signerRole: string;
  signerPhone: string;
  signerCompany: string;
  /** Page two. */
  paymentTerms: string[];
  benefits: string[];
  confidential: string;
  /** Optional links back into the desk. */
  showId: string;
  clientId: string;
  createdAt: string;
}

export const QUOTATION_PREFIX = "FD";

/** Next in the series: FD00069 → FD00070. */
export function nextQuotationNumber(quotations: Quotation[]): string {
  const highest = quotations.reduce((max, quotation) => {
    const serial = quotation.number.replace(/^#?/, "").match(/(\d+)\s*$/);
    return serial ? Math.max(max, Number(serial[1])) : max;
  }, 0);
  return `${QUOTATION_PREFIX}${String(highest + 1).padStart(5, "0")}`;
}

export function emptyRow(id: string, serial = ""): QuotationRow {
  return { id, serial, description: "", price: "" };
}

/** The wording the company's own quotations use, so a new one starts as a
 *  letter rather than a blank page. */
export const DEFAULT_TAX_NOTE = "All above prices are excluding GST";
export const DEFAULT_SCOPE_NOTE =
  "The above price includes all creative and technical drone-related costs.";
export const DEFAULT_PAYMENT_TERMS = [
  "50% Advance while Drone Show Booking",
  "50% on a same day of event",
];
export const DEFAULT_BENEFITS = [
  "Vibrant visuals that cut through city light pollution—clear at 1km+ viewing distance.",
  "Our Drones offer Reliable 12 minute show window that keeps the sky yours long enough to tell the full story.",
  "Made-in-India drones with best-in-class technical team ensuring faster support and no redundancy.",
  "Super-precise formations and silky-smooth movements that stay sharp on phones and broadcast cameras.",
  "Built-in automatic safety technology, preventing failures in even tough conditions.",
];
export const DEFAULT_CONFIDENTIAL =
  "(Confidential – For recipient use only. Property of Flybit Dynamics. This quotation is non-binding and is provided for informational purposes only. It does not constitute a legally enforceable offer or agreement. Final pricing, availability, and scope of services are subject to change based on further discussions, technical feasibility, site assessment, and formal agreement between both parties.)";

export function emptyQuotation(number: string): Omit<Quotation, "id"> {
  return {
    number,
    status: "draft",
    date: todayISO(),
    to: "",
    subject: "Quotation for Aerial Drone Light Show Performance Services:",
    priceHeading: "Drone Show Price",
    rows: [emptyRow("row-1", "1"), emptyRow("row-2")],
    taxNote: DEFAULT_TAX_NOTE,
    scopeNote: DEFAULT_SCOPE_NOTE,
    closing: "Thanking You",
    signerName: "Yash Dave",
    signerRole: "Marketing Head",
    signerPhone: "+91 9979 850863",
    signerCompany: "Flybit Dynamics Pvt Ltd",
    paymentTerms: [...DEFAULT_PAYMENT_TERMS],
    benefits: [...DEFAULT_BENEFITS],
    confidential: DEFAULT_CONFIDENTIAL,
    showId: "",
    clientId: "",
    createdAt: new Date().toISOString(),
  };
}

/** Read a stored quotation whatever version wrote it. */
export function normalizeQuotation(id: string, raw: Record<string, unknown>): Quotation {
  const base = emptyQuotation("");
  const merged = { ...base, ...raw } as Quotation;
  const list = (value: unknown, fallback: string[]) =>
    Array.isArray(value) ? (value as string[]).map(String) : fallback;

  return {
    ...merged,
    id,
    rows:
      Array.isArray(raw.rows) && raw.rows.length > 0
        ? (raw.rows as QuotationRow[]).map((row, index) => ({
            ...emptyRow(row?.id || `row-${index + 1}`),
            ...row,
          }))
        : [emptyRow("row-1", "1")],
    paymentTerms: list(raw.paymentTerms, base.paymentTerms),
    benefits: list(raw.benefits, base.benefits),
  };
}

/** A copy to work from: same wording, its own number and today's date. */
export function duplicateOfQuotation(
  source: Omit<Quotation, "id">,
  number: string,
): Omit<Quotation, "id"> {
  return {
    ...source,
    number,
    status: "draft",
    date: todayISO(),
    createdAt: new Date().toISOString(),
    rows: source.rows.map((row, index) => ({ ...row, id: `row-${index + 1}` })),
  };
}

/** The last two digits of "#FD00069" → "69". */
function quotationSerial(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.slice(-2).padStart(2, "0") || "00";
}

/** "2026-09-29" → "29 sept 2026". Leaves a typed date as it stands. */
function quotationFileDate(value: string): string {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.toLowerCase();
  const formatted = formatDate(raw);
  if (formatted === "—") return raw;
  const [day, month, year] = formatted.split(" ");
  return `${Number(day)} ${month.toLowerCase()} ${year}`;
}

/** The name the browser offers when you Save as PDF:
 *  "01. Flybit Quotation 29 sept 2026 Client". */
export function quotationPdfName(
  quotation: Pick<Quotation, "number" | "date" | "to">,
  clientName = "",
): string {
  const who = (clientName || quotation.to.split("\n")[0] || "").trim();
  return [`${quotationSerial(quotation.number)}. Flybit Quotation`, quotationFileDate(quotation.date), who]
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Start one from a booking: who it is for, and the event the price is for. */
export function quotationFromShow(
  draft: Omit<Quotation, "id">,
  show: Show,
  client: Client | null,
): Omit<Quotation, "id"> {
  const where = [show.area, show.location, show.state].filter(Boolean).join(", ");
  const heading = [
    "Drone Show Price for",
    show.showDate ? formatDate(show.showDate) : "",
    show.location ? `in ${show.location}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...draft,
    showId: show.id,
    clientId: client?.id ?? "",
    to: [client?.name || show.client, where].filter(Boolean).join("\n"),
    priceHeading: heading,
    rows: [
      {
        ...emptyRow("row-1", "1"),
        description: show.droneCount
          ? `Package FLYBIT ${show.droneCount} : ${show.droneCount} Drones Show`
          : "Drone Light Show",
        price: show.showAmount ? `₹ ${show.showAmount.toLocaleString("en-IN")}` : "",
      },
      { ...emptyRow("row-2"), description: "Show Length:\nformations -" },
    ],
  };
}
