"use client";

import { useState } from "react";
import { deleteRole, describeAuthError, saveRole } from "../../lib/auth";
import {
  ACTION_LABELS,
  Action,
  MODULES,
  MODULE_KEYS,
  Role,
  UserProfile,
  emptyMatrix,
} from "../../lib/permissions";
import { Field, Modal, inputClass } from "../Modal";

const ACTIONS: Action[] = ["view", "create", "edit", "delete"];

function RoleEditor({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Role>(
    () => role ?? { id: "", name: "", description: "", permissions: emptyMatrix() },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(module: (typeof MODULE_KEYS)[number], action: Action) {
    setDraft((prev) => {
      const row = { ...(prev.permissions[module] ?? {}) };
      row[action] = !row[action];
      // Anything you can change, you must be able to see.
      if (action !== "view" && row[action]) row.view = true;
      if (action === "view" && !row.view) for (const a of ACTIONS) row[a] = false;
      return { ...prev, permissions: { ...prev.permissions, [module]: row } };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Give the role a name.");
    const id =
      draft.id ||
      draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `role-${Date.now()}`;
    setBusy(true);
    setError(null);
    try {
      await saveRole({ ...draft, id, name: draft.name.trim(), description: draft.description.trim() });
      onClose();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? `Edit ${role.name}` : "New role"} subtitle="Tick what people with this role may do. Changes apply the moment you save."
      onClose={onClose} width="max-w-3xl"
      footer={
        <>
          <span className="text-xs text-neutral-500">Giving Add, Edit or Delete turns on View too.</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200">Cancel</button>
            <button type="submit" form="role-form" disabled={busy}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
              {busy ? "Saving…" : "Save role"}
            </button>
          </div>
        </>
      }>
      <form id="role-form" onSubmit={submit} className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto p-5">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Role name" htmlFor="r-name">
            <input id="r-name" required autoFocus className={inputClass} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Operations" />
          </Field>
          <Field label="What it is for" htmlFor="r-desc">
            <input id="r-desc" className={inputClass} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Books shows and files paperwork" />
          </Field>
        </div>

        <div className="overflow-hidden rounded-xl bg-neutral-50">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-200/70">
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Area</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    {ACTION_LABELS[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULE_KEYS.map((module) => {
                const offered = MODULES[module].actions as readonly Action[];
                return (
                  <tr key={module} className="row-line">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-neutral-900">{MODULES[module].label}</div>
                      <div className="text-[11px] text-neutral-500">{MODULES[module].hint}</div>
                    </td>
                    {ACTIONS.map((action) => (
                      <td key={action} className="px-3 py-2 text-center">
                        {offered.includes(action) ? (
                          <input type="checkbox" aria-label={`${ACTION_LABELS[action]} ${MODULES[module].label}`}
                            className="size-4 accent-neutral-900"
                            checked={draft.permissions[module]?.[action] === true}
                            onChange={() => toggle(module, action)} />
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </form>
    </Modal>
  );
}

export function RolesPanel({ roles, people }: { roles: Role[]; people: UserProfile[] }) {
  const [editing, setEditing] = useState<Role | null | "new">(null);
  const [message, setMessage] = useState<string | null>(null);

  const holders = (id: string) => people.filter((p) => !p.superAdmin && p.roleId === id).length;

  function summary(role: Role): string {
    const parts = MODULE_KEYS.flatMap((module) => {
      const row = role.permissions[module];
      if (!row?.view) return [];
      const changes = (["create", "edit", "delete"] as Action[]).filter((a) => row[a]);
      return [changes.length ? `${MODULES[module].label} (${changes.map((a) => ACTION_LABELS[a].toLowerCase()).join(", ")})` : MODULES[module].label];
    });
    return parts.length ? parts.join(" · ") : "No access";
  }

  async function remove(role: Role) {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    try {
      await deleteRole(role.id);
      setMessage(`${role.name} deleted.`);
    } catch (e) {
      setMessage(describeAuthError(e));
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">Roles & permissions</h2>
          <p className="text-xs text-neutral-500">What each role can see and change. The super admin always has everything.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
          + New role
        </button>
      </div>

      {message && <p className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-600">{message}</p>}

      <div>
        {roles.map((role) => {
          const count = holders(role.id);
          return (
            <div key={role.id} className="row-line flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">{role.name}</span>
                  <span className="text-xs text-neutral-400">{count} {count === 1 ? "person" : "people"}</span>
                </div>
                {role.description && <p className="text-xs text-neutral-500">{role.description}</p>}
                <p className="mt-1 text-[11px] text-neutral-500">{summary(role)}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setEditing(role)} className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                  Edit permissions
                </button>
                <button type="button" disabled={count > 0} onClick={() => remove(role)}
                  title={count > 0 ? "Move its people to another role first" : undefined}
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent">
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && <RoleEditor role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
