"use client";

import { useState } from "react";
import {
  LEAVE_TYPES,
  LeaveRequest,
  LeaveType,
  TeamMember,
  emptyLeaveRequest,
  leaveDays,
  paidLeaveUsed,
} from "../../lib/team";
import { Field, Modal, inputClass } from "../Modal";

/** The team member applies here. There is no per-person login, so who is
 *  applying is chosen from the list. */
export function LeaveDialog({
  members,
  requests,
  onApply,
  onClose,
}: {
  members: TeamMember[];
  requests: LeaveRequest[];
  onApply: (draft: Omit<LeaveRequest, "id">) => void;
  onClose: () => void;
}) {
  const active = members.filter((m) => m.status === "active");
  const [draft, setDraft] = useState<Omit<LeaveRequest, "id">>(() =>
    emptyLeaveRequest(active[0]?.id ?? ""),
  );

  const set = <K extends keyof Omit<LeaveRequest, "id">>(
    key: K,
    value: Omit<LeaveRequest, "id">[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const member = members.find((m) => m.id === draft.memberId) ?? null;
  const days = leaveDays(draft);
  const badRange = draft.toDate < draft.fromDate;

  const used = member ? paidLeaveUsed(member.id, requests) : 0;
  const remaining = member ? member.leaveAllowance - used : 0;
  const wouldExceed =
    member !== null && draft.type !== "unpaid" && days > remaining && member.leaveAllowance > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.memberId || badRange || days === 0) return;
    onApply(draft);
  }

  return (
    <Modal
      title="Apply for leave"
      subtitle="Goes to the admin as a pending request."
      onClose={onClose}
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {badRange
              ? "End date is before the start date"
              : `${days} day${days === 1 ? "" : "s"}`}
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
              form="leave-form"
              disabled={!draft.memberId || badRange || days === 0}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              Submit request
            </button>
          </div>
        </>
      }
    >
      <form
        id="leave-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        {active.length === 0 && (
          <p className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Add a team member first — there is nobody to apply on behalf of.
          </p>
        )}

        <Field label="Who is applying" htmlFor="l-member">
          <select
            id="l-member"
            className={inputClass}
            value={draft.memberId}
            onChange={(e) => set("memberId", e.target.value)}
          >
            <option value="">Select…</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.role ? ` — ${m.role}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Leave type" htmlFor="l-type">
          <select
            id="l-type"
            className={inputClass}
            value={draft.type}
            onChange={(e) => set("type", e.target.value as LeaveType)}
          >
            {(Object.keys(LEAVE_TYPES) as LeaveType[]).map((key) => (
              <option key={key} value={key}>
                {LEAVE_TYPES[key]}
                {key === "unpaid" ? " (deducted from salary)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From" htmlFor="l-from">
          <input
            id="l-from"
            type="date"
            required
            className={inputClass}
            value={draft.fromDate}
            onChange={(e) => set("fromDate", e.target.value)}
          />
        </Field>

        <Field label="To" htmlFor="l-to">
          <input
            id="l-to"
            type="date"
            required
            className={inputClass}
            value={draft.toDate}
            onChange={(e) => set("toDate", e.target.value)}
          />
        </Field>

        {member && (
          <p
            className={`sm:col-span-2 rounded-md border px-3 py-2 text-sm ${
              wouldExceed
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-neutral-200 bg-neutral-50 text-neutral-600"
            }`}
          >
            {member.name} has used <strong>{used}</strong> of{" "}
            <strong>{member.leaveAllowance}</strong> paid days this year.{" "}
            {draft.type === "unpaid"
              ? "Unpaid leave does not touch that allowance."
              : wouldExceed
                ? `This request is ${days} day${days === 1 ? "" : "s"} and would go past it — the admin can still approve.`
                : `${remaining} day${remaining === 1 ? "" : "s"} left.`}
          </p>
        )}

        <Field label="Reason" htmlFor="l-reason" wide>
          <textarea
            id="l-reason"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="Family function in Surat"
          />
        </Field>
      </form>
    </Modal>
  );
}
