"use client";

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
}

export function ReceiptSheet({
  receipt,
  settings,
  edit,
  colorScheme = "blue",
}: {
  receipt: Receipt;
  settings: Settings;
  edit?: ReceiptSheetEdit;
  colorScheme?: "blue" | "navy" | "maroon";
}) {
  const on = Boolean(edit);

  // Border & Accent Colors matching the user's template image
  const colors = {
    blue: {
      outerBorder: "border-[#1e40af]",
      innerBorder: "border-[#2563eb]",
      titleText: "text-[#1e3a8a]",
      headerCompany: "text-[#1e3a8a]",
      tableHeaderBg: "bg-[#eff6ff]",
      tableBorder: "border-[#93c5fd]",
      accentBg: "bg-[#dbeafe]",
    },
    navy: {
      outerBorder: "border-[#0f172a]",
      innerBorder: "border-[#334155]",
      titleText: "text-[#0f172a]",
      headerCompany: "text-[#0f172a]",
      tableHeaderBg: "bg-neutral-100",
      tableBorder: "border-neutral-300",
      accentBg: "bg-neutral-100",
    },
    maroon: {
      outerBorder: "border-[#991b1b]",
      innerBorder: "border-[#dc2626]",
      titleText: "text-[#7f1d1d]",
      headerCompany: "text-[#7f1d1d]",
      tableHeaderBg: "bg-[#fef2f2]",
      tableBorder: "border-[#fca5a5]",
      accentBg: "bg-[#fee2e2]",
    },
  }[colorScheme] || {
    outerBorder: "border-[#1e40af]",
    innerBorder: "border-[#2563eb]",
    titleText: "text-[#1e3a8a]",
    headerCompany: "text-[#1e3a8a]",
    tableHeaderBg: "bg-[#eff6ff]",
    tableBorder: "border-[#93c5fd]",
    accentBg: "bg-[#dbeafe]",
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

  // Auto-calculate balance when total or received changes
  function handleTotalChange(total: number) {
    if (!edit) return;
    edit.onChange({
      totalAmountDue: total,
      balanceDue: Math.max(0, total - (receipt.amountReceived || 0)),
    });
  }

  function handleReceivedChange(received: number) {
    if (!edit) return;
    edit.onChange({
      amountReceived: received,
      balanceDue: Math.max(0, (receipt.totalAmountDue || 0) - received),
    });
  }

  return (
    <div className="receipt-sheet relative mx-auto w-[595.4pt] min-h-[500pt] bg-white p-[24pt] text-black font-sans box-border select-text print:p-0 print:m-0 print:shadow-none shadow-md">
      {/* Outer Double Frame (Matches Reference Template) */}
      <div className={`receipt-outer-frame border-2 ${colors.outerBorder} p-[4pt] rounded-sm`}>
        <div className={`receipt-inner-frame border ${colors.innerBorder} p-[18pt] bg-white flex flex-col justify-between`}>
          {/* Header Section */}
          <div>
            <div className="flex items-start justify-between gap-4 border-b pb-3 border-neutral-200">
              {/* Company Logo & Details */}
              <div className="flex items-start gap-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded">
                  <Image
                    src="/icon.png"
                    alt={settings.companyName || "Company Logo"}
                    width={48}
                    height={48}
                    className="size-full object-contain"
                  />
                </div>
                <div>
                  <h1 className={`text-xl font-bold tracking-tight ${colors.headerCompany}`}>
                    {settings.companyName || "Flybit Dynamics Private Limited"}
                  </h1>
                  <div className="mt-0.5 text-[9.5pt] leading-[13pt] text-neutral-600">
                    <div>{settings.companyAddressLine1 || settings.companyAddress || "Ahmedabad, Gujarat"}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[8.5pt]">
                      {settings.companyPhone && <span>Phone: {settings.companyPhone}</span>}
                      {settings.companyEmail && <span>Email: {settings.companyEmail}</span>}
                      {settings.website && <span>Web: {settings.website}</span>}
                    </div>
                    {settings.gstin && (
                      <div className="text-[8.5pt] font-semibold text-neutral-700">
                        GSTIN: {settings.gstin}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Title & Date */}
              <div className="text-right">
                <div className="inline-block text-right">
                  <span className={`text-xl font-extrabold uppercase tracking-wider ${colors.titleText}`}>
                    {on ? (
                      <Slot
                        value={receipt.title || "Cash Receipt"}
                        edit={on}
                        onChange={(v) => edit?.onChange({ title: v })}
                        className="text-right font-extrabold"
                      />
                    ) : (
                      receipt.title || "Cash Receipt"
                    )}
                  </span>
                  <div className="mt-2 text-[10.5pt]">
                    <span className="font-semibold text-neutral-700">Date: </span>
                    <span className="font-mono font-medium">
                      <DateSlot
                        value={receipt.receiptDate}
                        edit={on}
                        onChange={(iso) => edit?.onChange({ receiptDate: iso })}
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Receipt Numbers Bar */}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4 bg-neutral-50 px-3 py-2 rounded border border-neutral-200 text-[10pt]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-neutral-800">Receipt #:</span>
                <span className="font-mono font-bold text-neutral-900">
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
                <span className="font-bold text-neutral-800">Invoice #:</span>
                <span className="font-mono font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  <Slot
                    value={receipt.invoiceNumber || "—"}
                    edit={on}
                    onChange={(v) => edit?.onChange({ invoiceNumber: v })}
                    placeholder="INV-000000"
                  />
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-neutral-800">Amount:</span>
                <span className="font-mono font-bold text-emerald-800 text-[11pt]">
                  ₹{" "}
                  <MoneySlot
                    value={receipt.amountReceived}
                    edit={on}
                    onChange={handleReceivedChange}
                  />
                </span>
              </div>
            </div>

            {/* Body Lines matching template */}
            <div className="mt-5 space-y-4 text-[10.5pt]">
              {/* Received From */}
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-bold text-neutral-800">
                  Cash Received From:
                </span>
                <div className="flex-1 border-b border-neutral-400 pb-0.5 font-semibold text-neutral-900">
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
                <span className="whitespace-nowrap font-bold text-neutral-800">
                  The Sum of:
                </span>
                <div className="flex-1 border-b border-neutral-400 pb-0.5 italic text-neutral-800">
                  {amountInWords}
                </div>
              </div>

              {/* For reason */}
              <div className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-bold text-neutral-800">For:</span>
                <div className="flex-1 border-b border-neutral-400 pb-0.5 text-neutral-900">
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
              <div className="col-span-7 rounded border border-neutral-300 p-3 bg-neutral-50/70">
                <div className="text-[9.5pt] font-bold uppercase tracking-wider text-neutral-700 mb-2">
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
                        className={`flex items-center gap-2 cursor-pointer select-none rounded px-2 py-1 transition-colors ${
                          isSelected
                            ? "bg-white font-bold text-neutral-900 shadow-xs border border-neutral-300"
                            : "text-neutral-600 hover:text-neutral-900"
                        }`}
                        onClick={() => {
                          if (on && edit) {
                            edit.onChange({ paymentMode: mode });
                          }
                        }}
                      >
                        <span
                          className={`flex size-4 items-center justify-center rounded border text-[10px] font-bold ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-neutral-400 bg-white"
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
                <div className="mt-3 border-t border-neutral-200 pt-2 flex items-center gap-2 text-[9pt]">
                  <span className="font-semibold text-neutral-600 whitespace-nowrap">
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
                <table className="w-full border-collapse border border-neutral-400 text-[9.5pt]">
                  <tbody>
                    <tr className="border-b border-neutral-300">
                      <td className="px-3 py-1.5 font-semibold text-neutral-700 bg-neutral-50 border-r border-neutral-300">
                        Total Amount Due
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium text-neutral-900">
                        ₹{" "}
                        <MoneySlot
                          value={receipt.totalAmountDue}
                          edit={on}
                          onChange={handleTotalChange}
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-neutral-300 bg-emerald-50/50">
                      <td className="px-3 py-1.5 font-bold text-emerald-900 border-r border-neutral-300">
                        Amount Received
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-900">
                        ₹{" "}
                        <MoneySlot
                          value={receipt.amountReceived}
                          edit={on}
                          onChange={handleReceivedChange}
                        />
                      </td>
                    </tr>
                    <tr className="bg-neutral-50/80">
                      <td className="px-3 py-1.5 font-bold text-neutral-800 border-r border-neutral-300">
                        Balance Due
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold text-neutral-900">
                        ₹{" "}
                        {Math.max(
                          0,
                          (receipt.totalAmountDue || 0) - (receipt.amountReceived || 0),
                        ).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {receipt.notes && (
                  <div className="mt-2 text-[8.5pt] text-neutral-500 italic">
                    {receipt.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Section: Authorized Signatory */}
          <div className="mt-8 pt-4 border-t border-dashed border-neutral-300 flex items-end justify-between">
            <div className="text-[8pt] text-neutral-500">
              {receipt.fineprint && (
                <>
                  <div>This is a computer-generated receipt issued by Flybit Dynamics.</div>
                  <div>Thank you for choosing FlyBit for your drone light show experience!</div>
                </>
              )}
            </div>

            {/* Signed By Block */}
            <div className="text-center min-w-48">
              {receipt.signature && (
                <div className="mb-1 flex justify-center">
                  <div className="h-10 w-28 flex items-center justify-center border-b border-neutral-400 pb-1">
                    <span className="font-serif italic text-neutral-700 text-sm">
                      {settings.signatoryName || "FlyBit Dynamics"}
                    </span>
                  </div>
                </div>
              )}
              <div className="border-t border-neutral-600 pt-1">
                <div className="text-[9pt] font-bold text-neutral-900">
                  Signed By / Authorized Signatory
                </div>
                <div className="text-[8pt] text-neutral-600">
                  {settings.signatoryName && <span>{settings.signatoryName}</span>}
                  {settings.signatoryTitle && <span> · {settings.signatoryTitle}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
