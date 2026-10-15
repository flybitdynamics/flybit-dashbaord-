"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Client, Settings, Show } from "../../lib/types";
import {
  RECEIPT_PAYMENT_MODES,
  Receipt,
  ReceiptPaymentMode,
  receiptFromInvoice,
} from "../../lib/receipts";
import { Invoice, totalsFor } from "../../lib/invoices";
import { ReceiptSheet } from "./ReceiptSheet";

const bar =
  "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200";
const select =
  "rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

const SHEET_W = 794; // A4 standard width in px at 96dpi

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.4, (window.innerWidth - 80) / SHEET_W));
}

export function ReceiptEditor({
  receipt,
  draft: initial,
  settings,
  invoices,
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
  receipt: Receipt | null;
  draft: Omit<Receipt, "id">;
  settings: Settings;
  invoices: Invoice[];
  shows: Show[];
  clients: Client[];
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: Omit<Receipt, "id">, id: string | null) => void;
  onDuplicate: (draft: Omit<Receipt, "id">) => void;
  onDelete: (receipt: Receipt) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [zoom, setZoom] = useState(fitToWindow);
  const [dirty, setDirty] = useState(!receipt);
  const [problem, setProblem] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<"blue" | "navy" | "maroon">("blue");

  const [isExporting, setIsExporting] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(false);
  const [driveNotice, setDriveNotice] = useState<{
    type: "success" | "error";
    message: string;
    link?: string;
  } | null>(null);

  function change(patch: Partial<Omit<Receipt, "id">>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setProblem(null);
  }

  // Handle picking an invoice from dropdown
  function handleSelectInvoice(invoiceId: string) {
    if (!invoiceId) {
      change({ invoiceId: "", invoiceNumber: "" });
      return;
    }
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    const matchedShow = shows.find((s) => s.id === inv.showId);
    const populated = receiptFromInvoice(inv, draft.number, undefined, draft.paymentMode, matchedShow);
    setDraft((prev) => ({
      ...prev,
      ...populated,
      number: prev.number, // keep current receipt number
    }));
    setDirty(true);
    setProblem(null);
  }

  function close() {
    if (dirty && !window.confirm("Close without saving this receipt?")) return;
    onClose();
  }

  function save() {
    if (!draft.number.trim()) {
      setProblem("The receipt needs a receipt number.");
      return;
    }
    if (!draft.receivedFrom.trim()) {
      setProblem("Say who the receipt is for — fill in 'Cash Received From'.");
      return;
    }
    onSave(draft, receipt?.id ?? null);
    setDirty(false);
  }

  /** Print / PDF Export: Captures crisp canvas, generates PDF, uploads to Drive, and triggers print/download */
  async function handlePrintPdf() {
    if (uploadingToDrive) return;

    if (!draft.number.trim()) {
      setProblem("Give the receipt a number before printing.");
      return;
    }
    if (!draft.receivedFrom.trim()) {
      setProblem("Say who the receipt is for — fill in 'Cash Received From'.");
      return;
    }
    setProblem(null);

    // Auto-save changes
    if (canEdit && (dirty || !receipt)) {
      onSave(draft, receipt?.id ?? null);
      setDirty(false);
    }

    setUploadingToDrive(true);
    setDriveNotice(null);

    const safeNum = draft.number ? draft.number.replace(/\//g, "-") : "Receipt";
    const fileName = `${safeNum}.pdf`;

    try {
      const prevZoom = zoom;
      setIsExporting(true);
      setZoom(1);

      await new Promise((r) => setTimeout(r, 120));

      const sheetEl = document.querySelector(".print-host .receipt-sheet") as HTMLElement | null;
      if (!sheetEl) {
        throw new Error("Could not find receipt sheet for export.");
      }

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

      const canvas = await html2canvas(sheetEl, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: SHEET_W,
      });

      setIsExporting(false);
      setZoom(prevZoom);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pdfHeight = Math.min(pageHeight, (canvas.height * pdfWidth) / canvas.width);
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");

      const blob = pdf.output("blob");

      // Optional upload to Google Drive if connected
      try {
        const formData = new FormData();
        formData.append("file", blob, fileName);
        formData.append("fileName", fileName);

        const res = await fetch("/api/drive/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setDriveNotice({
            type: "success",
            message: `Saved ${fileName} to Google Drive!`,
            link: data.webViewLink,
          });
        }
      } catch {
        // Drive upload optional; proceed with direct download/print
      }

      // Download PDF directly for user
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      window.print();
    } catch (err: any) {
      setIsExporting(false);
      setProblem(err?.message || "Failed to generate receipt PDF.");
    } finally {
      setUploadingToDrive(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/40 backdrop-blur-xs">
      {/* Top Action Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            ← Back
          </button>
          <span className="text-neutral-300">|</span>

          {/* Link to Invoice Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-neutral-600">Link Invoice:</span>
            <select
              aria-label="Link to an invoice"
              className={select}
              value={draft.invoiceId || ""}
              onChange={(e) => handleSelectInvoice(e.target.value)}
            >
              <option value="">(No invoice linked)</option>
              {invoices.map((inv) => {
                const invTotals = totalsFor(inv);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {inv.billTo.name || "Client"} (₹{invTotals.total.toLocaleString("en-IN")})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Payment Mode Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-neutral-600">Mode:</span>
            <select
              aria-label="Payment mode"
              className={select}
              value={draft.paymentMode}
              onChange={(e) => change({ paymentMode: e.target.value as ReceiptPaymentMode })}
            >
              {(Object.keys(RECEIPT_PAYMENT_MODES) as ReceiptPaymentMode[]).map((m) => (
                <option key={m} value={m}>
                  {RECEIPT_PAYMENT_MODES[m]}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Color Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-neutral-600">Color:</span>
            <select
              aria-label="Receipt border theme"
              className={select}
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as any)}
            >
              <option value="blue">Classic Blue</option>
              <option value="navy">Slate Navy</option>
              <option value="maroon">Maroon Red</option>
            </select>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center rounded-md bg-neutral-100 p-0.5 text-xs font-mono text-neutral-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              className="px-2 py-1 hover:bg-white rounded"
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-1 hover:bg-white rounded"
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
              className="px-2 py-1 hover:bg-white rounded"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {receipt && canCreate && (
            <button
              type="button"
              onClick={() => onDuplicate(draft)}
              className={bar}
              title="Duplicate this receipt"
            >
              Duplicate
            </button>
          )}

          {receipt && canDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete receipt ${receipt.number}?`)) {
                  onDelete(receipt);
                  onClose();
                }
              }}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-white border border-neutral-300 px-3.5 py-1.5 text-sm font-medium text-neutral-800 shadow-xs hover:bg-neutral-50"
            >
              {dirty ? "Save Receipt" : "Saved ✓"}
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintPdf}
            disabled={uploadingToDrive}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {uploadingToDrive ? (
              <>
                <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Exporting…</span>
              </>
            ) : (
              <>
                <span>🖨️</span>
                <span>Print / Save PDF</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Notices */}
      {problem && (
        <div className="bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-700 border-b border-red-200">
          ⚠️ {problem}
        </div>
      )}

      {driveNotice && (
        <div
          className={`px-4 py-2 text-center text-xs font-semibold border-b flex items-center justify-center gap-2 ${
            driveNotice.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{driveNotice.type === "success" ? "✓" : "⚠️"}</span>
          <span>{driveNotice.message}</span>
          {driveNotice.link && (
            <a
              href={driveNotice.link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              Open in Drive ↗
            </a>
          )}
        </div>
      )}

      {/* Document Workspace */}
      <div className="flex-1 overflow-auto p-6 flex justify-center bg-neutral-800/20">
        <div
          className="print-host transition-transform duration-150 origin-top"
          style={{ transform: `scale(${zoom})` }}
        >
          <ReceiptSheet
            receipt={{ ...draft, id: receipt?.id ?? "draft" }}
            settings={settings}
            colorScheme={colorScheme}
            edit={
              canEdit && !isExporting
                ? {
                    onChange: change,
                    clients,
                    invoices,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
