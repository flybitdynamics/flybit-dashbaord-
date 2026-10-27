"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Client, Settings, Show } from "../../lib/types";
import {
  RECEIPT_PAYMENT_MODES,
  Receipt,
  ReceiptPaymentMode,
  invoiceReceiptSummary,
  receiptFromInvoice,
} from "../../lib/receipts";
import { Invoice, totalsFor } from "../../lib/invoices";
import { ReceiptSheet } from "./ReceiptSheet";

const bar =
  "rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200";
const select =
  "rounded-md bg-neutral-100 px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-900";

const SHEET_W = 794; // A4 standard width in px at 96dpi
const SHEET_H = 1123; // A4 standard height in px at 96dpi

function fitToWindow(): number {
  if (typeof window === "undefined") return 1;
  const availW = window.innerWidth - 80;
  const availH = window.innerHeight - 170;
  const scaleW = availW / SHEET_W;
  const scaleH = availH / SHEET_H;
  return Math.min(1, Math.max(0.4, Number(Math.min(scaleW, scaleH).toFixed(2))));
}

function defaultZoom(mode: "single" | "sideBySide", count: number): number {
  if (typeof window === "undefined") return 1;
  if (mode === "sideBySide" && count > 1) {
    const availableW = window.innerWidth - 140;
    const targetW = count * SHEET_W + (count - 1) * 32;
    const ideal = availableW / targetW;
    return Math.min(0.72, Math.max(0.42, Number(ideal.toFixed(2))));
  }
  return fitToWindow();
}

export function ReceiptEditor({
  receipt,
  draft: initial,
  settings,
  invoices,
  shows,
  clients,
  receipts = [],
  initialViewMode,
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
  receipts?: Receipt[];
  initialViewMode?: "single" | "sideBySide";
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onSave: (draft: Omit<Receipt, "id">, id: string | null) => void;
  onDuplicate: (draft: Omit<Receipt, "id">) => void;
  onDelete: (receipt: Receipt) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(!receipt);
  const [problem, setProblem] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<"orange" | "blue" | "navy" | "maroon">("orange");

  // Multi-receipt sibling grouping for this invoice
  const siblingReceipts = useMemo(() => {
    const invId = draft.invoiceId;
    const invNum = draft.invoiceNumber?.trim();
    if (!invId && !invNum) return [];
    const list = receipts.filter(
      (r) =>
        (invId && r.invoiceId === invId) ||
        (invNum && r.invoiceNumber?.trim() === invNum),
    );
    return list.sort((a, b) => a.number.localeCompare(b.number));
  }, [receipts, draft.invoiceId, draft.invoiceNumber]);

  const [viewMode, setViewMode] = useState<"single" | "sideBySide">(
    initialViewMode ?? (siblingReceipts.length > 1 ? "sideBySide" : "single"),
  );

  const [zoom, setZoom] = useState(() =>
    defaultZoom(
      initialViewMode ?? (siblingReceipts.length > 1 ? "sideBySide" : "single"),
      siblingReceipts.length,
    ),
  );

  const [printingReceipt, setPrintingReceipt] = useState<Receipt | Omit<Receipt, "id"> | null>(null);

  // Invoice summary for the subheader badge
  const invoiceSummary = useMemo(() => {
    const inv = invoices.find(
      (i) => i.id === draft.invoiceId || i.number.trim() === draft.invoiceNumber?.trim(),
    );
    if (!inv) return null;
    const totals = totalsFor(inv);
    const totalPaid = siblingReceipts.reduce((sum, r) => sum + (r.amountReceived || 0), 0);
    const balance = Math.max(0, totals.total - totalPaid);
    return {
      invoice: inv,
      totals,
      totalPaid,
      balance,
      isSettled: balance <= 0,
    };
  }, [invoices, draft.invoiceId, draft.invoiceNumber, siblingReceipts]);

  const activeIdx = Math.max(0, siblingReceipts.findIndex((r) => r.number === draft.number));
  const prevIdx =
    siblingReceipts.length > 1
      ? activeIdx > 0
        ? activeIdx - 1
        : siblingReceipts.length - 1
      : 0;
  const nextIdx =
    siblingReceipts.length > 1
      ? activeIdx < siblingReceipts.length - 1
        ? activeIdx + 1
        : 0
      : 0;
  const prevReceipt = siblingReceipts[prevIdx];
  const nextReceipt = siblingReceipts[nextIdx];

  function scrollToReceipt(receiptNumber: string) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`receipt-card-${receiptNumber}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

  function selectSibling(sib: Receipt) {
    if (dirty && !window.confirm("Switch to another receipt without saving current changes?")) return;
    setDraft({ ...sib });
    setDirty(false);
    setProblem(null);
  }

  function goPrevSibling() {
    if (siblingReceipts.length <= 1) return;
    const target = siblingReceipts[prevIdx];
    selectSibling(target);
    if (viewMode === "sideBySide") {
      scrollToReceipt(target.number);
    }
  }

  function goNextSibling() {
    if (siblingReceipts.length <= 1) return;
    const target = siblingReceipts[nextIdx];
    selectSibling(target);
    if (viewMode === "sideBySide") {
      scrollToReceipt(target.number);
    }
  }

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

    const summary = invoiceReceiptSummary(inv, receipts, receipt?.id ?? null);
    if (summary.isZeroBalance && !receipt) {
      setProblem(
        `Invoice ${inv.number} has Balance ₹0 (fully paid). A new receipt cannot be created.`,
      );
      return;
    }

    const matchedShow = shows.find((s) => s.id === inv.showId);
    const populated = receiptFromInvoice(
      inv,
      draft.number,
      undefined,
      draft.paymentMode,
      matchedShow,
      receipts,
      receipt?.id ?? null,
    );
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
    if (!receipt && draft.invoiceId) {
      const inv = invoices.find((i) => i.id === draft.invoiceId);
      if (inv) {
        const summary = invoiceReceiptSummary(inv, receipts);
        if (summary.isZeroBalance) {
          setProblem(
            `Invoice ${inv.number} has Balance ₹0 (already fully paid). A new receipt cannot be created.`,
          );
          return;
        }
      }
    }
    onSave(draft, receipt?.id ?? null);
    setDirty(false);
  }

  /** Print / PDF Export: Captures crisp canvas, generates PDF, uploads to Drive, and triggers print/download */
  async function handlePrintPdf(targetReceipt?: Receipt | Omit<Receipt, "id">) {
    if (uploadingToDrive) return;
    const target = targetReceipt || draft;

    if (!target.number.trim()) {
      setProblem("Give the receipt a number before printing.");
      return;
    }
    if (!target.receivedFrom.trim()) {
      setProblem("Say who the receipt is for — fill in 'Cash Received From'.");
      return;
    }
    if (!receipt && target.invoiceId && target.number === draft.number) {
      const inv = invoices.find((i) => i.id === target.invoiceId);
      if (inv) {
        const summary = invoiceReceiptSummary(inv, receipts);
        if (summary.isZeroBalance) {
          setProblem(
            `Invoice ${inv.number} has Balance ₹0 (already fully paid). A new receipt cannot be created.`,
          );
          return;
        }
      }
    }
    setProblem(null);

    // Auto-save changes if currently active receipt
    if (canEdit && (dirty || !receipt) && target.number === draft.number) {
      onSave(draft, receipt?.id ?? null);
      setDirty(false);
    }

    setUploadingToDrive(true);
    setDriveNotice(null);
    setPrintingReceipt(target);

    const safeNum = target.number ? target.number.replace(/\//g, "-") : "Receipt";
    const fileName = `${safeNum}.pdf`;

    try {
      const prevZoom = zoom;
      setIsExporting(true);
      setZoom(1);

      await new Promise((r) => setTimeout(r, 120));

      const sheetEl = (
        document.querySelector(`.print-host .receipt-sheet`) ||
        document.querySelector(`#receipt-card-${target.number} .receipt-sheet`) ||
        document.querySelector(".receipt-sheet")
      ) as HTMLElement | null;

      if (sheetEl) {
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

        // Filter html2canvas's unsupported modern color function warnings (lab/oklch)
        const origWarn = console.warn;
        console.warn = (...args: any[]) => {
          if (
            typeof args[0] === "string" &&
            (args[0].includes("unsupported color function") || args[0].includes("lab"))
          ) {
            return;
          }
          origWarn.apply(console, args);
        };

        let canvas;
        try {
          canvas = await html2canvas(sheetEl, {
            scale: 3,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
            windowWidth: SHEET_W,
          });
        } finally {
          console.warn = origWarn;
        }

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

        // Optional upload to Google Drive if connected (runs in background)
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
          // Drive upload optional
        }
      }
    } catch (err: any) {
      setIsExporting(false);
      setProblem(err?.message || "Failed to prepare receipt PDF.");
    } finally {
      setIsExporting(false);
      setUploadingToDrive(false);

      // Open browser print dialog — DO NOT auto-download file
      const previous = document.title;
      document.title = safeNum;
      const restore = () => {
        document.title = previous;
        setPrintingReceipt(null);
      };
      window.addEventListener("afterprint", restore, { once: true });
      window.print();
    }
  }

  async function handleDownloadDirectPdf(targetReceipt?: Receipt | Omit<Receipt, "id">) {
    const target = targetReceipt || draft;

    if (!target.number.trim()) {
      setProblem("Give the receipt a number before downloading.");
      return;
    }
    if (!target.receivedFrom.trim()) {
      setProblem("Say who the receipt is for — fill in 'Cash Received From'.");
      return;
    }
    setProblem(null);

    // Auto-save changes if currently active receipt
    if (canEdit && (dirty || !receipt) && target.number === draft.number) {
      onSave(draft, receipt?.id ?? null);
      setDirty(false);
    }

    setPrintingReceipt(target);
    const safeNum = target.number ? target.number.replace(/\//g, "-") : "Receipt";
    const fileName = `${safeNum}.pdf`;

    try {
      const prevZoom = zoom;
      setIsExporting(true);
      setUploadingToDrive(true);
      setZoom(1);

      await new Promise((r) => setTimeout(r, 140));

      const sheetEl = (
        document.querySelector(`.print-host .receipt-sheet`) ||
        document.querySelector(`#receipt-card-${target.number} .receipt-sheet`) ||
        document.querySelector(".receipt-sheet")
      ) as HTMLElement | null;

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

      const origWarn = console.warn;
      console.warn = (...args: any[]) => {
        if (
          typeof args[0] === "string" &&
          (args[0].includes("unsupported color function") || args[0].includes("lab"))
        ) {
          return;
        }
        origWarn.apply(console, args);
      };

      let canvas;
      try {
        canvas = await html2canvas(sheetEl, {
          scale: 3,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: SHEET_W,
        });
      } finally {
        console.warn = origWarn;
      }

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
        // Drive upload optional
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
    } catch (err: any) {
      setIsExporting(false);
      setProblem(err?.message || "Failed to download receipt PDF.");
    } finally {
      setIsExporting(false);
      setUploadingToDrive(false);
      setPrintingReceipt(null);
    }
  }

  const overlay = (
    <div className="print-root fixed inset-0 z-50 flex flex-col bg-neutral-900/40 backdrop-blur-xs">
      {/* Top Action Bar */}
      <header className="inv-noprint flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 shadow-xs">
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
                const summary = invoiceReceiptSummary(inv, receipts, receipt?.id ?? null);
                const isCurrent = draft.invoiceId === inv.id;
                const isZero = summary.isZeroBalance;
                return (
                  <option
                    key={inv.id}
                    value={inv.id}
                    disabled={isZero && !isCurrent}
                  >
                    {inv.number} — {inv.billTo.name || "Client"}{" "}
                    {isZero
                      ? "(Balance ₹0 — Paid)"
                      : summary.receiptCount > 0
                        ? `(Pending: ₹${summary.remainingPending.toLocaleString("en-IN")} of ₹${summary.invoiceTotal.toLocaleString("en-IN")})`
                        : `(₹${summary.invoiceTotal.toLocaleString("en-IN")})`}
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
              <option value="orange">FlyBit Orange (Logo)</option>
              <option value="blue">Classic Blue</option>
              <option value="navy">Slate Navy</option>
              <option value="maroon">Maroon Red</option>
            </select>
          </div>

          {/* Signature Toggle */}
          <label
            className={`flex items-center gap-1.5 ${bar} cursor-pointer text-xs`}
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
            onClick={() => handleDownloadDirectPdf()}
            disabled={uploadingToDrive || isExporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-white border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-xs hover:bg-neutral-50 disabled:opacity-50"
            title="Download PDF directly to your computer"
          >
            <span>⬇</span>
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintPdf()}
            disabled={uploadingToDrive || isExporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50"
            title="Open browser print dialog / Save as PDF"
          >
            {uploadingToDrive ? (
              <>
                <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Preparing…</span>
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

      {/* Sibling Receipts Sub-Header Bar (shown when an invoice has multiple receipts) */}
      {siblingReceipts.length > 1 && (
        <div className="inv-noprint flex flex-wrap items-center justify-between gap-3 bg-neutral-50 px-4 py-2 border-b border-neutral-200 text-xs shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            {invoiceSummary && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-neutral-800">
                  Invoice {invoiceSummary.invoice.number}:
                </span>
                <span className="text-neutral-500">
                  Total ₹{invoiceSummary.totals.total.toLocaleString("en-IN")}
                </span>
                <span className="text-neutral-300">•</span>
                <span className="font-semibold text-emerald-700">
                  Paid ({siblingReceipts.length} receipts) ₹
                  {invoiceSummary.totalPaid.toLocaleString("en-IN")}
                </span>
                <span className="text-neutral-300">•</span>
                {invoiceSummary.isSettled ? (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-bold">
                    ✓ Settled (₹0 Balance)
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
                    Pending ₹{invoiceSummary.balance.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            )}

            <div className="h-4 w-px bg-neutral-300 hidden sm:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              {siblingReceipts.map((sib, idx) => {
                const isActive = sib.number === draft.number;
                return (
                  <button
                    key={sib.id || sib.number}
                    type="button"
                    onClick={() => {
                      selectSibling(sib);
                      if (viewMode === "sideBySide") {
                        scrollToReceipt(sib.number);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono transition-all ${isActive && viewMode === "single"
                        ? "bg-blue-600 text-white font-bold shadow-xs ring-1 ring-blue-700"
                        : isActive && viewMode === "sideBySide"
                          ? "bg-blue-100 text-blue-900 border border-blue-400 font-bold"
                          : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100"
                      }`}
                  >
                    <span className="opacity-75">#{idx + 1}</span>
                    <span>{sib.number}</span>
                    <span
                      className={
                        isActive && viewMode === "single"
                          ? "text-blue-100"
                          : "text-emerald-700 font-bold"
                      }
                    >
                      ₹{sib.amountReceived.toLocaleString("en-IN")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* View Mode & Fit Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom(defaultZoom(viewMode, siblingReceipts.length))}
              className="rounded px-2.5 py-1 text-xs font-medium text-neutral-600 bg-white border border-neutral-300 hover:bg-neutral-100 shadow-2xs"
              title="Reset Zoom to fit all sheets on screen"
            >
              Fit Screen
            </button>

            <div className="flex items-center rounded-md bg-neutral-200 p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setViewMode("single");
                  setZoom(fitToWindow());
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${viewMode === "single"
                    ? "bg-white text-neutral-900 shadow-xs font-semibold"
                    : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                Single Sheet
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("sideBySide");
                  setZoom(defaultZoom("sideBySide", siblingReceipts.length));
                }}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors ${viewMode === "sideBySide"
                    ? "bg-blue-600 text-white shadow-xs font-semibold"
                    : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                <span>☷ Side by Side ({siblingReceipts.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Side Navigation Buttons (Left & Right) */}
      {siblingReceipts.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrevSibling}
            className="inv-noprint fixed left-4 top-1/2 -translate-y-1/2 z-40 group flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-3 text-neutral-800 shadow-2xl border border-neutral-300 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 hover:scale-105 active:scale-95 transition-all focus:outline-none"
            title={`Previous: Receipt #${prevReceipt?.number} (₹${prevReceipt?.amountReceived?.toLocaleString("en-IN")})`}
            aria-label="Previous Receipt"
          >
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden group-hover:inline-block text-xs font-semibold whitespace-nowrap pr-1">
              Prev: #{prevReceipt?.number} (₹{prevReceipt?.amountReceived?.toLocaleString("en-IN")})
            </span>
          </button>

          <button
            type="button"
            onClick={goNextSibling}
            className="inv-noprint fixed right-4 top-1/2 -translate-y-1/2 z-40 group flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-3 text-neutral-800 shadow-2xl border border-neutral-300 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 hover:scale-105 active:scale-95 transition-all focus:outline-none"
            title={`Next: Receipt #${nextReceipt?.number} (₹${nextReceipt?.amountReceived?.toLocaleString("en-IN")})`}
            aria-label="Next Receipt"
          >
            <span className="hidden group-hover:inline-block text-xs font-semibold whitespace-nowrap pl-1">
              Next: #{nextReceipt?.number} (₹{nextReceipt?.amountReceived?.toLocaleString("en-IN")})
            </span>
            <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Floating Bottom Quick Jump Dock */}
          <div className="inv-noprint fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-neutral-900/95 backdrop-blur-md text-white p-1.5 rounded-full shadow-2xl border border-neutral-700 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode("sideBySide");
                setZoom(defaultZoom("sideBySide", siblingReceipts.length));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all ${viewMode === "sideBySide"
                  ? "bg-blue-600 text-white shadow-md font-semibold"
                  : "hover:bg-neutral-800 text-neutral-300"
                }`}
            >
              <span>☷ All Side by Side ({siblingReceipts.length})</span>
            </button>
            <div className="h-4 w-px bg-neutral-700 mx-1" />
            {siblingReceipts.map((sib, idx) => {
              const isCurrent = sib.number === draft.number;
              return (
                <button
                  key={sib.id || sib.number}
                  type="button"
                  onClick={() => {
                    selectSibling(sib);
                    if (viewMode === "sideBySide") {
                      scrollToReceipt(sib.number);
                    }
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-mono transition-all ${isCurrent
                      ? "bg-emerald-600 text-white font-bold shadow-md ring-1 ring-white/50"
                      : "hover:bg-neutral-800 text-neutral-300"
                    }`}
                  title={`Receipt #${sib.number}: ₹${sib.amountReceived.toLocaleString("en-IN")}`}
                >
                  <span className="opacity-75">#{idx + 1}</span>
                  <span>{sib.number}</span>
                  <span className="text-emerald-300 font-semibold text-[11px]">
                    ₹{sib.amountReceived.toLocaleString("en-IN")}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Notices */}
      {problem && (
        <div className="inv-noprint bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-700 border-b border-red-200">
          ⚠️ {problem}
        </div>
      )}

      {driveNotice && (
        <div
          className={`inv-noprint px-4 py-2 text-center text-xs font-semibold border-b flex items-center justify-center gap-2 ${driveNotice.type === "success"
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
      {viewMode === "sideBySide" && siblingReceipts.length > 1 ? (
        <div className="flex-1 overflow-auto p-6 flex justify-start lg:justify-center bg-neutral-800/20">
          {/* Multi-column list for on-screen viewing */}
          <div className="inv-noprint flex items-start gap-8 px-8 py-6 min-w-max mx-auto">
            {siblingReceipts.map((sib, idx) => {
              const isFocused = sib.number === draft.number;
              return (
                <div
                  key={sib.id || sib.number}
                  id={`receipt-card-${sib.number}`}
                  style={{ width: `${SHEET_W * zoom}px` }}
                  className="shrink-0 flex flex-col items-center transition-all select-text cursor-pointer"
                  onClick={() => selectSibling(sib)}
                >
                  <div
                    style={{
                      width: `${SHEET_W}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                    className={`transition-all rounded-lg overflow-hidden ${isFocused
                        ? "ring-4 ring-blue-600 shadow-2xl"
                        : "shadow-xl hover:shadow-2xl hover:ring-2 hover:ring-blue-300"
                      }`}
                  >
                    {/* Card Header Banner */}
                    <div className="flex items-center justify-between px-5 py-3 bg-neutral-900 text-white border-b border-neutral-700 shadow-xs">
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold font-mono shadow-xs">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm tracking-wide">
                              Receipt #{sib.number}
                            </span>
                            <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-mono font-bold">
                              ₹{sib.amountReceived.toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
                            <span>{sib.receiptDate}</span>
                            <span>•</span>
                            <span className="uppercase tracking-wider font-medium text-neutral-300">
                              {RECEIPT_PAYMENT_MODES[sib.paymentMode] || sib.paymentMode}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadDirectPdf(sib);
                          }}
                          className="flex items-center gap-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 px-2.5 py-1.5 text-xs font-medium transition-colors"
                          title="Download PDF directly to your computer"
                        >
                          <span>⬇ PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintPdf(sib);
                          }}
                          className="flex items-center gap-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 px-3 py-1.5 text-xs font-medium transition-colors"
                          title="Print or Save PDF via browser dialog"
                        >
                          <span>🖨️</span>
                          <span>Print PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectSibling(sib);
                            setViewMode("single");
                            setZoom(fitToWindow());
                          }}
                          className="flex items-center gap-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs font-medium transition-colors shadow-xs"
                          title="Open this receipt in single editor view"
                        >
                          <span>Focus Sheet ↗</span>
                        </button>
                      </div>
                    </div>

                    {/* Receipt Sheet */}
                    <div className="bg-white">
                      <ReceiptSheet
                        receipt={sib}
                        settings={settings}
                        colorScheme={colorScheme}
                        edit={
                          canEdit && !isExporting && isFocused && !printingReceipt
                            ? {
                              onChange: change,
                              clients,
                              invoices,
                              receipts,
                            }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dedicated clean sheet for printing during side-by-side mode */}
          <div className="print-host hidden print:block">
            <div className="inv-zoom-wrap mx-auto">
              <div className="inv-zoom">
                <ReceiptSheet
                  receipt={{
                    ...(printingReceipt || draft),
                    id: (printingReceipt as Receipt)?.id ?? receipt?.id ?? "draft",
                  }}
                  settings={settings}
                  colorScheme={colorScheme}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="print-host flex-1 overflow-auto p-4 sm:p-6 flex justify-center bg-neutral-800/20">
          <div
            className="inv-zoom-wrap mx-auto"
            style={{ width: SHEET_W * zoom, height: SHEET_H * zoom }}
          >
            <div
              className="inv-zoom shadow-2xl"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: SHEET_W, height: SHEET_H }}
            >
              <ReceiptSheet
                receipt={{
                  ...(printingReceipt || draft),
                  id: receipt?.id ?? "draft",
                }}
                settings={settings}
                colorScheme={colorScheme}
                edit={
                  canEdit && !isExporting && !printingReceipt
                    ? {
                      onChange: change,
                      clients,
                      invoices,
                      receipts,
                    }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* Printing takes everything but this out of the page, which only works
     if the sheet is a child of the body rather than of the app's layout. */
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
