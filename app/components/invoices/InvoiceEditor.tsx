"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  INVOICE_STATUSES,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  TAX_MODES,
  TaxMode,
  emptyLine,
  invoiceFromShow,
  totalsFor,
} from "../../lib/invoices";
import { Client, Payment, Settings, Show, daysAway, formatDate, formatMoney, isBooked, receivedFor, todayISO } from "../../lib/types";
import { InvoiceSheet } from "./InvoiceSheet";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** A4 at 96dpi — what the sheet measures on screen. */
const SHEET_W = 794;
const SHEET_H = 1123;

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.4, (window.innerWidth - 80) / SHEET_W));
}

const bar =
  "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200";
const select =
  "rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

/** The invoice, open on the desk: you type on the document itself, and only
 *  the things that never print — its status, which show it bills, how the
 *  tax splits — sit in the bar above it. */
export function InvoiceEditor({
  invoice,
  draft: initial,
  settings,
  shows,
  clients,
  payments,
  canEdit,
  canDelete,
  canCreate,
  onSave,
  onDuplicate,
  onDelete,
  onClose,
}: {
  /** The saved record, or null while it is still new. */
  invoice: Invoice | null;
  draft: Omit<Invoice, "id">;
  settings: Settings;
  shows: Show[];
  clients: Client[];
  payments: Payment[];
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: Omit<Invoice, "id">, id: string | null) => void;
  /** Opens a fresh copy of what is on screen. */
  onDuplicate: (draft: Omit<Invoice, "id">) => void;
  onDelete: (invoice: Invoice) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(fitToWindow);
  const [dirty, setDirty] = useState(!invoice);
  const [problem, setProblem] = useState<string | null>(null);

  const totals = totalsFor({ ...draft, id: invoice?.id ?? "draft" });
  const billable = shows.filter(isBooked);
  const linked = billable.find((s) => s.id === draft.showId) ?? null;
  const received = linked ? receivedFor(linked.id, payments) : 0;

  function change(patch: Partial<Omit<Invoice, "id">>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setProblem(null);
  }

  function changeLine(id: string, patch: Partial<InvoiceLine>) {
    change({
      lines: draft.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  }

  function close() {
    if (dirty && !window.confirm("Close without saving this invoice?")) return;
    onClose();
  }

  function save() {
    if (!draft.number.trim()) {
      setProblem("The invoice needs a number — click the # line at the top.");
      return;
    }
    if (!draft.billTo.name.trim()) {
      setProblem("Say who the invoice is for — click the name under Bill To.");
      return;
    }
    onSave(draft, invoice?.id ?? null);
    setDirty(false);
  }

  const [isExporting, setIsExporting] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(false);
  const [driveNotice, setDriveNotice] = useState<{
    type: "success" | "error";
    message: string;
    link?: string;
  } | null>(null);

  /** The print dialog names the PDF from the invoice number. */
  function printPdf() {
    const previous = document.title;
    const safeNum = draft.number ? draft.number.replace(/\//g, "-") : "Invoice";
    document.title = safeNum;
    const restore = () => {
      document.title = previous;
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  }

  /** Direct 1-click upload to Google Drive without any local file picking */
  async function uploadDirectlyToDrive() {
    if (uploadingToDrive) return;
    setUploadingToDrive(true);
    setDriveNotice(null);

    try {
      // 1. Check Drive credentials and connection
      const statusRes = await fetch("/api/drive/status");
      const statusData = await statusRes.json();
      if (!statusData.configured) {
        setDriveNotice({
          type: "error",
          message:
            "Google Drive OAuth credentials are not set. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
        });
        setUploadingToDrive(false);
        return;
      }
      if (!statusData.connected) {
        if (
          window.confirm(
            "Google Drive is not connected yet. Would you like to connect it now?"
          )
        ) {
          window.location.href = "/api/drive/auth";
        }
        setUploadingToDrive(false);
        return;
      }

      // 2. Auto-save changes if valid
      if (dirty && canEdit && draft.number.trim() && draft.billTo.name.trim()) {
        onSave(draft, invoice?.id ?? null);
        setDirty(false);
      }

      // 3. Temporarily switch sheet to pure read/print mode (removes all inputs, blue boxes, placeholders, delete buttons)
      const prevZoom = zoom;
      setIsExporting(true);
      setZoom(1);

      // Wait 120ms for React to update DOM at 100% scale
      await new Promise((r) => setTimeout(r, 120));

      const sheetEl = document.querySelector(".print-host .inv-sheet") as HTMLElement | null;
      if (!sheetEl) {
        throw new Error("Could not find invoice sheet for export.");
      }

      // Ensure fonts and images are ready
      if (document.fonts) {
        await document.fonts.ready;
      }
      const imgs = Array.from(sheetEl.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(true);
          });
        })
      );

      // Render crisp 300dpi canvas directly from the clean sheet
      const canvas = await html2canvas(sheetEl, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: SHEET_W,
      });

      // Restore zoom and edit mode immediately
      setIsExporting(false);
      setZoom(prevZoom);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 595.28 pt
      const pageHeight = pdf.internal.pageSize.getHeight(); // 841.89 pt
      const pdfHeight = Math.min(pageHeight, (canvas.height * pdfWidth) / canvas.width);
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");

      const blob = pdf.output("blob");
      const safeNum = draft.number ? draft.number.replace(/\//g, "-") : "Invoice";
      const fileName = `${safeNum}.pdf`;

      const formData = new FormData();
      formData.append("file", blob, fileName);
      formData.append("fileName", fileName);

      const res = await fetch("/api/drive/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload to Google Drive");
      }

      setDriveNotice({
        type: "success",
        message: `Saved ${fileName} directly to Google Drive (Invoice 26-27)!`,
        link: data.webViewLink,
      });
    } catch (err: unknown) {
      setIsExporting(false);
      const msg = err instanceof Error ? err.message : "Upload failed";
      setDriveNotice({
        type: "error",
        message: msg,
      });
    } finally {
      setUploadingToDrive(false);
    }
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
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-neutral-200">

      {/* ---------------- the bar above the paper ---------------- */}
      <div className="inv-noprint flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
        <button type="button" onClick={close} aria-label="Close" className={bar}>
          ←
        </button>

        <div className="mr-auto min-w-40">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-neutral-900">
              {draft.number || "New invoice"}
            </h2>
            {dirty && canEdit && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                UNSAVED
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            {canEdit
              ? "Click anything on the page to change it."
              : "Your role can read invoices, not change them."}
          </p>
        </div>

        {canEdit && (
          <>
            <select
              aria-label="Status"
              className={select}
              value={draft.status}
              onChange={(e) => {
                const nextStatus = e.target.value as InvoiceStatus;
                if (nextStatus === "paid" && draft.paymentMade < totals.total) {
                  change({ status: nextStatus, paymentMade: totals.total });
                } else if (nextStatus === "sent") {
                  const days = daysAway(draft.dueDate);
                  if (days !== null && days < 0) {
                    change({ status: nextStatus, dueDate: todayISO() });
                  } else {
                    change({ status: nextStatus });
                  }
                } else {
                  change({ status: nextStatus });
                }
              }}
            >
              {(Object.keys(INVOICE_STATUSES) as InvoiceStatus[]).map((key) => (
                <option key={key} value={key}>
                  {INVOICE_STATUSES[key]}
                </option>
              ))}
            </select>

            <select
              aria-label="Tax"
              className={select}
              value={draft.taxMode}
              onChange={(e) => change({ taxMode: e.target.value as TaxMode })}
            >
              {(Object.keys(TAX_MODES) as TaxMode[]).map((key) => (
                <option key={key} value={key}>
                  {TAX_MODES[key]}
                </option>
              ))}
            </select>

            <select
              aria-label="Show this invoice bills"
              className={select}
              value={draft.showId}
              onChange={(e) => {
                const show = shows.find((s) => s.id === e.target.value);
                if (!show) {
                  change({ showId: "" });
                  return;
                }
                const client = clients.find((c) => c.id === show.clientId) ?? null;
                change(invoiceFromShow(draft, show, client, draft.lines[0]?.id ?? "line-1"));
              }}
            >
              <option value="">No show linked</option>
              {billable.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.client || show.location || "Show"} · {formatDate(show.showDate)}
                </option>
              ))}
            </select>

            <label
              className={`flex items-center gap-1.5 ${bar} cursor-pointer`}
              title="Print the company stamp and signature over the signature line"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-neutral-900"
                checked={draft.signature}
                onChange={(e) => change({ signature: e.target.checked })}
              />
              Signature
            </label>

            <label
              className={`flex items-center gap-1.5 ${bar} cursor-pointer`}
              title="Print “This is a computer-generated invoice…” under the frame"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-neutral-900"
                checked={draft.fineprint}
                onChange={(e) => change({ fineprint: e.target.checked })}
              />
              Footer note
            </label>

            <button
              type="button"
              className={bar}
              onClick={() =>
                change({ lines: [...draft.lines, emptyLine(`line-${Date.now()}`)] })
              }
            >
              + Line
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
            title="Start a new invoice from this one"
            onClick={() => {
              if (dirty && !window.confirm("Copy this invoice as it stands? The changes here are not saved yet.")) return;
              onDuplicate(draft);
            }}
            className={bar}
          >
            Duplicate
          </button>
        )}

        {invoice && canDelete && (
          <button
            type="button"
            onClick={() => onDelete(invoice)}
            className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}

        <button type="button" onClick={printPdf} className={bar}>
          Print / PDF
        </button>

        <button
          type="button"
          onClick={uploadDirectlyToDrive}
          disabled={uploadingToDrive}
          className={`${bar} flex items-center gap-1.5 font-medium text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 border border-emerald-300 bg-emerald-50/70`}
          title="Upload this invoice directly into your Google Drive (Invoice 26-27)"
        >
          {uploadingToDrive ? (
            <>
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
              <span>Uploading to Drive…</span>
            </>
          ) : (
            <>
              <svg className="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
              </svg>
              <span>Upload to Drive</span>
            </>
          )}
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

      {/* ---------------- notices ---------------- */}
      {driveNotice && (
        <div
          className={`inv-noprint flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs ${driveNotice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-200 bg-red-50 text-red-900"
            }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {driveNotice.type === "success" ? "✓" : "⚠️"}
            </span>
            <span>{driveNotice.message}</span>
            {driveNotice.link && (
              <a
                href={driveNotice.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-800 underline hover:text-emerald-950"
              >
                View in Google Drive ↗
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDriveNotice(null)}
            className="text-xs font-semibold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {(problem || (linked && received !== draft.paymentMade && canEdit)) && (
        <div className="inv-noprint flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-xs">
          {problem ? (
            <span className="font-medium text-red-700">{problem}</span>
          ) : (
            <>
              <span className="text-neutral-600">
                {formatMoney(received)} is logged against this show, but the invoice shows{" "}
                {formatMoney(draft.paymentMade)} paid.
              </span>
              <button
                type="button"
                onClick={() => change({ paymentMade: received })}
                className="rounded-md bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-200"
              >
                Use {formatMoney(received)}
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------------- the paper ---------------- */}
      <div className="print-host flex-1 overflow-auto p-4 sm:p-8">
        <div className="inv-zoom-wrap mx-auto" style={{ width: SHEET_W * zoom, height: SHEET_H * zoom }}>
          <div
            className="inv-zoom shadow-2xl"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: SHEET_W }}
          >
            <InvoiceSheet
              invoice={{ ...draft, id: invoice?.id ?? "draft" }}
              settings={settings}
              edit={
                canEdit && !isExporting
                  ? {
                    onChange: change,
                    onLineChange: changeLine,
                    onRemoveLine: (id) =>
                      change({ lines: draft.lines.filter((line) => line.id !== id) }),
                    clients,
                  }
                  : undefined
              }
            />
          </div>
        </div>

        <p className="inv-noprint mx-auto pb-4 pt-3 text-center text-[11px] text-neutral-500">
          Balance due {formatMoney(totals.balance)} · printing uses A4 with the browser&rsquo;s
          default margins — the sheet carries its own.
        </p>
      </div>
    </div>
  );

  /* Printing takes everything but this out of the page, which only works
     if the sheet is a child of the body rather than of the app's layout. */
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
