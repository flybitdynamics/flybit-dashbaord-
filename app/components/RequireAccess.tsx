"use client";

import Link from "next/link";
import { MODULES, MODULE_KEYS, Module } from "../lib/permissions";
import { useAuth } from "./AuthProvider";

const HREFS: Partial<Record<Module, string>> = {
  shows: "/",
  calendar: "/calendar",
  clients: "/clients",
  pilots: "/pilots",
  finance: "/finance",
  team: "/team",
  settings: "/settings",
};

/** Shows the page only to people whose role can view it; everyone else gets
 *  the places they can go instead. */
export function RequireAccess({ module, children }: { module: Module; children: React.ReactNode }) {
  const { can, role, isSuperAdmin } = useAuth();
  if (can(module, "view")) return <>{children}</>;

  const elsewhere = MODULE_KEYS.filter((m) => HREFS[m] && can(m, "view"));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
        {MODULES[module].label} is not part of your role
      </h1>
      <p className="text-sm text-neutral-500">
        {isSuperAdmin
          ? "This should not happen for a super admin — reload the page."
          : `You are signed in as ${role?.name ?? "a role that no longer exists"}. Ask the super admin if you need access.`}
      </p>
      {elsewhere.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {elsewhere.map((m) => (
            <Link
              key={m}
              href={HREFS[m]!}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              {MODULES[m].label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
