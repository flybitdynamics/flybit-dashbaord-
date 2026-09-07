export type Zone = "green" | "yellow" | "red";
export type ShowStatus = "upcoming" | "completed" | "cancelled";
export type PermissionStatus = "na" | "applied" | "approved" | "rejected";
export type PaymentMode = "cash" | "upi" | "bank" | "cheque" | "other";

/** One booking. Mirrors the show sheet, plus the fields the MoCA
 *  paperwork needs (venue address and coordinates). */
export interface Show {
  id: string;
  location: string;
  zone: Zone;
  droneCount: number;
  person: string;
  bookingDate: string;
  showAmount: number;
  showDate: string;
  showStartTime: string;
  showEndTime: string;
  showStatus: ShowStatus;
  /** The B2B partner or agency the booking came through. */
  b2b: string;
  permission: PermissionStatus;
  notes: string;
  commission: number;
  /* For the permission documents and the client record. */
  client: string;
  contact: string;
  venueAddress: string;
  coordinates: string;
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
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
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

/** The person running most shows; the admin can change it per booking. */
export const DEFAULT_PERSON = "Jehan Patel";

export function emptyShow(): Omit<Show, "id"> {
  return {
    location: "",
    zone: "yellow",
    droneCount: 0,
    person: DEFAULT_PERSON,
    bookingDate: todayISO(),
    showAmount: 0,
    showDate: todayISO(),
    showStartTime: "20:00",
    showEndTime: "21:00",
    showStatus: "upcoming",
    b2b: "",
    permission: "na",
    notes: "",
    commission: 0,
    client: "",
    contact: "",
    venueAddress: "",
    coordinates: "",
  };
}

export function emptyPayment(showId: string): Omit<Payment, "id"> {
  return { showId, amount: 0, date: todayISO(), mode: "cash", notes: "" };
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

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

/** Show has flown but money is still outstanding. */
export function isOverdue(show: Show, payments: Payment[]): boolean {
  const days = daysAway(show.showDate);
  return (
    show.showStatus !== "cancelled" &&
    pendingFor(show, payments) > 0 &&
    days !== null &&
    days < 0
  );
}

/** Upcoming show whose airspace needs a permission we do not have yet.
 *  Green-zone shows need none, so they never raise a flag. */
export function needsClearance(show: Show): boolean {
  const days = daysAway(show.showDate);
  if (show.showStatus !== "upcoming") return false;
  if (days === null || days < 0) return false;
  if (show.zone === "green") return false;
  return show.permission !== "approved";
}
