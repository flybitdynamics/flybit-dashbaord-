"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";

const COLLAPSE_KEY = "flybit_sidebar_collapsed";

/** The shell only mounts after AuthProvider has resolved on the client, so
 *  reading localStorage in the initialiser cannot cause a hydration gap. */
function initialCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Shows",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M10 3.5 12 7l3.8.6-2.7 2.7.6 3.8L10 12.3 6.3 14.1l.6-3.8L4.2 7.6 8 7z" />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <circle cx="7.5" cy="7" r="2.6" />
        <path d="M2.8 16c0-2.6 2.1-4.3 4.7-4.3s4.7 1.7 4.7 4.3" />
        <path d="M13.4 5.1a2.6 2.6 0 0 1 0 5" />
        <path d="M14.2 11.9c1.8.3 3 1.8 3 4.1" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8" />
      </svg>
    ),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* the choice just won't be remembered */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-1">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 ${collapsed ? "w-[64px]" : "w-[216px]"
          }`}
      >
        <div
          className={`flex h-16 shrink-0 items-center border-b border-neutral-200 ${collapsed ? "justify-center px-2" : "justify-between px-4"
            }`}
        >
          {collapsed ? (
            <Link href="/" aria-label="FLYBIT Dynamics">
              <Image src="/icon.png" alt="" width={512} height={512} className="size-7 rounded-md" />
            </Link>
          ) : (
            <Link href="/" aria-label="FLYBIT Dynamics">
              <Image
                src="/logo-on-light.png"
                alt="FLYBIT Dynamics"
                width={666}
                height={276}
                priority
                className="h-6 w-auto"
              />
            </Link>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Sections">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : ""
                  } ${active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-neutral-200 p-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 ${collapsed ? "justify-center px-2" : ""
              }`}
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
              <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
              <path d="M7.8 3.5v13" />
              {collapsed ? <path d="M11 7.5 13.5 10 11 12.5" /> : <path d="M13.5 7.5 11 10l2.5 2.5" />}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>

          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 ${collapsed ? "justify-center px-2" : ""
              }`}
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
              <path d="M12.5 6V4.5a1.5 1.5 0 0 0-1.5-1.5H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5V14" />
              <path d="M8 10h9M14.5 7.5 17 10l-2.5 2.5" />
            </svg>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
