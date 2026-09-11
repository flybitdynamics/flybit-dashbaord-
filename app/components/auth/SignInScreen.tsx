"use client";

import Image from "next/image";
import { useState } from "react";
import {
  AuthState,
  describeAuthError,
  sendReset,
  setUpSuperAdmin,
  signIn,
  signOut,
} from "../../lib/auth";

type Mode = "sign-in" | "setup" | "reset";

const input =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900";
const label = "mb-1 block text-xs font-medium text-neutral-700";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm shadow-neutral-900/5">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo-on-light.png"
            alt="FLYBIT Dynamics"
            width={666}
            height={276}
            priority
            className="mb-3 h-10 w-auto"
          />
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
          <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Signed in, but the desk has no profile for this account, or it is off. */
function Blocked({ state }: { state: AuthState }) {
  const disabled = state.status === "disabled";
  return (
    <Shell
      title={disabled ? "Access turned off" : "No access yet"}
      subtitle={state.user?.email ?? ""}
    >
      <p className="mt-6 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
        {disabled
          ? "The super admin has turned off this account. Ask them to turn it back on."
          : "This login works, but it has not been given access to the desk. Ask the super admin to add you under Settings → People."}
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-4 w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Sign out
      </button>
    </Shell>
  );
}

export function SignInScreen({ state }: { state: AuthState }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");

  if (state.status === "no-profile" || state.status === "disabled") return <Blocked state={state} />;

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    run(() => signIn(email, password));
  }

  function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Choose a password of at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    run(() => setUpSuperAdmin({ name, email, employeeId, phone }, password));
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await sendReset(email);
      setNotice("If that email has an account, a link to reset the password is on its way.");
    });
  }

  const titles: Record<Mode, [string, string]> = {
    "sign-in": ["Sign in to FlyBit Desk", "Use the email and password the super admin gave you"],
    setup: ["Set up the desk", "Create the super admin — the one account that manages people and roles"],
    reset: ["Reset your password", "We will email you a link to choose a new one"],
  };

  return (
    <Shell title={titles[mode][0]} subtitle={titles[mode][1]}>
      {mode === "sign-in" && state.setupNeeded && (
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex-1">Nobody has set up this desk yet.</span>
          <button
            type="button"
            onClick={() => go("setup")}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Set up
          </button>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">{error}</div>
      )}
      {notice && (
        <div className="mt-5 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{notice}</div>
      )}

      {mode === "sign-in" && (
        <form onSubmit={submitSignIn} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="si-email" className={label}>Email</label>
            <input id="si-email" type="email" required autoFocus autoComplete="username" className={input}
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@flybitdynamics.com" />
          </div>
          <div>
            <label htmlFor="si-password" className={label}>Password</label>
            <input id="si-password" type="password" required autoComplete="current-password" className={input}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}
            className="mt-1 w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => go("reset")} className="text-xs text-neutral-500 hover:text-neutral-900">
            Forgot password?
          </button>
        </form>
      )}

      {mode === "setup" && (
        <form onSubmit={submitSetup} className="mt-6 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="su-name" className={label}>Your name</label>
            <input id="su-name" required autoFocus className={input} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Vivekkumar Patel" />
          </div>
          <div className="col-span-2">
            <label htmlFor="su-email" className={label}>Email — this is your sign-in</label>
            <input id="su-email" type="email" required autoComplete="username" className={input} value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="flybitdynamics@gmail.com" />
          </div>
          <div>
            <label htmlFor="su-id" className={label}>Employee ID</label>
            <input id="su-id" className={input} value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)} placeholder="FB-001" />
          </div>
          <div>
            <label htmlFor="su-phone" className={label}>Phone</label>
            <input id="su-phone" type="tel" className={input} value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="92274 28262" />
          </div>
          <div>
            <label htmlFor="su-pw" className={label}>Password</label>
            <input id="su-pw" type="password" required minLength={8} autoComplete="new-password" className={input}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="su-pw2" className={label}>Confirm password</label>
            <input id="su-pw2" type="password" required minLength={8} autoComplete="new-password" className={input}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="col-span-2 text-[11px] text-neutral-500">
            Also creates five starting roles — Admin, Operations, Accounts, Pilot and Viewer — which you
            can change later.
          </p>
          <button type="submit" disabled={busy}
            className="col-span-2 mt-1 w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
            {busy ? "Setting up…" : "Create super admin"}
          </button>
          <button type="button" onClick={() => go("sign-in")}
            className="col-span-2 text-xs text-neutral-500 hover:text-neutral-900">
            Back to sign in
          </button>
        </form>
      )}

      {mode === "reset" && (
        <form onSubmit={submitReset} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="rs-email" className={label}>Email</label>
            <input id="rs-email" type="email" required autoFocus className={input} value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}
            className="w-full rounded-md bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400">
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={() => go("sign-in")} className="text-xs text-neutral-500 hover:text-neutral-900">
            Back to sign in
          </button>
        </form>
      )}
    </Shell>
  );
}
