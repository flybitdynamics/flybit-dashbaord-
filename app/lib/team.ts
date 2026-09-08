import { formatDate, toISO, todayISO } from "./types";

export type MemberStatus = "active" | "inactive";
export type LeaveType = "casual" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  joiningDate: string;
  monthlySalary: number;
  /** Paid leave days allowed per calendar year. */
  leaveAllowance: number;
  status: MemberStatus;
  notes: string;
}

export interface LeaveRequest {
  id: string;
  memberId: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  decidedOn: string;
  decisionNote: string;
}

/** One row per member per month — how many days they actually worked. */
export interface AttendanceRecord {
  id: string;
  memberId: string;
  /** YYYY-MM */
  month: string;
  daysPresent: number;
  notes: string;
}

export const MEMBER_STATUSES: Record<MemberStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const LEAVE_TYPES: Record<LeaveType, string> = {
  casual: "Casual",
  sick: "Sick",
  unpaid: "Unpaid",
};

export const LEAVE_STATUSES: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Unpaid leave does not come out of the paid allowance. */
export const PAID_LEAVE_TYPES: LeaveType[] = ["casual", "sick"];

export function emptyMember(): Omit<TeamMember, "id"> {
  return {
    name: "",
    role: "",
    phone: "",
    email: "",
    joiningDate: todayISO(),
    monthlySalary: 0,
    leaveAllowance: 12,
    status: "active",
    notes: "",
  };
}

export function emptyLeaveRequest(memberId = ""): Omit<LeaveRequest, "id"> {
  return {
    memberId,
    type: "casual",
    fromDate: todayISO(),
    toDate: todayISO(),
    reason: "",
    status: "pending",
    appliedOn: todayISO(),
    decidedOn: "",
    decisionNote: "",
  };
}

export function emptyAttendance(memberId = "", month = currentMonth()) {
  return { memberId, month, daysPresent: 0, notes: "" };
}

/* ---------------- months ---------------- */

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/** The last 12 months, newest first — for the month picker. */
export function recentMonths(count = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  now.setDate(1);
  for (let i = 0; i < count; i += 1) {
    out.push(toISO(now).slice(0, 7));
    now.setMonth(now.getMonth() - 1);
  }
  return out;
}

/** Calendar days in a month, used as the salary divisor. */
export function daysInMonth(month: string): number {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return 30;
  return new Date(year, m, 0).getDate();
}

/* ---------------- leave ---------------- */

/** Inclusive day count, so a single-day leave counts as 1. */
export function leaveDays(request: Pick<LeaveRequest, "fromDate" | "toDate">): number {
  const from = Date.parse(request.fromDate);
  const to = Date.parse(request.toDate);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/** How many days of an approved leave fall inside one month. */
export function leaveDaysInMonth(request: LeaveRequest, month: string): number {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return 0;
  const monthStart = new Date(year, m - 1, 1).getTime();
  const monthEnd = new Date(year, m, 0).getTime();
  const from = Date.parse(request.fromDate);
  const to = Date.parse(request.toDate);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;

  const start = Math.max(from, monthStart);
  const end = Math.min(to, monthEnd);
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function isOnLeaveOn(request: LeaveRequest, iso: string): boolean {
  return (
    request.status === "approved" &&
    request.fromDate <= iso &&
    request.toDate >= iso
  );
}

/** Paid leave used this calendar year. */
export function paidLeaveUsed(memberId: string, requests: LeaveRequest[], year = new Date().getFullYear()): number {
  return requests
    .filter(
      (r) =>
        r.memberId === memberId &&
        r.status === "approved" &&
        PAID_LEAVE_TYPES.includes(r.type) &&
        r.fromDate.startsWith(String(year)),
    )
    .reduce((sum, r) => sum + leaveDays(r), 0);
}

export function unpaidLeaveInMonth(memberId: string, requests: LeaveRequest[], month: string): number {
  return requests
    .filter((r) => r.memberId === memberId && r.status === "approved" && r.type === "unpaid")
    .reduce((sum, r) => sum + leaveDaysInMonth(r, month), 0);
}

/** Total days worked across every month on record. */
export function totalDaysAttended(memberId: string, attendance: AttendanceRecord[]): number {
  return attendance
    .filter((a) => a.memberId === memberId)
    .reduce((sum, a) => sum + (a.daysPresent || 0), 0);
}

export function daysAttendedInMonth(memberId: string, attendance: AttendanceRecord[], month: string): number {
  return attendance.find((a) => a.memberId === memberId && a.month === month)?.daysPresent ?? 0;
}

/** Salary less a pro-rata cut for unpaid days. */
export function payableThisMonth(
  member: TeamMember,
  requests: LeaveRequest[],
  month: string,
): { unpaidDays: number; deduction: number; payable: number } {
  const unpaidDays = unpaidLeaveInMonth(member.id, requests, month);
  const perDay = member.monthlySalary / daysInMonth(month);
  const deduction = Math.round(perDay * unpaidDays);
  return { unpaidDays, deduction, payable: Math.max(0, member.monthlySalary - deduction) };
}

export function describeRange(request: Pick<LeaveRequest, "fromDate" | "toDate">): string {
  return request.fromDate === request.toDate
    ? formatDate(request.fromDate)
    : `${formatDate(request.fromDate)} – ${formatDate(request.toDate)}`;
}
