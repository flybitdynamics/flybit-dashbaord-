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

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const NAV = [
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
    href: "/calendar",
    label: "Calendar",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <rect x="2.8" y="4.2" width="14.4" height="13" rx="2" />
        <path d="M2.8 8.2h14.4M6.6 2.6v3M13.4 2.6v3" />
      </svg>
    ),
  },
  {
    href: "/clients",
    label: "Clients",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <rect x="3" y="6" width="14" height="10.5" rx="2" />
        <path d="M7.5 6V4.6a1.1 1.1 0 0 1 1.1-1.1h2.8a1.1 1.1 0 0 1 1.1 1.1V6M3 10.5h14" />
      </svg>
    ),
  },
  {
    href: "/pilots",
    label: "Pilots",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <circle cx="5" cy="5" r="2" />
        <circle cx="15" cy="5" r="2" />
        <circle cx="5" cy="15" r="2" />
        <circle cx="15" cy="15" r="2" />
        <rect x="8" y="8" width="4" height="4" rx="1" />
        <path d="M6.4 6.4 8 8M13.6 6.4 12 8M6.4 13.6 8 12M13.6 13.6 12 12" />
      </svg>
    ),
  },
  {
    href: "/finance",
    label: "Finance",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M3 15.2 7.2 10l3.1 3.1L17 6" />
        <path d="M17 10V6h-4" />
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
  const { logout, user, canEdit } = useAuth();
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
        className={`sticky top-0 z-20 flex h-screen shrink-0 flex-col border-r border-neutral-100 bg-white transition-[width] duration-200 ${collapsed ? "w-[64px]" : "w-[216px]"
          }`}
      >
        <div
          className={`relative flex h-16 shrink-0 items-center border-b border-neutral-100 ${collapsed ? "justify-center px-2" : "px-4"
            }`}
        >
          <Link href="/" aria-label="FLYBIT Dynamics">
            {collapsed ? (
              <Image src="/icon.png" alt="" width={512} height={512} className="size-9 rounded-md" />
            ) : (
              <Image
                src="/logo-on-light.png"
                alt="FLYBIT Dynamics"
                width={666}
                height={276}
                priority
                className="h-8 w-auto"
              />
            )}
          </Link>

          {/* Sits on the sidebar's edge, so it reads as the handle that opens
              and closes the panel. */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-1/2 z-30 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-200 transition-colors hover:text-neutral-900 hover:ring-neutral-300"
          >
            <svg viewBox="0 0 20 20" className="size-3.5" {...stroke}>
              {collapsed ? <path d="M8 5.5 12.5 10 8 14.5" /> : <path d="M12 5.5 7.5 10 12 14.5" />}
            </svg>
          </button>
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
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : ""
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

        {!canEdit && (
          <div
            className={`mx-2 mb-2 rounded-xl bg-amber-50 text-center text-amber-800 ${collapsed ? "px-1 py-1.5 text-[10px] font-semibold" : "px-2 py-1.5 text-[11px]"
              }`}
            title="Signed in as a viewer — you can look at everything but not change it"
          >
            {collapsed ? "VIEW" : "View only"}
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-neutral-100 p-2">
          {!collapsed && user && (
            <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-500">
              Signed in as <span className="font-medium text-neutral-700">{user.username}</span>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Sign out" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 ${collapsed ? "justify-center px-2" : ""
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
