"use client";

import { useEffect, useState } from "react";
import { DeviceSession, ONLINE_MS, currentSessionId, revokeSession, watchSessions } from "../../lib/sessions";
import { useAuth } from "../AuthProvider";

const stamp = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function seenLabel(iso: string, now: number): { text: string; online: boolean } {
  const ago = now - new Date(iso).getTime();
  if (ago < ONLINE_MS) return { text: "Active now", online: true };
  const minutes = Math.round(ago / 60_000);
  if (minutes < 60) return { text: `Last seen ${minutes} min ago`, online: false };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { text: `Last seen ${hours} h ago`, online: false };
  return { text: `Last seen ${stamp.format(new Date(iso))}`, online: false };
}

function DeviceIcon({ device }: { device: string }) {
  const phone = /iPhone|Android phone/.test(device);
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {phone ? (
          <>
            <rect x="6" y="2.5" width="8" height="15" rx="1.8" />
            <path d="M9 15h2" />
          </>
        ) : (
          <>
            <rect x="3" y="4" width="14" height="9.5" rx="1.5" />
            <path d="M1.8 16.5h16.4" />
          </>
        )}
      </svg>
    </span>
  );
}

/** The browsers someone is signed in on, with a way to sign each one out.
 *  `everyone` is the super admin's view of every account's devices. */
export function ActiveSessions({ everyone = false }: { everyone?: boolean }) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? "";
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const thisOne = uid ? currentSessionId(uid) : null;

  useEffect(() => {
    if (!uid) return;
    return watchSessions(everyone ? null : uid, setSessions, setError);
  }, [uid, everyone]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const by = profile?.name || profile?.email || "the account owner";
  const byLabel = everyone && !sessions.every((s) => s.uid === uid) ? `${by} (super admin)` : by;

  async function end(targets: DeviceSession[], question: string) {
    if (!targets.length || !window.confirm(question)) return;
    try {
      await Promise.all(targets.map((s) => revokeSession(s.id, s.uid === uid ? by : byLabel)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign that device out.");
    }
  }

  /* The super admin sees devices grouped under each person. */
  const groups = everyone
    ? [...new Map(sessions.map((s) => [s.uid, s.name || s.email])).entries()]
        .map(([id, name]) => ({ id, name, list: sessions.filter((s) => s.uid === id) }))
        .sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : a.name.localeCompare(b.name)))
    : [{ id: uid, name: "", list: sessions }];
  const others = sessions.filter((s) => s.uid === uid && s.id !== thisOne);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
            {everyone ? "Active devices — everyone" : "Where you are signed in"}
          </h2>
          <p className="text-xs text-neutral-500">
            {everyone
              ? "Every browser signed in to the desk. Signing one out takes effect on that device within moments."
              : "Sign out a device you no longer use, or one you do not recognise."}
          </p>
        </div>
        {!everyone && others.length > 0 && (
          <button
            type="button"
            onClick={() => void end(others, `Sign out of ${others.length} other device${others.length === 1 ? "" : "s"}?`)}
            className="rounded-md bg-white px-3 py-1.5 text-sm text-red-600 ring-1 ring-neutral-200 hover:bg-red-50"
          >
            Sign out all other devices
          </button>
        )}
      </div>

      {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {sessions.length === 0 && !error ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-500">No devices recorded yet.</p>
      ) : (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.id} className="border-b border-neutral-100 last:border-b-0">
              {everyone && (
                <div className="flex items-center gap-2 bg-neutral-50/60 px-4 py-2">
                  <span className="mr-auto text-sm font-semibold text-neutral-900">
                    {group.name}
                    {group.id === uid && <span className="ml-1.5 text-xs font-normal text-neutral-500">(you)</span>}
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      {group.list.length} device{group.list.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {group.id !== uid && group.list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void end(group.list, `Sign ${group.name} out of all ${group.list.length} devices?`)}
                      className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Sign out everywhere
                    </button>
                  )}
                </div>
              )}
              <ul className="divide-y divide-neutral-100">
                {group.list.map((s) => {
                  const seen = seenLabel(s.lastSeen, now);
                  const mine = s.id === thisOne;
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <DeviceIcon device={s.device} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-neutral-900">
                            {s.browser} on {s.device}
                          </span>
                          {mine && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              THIS DEVICE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">
                          <span className={seen.online ? "font-medium text-emerald-700" : ""}>
                            {seen.online && <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" />}
                            {seen.text}
                          </span>
                          {" · signed in "}
                          {stamp.format(new Date(s.signedInAt))}
                          {everyone && s.email ? ` · ${s.email}` : ""}
                        </div>
                      </div>
                      {!mine && (
                        <button
                          type="button"
                          onClick={() =>
                            void end([s], `Sign ${s.uid === uid ? "this device" : s.name || "this person"} out of ${s.browser} on ${s.device}?`)
                          }
                          className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm text-red-600 ring-1 ring-neutral-200 hover:bg-red-50"
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
