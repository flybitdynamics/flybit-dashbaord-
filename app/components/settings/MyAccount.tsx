"use client";

import { useState } from "react";
import { changeOwnPassword, describeAuthError } from "../../lib/auth";
import { useAuth } from "../AuthProvider";
import { Field, inputClass } from "../Modal";

export function MyAccount() {
  const { profile, role, isSuperAdmin } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setMessage({ ok: false, text: "Choose a password of at least 8 characters." });
    if (next !== confirm) return setMessage({ ok: false, text: "The two new passwords do not match." });
    setBusy(true);
    setMessage(null);
    try {
      await changeOwnPassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ ok: true, text: "Password changed." });
    } catch (err) {
      setMessage({ ok: false, text: describeAuthError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">My account</h2>
        <p className="text-xs text-neutral-500">
          {profile?.name} · {profile?.email} · {isSuperAdmin ? "Super admin" : role?.name ?? "No role"}
        </p>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-3">
        <Field label="Current password" htmlFor="ma-current">
          <input id="ma-current" type="password" required autoComplete="current-password" className={inputClass}
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="ma-next">
          <input id="ma-next" type="password" required minLength={8} autoComplete="new-password" className={inputClass}
            value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="ma-confirm">
          <input id="ma-confirm" type="password" required minLength={8} autoComplete="new-password" className={inputClass}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={busy}
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
            {busy ? "Changing…" : "Change password"}
          </button>
          {message && (
            <span className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</span>
          )}
        </div>
      </form>
    </section>
  );
}
