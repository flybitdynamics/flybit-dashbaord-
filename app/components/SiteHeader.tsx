"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

const TABS = [
  { href: "/", label: "Shows" },
  { href: "/team", label: "Team" },
];

export function SiteHeader({
  subtitle,
  actions,
}: {
  subtitle: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
      <div>
        <h1>
          <Image
            src="/logo-on-light.png"
            alt="FLYBIT Dynamics"
            width={666}
            height={276}
            priority
            className="h-9 w-auto"
          />
        </h1>
        <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>

        <nav className="mt-3 flex gap-1" aria-label="Sections">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
