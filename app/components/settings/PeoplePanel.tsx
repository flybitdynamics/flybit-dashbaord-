"use client";

import { useState } from "react";
import { createUserAccount, describeAuthError, sendReset, updateUserProfile } from "../../lib/auth";
import { Role, UserProfile } from "../../lib/permissions";
import { useAuth } from "../AuthProvider";
import { Field, Modal, inputClass } from "../Modal";

/** 12 characters, no look-alikes (0/O, 1/l), so it can be read out loud. */
function temporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function AddPerson({
  roles,
  onClose,
}: {
  roles: Role[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState(roles.find((r) => r.id === "operations")?.id ?? roles[0]?.id ?? "");
  const [superAdmin, setSuperAdmin] = useState(false);
  const [password, setPassword] = useState(temporaryPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("The password needs at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      await createUserAccount({ name, email, employeeId: "", phone, roleId, superAdmin }, password);
      setDone(true);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal title="Person added" subtitle="Share these sign-in details with them privately." onClose={onClose}
        footer={
          <button type="button" onClick={onClose}
            className="ml-auto rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Done
          </button>
        }>
        <div className="flex flex-col gap-3 p-5">
          <div className="rounded-xl bg-neutral-50 p-4 font-mono text-sm">
            <div><span className="text-neutral-500">Email </span>{email}</div>
            <div><span className="text-neutral-500">Password </span>{password}</div>
          </div>
          <p className="text-xs text-neutral-500">
            They can change it after signing in, under Settings → My account. This password is not
            shown again.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a person" subtitle="Creates their login and decides what they can do." onClose={onClose}
      footer={
        <>
          <span className="text-xs text-neutral-500">They sign in with the email below.</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200">
              Cancel
            </button>
            <button type="submit" form="person-form" disabled={busy}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
              {busy ? "Adding…" : "Add person"}
            </button>
          </div>
        </>
      }>
      <form id="person-form" onSubmit={submit} className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <Field label="Name" htmlFor="pp-name">
          <input id="pp-name" required autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email (their sign-in)" htmlFor="pp-email">
          <input id="pp-email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <Field label="Phone" htmlFor="pp-phone">
          <input id="pp-phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="pp-role" hint={roles.find((r) => r.id === roleId)?.description}>
          <select id="pp-role" className={inputClass} value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={superAdmin}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Temporary password" htmlFor="pp-pw" hint="Shown once after adding — share it privately.">
          <div className="flex gap-2">
            <input id="pp-pw" required minLength={8} className={`${inputClass} font-mono`} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setPassword(temporaryPassword())}
              className="shrink-0 rounded-md bg-neutral-100 px-2.5 text-xs text-neutral-700 hover:bg-neutral-200">
              New
            </button>
          </div>
        </Field>
        <label className="flex items-start gap-2.5 rounded-xl bg-neutral-50 p-3 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-neutral-900" checked={superAdmin} onChange={(e) => setSuperAdmin(e.target.checked)} />
          <span>
            <span className="block font-medium">Make super admin</span>
            <span className="block text-xs text-neutral-500">
              Full access, and can add people and change roles. Give this to as few people as possible.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

export function PeoplePanel({ people, roles }: { people: UserProfile[]; roles: Role[] }) {
  const { profile } = useAuth();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: () => Promise<void>, done: string) {
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (e) {
      setMessage(describeAuthError(e));
    }
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "No role";

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">People</h2>
          <p className="text-xs text-neutral-500">Everyone who can sign in, and the role that decides what they can do.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
          + Add person
        </button>
      </div>

      {message && <p className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-600">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-100">
              {["Person", "Sign-in email", "Role", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const self = person.uid === profile?.uid;
              return (
                <tr key={person.uid} className="row-line">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{person.name || "—"}</span>
                      {person.superAdmin && (
                        <span className="rounded-md bg-neutral-900 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
                          Super admin
                        </span>
                      )}
                      {self && <span className="text-[11px] text-neutral-400">you</span>}
                    </div>
                    {person.phone && (
                      <div className="tnum font-mono text-xs text-neutral-500">{person.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-neutral-600">{person.email}</td>
                  <td className="px-4 py-2.5">
                    {person.superAdmin ? (
                      <span className="text-sm text-neutral-500">Everything</span>
                    ) : (
                      <select aria-label={`Role for ${person.name}`} value={person.roleId}
                        onChange={(e) => act(() => updateUserProfile(person.uid, { roleId: e.target.value }), `${person.name} is now ${roleName(e.target.value)}.`)}
                        className="rounded-md bg-neutral-100 px-2 py-1 text-sm">
                        {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${person.status === "active" ? "text-emerald-700" : "text-neutral-400"}`}>
                      {person.status === "active" ? "Active" : "Turned off"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button"
                        onClick={() => act(() => sendReset(person.email), `Password reset link sent to ${person.email}.`)}
                        className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                        Reset password
                      </button>
                      {!self && (
                        <>
                          <button type="button"
                            onClick={() => act(() => updateUserProfile(person.uid, { superAdmin: !person.superAdmin }),
                              person.superAdmin ? `${person.name} is no longer a super admin.` : `${person.name} is now a super admin.`)}
                            className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                            {person.superAdmin ? "Remove super admin" : "Make super admin"}
                          </button>
                          <button type="button"
                            onClick={() => act(() => updateUserProfile(person.uid, { status: person.status === "active" ? "disabled" : "active" }),
                              person.status === "active" ? `${person.name} can no longer sign in.` : `${person.name} can sign in again.`)}
                            className={`rounded-md px-2 py-1 text-xs ${person.status === "active" ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-100"}`}>
                            {person.status === "active" ? "Turn off" : "Turn on"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && <AddPerson roles={roles} onClose={() => setAdding(false)} />}
    </section>
  );
}
