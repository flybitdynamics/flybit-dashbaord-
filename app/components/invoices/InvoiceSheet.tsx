"use client";

/** The tax invoice — the same component whether you are reading it, editing
 *  it or printing it.
 *
 *  Every measurement is taken from the company's own INV-000002: the frame
 *  sits at 39.6pt / 50.4pt inside an A4 page, the column edges are the ones
 *  in that file, and the type is 8pt body, 9pt names, 12pt company, 22pt
 *  title. Pass `edit` and each printed value becomes a field you type into
 *  on the page itself — the fields inherit the document's type and carry no
 *  box of their own, so nothing moves between editing and paper. */

import Image from "next/image";
import { useState } from "react";
import { Client, Settings } from "../../lib/types";
import {
  Invoice,
  InvoiceLine,
  InvoiceParty,
  amountText,
  invoiceDate,
  parseInvoiceDate,
  partyFromClient,
  placeOfSupplyLabel,
  taxModeFor,
  totalInWords,
  totalsFor,
} from "../../lib/invoices";

export interface SheetEdit {
  onChange: (patch: Partial<Omit<Invoice, "id">>) => void;
  onLineChange: (id: string, patch: Partial<InvoiceLine>) => void;
  onRemoveLine: (id: string) => void;
  /** Naming one fills the address block from their record. */
  clients: Client[];
}

/* ---------------- the editable slots ---------------- */

/** A single-line value. */
function Slot({
  value,
  edit,
  onChange,
  className = "",
  placeholder,
  list,
}: {
  value: string;
  edit: boolean;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  list?: string;
}) {
  if (!edit || !onChange) return <>{value}</>;
  return (
    <input
      className={`inv-edit ${className}`}
      value={value}
      list={list}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A value that may wrap or run to several lines. The wrapper sizes itself
 *  from the same text, so the box is always exactly as tall as the words. */
function GrowSlot({
  value,
  edit,
  onChange,
  className = "",
  placeholder,
}: {
  value: string;
  edit: boolean;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  if (!edit || !onChange) {
    return (
      <>
        {value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => (
            <div key={index}>{line}</div>
          ))}
      </>
    );
  }
  return (
    <span className="inv-grow" data-value={value}>
      <textarea
        rows={1}
        className={`inv-edit ${className}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

/** Money reads as 5,00,000 until you click into it, then as a whole number. */
function MoneySlot({
  value,
  edit,
  onChange,
  className = "",
}: {
  value: number;
  edit: boolean;
  onChange?: (value: number) => void;
  className?: string;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  if (!edit || !onChange) return <>{amountText(value)}</>;
  return (
    <input
      inputMode="numeric"
      className={`inv-edit ${className}`}
      value={typing ?? amountText(value)}
      onFocus={() => setTyping(value ? String(Math.round(value)) : "")}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        setTyping(e.target.value);
        const parsed = Number(e.target.value.replace(/[^\d-]/g, ""));
        if (!Number.isNaN(parsed)) onChange(Math.round(parsed));
      }}
    />
  );
}

/** Dates print as 25/03/2026 and are typed the same way. */
function DateSlot({
  value,
  edit,
  onChange,
}: {
  value: string;
  edit: boolean;
  onChange?: (iso: string) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  if (!edit || !onChange) return <>{invoiceDate(value)}</>;
  return (
    <input
      className="inv-edit"
      placeholder="dd/mm/yyyy"
      value={typing ?? invoiceDate(value)}
      onFocus={() => setTyping(invoiceDate(value))}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        setTyping(e.target.value);
        const iso = parseInvoiceDate(e.target.value);
        if (iso) onChange(iso);
      }}
    />
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inv-meta-row">
      <span className="inv-meta-label">{label}</span>
      <span className="inv-meta-value">
        <span className="inv-meta-colon">:</span>
        {children}
      </span>
    </div>
  );
}

export function InvoiceSheet({
  invoice,
  settings,
  edit,
}: {
  invoice: Invoice;
  settings: Settings;
  edit?: SheetEdit;
}) {
  const on = Boolean(edit);
  const totals = totalsFor(invoice);
  const split = invoice.taxMode === "intra";
  const taxed = invoice.taxMode !== "none";
  const hasBank = [
    settings.bankAccountName,
    settings.bankAccountNumber,
    settings.bankName,
    settings.bankIfsc,
  ].some((value) => value && value.trim());

  /* Two tax columns when it splits, one under IGST, none when untaxed. */
  const taxColumns = taxed ? (split ? ["CGST", "SGST"] : ["IGST"]) : [];

  /* Column edges from INV-000002, as a share of the frame. Whatever the
     tax columns do not need goes to the description. */
  const taxWidth = taxColumns.length * 2 * 10.98;
  const widths = [4.98, 17.01 + (43.92 - taxWidth), 9.99, 10.96]
    .concat(Array(taxColumns.length * 2).fill(10.98))
    .concat([12.98]);

  /* Sums cannot be split back across several lines, so the totals are only
     typeable when there is one line to put the answer into. */
  const single = totals.lines.length === 1 ? totals.lines[0] : null;
  const rupee = (value: number) => Math.round(value || 0);

  /** Typing a tax amount says what the rate must have been. */
  const rateFromTax = (row: typeof totals.lines[number], amount: number) => {
    if (!row.amount) return;
    const half = (amount / row.amount) * 100;
    edit?.onLineChange(row.line.id, { taxRate: rupee(split ? half * 2 : half) });
  };

  const party = (which: "billTo", patch: Partial<InvoiceParty>) =>
    edit?.onChange({ [which]: { ...invoice[which], ...patch } });

  /** Typing a name that matches a client fills in their address and GSTIN. */
  function billName(name: string) {
    const known = edit?.clients.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (!known) {
      party("billTo", { name });
      return;
    }
    const filled = partyFromClient(known);
    const place = placeOfSupplyLabel(known.state);
    edit?.onChange({
      billTo: filled,
      clientId: known.id,
      ...(place ? { placeOfSupply: place, taxMode: taxModeFor(place) } : {}),
    });
  }

  return (
    <div className="inv-sheet">
      {on && (
        <datalist id="inv-client-names">
          {edit?.clients.map((client) => (
            <option key={client.id} value={client.name} />
          ))}
        </datalist>
      )}

      <div className="inv-frame">
        {/* ---------------- letterhead ---------------- */}
        <div className="inv-head">
          <div className="inv-head-company">
            <div className="inv-company-name">{settings.companyName}</div>
            <div>{settings.companyAddressLine1}</div>
            <div>{settings.companyAddressLine2}</div>
            <div>India</div>
            {settings.gstin && <div>GSTIN {settings.gstin}</div>}
            <div>{settings.companyEmail}</div>
          </div>
          <div className="inv-head-right">
            <Image
              src="/logo-on-light.png"
              alt="FLYBIT Dynamics"
              width={666}
              height={276}
              unoptimized
              priority
              className="inv-logo"
            />
            <div className="inv-title">TAX INVOICE</div>
          </div>
        </div>

        {/* ---------------- numbers and dates ---------------- */}
        <div className="inv-meta">
          <div className="inv-meta-col">
            <MetaRow label="Invoice Number">
              <Slot
                value={invoice.number}
                edit={on}
                onChange={(number) => edit?.onChange({ number })}
                placeholder="INV-000003"
              />
            </MetaRow>
            <MetaRow label="Invoice Date">
              <DateSlot
                value={invoice.invoiceDate}
                edit={on}
                onChange={(invoiceDateISO) => edit?.onChange({ invoiceDate: invoiceDateISO })}
              />
            </MetaRow>
            <MetaRow label="Terms">
              <Slot
                value={invoice.terms}
                edit={on}
                onChange={(terms) => edit?.onChange({ terms })}
                placeholder="Custom"
              />
            </MetaRow>
            <MetaRow label="Due Date">
              <DateSlot
                value={invoice.dueDate}
                edit={on}
                onChange={(dueDate) => edit?.onChange({ dueDate })}
              />
            </MetaRow>
          </div>
          <div className="inv-meta-col">
            <MetaRow label="Place Of Supply">
              <Slot
                value={invoice.placeOfSupply}
                edit={on}
                onChange={(placeOfSupply) =>
                  edit?.onChange({ placeOfSupply, taxMode: taxModeFor(placeOfSupply) })
                }
                placeholder="Gujarat (24)"
              />
            </MetaRow>
          </div>
        </div>

        {/* ---------------- who it is for ---------------- */}
        <div className="inv-party-head">
          <div className="inv-party-cell">Bill To</div>
        </div>
        <div className="inv-party">
          <div className="inv-party-col">
            <div className="inv-party-name">
              <Slot
                value={invoice.billTo.name}
                edit={on}
                onChange={billName}
                list="inv-client-names"
                placeholder="Client name"
              />
            </div>
            <GrowSlot
              value={invoice.billTo.address}
              edit={on}
              onChange={(address) => party("billTo", { address })}
              placeholder="Address"
            />
            {(on || invoice.billTo.gstin) && (
              <div>
                GSTIN{" "}
                <Slot
                  value={invoice.billTo.gstin}
                  edit={on}
                  onChange={(gstin) => party("billTo", { gstin })}
                  className="inv-edit-gstin"
                  placeholder="—"
                />
              </div>
            )}
          </div>
        </div>

        {/* ---------------- subject ---------------- */}
        <div className="inv-subject">
          <div>Subject :</div>
          <div className="inv-subject-text">
            <GrowSlot
              value={invoice.subject}
              edit={on}
              onChange={(subject) => edit?.onChange({ subject })}
              placeholder="What the invoice is for"
            />
          </div>
        </div>

        {/* ---------------- the lines ---------------- */}
        <table className="inv-items">
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className="inv-c-sr">#</th>
              <th rowSpan={2} className="inv-c-item">Item &amp; Description</th>
              <th rowSpan={2} className="inv-c-hsn">HSN/SAC</th>
              <th rowSpan={2} className="inv-c-rate">Rate</th>
              {taxColumns.map((name) => (
                <th key={name} colSpan={2} className="inv-c-tax">
                  {name}
                </th>
              ))}
              <th rowSpan={2} className="inv-c-amount">Amount</th>
            </tr>
            <tr>
              {taxColumns.map((name) => [
                <th key={`${name}-pct`} className="inv-c-tax-half">%</th>,
                <th key={`${name}-amt`} className="inv-c-tax-half">Amt</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((row, index) => (
              <tr key={row.line.id}>
                <td className={`inv-c-sr ${on ? "inv-rel" : ""}`}>
                  {index + 1}
                  {on && totals.lines.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      title="Remove this line"
                      className="inv-noprint inv-row-del"
                      onClick={() => edit?.onRemoveLine(row.line.id)}
                    >
                      ✕
                    </button>
                  )}
                </td>
                <td className="inv-c-item">
                  <GrowSlot
                    value={row.line.description}
                    edit={on}
                    onChange={(description) => edit?.onLineChange(row.line.id, { description })}
                    placeholder="What was supplied"
                  />
                </td>
                <td className="inv-c-hsn">
                  <Slot
                    value={row.line.hsn}
                    edit={on}
                    onChange={(hsn) => edit?.onLineChange(row.line.id, { hsn })}
                    placeholder="998387"
                  />
                </td>
                <td className="inv-c-rate inv-num">
                  <MoneySlot
                    value={row.line.rate}
                    edit={on}
                    onChange={(rate) => edit?.onLineChange(row.line.id, { rate })}
                  />
                </td>
                {taxColumns.map((name) => [
                  <td key={`${name}-pct`} className="inv-c-tax-half inv-num">
                    {on ? (
                      <span className="inv-pct">
                        <input
                          className="inv-edit"
                          inputMode="decimal"
                          aria-label={`${name} rate`}
                          value={row.splitRate}
                          onChange={(e) => {
                            const shown = Number(e.target.value.replace(/[^\d.]/g, ""));
                            if (Number.isNaN(shown)) return;
                            edit?.onLineChange(row.line.id, { taxRate: split ? shown * 2 : shown });
                          }}
                        />
                        %
                      </span>
                    ) : (
                      `${row.splitRate}%`
                    )}
                  </td>,
                  <td key={`${name}-amt`} className="inv-c-tax-half inv-num">
                    <MoneySlot
                      value={row.splitAmount}
                      edit={on && row.amount > 0}
                      onChange={(amount) => rateFromTax(row, amount)}
                    />
                  </td>,
                ])}
                <td className="inv-c-amount inv-num">
                  <MoneySlot
                    value={row.amount}
                    edit={on}
                    onChange={(amount) =>
                      edit?.onLineChange(row.line.id, {
                        rate: rupee(amount / (row.line.quantity || 1)),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------------- totals, words and signature ---------------- */}
        <div className="inv-foot">
          <div className="inv-foot-left">
            <div className="inv-foot-label">Total In Words</div>
            <div className="inv-words">{totalInWords(totals.total)}</div>
            {/* The same on every invoice, so it comes from the company
                settings and is not typed on the page. */}
            {hasBank && (
              <div className="inv-foot-block">
                <div className="inv-foot-label inv-bank-head">Bank Details</div>
                {settings.bankAccountName && <div>{settings.bankAccountName}</div>}
                {settings.bankAccountNumber && (
                  <div>Account Number : {settings.bankAccountNumber}</div>
                )}
                {settings.bankName && <div>Bank: {settings.bankName}</div>}
                {settings.bankIfsc && <div>IFSC: {settings.bankIfsc}</div>}
              </div>
            )}

            {(on || invoice.notes.trim()) && (
              <div className="inv-foot-block">
                <div className="inv-foot-label">Notes</div>
                <GrowSlot
                  value={invoice.notes}
                  edit={on}
                  onChange={(notes) => edit?.onChange({ notes })}
                  placeholder="Thanks for your business."
                />
              </div>
            )}
          </div>

          <div className="inv-foot-right">
            <div className="inv-total-row">
              <span>Sub Total</span>
              <span className="inv-num">
                <MoneySlot
                  value={totals.subTotal}
                  edit={on && single !== null}
                  onChange={(value) =>
                    single && edit?.onLineChange(single.line.id, {
                      rate: rupee(value / (single.line.quantity || 1)),
                    })
                  }
                />
              </span>
            </div>
            {totals.groups.map((group) => (
              <div key={group.label} className="inv-total-row">
                <span>{group.label}</span>
                <span className="inv-num">
                  <MoneySlot
                    value={group.amount}
                    edit={on && single !== null && single.amount > 0}
                    onChange={(value) => single && rateFromTax(single, value)}
                  />
                </span>
              </div>
            ))}
            <div className="inv-total-row inv-total-strong">
              <span>Total</span>
              <span className="inv-num">
                ₹.
                <MoneySlot
                  value={totals.total}
                  edit={on && single !== null}
                  className="inv-edit-total"
                  onChange={(value) => {
                    if (!single) return;
                    /* The figure quoted is tax-inclusive, so the rate is
                       what is left once the tax is taken back out. The
                       rate itself is a whole rupee — GST stays on that
                       rounded figure. */
                    const rate = taxed ? value / (1 + (single.line.taxRate || 0) / 100) : value;
                    edit?.onLineChange(single.line.id, {
                      rate: rupee(rate / (single.line.quantity || 1)),
                    });
                  }}
                />
              </span>
            </div>
            {(on || invoice.paymentMade > 0) && (
              <div className="inv-total-row">
                <span>Payment Made</span>
                <span className="inv-num inv-paid">
                  (-){" "}
                  <MoneySlot
                    value={invoice.paymentMade}
                    edit={on}
                    onChange={(paymentMade) => edit?.onChange({ paymentMade })}
                    className="inv-edit-paid"
                  />
                </span>
              </div>
            )}
            <div className="inv-total-row inv-balance">
              <span>Balance Due</span>
              <span className="inv-num">
                ₹.
                <MoneySlot
                  value={totals.balance}
                  edit={on}
                  className="inv-edit-total"
                  onChange={(value) =>
                    edit?.onChange({ paymentMade: Math.max(0, rupee(totals.total - value)) })
                  }
                />
              </span>
            </div>

            <div className="inv-sign">
              {invoice.signature && (
                /* Served as-is: an optimised copy would be resampled to
                   whatever the zoomed preview needs, and print it soft. */
                <Image
                  src="/signature.png"
                  alt=""
                  width={367}
                  height={183}
                  unoptimized
                  priority
                  className="inv-sign-mark"
                />
              )}
              <div className="inv-sign-line" />
              <div>Authorized Signature</div>
            </div>
          </div>
        </div>
      </div>

      {invoice.fineprint && (
        <p className="inv-fineprint">
          This is a computer-generated invoice authenticated with a digital signature.
        </p>
      )}
    </div>
  );
}
