 "use client";

import { useEffect, useState } from "react";
import { watchPeople } from "../../lib/auth";
import { DEFAULT_ROLES, Role, UserProfile } from "../../lib/permissions";
import { useAuth } from "../AuthProvider";
import { SettingsForm } from "../SettingsForm";
import { MyAccount } from "./MyAccount";
import { PeoplePanel } from "./PeoplePanel";
import { RolesPanel } from "./RolesPanel";

type Tab = "documents" | "access" | "account";

export function SettingsView() {
  const { isSuperAdmin, can } = useAuth();
  const canSeeDefaults = can("settings", "view");
  const [tab, setTab] = useState<Tab>(canSeeDefaults ? "documents" : "account");

  const [people, setPeople] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const stop = watchPeople(
      (nextPeople) => setPeople(nextPeople),
      (nextRoles) => setRoles(nextRoles.length > 0 ? nextRoles : DEFAULT_ROLES),
      (msg) => setError(msg),
    );

    return () => stop();
  }, [isSuperAdmin]);

  return (
    <div className="flex flex-col gap-6">
      {/* Settings Tab Navigation Bar */}
      <div className="flex border-b border-neutral-200">
        {canSeeDefaults && (
        <button
          type="button"
          onClick={() => setTab("documents")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "documents"
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
          }`}
        >
          Document Defaults
        </button>
        )}

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setTab("access")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "access"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
            }`}
          >
            Users & Permissions
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">
              Super Admin
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setTab("account")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "account"
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
          }`}
        >
          My Account
        </button>
      </div>

      {/* Tab Contents */}
      {tab === "documents" && canSeeDefaults && <SettingsForm />}

      {tab === "access" && isSuperAdmin && (
        <div className="flex flex-col gap-6">
          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
          <PeoplePanel people={people} roles={roles} />
          <RolesPanel roles={roles} people={people} />
        </div>
      )}

      {tab === "account" && <MyAccount />}
    </div>
  );
}
