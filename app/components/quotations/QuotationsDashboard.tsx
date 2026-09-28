"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  removeQuotation,
  subscribe,
  upsertQuotation,
} from "../../lib/store";
import {
  QUOTATION_STATUSES,
  Quotation,
  QuotationStatus,
  duplicateOfQuotation,
  emptyQuotation,
  nextQuotationNumber,
  quotationFromShow,
} from "../../lib/quotations";
import { DEFAULT_SETTINGS, formatDate } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { SiteHeader } from "../SiteHeader";
import { QuotationEditor } from "./QuotationEditor";

type Open =
  | { kind: "none" }
  /** `quotation` is null while a new one has not been saved yet. */
  | { kind: "sheet"; quotation: Quotation | null; draft: Omit<Quotation, "id"> };

const STATUS_STYLE: Record<QuotationStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  expired: "bg-neutral-100 text-neutral-400",
};

export function QuotationsDashboard({ fromShowId = "" }: { fromShowId?: string }) {
  const { can } = useAuth();
  const canCreate = can("quotations", "create");
  const canEdit = can("quotations", "edit");
  const canDelete = can("quotations", "delete");

  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [linkUsed, setLinkUsed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuotationStatus | "all">("all");

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const quotations = useMemo(() => state?.quotations ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const settings = state?.settings ?? DEFAULT_SETTINGS;

  function blank(): Omit<Quotation, "id"> {
    return emptyQuotation(nextQuotationNumber(quotations));
  }

  function fromShow(showId: string): Omit<Quotation, "id"> {
    const base = blank();
    const show = shows.find((s) => s.id === showId);
    if (!show) return base;
    const client = clients.find((c) => c.id === show.clientId) ?? null;
    return quotationFromShow(base, show, client);
  }

  function edit(quotation: Quotation) {
    const { id: _id, ...draft } = quotation;
    void _id;
    setOpen({ kind: "sheet", quotation, draft });
  }

  /* Arriving from a show's Quote button opens one as soon as the desk has
     loaded, without needing an effect to do it. */
  const linked =
    !linkUsed && fromShowId && canCreate && ready && open.kind === "none"
      ? fromShow(fromShowId)
      : null;
  const sheet: Open = linked ? { kind: "sheet", quotation: null, draft: linked } : open;

  function close() {
    setLinkUsed(true);
    setOpen({ kind: "none" });
  }

  function duplicate(source: Omit<Quotation, "id">) {
    setLinkUsed(true);
    setOpen({
      kind: "sheet",
      quotation: null,
      draft: duplicateOfQuotation(source, nextQuotationNumber(quotations)),
    });
  }

  function handleSave(draft: Omit<Quotation, "id">, id: string | null) {
    const savedId = upsertQuotation(draft, id);
    setLinkUsed(true);
    setOpen({ kind: "sheet", quotation: { ...draft, id: savedId }, draft });
  }

  function handleDelete(quotation: Quotation) {
    if (!window.confirm(`Delete quotation ${quotation.number}? This cannot be undone.`)) return;
    removeQuotation(quotation.id);
    close();
  }

  const visible = quotations.filter((quotation) => {
    if (filter !== "all" && quotation.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [quotation.number, quotation.to, quotation.subject, quotation.priceHeading]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const counts = quotations.reduce(
    (acc, quotation) => {
      acc[quotation.status] = (acc[quotation.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<QuotationStatus, number>>,
  );

  const tiles = [
    { label: "Quotations", value: String(quotations.length), note: "raised in all" },
    { label: "Sent", value: String(counts.sent ?? 0), note: "waiting on an answer" },
    { label: "Accepted", value: String(counts.accepted ?? 0), note: "turned into work" },
    { label: "Drafts", value: String(counts.draft ?? 0), note: "not sent yet" },
  ];

  const filters: Array<QuotationStatus | "all"> = [
    "all",
    "draft",
    "sent",
    "accepted",
    "declined",
    "expired",
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Quotations"
        subtitle="The priced letter you send before a booking — on the company letterhead, ready to print"
        actions={
          canCreate && (
            <button
              type="button"
              onClick={() => setOpen({ kind: "sheet", quotation: null, draft: blank() })}
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + New quotation
            </button>
          )
        }
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading quotations from Firebase…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-neutral-100 shadow-sm shadow-neutral-900/5 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="bg-white px-4 py-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {tile.label}
                </div>
                <div className="tnum mt-1 font-mono text-lg font-semibold text-neutral-900">
                  {tile.value}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{tile.note}</div>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, client or subject"
              className="w-full max-w-72 rounded-md bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:ring-neutral-900"
            />
            <div className="flex flex-wrap gap-1">
              {filters.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === key
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600 shadow-sm hover:bg-neutral-100"
                  }`}
                >
                  {key === "all" ? "All" : QUOTATION_STATUSES[key]}
                </button>
              ))}
            </div>
          </div>

          <section className="card overflow-hidden">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
                <p className="text-sm font-medium text-neutral-900">
                  {quotations.length === 0 ? "No quotations yet" : "Nothing matches that"}
                </p>
                <p className="text-sm text-neutral-500">
                  {quotations.length === 0
                    ? "Raise one from an inquiry and it prints on your usual letterhead."
                    : "Clear the search, or pick another status."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                      <th className="px-4 py-2.5">Quotation</th>
                      <th className="px-3 py-2.5">To</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Rows</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((quotation) => (
                      <tr
                        key={quotation.id}
                        onClick={() => edit(quotation)}
                        className="row-line cursor-pointer hover:bg-neutral-50"
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-[13px] font-semibold text-neutral-900">
                            {quotation.number}
                          </div>
                          {quotation.priceHeading && (
                            <div className="max-w-64 truncate text-xs text-neutral-500">
                              {quotation.priceHeading}
                            </div>
                          )}
                        </td>
                        <td className="max-w-56 px-3 py-2.5">
                          <div className="truncate">
                            {quotation.to.split("\n")[0] || "—"}
                          </div>
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-neutral-600">
                          {formatDate(quotation.date) === "—" ? quotation.date : formatDate(quotation.date)}
                        </td>
                        <td className="tnum px-3 py-2.5 font-mono text-[13px] text-neutral-600">
                          {quotation.rows.length}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[quotation.status]}`}
                          >
                            {QUOTATION_STATUSES[quotation.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => edit(quotation)}
                              className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                            >
                              {canEdit ? "Open" : "Print"}
                            </button>
                            {canCreate && (
                              <button
                                type="button"
                                title="Start a new quotation from this one"
                                onClick={() => {
                                  const { id: _id, ...source } = quotation;
                                  void _id;
                                  duplicate(source);
                                }}
                                className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                              >
                                Duplicate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {sheet.kind === "sheet" && (
        <QuotationEditor
          quotation={sheet.quotation}
          draft={sheet.draft}
          settings={settings}
          shows={shows}
          clients={clients}
          canEdit={sheet.quotation ? canEdit : canCreate}
          canDelete={canDelete}
          canCreate={canCreate}
          onSave={handleSave}
          onDuplicate={duplicate}
          onDelete={handleDelete}
          onClose={close}
        />
      )}
    </div>
  );
}
