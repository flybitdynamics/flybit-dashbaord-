"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  AttendanceRecord,
  LEAVE_TYPES,
  LeaveRequest,
  TeamMember,
  currentMonth,
  daysAttendedInMonth,
  describeRange,
  formatMonth,
  isOnLeaveOn,
  leaveDays,
  paidLeaveUsed,
  payableThisMonth,
  recentMonths,
  totalDaysAttended,
} from "../../lib/team";
import {
  applyForLeave,
  decideLeave,
  getServerSnapshot,
  getSnapshot,
  removeLeave,
  removeMember,
  saveAttendance,
  subscribe,
  upsertMember,
} from "../../lib/team-store";
import { formatCompactMoney, formatDate, formatMoney, formatNumber, todayISO } from "../../lib/types";
import { SiteHeader } from "../SiteHeader";
import { AttendanceDialog } from "./AttendanceDialog";
import { LeaveDialog } from "./LeaveDialog";
import { MemberDialog } from "./MemberDialog";
import { LeaveMeter, LeaveStatusBadge, LeaveTypeBadge, MemberStatusBadge } from "./TeamBadges";

type Dialog =
  | { kind: "none" }
  | { kind: "member"; member: TeamMember | null }
  | { kind: "leave" }
  | { kind: "attendance" };

export function TeamDashboard() {
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [month, setMonth] = useState(currentMonth());

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const members = useMemo(() => state?.members ?? [], [state]);
  const requests = useMemo(() => state?.requests ?? [], [state]);
  const attendance = useMemo<AttendanceRecord[]>(() => state?.attendance ?? [], [state]);
  const storeError = state?.error ?? null;

  const today = todayISO();
  const active = members.filter((m) => m.status === "active");
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  const payroll = active.reduce((sum, m) => sum + (m.monthlySalary || 0), 0);
  const daysThisMonth = active.reduce(
    (sum, m) => sum + daysAttendedInMonth(m.id, attendance, month),
    0,
  );
  const onLeaveToday = members.filter((m) =>
    requests.some((r) => r.memberId === m.id && isOnLeaveOn(r, today)),
  );

  const nameOf = (memberId: string) =>
    members.find((m) => m.id === memberId)?.name ?? "Removed member";

  function handleDeleteMember(member: TeamMember) {
    if (
      !window.confirm(
        `Remove ${member.name} from the team? Their leave and attendance history goes too.`,
      )
    ) {
      return;
    }
    removeMember(member.id);
    setDialog({ kind: "none" });
  }

  function decide(request: LeaveRequest, status: "approved" | "rejected") {
    const note = window.prompt(
      `${status === "approved" ? "Approving" : "Rejecting"} ${nameOf(request.memberId)}'s leave. Add a note (optional):`,
      "",
    );
    if (note === null) return;
    decideLeave(request.id, status, note, todayISO());
  }

  function exportCsv() {
    const headers = [
      "Name", "Role", "Phone", "Email", "Joined", "Status", "Monthly salary",
      `Days attended (${month})`, "Total days attended", "Paid leave used",
      "Paid leave allowance", `Unpaid days (${month})`, `Payable (${month})`, "Notes",
    ];
    const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(quote).join(",")];

    members.forEach((m) => {
      const pay = payableThisMonth(m, requests, month);
      lines.push(
        [
          m.name, m.role, m.phone, m.email, formatDate(m.joiningDate), m.status,
          m.monthlySalary, daysAttendedInMonth(m.id, attendance, month),
          totalDaysAttended(m.id, attendance), paidLeaveUsed(m.id, requests),
          m.leaveAllowance, pay.unpaidDays, pay.payable, m.notes,
        ].map(quote).join(","),
      );
    });

    lines.push("");
    lines.push(["Leave requests"].map(quote).join(","));
    lines.push(["Member", "Type", "From", "To", "Days", "Status", "Applied", "Reason", "Decision note"].map(quote).join(","));
    requests.forEach((r) => {
      lines.push(
        [
          nameOf(r.memberId), LEAVE_TYPES[r.type], formatDate(r.fromDate), formatDate(r.toDate),
          leaveDays(r), r.status, formatDate(r.appliedOn), r.reason, r.decisionNote,
        ].map(quote).join(","),
      );
    });

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flybit-team-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const tiles = [
    { label: "Team size", value: String(active.length), note: `${members.length - active.length} inactive` },
    { label: "Monthly payroll", value: formatCompactMoney(payroll), note: "active members" },
    { label: "Days attended", value: formatNumber(daysThisMonth), note: formatMonth(month) },
    { label: "Leave requests", value: String(pending.length), note: pending.length > 0 ? "waiting on you" : "nothing pending" },
    { label: "On leave today", value: String(onLeaveToday.length), note: onLeaveToday.map((m) => m.name.split(" ")[0]).join(", ") || "everyone in" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        subtitle="Team — salary, attendance and leave"
        actions={
          <>
            <Link
              href="/settings"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "attendance" })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Record attendance
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "leave" })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Apply for leave
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "member", member: null })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + Add member
            </button>
          </>
        }
      />

      {storeError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {storeError}
        </div>
      )}

      {!ready ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm text-neutral-500">
          Loading the team from Firebase…
        </div>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1"
          >
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div className="tnum mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                  {tile.value}
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          {/* Anything waiting on a decision comes first. */}
          <section>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Leave requests
              </h2>
              <span className="text-xs text-neutral-500">
                {pending.length} pending · {decided.length} decided
              </span>
            </div>

            {requests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-500">
                No leave applied for yet. Use <strong>Apply for leave</strong> above.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pending.map((request) => (
                      <article
                        key={request.id}
                        className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold tracking-tight text-neutral-900">
                              {nameOf(request.memberId)}
                            </h3>
                            <p className="tnum mt-0.5 font-mono text-xs text-neutral-600">
                              {describeRange(request)} · {leaveDays(request)} day
                              {leaveDays(request) === 1 ? "" : "s"}
                            </p>
                          </div>
                          <LeaveTypeBadge type={request.type} />
                        </div>

                        {request.reason && (
                          <p className="mt-2 text-sm text-neutral-600">{request.reason}</p>
                        )}

                        <div className="mt-3 flex items-center gap-2 border-t border-amber-200/70 pt-3">
                          <button
                            type="button"
                            onClick={() => decide(request, "approved")}
                            className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(request, "rejected")}
                            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                          >
                            Reject
                          </button>
                          <span className="ml-auto text-[11px] text-neutral-500">
                            applied {formatDate(request.appliedOn)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {decided.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-neutral-200 bg-neutral-50">
                            {["Member", "Type", "Dates", "Days", "Status", "Decision", ""].map((h) => (
                              <th
                                key={h}
                                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {decided.map((request) => (
                            <tr
                              key={request.id}
                              className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                            >
                              <td className="px-3 py-2.5 text-sm font-medium text-neutral-900">
                                {nameOf(request.memberId)}
                              </td>
                              <td className="px-3 py-2.5">
                                <LeaveTypeBadge type={request.type} />
                              </td>
                              <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-sm text-neutral-600">
                                {describeRange(request)}
                              </td>
                              <td className="tnum px-3 py-2.5 font-mono text-sm">
                                {leaveDays(request)}
                              </td>
                              <td className="px-3 py-2.5">
                                <LeaveStatusBadge status={request.status} />
                              </td>
                              <td className="max-w-64 px-3 py-2.5">
                                <p className="truncate text-xs text-neutral-500" title={request.decisionNote}>
                                  {request.decisionNote || "—"}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeLeave(request.id)}
                                  className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-500 hover:border-red-300 hover:text-red-600"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Team
              </h2>
              <label className="flex items-center gap-2 text-xs text-neutral-500">
                Showing attendance for
                <select
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  {recentMonths().map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      {[
                        "Name / role", "Contact", "Joined", "Monthly salary",
                        `Days in ${formatMonth(month).split(" ")[0]}`, "Total days",
                        "Paid leave", "Payable", "Status", "",
                      ].map((h, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center">
                          <p className="font-medium text-neutral-900">No team members yet</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            Add your first person to start tracking salary, attendance and leave.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      members.map((member) => {
                        const pay = payableThisMonth(member, requests, month);
                        const used = paidLeaveUsed(member.id, requests);
                        const onLeave = requests.some(
                          (r) => r.memberId === member.id && isOnLeaveOn(r, today),
                        );
                        return (
                          <tr
                            key={member.id}
                            className={`border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 ${
                              member.status === "inactive" ? "text-neutral-500" : ""
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-neutral-900">{member.name}</div>
                              <div className="text-xs text-neutral-500">
                                {member.role || "—"}
                                {onLeave && (
                                  <span className="ml-1.5 font-medium text-amber-700">
                                    · on leave today
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="tnum font-mono text-xs text-neutral-600">
                                {member.phone || "—"}
                              </div>
                              <div className="truncate text-xs text-neutral-500">{member.email}</div>
                            </td>
                            <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-sm text-neutral-600">
                              {formatDate(member.joiningDate)}
                            </td>
                            <td className="tnum px-3 py-2.5 font-mono text-sm">
                              {formatMoney(member.monthlySalary)}
                            </td>
                            <td className="tnum px-3 py-2.5 font-mono text-sm">
                              {daysAttendedInMonth(member.id, attendance, month)}
                            </td>
                            <td className="tnum px-3 py-2.5 font-mono text-sm text-neutral-600">
                              {totalDaysAttended(member.id, attendance)}
                            </td>
                            <td className="px-3 py-2.5">
                              <LeaveMeter used={used} allowance={member.leaveAllowance} />
                            </td>
                            <td className="tnum px-3 py-2.5 font-mono text-sm">
                              {formatMoney(pay.payable)}
                              {pay.unpaidDays > 0 && (
                                <div className="text-[11px] text-neutral-500">
                                  −{formatCompactMoney(pay.deduction)} · {pay.unpaidDays} unpaid
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <MemberStatusBadge status={member.status} />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "member", member })}
                                className="rounded-md border border-transparent px-2 py-1 text-xs text-neutral-600 hover:border-neutral-300 hover:bg-white hover:text-neutral-900"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {payroll > 0 && (
                <div className="tnum border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-right font-mono text-xs text-neutral-600">
                  Payroll for {formatMonth(month)}:{" "}
                  <span className="font-semibold text-neutral-900">
                    {formatMoney(
                      active.reduce((sum, m) => sum + payableThisMonth(m, requests, month).payable, 0),
                    )}
                  </span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <footer className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        Synced to Firebase ({process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}) · Amounts in INR ·
        Paid leave counts against the calendar year
      </footer>

      {dialog.kind === "member" && (
        <MemberDialog
          key={dialog.member?.id ?? "new"}
          member={dialog.member}
          onSave={(draft, id) => {
            upsertMember(draft, id);
            setDialog({ kind: "none" });
          }}
          onDelete={handleDeleteMember}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "leave" && (
        <LeaveDialog
          members={members}
          requests={requests}
          onApply={(draft) => {
            applyForLeave(draft);
            setDialog({ kind: "none" });
          }}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "attendance" && (
        <AttendanceDialog
          members={members}
          attendance={attendance}
          requests={requests}
          month={month}
          onMonthChange={setMonth}
          onSave={(memberId, daysPresent) =>
            saveAttendance({ memberId, month, daysPresent, notes: "" })
          }
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
