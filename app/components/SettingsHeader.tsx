"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function SettingsHeader() {
  const { logout } = useAuth();

  return (
    <header className="flex items-start justify-between border-b border-neutral-200 pb-4">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-900"
        >
          ←
          <Image
            src="/logo-on-light.png"
            alt="FLYBIT Dynamics"
            width={666}
            height={276}
            className="h-4 w-auto"
          />
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The fixed details the permission documents are filled from. Changing them here changes
          every document generated afterwards.
        </p>
      </div>

      <button
        type="button"
        onClick={logout}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
      >
        Sign Out
      </button>
    </header>
  );
}
