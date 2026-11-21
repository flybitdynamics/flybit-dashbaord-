"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  PURCHASE_ORDER_STATUSES,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderDraft,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  PurchaseOrderTax,
  PurchaseOrderTerm,
  emptyRow,
  purchaseOrderFileName,
} from "../../lib/purchase-orders";
import { Settings } from "../../lib/types";
import { PurchaseOrderSheet } from "./PurchaseOrderSheet";

/** A4 at 96dpi. */
const PAGE_W = 794;
const PAGE_H = 1123;
/** The gap .po-page-two leaves above page two (16pt). */
const GAP = 22;

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.4, (window.innerWidth - 80) / PAGE_W));
}

const bar = "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200 disabled:opacity-50";
const select =
  "rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "HKD", "CNY", "AED"];

/** The PO open on the desk: typed on the page itself, with only what never
 *  prints in the bar above it. */
export function PurchaseOrderEditor({
  order,
  draft: initial,
  settings,
  canEdit,
  canDelete,
  canCreate,
  onSave,
  onDuplicate,
  onDelete,
  onClose,
}: {
  order: PurchaseOrder | null;
  draft: PurchaseOrderDraft;
  settings: Settings;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: PurchaseOrderDraft, id: string | null) => void;
  onDuplicate: (draft: PurchaseOrderDraft) => void;
  onDelete: (order: PurchaseOrder) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(fitToWindow);
  const [dirty, setDirty] = useState(!order);
  const [problem, setProblem] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function change(patch: Partial<PurchaseOrderDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setProblem(null);
  }

  /** Patch one item of a list field by id. */
  function patchList<K extends "rows" | "taxes" | "details" | "terms">(
    key: K,
    id: string,
    patch: Partial<PurchaseOrderDraft[K][number]>,
  ) {
    setDraft((prev) => ({
      ...prev,
      [key]: (prev[key] as Array<{ id: string }>).map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    setDirty(true);
    setProblem(null);
  }

  function removeFrom(key: "rows" | "taxes" | "details" | "terms", id: string) {
    setDraft((prev) => ({ ...prev, [key]: (prev[key] as Array<{ id: string }>).filter((item) => item.id !== id) }));
    setDirty(true);
  }

  function addRow(afterId: string) {
    setDraft((prev) => {
      const at = prev.rows.findIndex((row) => row.id === afterId);
      const rows = [...prev.rows];
      rows.splice(at < 0 ? rows.length : at + 1, 0, emptyRow(`row-${Date.now()}`));
      return { ...prev, rows };
    });
    setDirty(true);
  }

  function setCurrency(currency: string) {
    change({
      currency,
      details: draft.details.map((d) => (d.label.trim().toLowerCase() === "currency" ? { ...d, value: currency } : d)),
    });
  }

  function close() {
    if (dirty && canEdit && !window.confirm("Close without saving this purchase order?")) return;
    onClose();
  }

  function validate(): boolean {
    if (!draft.number.trim()) {
      setProblem("The PO needs a number — click beside “PO Number”.");
      return false;
    }
    if (!draft.vendorName.trim()) {
      setProblem("Say who the PO is to — click beside “Company Name” under Supplier / Vendor.");
      return false;
    }
    return true;
  }

  function save() {
    if (!validate()) return;
    onSave(draft, order?.id ?? null);
    setDirty(false);
  }

  /** Draws each page as it prints, without the field boxes, and hands the
   *  browser a PDF file. Everything stays on this machine. */
  async function downloadPdf() {
    if (exporting || !validate()) return;
    if (canEdit && dirty) {
      onSave(draft, order?.id ?? null);
      setDirty(false);
    }
    const previousZoom = zoom;
    setExporting(true);
    setZoom(1);
    try {
      await new Promise((r) => setTimeout(r, 150));
      if (document.fonts) await document.fonts.ready;
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".print-host .po-page"));
      if (pages.length === 0) throw new Error("Could not find the purchase order on the page.");
      await Promise.all(
        pages.flatMap((page) => Array.from(page.querySelectorAll("img"))).map((img) =>
          img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
        ),
      );

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      for (const [index, page] of pages.entries()) {
        const canvas = await html2canvas(page, {
          scale: 3,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: PAGE_W,
        });
        if (index > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, w, h, undefined, "FAST");
      }
      pdf.setProperties({ title: `Purchase Order ${draft.number}`, author: settings.companyName });
      pdf.save(`${purchaseOrderFileName(draft)}.pdf`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The PDF could not be made.");
    } finally {
      setExporting(false);
      setZoom(previousZoom);
    }
  }

  function printSheet() {
    const previous = document.title;
    document.title = purchaseOrderFileName(draft);
    window.addEventListener("afterprint", () => (document.title = previous), { once: true });
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

  const editing = canEdit && !exporting;

  const overlay = (
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-neutral-200/90">
      <div className="inv-noprint flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
        <button type="button" onClick={close} aria-label="Close" className={bar}>
          ←
        </button>

        <div className="mr-auto min-w-40">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-neutral-900">{draft.number || "New purchase order"}</h2>
            {dirty && canEdit && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">UNSAVED</span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            {canEdit
              ? "Click anything on the page to change it · ✕ and + beside a row remove or add one"
              : "Your role can read purchase orders, not change them."}
          </p>
        </div>

        {canEdit && (
          <>
            <select
              aria-label="Status"
              className={select}
              value={draft.status}
              onChange={(e) => change({ status: e.target.value as PurchaseOrderStatus })}
            >
              {(Object.keys(PURCHASE_ORDER_STATUSES) as PurchaseOrderStatus[]).map((key) => (
                <option key={key} value={key}>
                  {PURCHASE_ORDER_STATUSES[key]}
                </option>
              ))}
            </select>
            <select aria-label="Currency" className={select} value={draft.currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([draft.currency, ...CURRENCIES])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <button type="button" className={bar} onClick={() => addRow(draft.rows[draft.rows.length - 1]?.id ?? "")}>
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
          <span className="tnum min-w-12 px-1 py-1.5 text-center text-xs text-neutral-500">{Math.round(zoom * 100)}%</span>
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
            title="Start a new PO from this one, with the next number"
            onClick={() => {
              if (dirty && canEdit && !window.confirm("Copy this PO as it stands? The changes here are not saved yet.")) return;
              onDuplicate(draft);
            }}
            className={bar}
          >
            Duplicate
          </button>
        )}

        {order && canDelete && (
          <button type="button" onClick={() => onDelete(order)} className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Delete
          </button>
        )}

        <button type="button" onClick={printSheet} className={bar}>
          Print
        </button>

        <button type="button" onClick={() => void downloadPdf()} disabled={exporting} className={bar}>
          {exporting ? "Making PDF…" : "Download PDF"}
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
        <div className="inv-noprint border-b border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-red-700">{problem}</div>
      )}

      <div className="print-host flex-1 overflow-auto p-4 sm:p-8">
        <div className="inv-zoom-wrap mx-auto" style={{ width: PAGE_W * zoom, height: (PAGE_H * 2 + GAP) * zoom }}>
          <div className="inv-zoom" style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: PAGE_W }}>
            <PurchaseOrderSheet
              order={draft}
              settings={settings}
              edit={
                editing
                  ? {
                      onChange: change,
                      onRowChange: (id, patch: Partial<PurchaseOrderRow>) => patchList("rows", id, patch),
                      onAddRow: addRow,
                      onRemoveRow: (id) => removeFrom("rows", id),
                      onTaxChange: (id, patch: Partial<PurchaseOrderTax>) => patchList("taxes", id, patch),
                      onAddTax: () => change({ taxes: [...draft.taxes, { id: `tax-${Date.now()}`, label: "Tax", rate: "" }] }),
                      onRemoveTax: (id) => removeFrom("taxes", id),
                      onDetailChange: (id, patch: Partial<PurchaseOrderDetail>) => patchList("details", id, patch),
                      onAddDetail: () => change({ details: [...draft.details, { id: `d-${Date.now()}`, label: "", value: "" }] }),
                      onRemoveDetail: (id) => removeFrom("details", id),
                      onTermChange: (id, patch: Partial<PurchaseOrderTerm>) => patchList("terms", id, patch),
                      onAddTerm: () => change({ terms: [...draft.terms, { id: `t-${Date.now()}`, title: "", body: "" }] }),
                      onRemoveTerm: (id) => removeFrom("terms", id),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
