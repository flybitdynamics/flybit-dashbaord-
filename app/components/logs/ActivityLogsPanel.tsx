"use client";

import { useMemo, useState } from "react";
import { AuditLog, LogAction, formatDate } from "../../lib/types";

const actionStyles: Record<LogAction, { label: string; badge: string }> = {
  create: { label: "Created", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  edit: { label: "Updated", badge: "bg-blue-50 text-blue-700 ring-blue-200" },
  delete: { label: "Deleted", badge: "bg-red-50 text-red-700 ring-red-200" },
  stage_change: { label: "Stage Changed", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  payment: { label: "Payment Logged", badge: "bg-purple-50 text-purple-700 ring-purple-200" },
  expense: { label: "Expense Logged", badge: "bg-neutral-100 text-neutral-800 ring-neutral-200" },
  user: { label: "User Managed", badge: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
};

function formatLogTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    const dateStr = formatDate(isoString.slice(0, 10));
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${dateStr} · ${timeStr}`;
  } catch {
    return isoString;
  }
}

export function ActivityLogsPanel({ logs }: { logs: AuditLog[] }) {
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  /* List of all unique users who performed actions */
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; email: string }>();
    for (const log of logs) {
      if (log.actorUid && !map.has(log.actorUid)) {
        map.set(log.actorUid, {
          uid: log.actorUid,
          name: log.actorName || "Unknown",
          email: log.actorEmail,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (userFilter !== "all" && log.actorUid !== userFilter) return false;
      if (categoryFilter !== "all" && log.entityType !== categoryFilter) return false;
      if (actionFilter !== "all" && log.action !== actionFilter) return false;

      if (q) {
        const haystack = [
          log.actorName,
          log.actorEmail,
          log.details,
          log.entityTitle,
          log.entityType,
          log.action,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, query, userFilter, categoryFilter, actionFilter]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = logs.filter((l) => l.timestamp.startsWith(todayStr)).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
            Activity & Audit Logs
          </h2>
          <p className="text-xs text-neutral-500">
            Maintained history of creates, edits, stage changes, and deletions by user.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>{logs.length} total events</span>
          <span>·</span>
          <span>{todayCount} today</span>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-2.5 border-b border-neutral-100 bg-white p-4 sm:grid-cols-4">
        {/* Search */}
        <div className="sm:col-span-1">
          <label htmlFor="log-search" className="mb-1 block text-[11px] font-medium text-neutral-600">
            Search
          </label>
          <input
            id="log-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search details or user..."
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-900"
          />
        </div>

        {/* User filter */}
        <div>
          <label htmlFor="log-user" className="mb-1 block text-[11px] font-medium text-neutral-600">
            User Wise Filter
          </label>
          <select
            id="log-user"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-900"
          >
            <option value="all">All Users ({uniqueUsers.length})</option>
            {uniqueUsers.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name} {u.email ? `(${u.email})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Category filter */}
        <div>
          <label htmlFor="log-category" className="mb-1 block text-[11px] font-medium text-neutral-600">
            Category
          </label>
          <select
            id="log-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-900"
          >
            <option value="all">All Categories</option>
            <option value="show">Shows</option>
            <option value="payment">Payments</option>
            <option value="expense">Expenses</option>
            <option value="client">Clients</option>
            <option value="pilot">Pilots</option>
            <option value="user">Users</option>
            <option value="settings">Settings</option>
          </select>
        </div>

        {/* Action filter */}
        <div>
          <label htmlFor="log-action" className="mb-1 block text-[11px] font-medium text-neutral-600">
            Action Type
          </label>
          <select
            id="log-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-neutral-900"
          >
            <option value="all">All Actions</option>
            <option value="create">Created</option>
            <option value="edit">Updated</option>
            <option value="stage_change">Stage Changed</option>
            <option value="delete">Deleted</option>
            <option value="payment">Payment Logged</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/70">
              {["Date & Time", "User", "Action", "Item", "Details"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                  No activity logs match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((log) => {
                const style = actionStyles[log.action] ?? {
                  label: log.action,
                  badge: "bg-neutral-100 text-neutral-700 ring-neutral-200",
                };
                return (
                  <tr key={log.id} className="row-line hover:bg-neutral-50/50">
                    <td className="tnum whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">
                      {formatLogTimestamp(log.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium text-neutral-900">{log.actorName || "System"}</div>
                      {log.actorEmail && (
                        <div className="text-[11px] text-neutral-400">{log.actorEmail}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.badge}`}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800 max-w-44 truncate">
                      {log.entityTitle || "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {log.details}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
