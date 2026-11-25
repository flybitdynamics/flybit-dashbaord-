"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Module } from "../lib/permissions";
import { useAuth } from "./AuthProvider";
import { ReminderAlerts } from "./ReminderAlerts";

const COLLAPSE_KEY = "flybit_sidebar_collapsed";

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
    href: "/inventory",
    label: "Inventory",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M10 2.8 16.8 6.4v7.2L10 17.2 3.2 13.6V6.4z" />
        <path d="M3.2 6.4 10 10l6.8-3.6M10 10v7.2M6.6 4.6l6.8 3.6" />
      </svg>
    ),
  },
  {
    href: "/finance",
    label: "Finance",
    group: "finance",
    /** Its name inside the Finance group. */
    subLabel: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M3 15.2 7.2 10l3.1 3.1L17 6" />
        <path d="M17 10V6h-4" />
      </svg>
    ),
  },
  {
    href: "/quotations",
    group: "finance",
    label: "Quotations",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M4.5 3.2h11v13.6H4.5z" />
        <path d="M7.4 7h5.2M7.4 10h5.2M7.4 13h3" />
      </svg>
    ),
  },
  {
    href: "/invoices",
    group: "finance",
    label: "Invoices",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M5 2.8h10v14.4l-2.5-1.5-2.5 1.5-2.5-1.5L5 17.2z" />
        <path d="M8 7h4M8 10.5h4" />
      </svg>
    ),
  },
  {
    href: "/receipts",
    group: "finance",
    label: "Receipts",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M4.5 2.8h11v14.4l-2.75-1.5-2.75 1.5-2.75-1.5L4.5 17.2z" />
        <path d="M7.5 7h5M7.5 10.5h5M7.5 13.5h3" />
      </svg>
    ),
  },
  {
    href: "/purchase-orders",
    group: "finance",
    label: "Purchase Orders",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M3 4h2l1.6 8.2h8.6L17 6.5H6" />
        <circle cx="8" cy="15.5" r="1.2" />
        <circle cx="14" cy="15.5" r="1.2" />
      </svg>
    ),
  },
  {
    href: "/pdf-editor",
    label: "PDF Editor",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M11.5 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5z" />
        <path d="M11.5 2.5v4h4M7.5 14.5l.5-2 4.2-4.2 1.5 1.5L9.5 14z" />
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
    href: "/maps",
    label: "Maps",
    newTab: true,
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <path d="M2.8 5.2 7.4 3l5.2 2.2L17.2 3v11.8l-4.6 2.2-5.2-2.2-4.6 2.2z" />
        <path d="M7.4 3v11.8M12.6 5.2V17" />
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
  {
    href: "/logs",
    label: "Activity Logs",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <circle cx="10" cy="10" r="6.5" />
        <path d="M10 6v4.5l2.8 2.8" />
      </svg>
    ),
  },
];

type NavItem = (typeof NAV)[number];

/* The money sections sit together under one heading that opens and closes. */
const GROUPS: Record<string, { label: string; icon: React.ReactNode }> = {
  finance: {
    label: "Finance",
    icon: (
      <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
        <rect x="2.8" y="5" width="14.4" height="11" rx="2" />
        <path d="M2.8 8.4h14.4M13 12.2h1.6" />
        <path d="M5 5V4.2a1 1 0 0 1 1.2-1l7.6 1.6" />
      </svg>
    ),
  },
};

const isActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** The section links, with grouped ones under their heading. `collapsed` is
 *  the icon-only sidebar; `roomy` the taller rows of the phone menu. */
function NavList({
  items,
  pathname,
  collapsed = false,
  roomy = false,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  roomy?: boolean;
  onNavigate?: () => void;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const row = `flex items-center gap-3 rounded-xl px-3 ${roomy ? "py-2.5" : "py-2"} text-sm font-medium transition-colors ${
    collapsed ? "justify-center px-2" : ""
  }`;
  const tone = (active: boolean) =>
    active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900";

  const link = (item: NavItem, inGroup: boolean) => {
    const active = isActive(item.href, pathname);
    const label = inGroup && "subLabel" in item && item.subLabel ? item.subLabel : item.label;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        {...newTabProps(item)}
        className={`${row} ${inGroup && !collapsed ? "ml-4 pl-3" : ""} ${tone(active)}`}
      >
        {item.icon}
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  };

  const out: React.ReactNode[] = [];
  const done = new Set<string>();
  for (const item of items) {
    const group = "group" in item ? item.group : undefined;
    if (!group) {
      out.push(link(item, false));
      continue;
    }
    if (done.has(group)) continue;
    done.add(group);
    const members = items.filter((i) => "group" in i && i.group === group);
    const holdsPage = members.some((i) => isActive(i.href, pathname));
    const open = toggled[group] ?? holdsPage;
    const heading = GROUPS[group];
    out.push(
      <div key={`group-${group}`} className="flex flex-col gap-1">
        <button
          type="button"
          aria-expanded={open}
          title={collapsed ? heading.label : undefined}
          onClick={() => setToggled((prev) => ({ ...prev, [group]: !open }))}
          className={`${row} ${holdsPage && !open ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}
        >
          {heading.icon}
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{heading.label}</span>
              <svg viewBox="0 0 20 20" className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} {...stroke}>
                <path d="M8 5.5 12.5 10 8 14.5" />
              </svg>
            </>
          )}
        </button>
        {open && (
          <div className={`flex flex-col gap-1 ${collapsed ? "border-l-2 border-neutral-100 pl-0.5" : ""}`}>
            {members.map((member) => link(member, true))}
          </div>
        )}
      </div>,
    );
  }
  return <>{out}</>;
}

/** A section that is its own full-window app opens in a new tab. */
function newTabProps(item: { newTab?: boolean }) {
  return item.newTab ? { target: "_blank", rel: "noopener" } : {};
}

/** Which permission opens each section. Settings is always there, because
 *  My account lives in it. */
const MODULE_OF: Record<string, Module | null> = {
  "/": "shows",
  "/calendar": "calendar",
  "/clients": "clients",
  "/pilots": "pilots",
  "/inventory": "inventory",
  "/quotations": "quotations",
  "/invoices": "invoices",
  "/receipts": "receipts",
  "/purchase-orders": "finance",
  "/finance": "finance",
  "/team": "team",
  "/maps": null,
  "/pdf-editor": "pdfEditor",
  "/settings": null,
  "/logs": null,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout, profile, role, isSuperAdmin, can, canEdit } = useAuth();
  const nav = NAV.filter((item) => {
    const section = MODULE_OF[item.href];
    return !section || can(section, "view");
  });
  const roleLabel = isSuperAdmin ? "Super admin" : role?.name ?? "No role";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* The map planner fills its own tab, with no sidebar around it. */
  if (pathname.startsWith("/maps")) return <>{children}</>;

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* error ignored */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      {/* ---------------- MOBILE TOP BAR (< md) ---------------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white/95 px-4 backdrop-blur-md md:hidden">
        <Link href="/" aria-label="FLYBIT Dynamics" className="flex items-center gap-2">
          <Image
            src="/logo-on-light.png"
            alt="FLYBIT Dynamics"
            width={666}
            height={276}
            priority
            className="h-7 w-auto"
          />
        </Link>

        <div className="flex items-center gap-2">
          {!canEdit && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              VIEW ONLY
            </span>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
          >
            <svg viewBox="0 0 20 20" className="size-5" {...stroke}>
              <path d="M3.5 5h13M3.5 10h13M3.5 15h13" />
            </svg>
          </button>
        </div>
      </header>

      {/* ---------------- MOBILE DRAWER OVERLAY ---------------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="relative z-10 flex w-72 flex-col bg-white p-4 shadow-xl transition-transform">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <Image
                src="/logo-on-light.png"
                alt="FLYBIT Dynamics"
                width={666}
                height={276}
                priority
                className="h-6 w-auto"
              />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex size-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 py-4">
              <NavList items={nav} pathname={pathname} roomy onNavigate={() => setDrawerOpen(false)} />
            </nav>

            <div className="border-t border-neutral-100 pt-3">
              {profile && (
                <div className="mb-2 px-1 text-xs text-neutral-500">
                  Signed in as <span className="font-medium text-neutral-900">{profile.name}</span>
                  <span className="block text-[11px] text-neutral-400">{roleLabel}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <svg viewBox="0 0 20 20" className="size-[18px]" {...stroke}>
                  <path d="M12.5 6V4.5a1.5 1.5 0 0 0-1.5-1.5H5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5V14" />
                  <path d="M8 10h9M14.5 7.5 17 10l-2.5 2.5" />
                </svg>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- DESKTOP SIDEBAR (>= md) ---------------- */}
      <aside
        className={`sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-neutral-100 bg-white transition-[width] duration-200 md:flex ${collapsed ? "w-[64px]" : "w-[216px]"
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
          <NavList items={nav} pathname={pathname} collapsed={collapsed} />
        </nav>

        {!canEdit && (
          <div
            className={`mx-2 mb-2 rounded-xl bg-amber-50 text-center text-amber-800 ${collapsed ? "px-1 py-1.5 text-[10px] font-semibold" : "px-2 py-1.5 text-[11px]"
              }`}
            title="Your role can look but not change anything"
          >
            {collapsed ? "VIEW" : "View only"}
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-neutral-100 p-2">
          {!collapsed && profile && (
            <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-500">
              Signed in as <span className="font-medium text-neutral-700">{profile.name}</span>
              <span className="block text-neutral-400">{roleLabel}</span>
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

      {/* ---------------- MAIN CONTENT AREA ---------------- */}
      <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
      <ReminderAlerts />

      {/* ---------------- FIXED MOBILE BOTTOM NAVIGATION (< md) ---------------- */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-neutral-200 bg-white/95 shadow-lg backdrop-blur-md md:hidden">
        {nav.filter((item) => !["/pilots", "/quotations", "/invoices", "/receipts", "/purchase-orders", "/pdf-editor", "/maps", "/team", "/settings"].includes(item.href)).map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${active ? "text-neutral-900 font-bold" : "text-neutral-500 hover:text-neutral-800"
                }`}
            >
              <div
                className={`flex items-center justify-center rounded-full p-1 ${active ? "bg-neutral-900 text-white" : ""
                  }`}
              >
                {item.icon}
              </div>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
