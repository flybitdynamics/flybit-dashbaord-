/** Work orders: the order a client issues to Flybit for a drone light show.
 *
 *  Modelled on the Patel Family work order: a centred title block, the
 *  parties and date of issue, then numbered sections (event and service
 *  details, scope of work, technical requirements, deliverable, terms), the
 *  value and payment terms, and a sign-off for both sides. Every printed
 *  value is plain text typed on the page, so any wording can be changed;
 *  details and bullets can be added and taken away. */

import { Show, formatTime } from "./types";

export type WorkOrderStatus = "draft" | "issued" | "accepted" | "cancelled";

export const WORK_ORDER_STATUSES: Record<WorkOrderStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  accepted: "Accepted",
  cancelled: "Cancelled",
};

export interface WorkOrderDetail {
  id: string;
  label: string;
  value: string;
  /** Takes the full width of the table, as Venue does. */
  wide?: boolean;
}

export interface WorkOrderBullet {
  id: string;
  text: string;
}

export interface WorkOrder {
  id: string;
  /** For the list only; not printed. "WO-001". */
  number: string;
  status: WorkOrderStatus;
  /** The show it was made from, if any. */
  showId: string;

  /** "PATEL FAMILY" above the title, and in the footer. */
  clientName: string;
  title: string;
  subtitle: string;

  issuedBy: string;
  issuedTo: string;
  /** Printed as typed: "26 November 2026". */
  issueDate: string;

  details: WorkOrderDetail[];
  scopeIntro: string;
  scope: WorkOrderBullet[];
  requirements: WorkOrderBullet[];
  deliverable: string;
  terms: WorkOrderBullet[];

  /** "₹ 300000/- + GST" */
  value: string;
  paymentTerms: string;
  closingNote: string;

  clientSignFor: string;
  clientSignName: string;
  clientSignDate: string;
  providerSignFor: string;
  providerSignName: string;
  providerSignDate: string;

  /** Blank means "<CLIENT> | WORK ORDER FOR <SUBTITLE>". */
  footer: string;

  createdAt: string;
  updatedAt?: string;
}

export type WorkOrderDraft = Omit<WorkOrder, "id">;

export const PROVIDER = "Flybit Dynamics Private Limited";

/* ---------------- numbering ---------------- */

export function nextWorkOrderNumber(orders: Pick<WorkOrder, "number">[]): string {
  const highest = orders.reduce((max, order) => {
    const serial = order.number.match(/(\d+)\s*$/);
    return serial ? Math.max(max, Number(serial[1])) : max;
  }, 0);
  return `WO-${String(highest + 1).padStart(3, "0")}`;
}

/* ---------------- dates ---------------- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-11-26" → "26 November 2026". */
export function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-11-26" → "26th Nov 2026", as the signatures read. */
export function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = Number(m[3]);
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${MONTHS[Number(m[2]) - 1].slice(0, 3)} ${m[1]}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/* ---------------- money ---------------- */

/** The first number in the value line, for the list: "₹ 300000/- + GST" → 300000. */
export function workOrderAmount(value: string): number | null {
  const match = value.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/* ---------------- templates ---------------- */

const bullets = (prefix: string, lines: string[]): WorkOrderBullet[] =>
  lines.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }));

export const DEFAULT_REQUIREMENTS = [
  "Obtain and comply with all relevant regulatory permissions, including those from AAI, DGCA and local authorities.",
  "Carry out a site survey and technical rehearsal before the show.",
  "Ensure safety and maintenance protocols for all equipment and personnel.",
  "Coordinate airspace safety and ground security with the organizing and security teams.",
  "Provide power supply and backup at the launch site.",
  "Prepare and implement an emergency response plan.",
];

export const DEFAULT_TERMS = [
  "In case of adverse weather or permission not received, the show may be rescheduled.",
  "The Client shall ensure exclusive and safe access to the launch/landing site and clear airspace during the show.",
];

export const DEFAULT_SCOPE = ["Welcome graphics", "Name initials (logo)", "Heart formation", "Ring", "Other formations"];

/** A new work order with Flybit's side, the requirements and the terms
 *  filled in; the client, event and value left for you. */
export function emptyWorkOrder(number: string): WorkOrderDraft {
  const today = todayIso();
  return {
    number,
    status: "draft",
    showId: "",
    clientName: "",
    title: "WORK ORDER",
    subtitle: "DRONE LIGHT SHOW SERVICES",
    issuedBy: "",
    issuedTo: PROVIDER,
    issueDate: longDate(today),
    details: [
      { id: "d-1", label: "Event", value: "" },
      { id: "d-2", label: "Service", value: "Customized Drone Light Show" },
      { id: "d-3", label: "Show date", value: "" },
      { id: "d-4", label: "Show time", value: "" },
      { id: "d-5", label: "Show duration", value: "" },
      { id: "d-6", label: "Number of drones", value: "" },
      { id: "d-7", label: "Venue", value: "", wide: true },
    ],
    scopeIntro: scopeIntroFor("", "the above-mentioned event"),
    scope: bullets("s", DEFAULT_SCOPE),
    requirements: bullets("r", DEFAULT_REQUIREMENTS),
    deliverable: "",
    terms: bullets("t", DEFAULT_TERMS),
    value: "₹ /- + GST",
    paymentTerms: "50% advance, 50% on event day",
    closingNote:
      "This Work Order is issued by the Client to authorize the Service Provider to undertake the services described above, subject to the stated scope and terms.",
    clientSignFor: "",
    clientSignName: "",
    clientSignDate: shortDate(today),
    providerSignFor: `ACCEPTED FOR ${PROVIDER.toUpperCase()}`,
    providerSignName: "Vivek Patel",
    providerSignDate: shortDate(today),
    footer: "",
    createdAt: new Date().toISOString(),
  };
}

function scopeIntroFor(drones: string, event: string): string {
  return `The Client hereby appoints and issues this Work Order to ${PROVIDER} to plan and deliver a customized ${drones ? `${drones}-drone` : "drone"} light show for ${event}.`;
}

function setDetail(details: WorkOrderDetail[], label: string, value: string): WorkOrderDetail[] {
  return details.map((d) => (d.label.trim().toLowerCase() === label.toLowerCase() ? { ...d, value } : d));
}

/** Fills the client, the event details and the value from a show. */
export function fromShow(draft: WorkOrderDraft, show: Show): WorkOrderDraft {
  const client = show.client.trim() || show.contactName.trim();
  const drones = show.droneCount ? String(show.droneCount) : "";
  const time =
    show.showStartTime && show.showEndTime
      ? `${formatTime(show.showStartTime)} to ${formatTime(show.showEndTime)}`
      : show.showStartTime
        ? formatTime(show.showStartTime)
        : "";
  const venue = [show.venueAddress, show.area, show.location, show.state].map((s) => s.trim()).filter(Boolean);
  const venueText = show.venueAddress.trim() ? show.venueAddress.trim() : venue.join(", ");

  let details = draft.details;
  details = setDetail(details, "Show date", show.showDate ? longDate(show.showDate) : "");
  details = setDetail(details, "Show time", time);
  details = setDetail(details, "Number of drones", drones ? `${drones} drones` : "");
  details = setDetail(details, "Venue", venueText);

  return {
    ...draft,
    showId: show.id,
    clientName: client.toUpperCase(),
    issuedBy: client,
    details,
    scopeIntro: scopeIntroFor(drones, "the above-mentioned event"),
    value: show.showAmount ? `₹ ${show.showAmount}/- + GST` : draft.value,
    clientSignFor: client ? `FOR ${client.toUpperCase()}` : draft.clientSignFor,
    clientSignName: show.contactName.trim() || draft.clientSignName,
  };
}

/** The Patel Family work order exactly as it went out. */
export function sampleWorkOrder(number: string): WorkOrderDraft {
  const base = emptyWorkOrder(number);
  return {
    ...base,
    status: "issued",
    clientName: "PATEL FAMILY",
    issuedBy: "Patel Family",
    issueDate: "26 November 2026",
    details: [
      { id: "d-1", label: "Event", value: "Reception of Shiv and Diya" },
      { id: "d-2", label: "Service", value: "Customized Drone Light Show" },
      { id: "d-3", label: "Show date", value: "30 December 2026" },
      { id: "d-4", label: "Show time", value: "6:30 PM to 6:45 PM" },
      { id: "d-5", label: "Show duration", value: "13 minutes" },
      { id: "d-6", label: "Number of drones", value: "100 drones" },
      { id: "d-7", label: "Venue", value: "Avadh Utopia, Dumas Road, opposite Airport, Surat, Dumas, Gujarat 394550", wide: true },
    ],
    scopeIntro: scopeIntroFor("100", "the above-mentioned reception event"),
    deliverable:
      "One customized 100-drone light show of 13 minutes for the Reception of Shiv and Diya, as described in this Work Order.",
    value: "₹ 300000/- + GST",
    clientSignFor: "FOR PATEL FAMILY",
    clientSignName: "Shiv Patel",
    clientSignDate: "26th Nov 2026",
    providerSignDate: "26th Nov 2026",
  };
}

/** Read a stored work order whatever version wrote it. */
export function normalizeWorkOrder(id: string, raw: Record<string, unknown>): WorkOrder {
  const base = emptyWorkOrder("");
  const merged = { ...base, ...raw } as WorkOrder;
  const list = <T extends { id: string }>(value: unknown, fallback: T[], blank: (id: string) => T): T[] =>
    Array.isArray(value)
      ? (value as T[]).map((item, i) => ({ ...blank(`${i + 1}`), ...item, id: item?.id || `item-${i + 1}` }))
      : fallback;
  const bullet = (i: string) => ({ id: i, text: "" });
  return {
    ...merged,
    id,
    details: list(raw.details, base.details, (i) => ({ id: i, label: "", value: "" })),
    scope: list(raw.scope, base.scope, bullet),
    requirements: list(raw.requirements, base.requirements, bullet),
    terms: list(raw.terms, base.terms, bullet),
  };
}

/** A copy to work from: same wording, its own number, a draft again. */
export function duplicateOfWorkOrder(source: WorkOrderDraft, number: string): WorkOrderDraft {
  return { ...source, number, status: "draft", createdAt: new Date().toISOString(), updatedAt: undefined };
}

export function footerText(order: Pick<WorkOrder, "footer" | "clientName" | "subtitle">): string {
  if (order.footer.trim()) return order.footer;
  const what = `WORK ORDER FOR ${order.subtitle.trim() || "DRONE LIGHT SHOW SERVICES"}`;
  return order.clientName.trim() ? `${order.clientName.trim()}  |  ${what}` : what;
}

/** "Work_Order_Patel_Family", as the sample is named. */
export function workOrderFileName(order: Pick<WorkOrder, "clientName" | "issuedBy" | "number">): string {
  const who = (order.issuedBy || order.clientName || order.number).trim();
  const words = who
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return `Work_Order${words.length ? `_${words.join("_")}` : ""}`;
}
