"use client";

import { useState } from "react";
import {
  AttendanceRecord,
  TeamMember,
  daysAttendedInMonth,
  daysInMonth,
  formatMonth,
  recentMonths,
  unpaidLeaveInMonth,
} from "../../lib/team";
import { LeaveRequest } from "../../lib/team";
import { Modal, inputClass, labelClass } from "../Modal";

/** Days worked, one month at a time, for the whole team at once. */
export function AttendanceDialog({
  members,
  attendance,
  requests,
  month,
  onMonthChange,
  onSave,
  onClose,
}: {
  members: TeamMember[];
  attendance: AttendanceRecord[];
  requests: LeaveRequest[];
  month: string;
  onMonthChange: (month: string) => void;
  onSave: (memberId: string, daysPresent: number) => void;
  onClose: () => void;
}) {
  const active = members.filter((m) => m.status === "active");
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(active.map((m) => [m.id, daysAttendedInMonth(m.id, attendance, month)])),
  );

  const total = daysInMonth(month);

  function changeMonth(next: string) {
    onMonthChange(next);
    setDraft(
      Object.fromEntries(active.map((m) => [m.id, daysAttendedInMonth(m.id, attendance, next)])),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    for (const member of active) {
      onSave(member.id, draft[member.id] ?? 0);
    }
    onClose();
  }

  return (
    <Modal
      title="Record attendance"
      subtitle={`Days each person worked in ${formatMonth(month)} — ${total} days in the month.`}
      onClose={onClose}
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {active.length} active member{active.length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="attendance-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save attendance
            </button>
          </div>
        </>
      }
    >
      <form id="attendance-form" onSubmit={submit} className="max-h-[65vh] overflow-y-auto p-5">
        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="a-month" className={labelClass}>
            Month
          </label>
          <select
            id="a-month"
            className={`${inputClass} sm:max-w-56`}
            value={month}
            onChange={(e) => changeMonth(e.target.value)}
          >
            {recentMonths().map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>

        {active.length === 0 ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
            No active team members yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50">
                  {["Member", "Days present", "Unpaid leave", "Not worked"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((member) => {
                  const present = draft[member.id] ?? 0;
                  const unpaid = unpaidLeaveInMonth(member.id, requests, month);
                  return (
                    <tr key={member.id} className="border-b border-neutral-100 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{member.name}</div>
                        <div className="text-xs text-neutral-500">{member.role}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={total}
                          aria-label={`Days present for ${member.name}`}
                          className={`${inputClass} max-w-24`}
                          value={present || ""}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [member.id]: Math.min(total, Number(e.target.value) || 0),
                            }))
                          }
                        />
                      </td>
                      <td className="tnum px-3 py-2 font-mono text-neutral-600">
                        {unpaid > 0 ? `${unpaid} day${unpaid === 1 ? "" : "s"}` : "—"}
                      </td>
                      <td className="tnum px-3 py-2 font-mono text-neutral-500">
                        {Math.max(0, total - present)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </form>
    </Modal>
  );
}
