"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  WORK_ORDER_STATUSES,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderDraft,
  WorkOrderStatus,
  fromShow,
  workOrderFileName,
} from "../../lib/work-orders";
import { Show, formatDate } from "../../lib/types";
import { WorkOrderSheet } from "./WorkOrderSheet";

/** A4 at 96dpi. */
const PAGE_W = 794;
const PAGE_H = 1123;

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.4, (window.innerWidth - 80) / PAGE_W));
}

const bar = "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200 disabled:opacity-50";
const select =
  "max-w-56 rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

type BulletKey = "scope" | "requirements" | "terms";

/** The work order open on the desk: typed on the page itself, with only
 *  what never prints in the bar above it. */
export function WorkOrderEditor({
  order,
  draft: initial,
  shows,
  canEdit,
  canDelete,
  canCreate,
  onSave,
  onDuplicate,
  onDelete,
  onClose,
}: {
  order: WorkOrder | null;
  draft: WorkOrderDraft;
  shows: Show[];
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: WorkOrderDraft, id: string | null) => void;
  onDuplicate: (draft: WorkOrderDraft) => void;
  onDelete: (order: WorkOrder) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(fitToWindow);
  const [dirty, setDirty] = useState(!order);
  const [problem, setProblem] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function change(patch: Partial<WorkOrderDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setProblem(null);
  }

  function patchDetail(id: string, patch: Partial<WorkOrderDetail>) {
    setDraft((prev) => ({ ...prev, details: prev.details.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    setDirty(true);
  }

  function patchBullet(key: BulletKey, id: string, text: string) {
    setDraft((prev) => ({ ...prev, [key]: prev[key].map((b) => (b.id === id ? { ...b, text } : b)) }));
    setDirty(true);
  }

  function pickShow(id: string) {
    const show = shows.find((s) => s.id === id);
    if (!show) {
      change({ showId: "" });
      return;
    }
    if (dirty && !window.confirm("Fill the client, event details and value from this show? Text you typed in those places is replaced.")) return;
    setDraft((prev) => fromShow(prev, show));
    setDirty(true);
  }

  function close() {
    if (dirty && canEdit && !window.confirm("Close without saving this work order?")) return;
    onClose();
  }

  function save() {
    onSave(draft, order?.id ?? null);
    setDirty(false);
  }

  /** Draws the page as it prints, without the field boxes, and hands the
   *  browser a PDF. A longer work order is cut across as many A4 pages as
   *  it needs. Everything stays on this machine. */
  async function downloadPdf() {
    if (exporting) return;
    if (canEdit && dirty) save();
    const previousZoom = zoom;
    setExporting(true);
    setZoom(1);
    try {
      await new Promise((r) => setTimeout(r, 150));
      if (document.fonts) await document.fonts.ready;
      const page = document.querySelector<HTMLElement>(".print-host .wo-page");
      if (!page) throw new Error("Could not find the work order on the page.");

      const canvas = await html2canvas(page, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: PAGE_W,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      const sliceH = Math.round((canvas.width * h) / w);
      for (let top = 0, index = 0; top < canvas.height - 4; top += sliceH, index++) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(sliceH, canvas.height - top);
        const ctx = slice.getContext("2d");
        if (!ctx) throw new Error("The PDF could not be drawn.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        if (index > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, w, (slice.height * w) / canvas.width, undefined, "FAST");
      }
      pdf.setProperties({ title: `Work Order — ${draft.issuedBy || draft.clientName}` });
      pdf.save(`${workOrderFileName(draft)}.pdf`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The PDF could not be made.");
    } finally {
      setExporting(false);
      setZoom(previousZoom);
    }
  }

  function printSheet() {
    const previous = document.title;
    document.title = workOrderFileName(draft);
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
  const pickable = shows.filter((s) => s.showStatus !== "lost" || s.id === draft.showId);

  const overlay = (
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-neutral-200/90">
      <div className="inv-noprint flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
        <button type="button" onClick={close} aria-label="Close" className={bar}>
          ←
        </button>

        <div className="mr-auto min-w-40">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-neutral-900">
              {draft.number}
              {draft.issuedBy ? ` · ${draft.issuedBy}` : ""}
            </h2>
            {dirty && canEdit && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">UNSAVED</span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            {canEdit
              ? "Click anything on the page to change it · ✕ removes a line, the blue links add one"
              : "Your role can read work orders, not change them."}
          </p>
        </div>

        {canEdit && (
          <>
            <select aria-label="Fill from a show" title="Fill the client, event details and value from a show" className={select} value={draft.showId} onChange={(e) => pickShow(e.target.value)}>
              <option value="">Fill from a show…</option>
              {pickable.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.client || show.contactName || show.location || "Show"}
                  {show.showDate ? ` · ${formatDate(show.showDate)}` : ""}
                </option>
              ))}
            </select>
            <select aria-label="Status" className={select} value={draft.status} onChange={(e) => change({ status: e.target.value as WorkOrderStatus })}>
              {(Object.keys(WORK_ORDER_STATUSES) as WorkOrderStatus[]).map((key) => (
                <option key={key} value={key}>
                  {WORK_ORDER_STATUSES[key]}
                </option>
              ))}
            </select>
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
            title="Start a new work order from this one"
            onClick={() => {
              if (dirty && canEdit && !window.confirm("Copy this work order as it stands? The changes here are not saved yet.")) return;
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
        <div className="inv-zoom-wrap mx-auto" style={{ width: PAGE_W * zoom, minHeight: PAGE_H * zoom }}>
          <div className="inv-zoom" style={{ zoom }}>
            <WorkOrderSheet
              order={draft}
              edit={
                editing
                  ? {
                      onChange: change,
                      onDetailChange: patchDetail,
                      onAddDetail: (wide) => change({ details: [...draft.details, { id: `d-${Date.now()}`, label: "", value: "", wide }] }),
                      onRemoveDetail: (id) => change({ details: draft.details.filter((d) => d.id !== id) }),
                      onBulletChange: patchBullet,
                      onAddBullet: (key) => change({ [key]: [...draft[key], { id: `${key}-${Date.now()}`, text: "" }] }),
                      onRemoveBullet: (key, id) => change({ [key]: draft[key].filter((b) => b.id !== id) }),
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
