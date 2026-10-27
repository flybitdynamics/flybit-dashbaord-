"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Client, Settings } from "../../lib/types";
import { Invoice } from "../../lib/invoices";
import {
  RECEIPT_PAYMENT_MODES,
  Receipt,
  ReceiptPaymentMode,
  receiptAmountInWords,
  receiptDate,
} from "../../lib/receipts";
import { DateSlot, GrowSlot, MoneySlot, Slot } from "../sheet/Fields";

export interface ReceiptSheetEdit {
  onChange: (patch: Partial<Omit<Receipt, "id">>) => void;
  clients: Client[];
  invoices: Invoice[];
  receipts?: Receipt[];
}

export function ReceiptSheet({
  receipt,
  settings,
  edit,
  colorScheme = "orange",
}: {
  receipt: Receipt;
  settings: Settings;
  edit?: ReceiptSheetEdit;
  colorScheme?: "orange" | "blue" | "navy" | "maroon";
}) {
  const on = Boolean(edit);

  // Border & Accent Colors matching the user's template image and FlyBit logo theme
  const colors = {
    orange: {
      outerBorder: "border-[#ea580c]",
      innerBorder: "border-[#f6a20a]",
      titleText: "text-[#c2410c]",
      headerCompany: "text-[#0f172a]",
      tableHeaderBg: "bg-[#fff7ed]",
      tableBorder: "border-[#fed7aa]",
      accentBg: "bg-[#ffedd5]",
      checkboxBg: "border-[#ea580c] bg-[#ea580c] text-white",
      badgeBg: "text-[#c2410c] bg-[#fff7ed] border-[#fed7aa]",
    },
    blue: {
      outerBorder: "border-[#1e40af]",
      innerBorder: "border-[#2563eb]",
      titleText: "text-[#1e3a8a]",
      headerCompany: "text-[#1e3a8a]",
      tableHeaderBg: "bg-[#eff6ff]",
      tableBorder: "border-[#93c5fd]",
      accentBg: "bg-[#dbeafe]",
      checkboxBg: "border-[#2563eb] bg-[#2563eb] text-white",
      badgeBg: "text-[#1e3a8a] bg-[#eff6ff] border-[#bfdbfe]",
    },
    navy: {
      outerBorder: "border-[#0f172a]",
      innerBorder: "border-[#334155]",
      titleText: "text-[#0f172a]",
      headerCompany: "text-[#0f172a]",
      tableHeaderBg: "bg-[#f5f5f5]",
      tableBorder: "border-[#d4d4d4]",
      accentBg: "bg-[#f5f5f5]",
      checkboxBg: "border-[#0f172a] bg-[#0f172a] text-white",
      badgeBg: "text-[#0f172a] bg-[#f8fafc] border-[#cbd5e1]",
    },
    maroon: {
      outerBorder: "border-[#991b1b]",
      innerBorder: "border-[#dc2626]",
      titleText: "text-[#7f1d1d]",
      headerCompany: "text-[#7f1d1d]",
      tableHeaderBg: "bg-[#fef2f2]",
      tableBorder: "border-[#fca5a5]",
      accentBg: "bg-[#fee2e2]",
      checkboxBg: "border-[#dc2626] bg-[#dc2626] text-white",
      badgeBg: "text-[#7f1d1d] bg-[#fef2f2] border-[#fecaca]",
    },
  }[colorScheme] || {
    outerBorder: "border-[#ea580c]",
    innerBorder: "border-[#f6a20a]",
    titleText: "text-[#c2410c]",
    headerCompany: "text-[#0f172a]",
    tableHeaderBg: "bg-[#fff7ed]",
    tableBorder: "border-[#fed7aa]",
    accentBg: "bg-[#ffedd5]",
    checkboxBg: "border-[#ea580c] bg-[#ea580c] text-white",
    badgeBg: "text-[#c2410c] bg-[#fff7ed] border-[#fed7aa]",
  };

  const amountInWords = receiptAmountInWords(receipt.amountReceived);

  // Auto-fill client details if name matches
  function handleClientNameChange(name: string) {
    if (!edit) return;
    const match = edit.clients.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (match) {
      edit.onChange({
        receivedFrom: match.name,
        clientId: match.id,
        clientAddress: [match.address, match.city, match.state].filter(Boolean).join(", "),
        clientGstin: match.gstin || "",
        clientPhone: match.contactPhone || "",
      });
    } else {
      edit.onChange({ receivedFrom: name });
    }
  }

  // Compute previous payments already recorded on other receipts for this invoice
  const priorReceived = useMemo(() => {
    if (!receipt.invoiceId || !edit?.receipts) return 0;
    return edit.receipts
      .filter((r) => r.invoiceId === receipt.invoiceId && r.number !== receipt.number)
      .reduce((sum, r) => sum + (r.amountReceived || 0), 0);
  }, [receipt.invoiceId, receipt.number, edit?.receipts]);

  // Auto-calculate balance when total or received changes
  function handleTotalChange(total: number) {
    if (!edit) return;
    edit.onChange({
      totalAmountDue: total,
      balanceDue: Math.max(0, total - priorReceived - (receipt.amountReceived || 0)),
    });
  }

  function handleReceivedChange(received: number) {
    if (!edit) return;
    edit.onChange({
      amountReceived: received,
      balanceDue: Math.max(0, (receipt.totalAmountDue || 0) - priorReceived - received),
    });
  }

  return (
    <div className="receipt-sheet relative mx-auto w-[595.4pt] min-h-[841.7pt] h-[841.7pt] bg-white p-[24pt] text-black font-sans box-border select-text print:shadow-none shadow-md flex flex-col">
      {/* Outer Double Frame (Matches Reference Template) */}
      <div className={`receipt-outer-frame border-2 ${colors.outerBorder} p-[4pt] rounded-sm flex-1 flex flex-col`}>
        <div className={`receipt-inner-frame border ${colors.innerBorder} p-[18pt] bg-white flex-1 flex flex-col justify-between`}>
          {/* Header Section */}
          <div>
            <div className="flex items-start justify-between gap-6 border-b pb-3 border-[#e5e7eb]">
              {/* Company Details */}
              <div className="flex-1 min-w-0 pr-2">
                <h1 className={`text-xl font-bold tracking-tight ${colors.headerCompany}`}>
                  {settings.companyName || "Flybit Dynamics Private Limited"}
                </h1>
                <div className="mt-1 text-[9.5pt] leading-[13.5pt] text-[#4b5563]">
                  <div>{settings.companyAddressLine1 || settings.companyAddress || "Ahmedabad, Gujarat"}</div>
                  {settings.companyAddressLine2 && <div>{settings.companyAddressLine2}</div>}
                  <div className="flex flex-wrap items-center gap-x-2.5 text-[8.5pt] mt-0.5">
                    {settings.companyPhone && <span>Phone: {settings.companyPhone}</span>}
                    {settings.companyEmail && <span>Email: {settings.companyEmail}</span>}
                    {settings.website && <span>Web: {settings.website}</span>}
                  </div>
                  {settings.gstin && (
                    <div className="text-[8.5pt] font-semibold text-[#1f2937] mt-0.5">
                      GSTIN: {settings.gstin}
                    </div>
                  )}
                </div>
              </div>

              {/* FlyBit Logo & Payment Receipt Title (Logo positioned just above Payment Receipt) */}
              <div className="text-right flex flex-col items-end shrink-0 pl-2">
                {/* Logo just above Payment Receipt */}
                <div className="mb-2">
                  <Image
                    src="/logo-on-light.png"
                    alt="FLYBIT Dynamics"
                    width={666}
                    height={276}
                    unoptimized
                    priority
                    className="h-10 w-auto object-contain"
                  />
                </div>

                <div className="flex flex-col items-end">
                  <div className={`text-lg sm:text-xl font-extrabold uppercase tracking-wide whitespace-nowrap ${colors.titleText}`}>
                    {on ? (
                      <Slot
                        value={receipt.title || "Payment Receipt"}
                        edit={on}
                        onChange={(v) => edit?.onChange({ title: v })}
                        className="text-right font-extrabold whitespace-nowrap !m-0 !p-0.5"
                      />
                    ) : (
                      receipt.title || "Payment Receipt"
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10pt] whitespace-nowrap">
                    <span className="font-semibold text-[#374151]">Date:</span>
                    <span className="font-mono font-medium inline-block">
                      <DateSlot
                        value={receipt.receiptDate}
                        edit={on}
                        onChange={(iso) => edit?.onChange({ receiptDate: iso })}
                        className="!w-24 text-right font-mono font-medium !m-0 !p-0.5"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Receipt Numbers Bar */}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4 bg-[#f9fafb] px-3 py-2 rounded border border-[#e5e7eb] text-[10pt]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1f2937]">Receipt #:</span>
                <span className="font-mono font-bold text-[#111827]">
                  <Slot
                    value={receipt.number}
                    edit={on}
                    onChange={(v) => edit?.onChange({ number: v })}
                    placeholder="REC-2026-001"
                  />
                </span>
              </div>

              {/* Invoice Number (Mandatory user requirement) */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1f2937]">Invoice #:</span>
                <span className={`font-mono font-semibold px-2 py-0.5 rounded border ${colors.badgeBg}`}>
                  <Slot
                    value={receipt.invoiceNumber || "—"}
                    edit={on}
                    onChange={(v) => edit?.onChange({ invoiceNumber: v })}
                    placeholder="INV-000000"
                  />
                </span>
              </div>

              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-bold text-[#1f2937]">Amount:</span>
                <span className="inline-flex items-center font-mono font-bold text-[#065f46] text-[11pt]">
                  <span className="mr-0.5 select-none">₹</span>
                  <MoneySlot
                    value={receipt.amountReceived}
                    edit={on}
                    onChange={handleReceivedChange}
                    className="!w-24 text-left font-mono font-bold text-[#065f46] text-[11pt]"
                  />
                </span>
              </div>
            </div>

            {/* Body Lines matching template */}
            <div className="mt-5 space-y-4 text-[10.5pt]">
              {/* Received From */}
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-bold text-[#1f2937]">
                  Cash Received From:
                </span>
                <div className="flex-1 border-b border-[#9ca3af] pb-0.5 font-semibold text-[#111827]">
                  <Slot
                    value={receipt.receivedFrom}
                    edit={on}
                    onChange={handleClientNameChange}
                    placeholder="Client or Company Name"
                    className="w-full font-semibold"
                  />
                </div>
              </div>

              {/* Sum of words */}
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-bold text-[#1f2937]">
                  The Sum of:
                </span>
                <div className="flex-1 border-b border-[#9ca3af] pb-0.5 italic text-[#1f2937]">
                  {amountInWords}
                </div>
              </div>

              {/* For reason */}
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-bold text-[#1f2937]">For:</span>
                <div className="flex-1 border-b border-[#9ca3af] pb-0.5 text-[#111827]">
                  <GrowSlot
                    value={receipt.forReason}
                    edit={on}
                    onChange={(v) => edit?.onChange({ forReason: v })}
                    placeholder="Event, show details or services provided"
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Middle Section: Payment Mode on Left + Financial Table Box on Right (Matches image layout) */}
            <div className="mt-6 grid grid-cols-12 gap-5 items-start">
              {/* Payment Received in Box (Left) */}
              <div className="col-span-7 rounded border border-[#d1d5db] p-3 bg-[#f9fafb]">
                <div className="text-[9.5pt] font-bold uppercase tracking-wider text-[#374151] mb-2">
                  Payment Received in:
                </div>

                <div className="grid grid-cols-2 gap-2 text-[9pt]">
                  {(
                    ["cash", "upi", "bank", "cheque", "other"] as ReceiptPaymentMode[]
                  ).map((mode) => {
                    const isSelected = receipt.paymentMode === mode;
                    return (
                      <label
                        key={mode}
                        className={`flex items-center gap-2 cursor-pointer select-none rounded px-2 py-1 transition-colors ${isSelected
                          ? "bg-white font-bold text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-[#d1d5db]"
                          : "text-[#4b5563] hover:text-[#111827]"
                          }`}
                        onClick={() => {
                          if (on && edit) {
                            edit.onChange({ paymentMode: mode });
                          }
                        }}
                      >
                        <span
                          className={`flex size-4 items-center justify-center rounded border text-[10px] font-bold ${isSelected
                            ? colors.checkboxBg
                            : "border-[#9ca3af] bg-white"
                            }`}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{RECEIPT_PAYMENT_MODES[mode]}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Reference Number / Cheque Details */}
                <div className="mt-3 border-t border-[#e5e7eb] pt-2 flex items-center gap-2 text-[9pt]">
                  <span className="font-semibold text-[#4b5563] whitespace-nowrap">
                    Ref / Cheque #:
                  </span>
                  <div className="flex-1 font-mono">
                    <Slot
                      value={receipt.referenceNumber}
                      edit={on}
                      onChange={(v) => edit?.onChange({ referenceNumber: v })}
                      placeholder="Transaction ID / Cheque No."
                      className="w-full font-mono text-[9pt]"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Summary Table (Right) - EXACT formation from the image */}
              <div className="col-span-5">
                <table className="w-full border-collapse border border-[#9ca3af] text-[9.5pt]">
                  <tbody>
                    <tr className="border-b border-[#d1d5db]">
                      <td className="px-3 py-1.5 font-semibold text-[#374151] bg-[#f9fafb] border-r border-[#d1d5db]">
                        Total Amount Due
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium text-[#111827]">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="select-none">₹</span>
                          <MoneySlot
                            value={receipt.totalAmountDue}
                            edit={on}
                            onChange={handleTotalChange}
                            className="!w-24 text-right"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-[#d1d5db] bg-[#f0fdf4]">
                      <td className="px-3 py-1.5 font-bold text-[#065f46] border-r border-[#d1d5db]">
                        Amount Received
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-[#065f46]">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="select-none">₹</span>
                          <MoneySlot
                            value={receipt.amountReceived}
                            edit={on}
                            onChange={handleReceivedChange}
                            className="!w-24 text-right font-bold text-[#065f46]"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-[#f9fafb]">
                      <td className="px-3 py-1.5 font-bold text-[#1f2937] border-r border-[#d1d5db]">
                        Balance Due
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-[#111827]">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="select-none">₹</span>
                          <span>
                            {Math.max(
                              0,
                              receipt.balanceDue !== undefined
                                ? receipt.balanceDue
                                : (receipt.totalAmountDue || 0) - priorReceived - (receipt.amountReceived || 0),
                            ).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {priorReceived > 0 && (
                  <div className="mt-1 text-[8pt] text-[#6b7280] italic text-right">
                    * ₹{priorReceived.toLocaleString("en-IN")} received in prior receipt(s)
                  </div>
                )}

                {receipt.notes && (
                  <div className="mt-2 text-[8.5pt] text-[#6b7280] italic">
                    {receipt.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Section: Authorized Signatory */}
          <div className="mt-auto pt-4 border-t border-dashed border-[#d1d5db] flex items-end justify-between">
            <div className="text-[8pt] text-[#6b7280]">
              {receipt.fineprint && (
                <>
                  <div>This is a computer-generated receipt issued by Flybit Dynamics.</div>
                  <div>Thank you for choosing FlyBit for your drone light show experience!</div>
                </>
              )}
            </div>

            {/* Signed By Block */}
            <div className="text-center min-w-44 flex flex-col items-center">
              {receipt.signature ? (
                <div className="flex justify-center -mb-2">
                  <Image
                    src="/signature.png"
                    alt="Authorized Signatory"
                    width={367}
                    height={183}
                    unoptimized
                    priority
                    className="h-16 w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="h-14" />
              )}
              <div className="w-48 border-t border-[#374151] pt-1 text-center">
                <div className="text-[9pt] font-bold text-[#111827]">
                  Signed By / Authorized Signatory
                </div>
                <div className="text-[8pt] text-[#4b5563]">
                  {settings.companyName || "Flybit Dynamics Pvt. Ltd."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
