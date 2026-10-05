"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  QUOTATION_STATUSES,
  Quotation,
  QuotationRow,
  QuotationStatus,
  emptyRow,
  quotationFromShow,
  quotationPdfName,
} from "../../lib/quotations";
import { Client, Settings, Show, formatDate, isOpen } from "../../lib/types";
import { QuotationSheet } from "./QuotationSheet";

/** A4 at 96dpi — what one page measures on screen. */
const PAGE_W = 794;
const PAGE_H = 1123;

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.4, (window.innerWidth - 80) / PAGE_W));
}

const bar = "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200";
const select =
  "rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

/** The quotation open on the desk: the letter is typed on the page itself,
 *  and only what never prints sits in the bar above it. */
export function QuotationEditor({
  quotation,
  draft: initial,
  settings,
  shows,
  clients,
  canEdit,
  canDelete,
  canCreate,
  onSave,
  onDuplicate,
  onDelete,
  onClose,
}: {
  quotation: Quotation | null;
  draft: Omit<Quotation, "id">;
  settings: Settings;
  shows: Show[];
  clients: Client[];
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: Omit<Quotation, "id">, id: string | null) => void;
  onDuplicate: (draft: Omit<Quotation, "id">) => void;
  onDelete: (quotation: Quotation) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(fitToWindow);
  const [dirty, setDirty] = useState(!quotation);
  const [problem, setProblem] = useState<string | null>(null);

  /* A quotation is for work not yet booked, so open shows come first. */
  const quotable = [...shows].sort((a, b) => {
    const rank = (s: Show) => (isOpen(s) ? 0 : 1);
    return rank(a) - rank(b) || b.showDate.localeCompare(a.showDate);
  });

  function change(patch: Partial<Omit<Quotation, "id">>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setProblem(null);
  }

  function changeRow(id: string, patch: Partial<QuotationRow>) {
    change({ rows: draft.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  }

  /** New rows land under the one you clicked, numbered after it. */
  function addRow(afterId: string) {
    const at = draft.rows.findIndex((row) => row.id === afterId);
    const numbered = draft.rows.filter((row) => row.serial.trim()).length;
    const next = emptyRow(`row-${Date.now()}`, String(numbered + 1));
    const rows = [...draft.rows];
    rows.splice(at + 1, 0, next);
    change({ rows });
  }

  function close() {
    if (dirty && !window.confirm("Close without saving this quotation?")) return;
    onClose();
  }

  function save() {
    if (!draft.number.trim()) {
      setProblem("The quotation needs a number — click the # line at the top.");
      return;
    }
    if (!draft.to.trim()) {
      setProblem("Say who it is for — click under “To,”.");
      return;
    }
    onSave(draft, quotation?.id ?? null);
    setDirty(false);
  }

  /** The print dialog names the PDF from the page title. */
  function printPdf() {
    const client = clients.find((c) => c.id === draft.clientId);
    const previous = document.title;
    document.title = quotationPdfName(draft, client?.name);
    const restore = () => {
      document.title = previous;
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canEdit) save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const overlay = (
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-neutral-200/90">
      <div className="inv-noprint flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
        <button type="button" onClick={close} aria-label="Close" className={bar}>
          ←
        </button>

        <div className="mr-auto min-w-40">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-neutral-900">
              {draft.number || "New quotation"}
            </h2>
            {dirty && canEdit && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                UNSAVED
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            {canEdit
              ? "Click anything on the page to change it · ✕ and + beside a row add or remove one"
              : "Your role can read quotations, not change them."}
          </p>
        </div>

        {canEdit && (
          <>
            <select
              aria-label="Status"
              className={select}
              value={draft.status}
              onChange={(e) => change({ status: e.target.value as QuotationStatus })}
            >
              {(Object.keys(QUOTATION_STATUSES) as QuotationStatus[]).map((key) => (
                <option key={key} value={key}>
                  {QUOTATION_STATUSES[key]}
                </option>
              ))}
            </select>

            <select
              aria-label="Show this quotation is for"
              className={select}
              value={draft.showId}
              onChange={(e) => {
                const show = shows.find((s) => s.id === e.target.value);
                if (!show) {
                  change({ showId: "" });
                  return;
                }
                const client = clients.find((c) => c.id === show.clientId) ?? null;
                change(quotationFromShow(draft, show, client));
              }}
            >
              <option value="">No show linked</option>
              {quotable.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.client || show.location || "Show"} · {formatDate(show.showDate)}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={bar}
              onClick={() => addRow(draft.rows[draft.rows.length - 1]?.id ?? "")}
            >
              + Row
            </button>
          </>
        )}

        <div className="flex overflow-hidden rounded-md ring-1 ring-neutral-200">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
            className="px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            −
          </button>
          <span className="tnum min-w-12 px-1 py-1.5 text-center text-xs text-neutral-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}
            className="px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            +
          </button>
        </div>

        {canCreate && (
          <button
            type="button"
            title="Start a new quotation from this one"
            onClick={() => {
              if (dirty && !window.confirm("Copy this quotation as it stands? The changes here are not saved yet.")) return;
              onDuplicate(draft);
            }}
            className={bar}
          >
            Duplicate
          </button>
        )}

        {quotation && canDelete && (
          <button
            type="button"
            onClick={() => onDelete(quotation)}
            className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}

        <button type="button" onClick={printPdf} className={bar}>
          Print / PDF
        </button>

        {canEdit && (
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Save
          </button>
        )}
      </div>

      {problem && (
        <div className="inv-noprint border-b border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-red-700">
          {problem}
        </div>
      )}

      <div className="print-host flex-1 overflow-auto p-4 sm:p-8">
        <div
          className="mx-auto"
          style={{ width: PAGE_W * zoom, height: (PAGE_H * 2 + 22) * zoom }}
        >
          <div
            className="inv-zoom"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: PAGE_W }}
          >
            <QuotationSheet
              quotation={{ ...draft, id: quotation?.id ?? "draft" }}
              settings={settings}
              edit={
                canEdit
                  ? {
                      onChange: change,
                      onRowChange: changeRow,
                      onAddRow: addRow,
                      onRemoveRow: (id) =>
                        change({ rows: draft.rows.filter((row) => row.id !== id) }),
                      onListChange: (key, next) => change({ [key]: next }),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );

  /* Printing takes everything but this out of the page, which only works
     if the sheet is a child of the body rather than of the app's layout. */
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
