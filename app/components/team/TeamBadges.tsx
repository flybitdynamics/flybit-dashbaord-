import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  LeaveStatus,
  LeaveType,
  MEMBER_STATUSES,
  MemberStatus,
} from "../../lib/team";

/* Leave status is the one place colour carries meaning here — everything
   else stays black, white and gray, as on the shows desk. */
const leaveStatusStyles: Record<LeaveStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${leaveStatusStyles[status]}`}
    >
      {LEAVE_STATUSES[status]}
    </span>
  );
}

export function LeaveTypeBadge({ type }: { type: LeaveType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        type === "unpaid"
          ? "bg-neutral-900 text-white ring-neutral-900"
          : "bg-neutral-100 text-neutral-600 ring-neutral-200"
      }`}
      title={type === "unpaid" ? "Deducted from salary" : "Comes out of the paid allowance"}
    >
      {LEAVE_TYPES[type]}
    </span>
  );
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        status === "active"
          ? "bg-neutral-900 text-white ring-neutral-900"
          : "bg-neutral-100 text-neutral-400 ring-neutral-200"
      }`}
    >
      {MEMBER_STATUSES[status]}
    </span>
  );
}

/** Paid leave used against the year's allowance. */
export function LeaveMeter({ used, allowance }: { used: number; allowance: number }) {
  const pct = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
  const over = allowance > 0 && used > allowance;

  return (
    <div className="flex min-w-28 flex-col gap-1">
      <div className="tnum font-mono text-xs text-neutral-600">
        {used} / {allowance} days
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-full ${over ? "bg-red-500" : "bg-neutral-900"}`}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
      <span className={`text-[11px] ${over ? "font-semibold text-red-600" : "text-neutral-500"}`}>
        {over ? `${used - allowance} over allowance` : `${allowance - used} left this year`}
      </span>
    </div>
  );
}
