"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, emptyExpense } from "../../lib/finance";
import { Show, formatMoney } from "../../lib/types";
import { TeamMember } from "../../lib/team";
import { Field, Modal, inputClass } from "../Modal";
import { FileUpload } from "../FileUpload";

type Draft = Omit<Expense, "id">;

function toDraft(expense: Expense | null): Draft {
  if (!expense) return emptyExpense();
  const { id: _id, ...rest } = expense;
  void _id;
  return rest;
}

export function ExpenseDialog({
  expense,
  shows,
  team = [],
  onSave,
  onDelete,
  canDelete = true,
  onClose,
}: {
  expense: Expense | null;
  shows: Show[];
  team?: TeamMember[];
  onSave: (draft: Draft, id: string | null) => void;
  onDelete: (expense: Expense) => void;
  canDelete?: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(expense));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.amount || draft.amount <= 0) return;
    onSave({ ...draft, description: draft.description.trim() }, expense?.id ?? null);
  }

  return (
    <Modal
      title={expense ? "Edit expense" : "Add expense"}
      subtitle="Salary and commission are worked out automatically — record everything else here."
      onClose={onClose}
      footer={
        <>
          <span className="tnum font-mono text-xs text-neutral-600">
            {draft.amount > 0 ? formatMoney(draft.amount) : "No amount"}
          </span>
          <div className="ml-auto flex gap-2">
            {expense && canDelete && (
              <button
                type="button"
                onClick={() => onDelete(expense)}
                className="rounded-md bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="expense-form"
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Save expense
            </button>
          </div>
        </>
      }
    >
      <form
        id="expense-form"
        onSubmit={submit}
        className="grid max-h-[65vh] grid-cols-1 gap-3.5 overflow-y-auto p-5 sm:grid-cols-2"
      >
        <Field label="Amount (₹)" htmlFor="e-amount">
          <input
            id="e-amount"
            type="number"
            min={0}
            step={100}
            required
            className={inputClass}
            value={draft.amount || ""}
            onChange={(e) => set("amount", Number(e.target.value) || 0)}
            placeholder="12000"
          />
        </Field>

        <Field label="Date" htmlFor="e-date">
          <input
            id="e-date"
            type="date"
            className={inputClass}
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </Field>

        <Field label="Category" htmlFor="e-category">
          <select
            id="e-category"
            className={inputClass}
            value={draft.category}
            onChange={(e) => set("category", e.target.value as ExpenseCategory)}
          >
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {EXPENSE_CATEGORIES[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Against a show"
          htmlFor="e-show"
          hint="Leave blank for general overheads."
        >
          <select
            id="e-show"
            className={inputClass}
            value={draft.showId}
            onChange={(e) => set("showId", e.target.value)}
          >
            <option value="">General overhead</option>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.location} — {show.client || "no client"} ({show.showDate})
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Paid to / Employee"
          htmlFor="e-paidto"
          hint="Employee or vendor who received the payment."
        >
          <input
            id="e-paidto"
            list="team-members-list"
            className={inputClass}
            value={draft.paidTo || ""}
            onChange={(e) => set("paidTo", e.target.value)}
            placeholder="Select employee or type name"
          />
          <datalist id="team-members-list">
            {team.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name} ({m.role})
              </option>
            ))}
          </datalist>
        </Field>

        <Field label="Description" htmlFor="e-desc" wide>
          <input
            id="e-desc"
            className={inputClass}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Van hire to Bharuch and back"
          />
        </Field>

        <div className="sm:col-span-2 pt-2 border-t border-neutral-100">
          <FileUpload
            label="Attach Receipt / Invoice Document (Cloudflare R2)"
            folder="CRM"
            initialUrl={draft.receiptUrl || ""}
            onUploadComplete={(url) => set("receiptUrl", url)}
            onRemove={() => set("receiptUrl", "")}
          />
        </div>
      </form>
    </Modal>
  );
}
