"use client";

import { useState } from "react";
import {
  MEMBER_STATUSES,
  MemberStatus,
  TeamMember,
  emptyMember,
} from "../../lib/team";
import { formatMoney } from "../../lib/types";
import { Field, Modal, inputClass } from "../Modal";

type Draft = Omit<TeamMember, "id">;

function toDraft(member: TeamMember | null): Draft {
  if (!member) return emptyMember();
  const { id: _id, ...rest } = member;
  void _id;
  return rest;
}

export function MemberDialog({
  member,
  onSave,
  onDelete,
  onClose,
}: {
  member: TeamMember | null;
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (member: TeamMember) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(member));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), role: draft.role.trim() }, member?.id ?? null);
  }

  return (
    <Modal
      title={member ? "Edit team member" : "Add team member"}
      subtitle="Attendance and leave are recorded separately."
      onClose={onClose}
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {draft.monthlySalary > 0
              ? `${formatMoney(draft.monthlySalary)} per month`
              : "Salary not set"}
          </span>
          <div className="ml-auto flex gap-2">
            {member && (
              <button
                type="button"
                onClick={() => onDelete(member)}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:border-red-400"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="member-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save member
            </button>
          </div>
        </>
      }
    >
      <form
        id="member-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        <Field label="Name" htmlFor="m-name">
          <input
            id="m-name"
            required
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Jehan Patel"
          />
        </Field>

        <Field label="Role" htmlFor="m-role">
          <input
            id="m-role"
            className={inputClass}
            value={draft.role}
            onChange={(e) => set("role", e.target.value)}
            placeholder="Pilot in command"
          />
        </Field>

        <Field label="Phone" htmlFor="m-phone">
          <input
            id="m-phone"
            className={inputClass}
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+91 98250 00000"
          />
        </Field>

        <Field label="Email" htmlFor="m-email">
          <input
            id="m-email"
            type="email"
            className={inputClass}
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@flybitdynamics.com"
          />
        </Field>

        <Field label="Joining date" htmlFor="m-joined">
          <input
            id="m-joined"
            type="date"
            className={inputClass}
            value={draft.joiningDate}
            onChange={(e) => set("joiningDate", e.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="m-status">
          <select
            id="m-status"
            className={inputClass}
            value={draft.status}
            onChange={(e) => set("status", e.target.value as MemberStatus)}
          >
            {(Object.keys(MEMBER_STATUSES) as MemberStatus[]).map((key) => (
              <option key={key} value={key}>
                {MEMBER_STATUSES[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Monthly salary (₹)" htmlFor="m-salary">
          <input
            id="m-salary"
            type="number"
            min={0}
            step={1000}
            className={inputClass}
            value={draft.monthlySalary || ""}
            onChange={(e) => set("monthlySalary", Number(e.target.value) || 0)}
            placeholder="35000"
          />
        </Field>

        <Field
          label="Paid leave per year"
          htmlFor="m-allowance"
          hint="Casual and sick leave come out of this. Unpaid leave does not."
        >
          <input
            id="m-allowance"
            type="number"
            min={0}
            className={inputClass}
            value={draft.leaveAllowance || ""}
            onChange={(e) => set("leaveAllowance", Number(e.target.value) || 0)}
            placeholder="12"
          />
        </Field>

        <Field label="Notes" htmlFor="m-notes" wide>
          <textarea
            id="m-notes"
            rows={3}
            className={`${inputClass} resize-y`}
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="DGCA certificate number, emergency contact, anything worth remembering"
          />
        </Field>
      </form>
    </Modal>
  );
}
