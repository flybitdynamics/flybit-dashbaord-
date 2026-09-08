"use client";

import {
  AttendanceRecord,
  LEAVE_TYPES,
  LeaveRequest,
  TeamMember,
  daysAttendedInMonth,
  daysInMonth,
  describeRange,
  formatMonth,
  leaveDays,
  paidLeaveUsed,
  payableThisMonth,
  recentMonths,
  totalDaysAttended,
} from "../../lib/team";
import { formatDate, formatMoney } from "../../lib/types";
import { Modal } from "../Modal";
import { LeaveStatusBadge, LeaveTypeBadge, MemberStatusBadge } from "./TeamBadges";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-right text-sm text-neutral-900">{children}</span>
    </div>
  );
}

/** One person's salary record: what they are paid, what they worked, and
 *  every leave day behind the deductions. */
export function MemberDetailDialog({
  member,
  requests,
  attendance,
  canEdit,
  onEdit,
  onClose,
}: {
  member: TeamMember;
  requests: LeaveRequest[];
  attendance: AttendanceRecord[];
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const months = recentMonths(6);
  const own = requests
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));

  const used = paidLeaveUsed(member.id, requests);
  const totalDays = totalDaysAttended(member.id, attendance);
  const sixMonthPayable = months.reduce(
    (sum, m) => sum + payableThisMonth(member, requests, m).payable,
    0,
  );

  return (
    <Modal
      title={member.name}
      subtitle={`${member.role || "No role set"} · joined ${formatDate(member.joiningDate)}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {formatMoney(member.monthlySalary)} per month · {totalDays} days worked in total
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Close
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Edit member
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Details
          </h3>
          <div className="mt-1">
            <Row label="Status">
              <MemberStatusBadge status={member.status} />
            </Row>
            <Row label="Phone">{member.phone || "—"}</Row>
            <Row label="Email">{member.email || "—"}</Row>
            <Row label="Monthly salary">
              <span className="tnum font-mono">{formatMoney(member.monthlySalary)}</span>
            </Row>
            <Row label="Paid leave used">
              <span className="tnum font-mono">
                {used} / {member.leaveAllowance} days
              </span>
            </Row>
            <Row label="Total days worked">
              <span className="tnum font-mono">{totalDays}</span>
            </Row>
            <Row label="Last 6 months payable">
              <span className="tnum font-mono font-semibold">{formatMoney(sixMonthPayable)}</span>
            </Row>
          </div>
          {member.notes && (
            <p className="mt-3 rounded-lg bg-neutral-100/70 p-3 text-sm text-neutral-600">
              {member.notes}
            </p>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Salary by month
          </h3>
          <div className="mt-2 overflow-hidden rounded-xl bg-neutral-50">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200/70">
                  {["Month", "Worked", "Unpaid", "Payable"].map((h) => (
                    <th
                      key={h}
                      className="px-2.5 py-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const pay = payableThisMonth(member, requests, m);
                  const worked = daysAttendedInMonth(member.id, attendance, m);
                  return (
                    <tr key={m} className="row-line">
                      <td className="px-2.5 py-1.5 text-xs text-neutral-700">
                        {formatMonth(m)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 font-mono text-xs">
                        {worked}/{daysInMonth(m)}
                      </td>
                      <td className="tnum px-2.5 py-1.5 font-mono text-xs text-neutral-500">
                        {pay.unpaidDays || "—"}
                      </td>
                      <td className="tnum px-2.5 py-1.5 font-mono text-xs font-medium">
                        {formatMoney(pay.payable)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sm:col-span-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Leave history ({own.length})
          </h3>
          {own.length === 0 ? (
            <p className="py-2 text-sm text-neutral-500">No leave applied for.</p>
          ) : (
            <div className="mt-1">
              {own.map((request) => (
                <div
                  key={request.id}
                  className="row-line flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <LeaveTypeBadge type={request.type} />
                    <span className="tnum font-mono text-xs text-neutral-600">
                      {describeRange(request)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {leaveDays(request)} day{leaveDays(request) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {request.reason && (
                      <span className="max-w-64 truncate text-xs text-neutral-500">
                        {request.reason}
                      </span>
                    )}
                    <LeaveStatusBadge status={request.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-neutral-400">
            {LEAVE_TYPES.unpaid} leave is deducted pro-rata from salary; casual and sick come out
            of the yearly allowance.
          </p>
        </section>
      </div>
    </Modal>
  );
}
