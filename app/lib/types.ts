export type Zone = "green" | "yellow" | "red";

/** Where a booking sits in the funnel. The main path is
 *  Inquiry → Confirmed → Completed → Closed. Lost is an inquiry that never
 *  converted; Cancelled is a confirmed show that was called off. */
export type ShowStatus = "inquiry" | "confirmed" | "completed" | "closed" | "lost" | "cancelled";
export type PermissionStatus = "na" | "applied" | "approved" | "rejected";
export type PaymentMode = "cash" | "upi" | "bank" | "cheque" | "other";
export type ClientType = "direct" | "b2b";
export type PilotStatus = "active" | "inactive";

/** One booking, from first inquiry to the day it is closed. */
export interface Show {
  id: string;
  showStatus: ShowStatus;

  /* Who it is for, and who flies it. */
  clientId: string;
  /** Copied from the client record so lists and documents need no lookup.
   *  Rows from before clients were records carry only this. */
  client: string;
  contactName: string;
  contactPhone: string;
  pilotIds: string[];

  /* Where. `location` is the district or city — the MoCA letter prints it. */
  state: string;
  location: string;
  area: string;
  venueAddress: string;
  coordinates: string;
  zone: Zone;

  /* When. */
  bookingDate: string;
  showDate: string;
  showStartTime: string;
  showEndTime: string;

  /* What. */
  droneCount: number;
  showAmount: number;
  commission: number;
  permission: PermissionStatus;
  notes: string;

  /* Legacy, read-only: from before contacts, pilots and clients were split
   * out. Shown as a fallback, never written by the form. */
  contact?: string;
  person?: string;
  b2b?: string;
}

/** Anyone who pays for a show — a direct customer or a B2B agency. */
export interface Client {
  id: string;
  name: string;
  type: ClientType;
  contactName: string;
  contactPhone: string;
  email: string;
  gstin: string;
  state: string;
  city: string;
  address: string;
  notes: string;
}

/** A remote pilot. The DGCA certificate is what Annexure 3 asks for. */
export interface Pilot {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** DGCA Remote Pilot Certificate number. */
  rpcNumber: string;
  rpcValidUntil: string;
  qualification: string;
  status: PilotStatus;
  notes: string;
}

/** A place a show has been, remembered so the next booking can pick it. */
export interface Place {
  id: string;
  state: string;
  city: string;
  area: string;
}

/** One payment against a show. Mirrors the payment sheet — several rows
 *  can belong to the same booking, which is how part-payments are logged. */
export interface Payment {
  id: string;
  showId: string;
  amount: number;
  date: string;
  mode: PaymentMode;
  notes: string;
}

export type LogAction = "create" | "edit" | "delete" | "stage_change" | "payment" | "expense" | "user";

export interface AuditLog {
  id: string;
  timestamp: string;
  actorUid: string;
  actorName: string;
  actorEmail: string;
  action: LogAction;
  entityType: "show" | "client" | "pilot" | "payment" | "expense" | "user" | "settings";
  entityId: string;
  entityTitle: string;
  details: string;
}

/** Company details the permission documents are filled from. */
export interface Settings {
  companyName: string;
  companyShortName: string;
  companyAddress: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyEmail: string;
  companyPhone: string;
  nodalPhone: string;
  signatoryName: string;
  signatoryTitle: string;
  coordinatorName: string;
  coordinatorPhone: string;
  pilotName: string;
  pilotQualification: string;
  previousPermissionNo: string;
  uin: string;
  maxHeight: string;
  operatingRadius: string;
  operatingTime: string;
  weather: string;
  operationType: string;
}

/** Straight out of the current permission documents. */
export const DEFAULT_SETTINGS: Settings = {
  companyName: "Flybit Dynamics Private Limited",
  companyShortName: "Flybit Dynamics Pvt. Ltd.",
  companyAddress: "511, Satyamev Eminence, Science City Rd, Sola, Ahmedabad, 380006",
  companyAddressLine1: "511, Satyamev Eminence, Sola, Science City Road,",
  companyAddressLine2: "Ahmedabad, Gujarat - 380060",
  companyEmail: "flybitdynamics@gmail.com",
  companyPhone: "+91 92274 28262",
  nodalPhone: "+91 9227428262",
  signatoryName: "Vivekkumar Patel",
  signatoryTitle: "Director",
  coordinatorName: "Vivekkumar Patel",
  coordinatorPhone: "+91 92274 28262",
  pilotName: "Shivam Patel",
  pilotQualification: "Technical Head",
  previousPermissionNo: "AV-22031/106/2025-SDIT-MOCA",
  uin: "Mentioned in PDF",
  maxHeight: "120",
  operatingRadius: "200",
  operatingTime: "15-20 mins",
  weather: "Normal",
  operationType: "VLOS",
};

/* Zone is a fact about the venue's airspace on the DGCA map, not a status
   of your paperwork. Under the Drone Rules 2021: green needs no permission,
   yellow needs ATC clearance, red needs Central Government approval. */
export const ZONES: Record<Zone, { label: string; hint: string }> = {
  green: { label: "Green", hint: "No permission needed, up to 120 m" },
  yellow: { label: "Yellow", hint: "Controlled airspace — ATC permission needed" },
  red: { label: "Red", hint: "Central Government permission needed" },
};

export const SHOW_STATUSES: Record<ShowStatus, string> = {
  inquiry: "Inquiry",
  confirmed: "Confirmed",
  completed: "Completed",
  closed: "Closed",
  lost: "Lost",
  cancelled: "Cancelled",
};

export const STAGE_HINTS: Record<ShowStatus, string> = {
  inquiry: "A lead — not booked yet",
  confirmed: "Booked; the show is coming up",
  completed: "Flown; waiting to be settled",
  closed: "Paid and done",
  lost: "An inquiry that did not convert",
  cancelled: "Confirmed, then called off",
};

/** The main path, in order. Lost and Cancelled are exits from it. */
export const PIPELINE: ShowStatus[] = ["inquiry", "confirmed", "completed", "closed"];

/** Counts as business: money is owed on it or has been earned from it. */
export function isBooked(show: Pick<Show, "showStatus">): boolean {
  return (
    show.showStatus === "confirmed" ||
    show.showStatus === "completed" ||
    show.showStatus === "closed"
  );
}

/** Still needs someone's attention — not closed, lost or cancelled. */
export function isOpen(show: Pick<Show, "showStatus">): boolean {
  return (
    show.showStatus === "inquiry" ||
    show.showStatus === "confirmed" ||
    show.showStatus === "completed"
  );
}

/** Older rows used a three-value status. */
const LEGACY_STATUS: Record<string, ShowStatus> = { upcoming: "confirmed" };

export const CLIENT_TYPES: Record<ClientType, string> = {
  direct: "Direct",
  b2b: "B2B",
};

export const PERMISSION_STATUSES: Record<PermissionStatus, string> = {
  na: "NA",
  applied: "Applied",
  approved: "Approved",
  rejected: "Rejected",
};

export const PAYMENT_MODES: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

/** The pilot on most shows; pre-selected on a new booking if that pilot
 *  exists. */
export const DEFAULT_PERSON = "Jehan Patel";

/** Most shows are in Gujarat, so a new booking starts there. */
export const DEFAULT_STATE = "Gujarat";

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

export function emptyShow(): Omit<Show, "id"> {
  return {
    showStatus: "inquiry",
    clientId: "",
    client: "",
    contactName: "",
    contactPhone: "",
    pilotIds: [],
    state: DEFAULT_STATE,
    location: "",
    area: "",
    venueAddress: "",
    coordinates: "",
    zone: "yellow",
    bookingDate: todayISO(),
    showDate: todayISO(),
    showStartTime: "20:00",
    showEndTime: "21:00",
    droneCount: 0,
    showAmount: 0,
    commission: 0,
    permission: "na",
    notes: "",
  };
}

/** Read a stored show whatever version wrote it: fills fields added since,
 *  and maps the old status and single contact string forward. */
export function normalizeShow(id: string, raw: Record<string, unknown>): Show {
  const base = emptyShow();
  const merged = { ...base, ...raw } as Show & { showStatus: string };
  const rawStatus = String(raw.showStatus ?? "");
  const showStatus: ShowStatus =
    LEGACY_STATUS[rawStatus] ??
    (rawStatus in SHOW_STATUSES ? (rawStatus as ShowStatus) : "inquiry");

  return {
    ...merged,
    id,
    showStatus,
    pilotIds: Array.isArray(raw.pilotIds) ? (raw.pilotIds as string[]) : [],
    // The old single field nearly always held a phone number.
    contactPhone: String(raw.contactPhone ?? "") || String(raw.contact ?? ""),
    contactName: String(raw.contactName ?? ""),
    state: raw.state === undefined ? "" : String(raw.state),
    area: String(raw.area ?? ""),
    clientId: String(raw.clientId ?? ""),
  };
}

export function emptyClient(): Omit<Client, "id"> {
  return {
    name: "",
    type: "direct",
    contactName: "",
    contactPhone: "",
    email: "",
    gstin: "",
    state: DEFAULT_STATE,
    city: "",
    address: "",
    notes: "",
  };
}

export function emptyPilot(): Omit<Pilot, "id"> {
  return {
    name: "",
    phone: "",
    email: "",
    rpcNumber: "",
    rpcValidUntil: "",
    qualification: "",
    status: "active",
    notes: "",
  };
}

export function emptyPayment(showId: string): Omit<Payment, "id"> {
  return { showId, amount: 0, date: todayISO(), mode: "cash", notes: "" };
}

/** Stable id for a place, so saving the same one twice does not duplicate it. */
export function placeId(state: string, city: string, area: string): string {
  const slug = (v: string) =>
    v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [slug(state) || "x", slug(city) || "x", slug(area) || "x"].join("__");
}

/** "Satellite, Ahmedabad, Gujarat" */
export function placeLabel(show: Pick<Show, "area" | "location" | "state">): string {
  return [show.area, show.location, show.state].filter((v) => v && v.trim()).join(", ");
}

/** "Meera Patel · 98250 00114", falling back to the old single field. */
export function contactLabel(
  show: Pick<Show, "contactName" | "contactPhone"> & { contact?: string },
): string {
  const bits = [show.contactName, show.contactPhone].filter((v) => v && v.trim());
  return bits.length ? bits.join(" · ") : show.contact || "";
}

export type CertificateState = "valid" | "expiring" | "expired" | "missing";

/** Expiring means within 30 days — enough notice to renew before a show. */
export function certificateState(pilot: Pick<Pilot, "rpcValidUntil">): CertificateState {
  if (!pilot.rpcValidUntil) return "missing";
  const days = daysAway(pilot.rpcValidUntil);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}

/* ---------------- money ---------------- */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatMoney(value: number): string {
  return inr.format(value || 0);
}

/** Short form for summary tiles: ₹8.5 L, ₹1.2 Cr */
export function formatCompactMoney(value: number): string {
  if (!value) return "₹0";
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(value % 1e7 === 0 ? 0 : 1)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(value % 1e5 === 0 ? 0 : 1)} L`;
  return inr.format(value);
}

export function formatNumber(value: number): string {
  return (value || 0).toLocaleString("en-IN");
}

/* ---------------- dates ---------------- */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function parts(iso: string): { y: number; m: number; d: number } | null {
  const bits = iso?.split("-");
  if (!bits || bits.length !== 3) return null;
  const [y, m, d] = bits.map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function formatDate(iso: string): string {
  const p = parts(iso);
  if (!p) return "—";
  return `${String(p.d).padStart(2, "0")} ${MONTHS_SHORT[p.m - 1]} ${p.y}`;
}

/** "27th Aug, 2026" — the form the annexures use. */
export function formatDateOrdinal(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  return `${p.d}${ordinal(p.d)} ${MONTHS_SHORT[p.m - 1]}, ${p.y}`;
}

/** "7th September, 2026" — the form the letters use. */
export function formatDateLetter(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  return `${p.d}${ordinal(p.d)} ${MONTHS_LONG[p.m - 1]}, ${p.y}`;
}

/** "07-Sep-2026" — the form Annexure 2 uses. */
export function formatDateDashed(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  return `${String(p.d).padStart(2, "0")}-${MONTHS_SHORT[p.m - 1]}-${p.y}`;
}

function ordinal(day: number): string {
  if (day > 3 && day < 21) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}

export function formatTime(time: string): string {
  const bits = time?.split(":");
  if (!bits || bits.length < 2) return "";
  const hours = Number(bits[0]);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${bits[1]} ${suffix}`;
}

/** Whole days from today to the show date. Negative means it has passed. */
export function daysAway(iso: string): number | null {
  const p = parts(iso);
  if (!p) return null;
  const date = new Date(p.y, p.m - 1, p.d);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function countdownLabel(iso: string): string {
  const days = daysAway(iso);
  if (days === null) return "Date TBC";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

/* ---------------- payments ---------------- */

export function receivedFor(showId: string, payments: Payment[]): number {
  return payments
    .filter((p) => p.showId === showId)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

export function pendingFor(show: Show, payments: Payment[]): number {
  return Math.max(0, (show.showAmount || 0) - receivedFor(show.id, payments));
}

export type PaymentState = "paid" | "partial" | "pending";

export function paymentStateOf(show: Show, payments: Payment[]): PaymentState {
  const received = receivedFor(show.id, payments);
  if (show.showAmount > 0 && received >= show.showAmount) return "paid";
  if (received > 0) return "partial";
  return "pending";
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  paid: "Paid",
  partial: "Part paid",
  pending: "Payment pending",
};

/** A booked show that has flown with money still outstanding. Inquiries
 *  owe nothing, so they are never overdue. */
export function isOverdue(show: Show, payments: Payment[]): boolean {
  const days = daysAway(show.showDate);
  return isBooked(show) && pendingFor(show, payments) > 0 && days !== null && days < 0;
}

/** A confirmed, upcoming show whose airspace needs a permission we do not
 *  have yet. Green-zone shows need none, so they never raise a flag. */
export function needsClearance(show: Show): boolean {
  const days = daysAway(show.showDate);
  if (show.showStatus !== "confirmed") return false;
  if (days === null || days < 0) return false;
  if (show.zone === "green") return false;
  return show.permission !== "approved";
}
