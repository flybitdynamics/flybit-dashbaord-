"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  removeClient,
  setShowClient,
  subscribe,
  upsertClient,
} from "../../lib/store";
import {
  CLIENT_TYPES,
  Client,
  ClientType,
  emptyClient,
  formatCompactMoney,
  formatMoney,
  isBooked,
  isOpen,
  pendingFor,
} from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { ClientTypeBadge } from "../Badges";
import { SiteHeader } from "../SiteHeader";
import { ClientDetailDialog } from "./ClientDetailDialog";
import { ClientDialog } from "./ClientDialog";

type Dialog =
  | { kind: "none" }
  | { kind: "detail"; client: Client }
  | { kind: "edit"; client: Client | null };

export function ClientsDashboard() {
  const { canEdit } = useAuth();
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ClientType | "all">("all");

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const places = useMemo(() => state?.places ?? [], [state]);

  const live = (client: Client) => clients.find((c) => c.id === client.id) ?? client;

  /** Per-client roll-up, computed once for the table and the tiles. */
  const stats = useMemo(() => {
    const map = new Map<string, { total: number; open: number; business: number; outstanding: number }>();
    for (const show of shows) {
      if (!show.clientId) continue;
      const row = map.get(show.clientId) ?? { total: 0, open: 0, business: 0, outstanding: 0 };
      row.total += 1;
      if (isOpen(show)) row.open += 1;
      if (isBooked(show)) {
        row.business += show.showAmount || 0;
        row.outstanding += pendingFor(show, payments);
      }
      map.set(show.clientId, row);
    }
    return map;
  }, [shows, payments]);

  /** Shows from before clients were records, grouped by the name they carry. */
  const unlinked = useMemo(() => {
    const groups = new Map<string, typeof shows>();
    for (const show of shows) {
      if (show.clientId || !show.client.trim()) continue;
      const key = show.client.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), show]);
    }
    return [...groups.values()];
  }, [shows]);

  const visible = clients.filter((client) => {
    if (type !== "all" && client.type !== type) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [client.name, client.contactName, client.contactPhone, client.email, client.city, client.state, client.gstin]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const totals = [...stats.values()].reduce(
    (acc, row) => ({ business: acc.business + row.business, outstanding: acc.outstanding + row.outstanding }),
    { business: 0, outstanding: 0 },
  );
  const b2b = clients.filter((c) => c.type === "b2b").length;

  function linkUnlinked() {
    for (const group of unlinked) {
      const first = group[0];
      const existing = clients.find((c) => c.name.trim().toLowerCase() === first.client.trim().toLowerCase());
      const id =
        existing?.id ??
        upsertClient(
          {
            ...emptyClient(),
            name: first.client.trim(),
            type: first.b2b ? "b2b" : "direct",
            contactName: first.contactName,
            contactPhone: first.contactPhone,
            state: first.state,
            city: first.location,
          },
          null,
        );
      const name = existing?.name ?? first.client.trim();
      group.forEach((show) => setShowClient(show.id, id, name));
    }
  }

  function handleDelete(client: Client) {
    const count = stats.get(client.id)?.total ?? 0;
    const note = count
      ? ` Its ${count} show${count === 1 ? "" : "s"} keep the name but lose the link.`
      : "";
    if (!window.confirm(`Delete ${client.name}?${note}`)) return;
    removeClient(client.id);
    setDialog({ kind: "none" });
  }

  const tiles = [
    { label: "Clients", value: String(clients.length), note: `${clients.length - b2b} direct · ${b2b} B2B` },
    { label: "Booked value", value: formatCompactMoney(totals.business), note: "across all booked shows" },
    { label: "Outstanding", value: formatCompactMoney(totals.outstanding), note: "still to collect" },
    {
      label: "Open work",
      value: String([...stats.values()].reduce((sum, r) => sum + r.open, 0)),
      note: "inquiries, confirmed and completed shows",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Clients"
        subtitle="Everyone who books a show — direct customers and B2B agencies, in one list"
        actions={
          canEdit && (
            <button
              type="button"
              onClick={() => setDialog({ kind: "edit", client: null })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New client
            </button>
          )
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading clients from Firebase…
        </div>
      ) : (
        <>
          {unlinked.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="flex-1">
                <strong>
                  {unlinked.reduce((sum, g) => sum + g.length, 0)} older show
                  {unlinked.reduce((sum, g) => sum + g.length, 0) === 1 ? "" : "s"}
                </strong>{" "}
                name a client that has no record yet (
                {unlinked.map((g) => `“${g[0].client.trim()}”`).join(", ")}).
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={linkUnlinked}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  Create {unlinked.length} client record{unlinked.length === 1 ? "" : "s"} and link
                </button>
              )}
            </div>
          )}

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div className="tnum mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
                  {tile.value}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, contact, city or GSTIN"
              aria-label="Search clients"
              className="min-w-52 flex-1 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
            <div role="group" aria-label="Filter by type" className="flex overflow-hidden rounded-md bg-white ring-1 ring-neutral-200">
              {(["all", "direct", "b2b"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  onClick={() => setType(option)}
                  className={`px-3 py-2 text-sm ${type === option ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
                >
                  {option === "all" ? "All" : CLIENT_TYPES[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70">
                    {["Client", "Contact", "Place", "Shows", "Booked value", "Outstanding", ""].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <p className="font-medium text-neutral-900">
                          {clients.length === 0 ? "No clients yet" : "Nothing matches"}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {clients.length === 0
                            ? "Add one here, or pick “＋ New client” while adding a show."
                            : "Try another search or type."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    visible.map((client) => {
                      const row = stats.get(client.id);
                      return (
                        <tr
                          key={client.id}
                          onClick={() => setDialog({ kind: "detail", client })}
                          className="row-line cursor-pointer hover:bg-neutral-50"
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-neutral-900">{client.name}</span>
                              <ClientTypeBadge type={client.type} />
                            </div>
                            {client.email && <div className="text-xs text-neutral-500">{client.email}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-sm">
                            <div>{client.contactName || "—"}</div>
                            <div className="tnum font-mono text-xs text-neutral-500">{client.contactPhone}</div>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-neutral-600">
                            {[client.city, client.state].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm">
                            {row?.total ?? 0}
                            {row && row.open > 0 && (
                              <span className="ml-1.5 text-xs text-neutral-500">({row.open} open)</span>
                            )}
                          </td>
                          <td className="tnum px-3 py-2.5 font-mono text-sm">
                            {formatMoney(row?.business ?? 0)}
                          </td>
                          <td
                            className={`tnum px-3 py-2.5 font-mono text-sm ${
                              (row?.outstanding ?? 0) > 0 ? "font-semibold text-neutral-900" : "text-neutral-400"
                            }`}
                          >
                            {formatMoney(row?.outstanding ?? 0)}
                          </td>
                          <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "edit", client })}
                                className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {dialog.kind === "detail" && (
        <ClientDetailDialog
          key={dialog.client.id}
          client={live(dialog.client)}
          shows={shows}
          payments={payments}
          canEdit={canEdit}
          onEdit={() => setDialog({ kind: "edit", client: live(dialog.client) })}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "edit" && (
        <ClientDialog
          key={dialog.client?.id ?? "new"}
          client={dialog.client}
          places={places}
          showCount={dialog.client ? stats.get(dialog.client.id)?.total ?? 0 : 0}
          onSave={(draft, id) => {
            upsertClient(draft, id);
            setDialog({ kind: "none" });
          }}
          onDelete={handleDelete}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}
    </div>
  );
}
