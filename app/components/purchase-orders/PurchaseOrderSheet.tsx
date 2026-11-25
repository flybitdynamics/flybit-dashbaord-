"use client";

/** The printed purchase order: two A4 pages on the company letterhead.
 *
 *  Laid out from FBD/PO/26-27/001: a centred title, the PO number and date
 *  strip, the parties side by side under dark headings, the item table, the
 *  totals box, the order details, the signature, then a terms page. Pass
 *  `edit` and every printed value becomes a field typed on the page. */

import { Settings } from "../../lib/types";
import {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderRow,
  PurchaseOrderTax,
  PurchaseOrderTerm,
  amountInWords,
  currencySymbol,
  money,
  poDate,
  readPoDate,
  roundOffText,
  rowAmount,
  rowIsComputed,
  totalsFor,
} from "../../lib/purchase-orders";
import { GrowSlot, Slot } from "../sheet/Fields";
import { Letterhead } from "../quotations/QuotationSheet";

type Draft = Omit<PurchaseOrder, "id">;

export interface PurchaseOrderEdit {
  onChange: (patch: Partial<Draft>) => void;
  onRowChange: (id: string, patch: Partial<PurchaseOrderRow>) => void;
  onAddRow: (afterId: string) => void;
  onRemoveRow: (id: string) => void;
  onTaxChange: (id: string, patch: Partial<PurchaseOrderTax>) => void;
  onAddTax: () => void;
  onRemoveTax: (id: string) => void;
  onDetailChange: (id: string, patch: Partial<PurchaseOrderDetail>) => void;
  onAddDetail: () => void;
  onRemoveDetail: (id: string) => void;
  onTermChange: (id: string, patch: Partial<PurchaseOrderTerm>) => void;
  onAddTerm: () => void;
  onRemoveTerm: (id: string) => void;
}

function Footer({ settings }: { settings: Settings }) {
  const line = [settings.companyAddressLine1, settings.companyAddressLine2]
    .map((s) => s.trim().replace(/,$/, ""))
    .filter(Boolean)
    .join(", ");
  return (
    <div className="po-footer">
      <div className="po-rule" />
      <div className="po-address">
        <span className="q-icon q-icon-pin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21.5s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
            <circle cx="12" cy="10.4" r="2.4" />
          </svg>
        </span>
        <span>{line}, India.</span>
      </div>
    </div>
  );
}

/** A small ✕ that never prints. */
function Remove({ label, onClick, className = "" }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`inv-noprint po-del ${className}`} onClick={onClick}>
      ✕
    </button>
  );
}

function AddLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="inv-noprint po-add-link" onClick={onClick}>
      {children}
    </button>
  );
}

/** "Company Name: value" — the label stays bold, the value is a field. */
function Labelled({
  label,
  value,
  edit,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  edit: boolean;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="po-labelled">
      <b>{label}</b>:&nbsp;
      {edit ? (
        <GrowSlot value={value} edit onChange={onChange} placeholder={placeholder} />
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

export function PurchaseOrderSheet({
  order,
  settings,
  edit,
}: {
  order: Draft;
  settings: Settings;
  edit?: PurchaseOrderEdit;
}) {
  const on = Boolean(edit);
  const symbol = currencySymbol(order.currency);
  const totals = totalsFor(order);
  const words = order.amountWords.trim() || amountInWords(totals.grandTotal, order.currency);

  return (
    <div className="po-sheet">
      {/* ---------------- page one ---------------- */}
      <div className="po-page">
        <Letterhead settings={settings} />

        <div className="po-body">
          <h1 className="po-title">PURCHASE ORDER</h1>

          <table className="po-strip">
            <tbody>
              <tr>
                <th>PO Number</th>
                <td>
                  <Slot value={order.number} edit={on} onChange={(number) => edit?.onChange({ number })} placeholder="FBD/PO/26-27/002" />
                </td>
                <th>PO Date</th>
                <td>
                  {on ? (
                    <DateField value={order.date} onChange={(date) => edit?.onChange({ date })} />
                  ) : (
                    poDate(order.date)
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className="po-section">PARTIES</h2>
          <table className="po-parties">
            <thead>
              <tr>
                <th>SUPPLIER / VENDOR</th>
                <th>BILL TO / SHIP TO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <Labelled label="Company Name" value={order.vendorName} edit={on} onChange={(vendorName) => edit?.onChange({ vendorName })} placeholder="Vendor company" />
                  <Labelled label="Address" value={order.vendorAddress} edit={on} onChange={(vendorAddress) => edit?.onChange({ vendorAddress })} placeholder="Street, city, country" />
                  <Labelled label="GSTIN" value={order.vendorGstin} edit={on} onChange={(vendorGstin) => edit?.onChange({ vendorGstin })} placeholder="NA" />
                  <Labelled label="Contact Person" value={order.vendorContact} edit={on} onChange={(vendorContact) => edit?.onChange({ vendorContact })} placeholder="Name or email" />
                  <Labelled label="Phone / Email" value={order.vendorPhoneEmail} edit={on} onChange={(vendorPhoneEmail) => edit?.onChange({ vendorPhoneEmail })} placeholder="+1 555 0100" />
                </td>
                <td>
                  <GrowSlot value={order.shipTo} edit={on} onChange={(shipTo) => edit?.onChange({ shipTo })} placeholder="Company, address, GSTIN, contact" />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="po-greeting">
            <Slot value={order.greeting} edit={on} onChange={(greeting) => edit?.onChange({ greeting })} placeholder="Dear Sir / Madam," />
          </div>
          <div className="po-intro">
            <GrowSlot value={order.intro} edit={on} onChange={(intro) => edit?.onChange({ intro })} placeholder="Please supply…" />
          </div>

          <table className="po-items">
            <colgroup>
              <col style={{ width: "5.1%" }} />
              <col style={{ width: "34.3%" }} />
              <col style={{ width: "10.3%" }} />
              <col style={{ width: "5.3%" }} />
              <col style={{ width: "5.2%" }} />
              <col style={{ width: "14.7%" }} />
              <col style={{ width: "25.1%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>No.</th>
                <th>Description of Goods / Services</th>
                <th>HSN / SAC</th>
                <th>GST</th>
                <th>Qty</th>
                <th>Unit Rate ({symbol})</th>
                <th>Taxable Amount ({symbol})</th>
              </tr>
            </thead>
            <tbody>
              {order.rows.map((row, index) => {
                const amount = rowAmount(row);
                const computed = rowIsComputed(row);
                return (
                  <tr key={row.id}>
                    <td className={`po-center ${on ? "q-rel" : ""}`}>
                      {index + 1}
                      {on && order.rows.length > 1 && (
                        <button type="button" aria-label="Remove this row" title="Remove this row" className="inv-noprint q-row-del" onClick={() => edit?.onRemoveRow(row.id)}>
                          ✕
                        </button>
                      )}
                      {on && (
                        <button type="button" aria-label="Add a row below" title="Add a row below" className="inv-noprint q-row-add" onClick={() => edit?.onAddRow(row.id)}>
                          +
                        </button>
                      )}
                    </td>
                    <td>
                      <GrowSlot value={row.description} edit={on} onChange={(description) => edit?.onRowChange(row.id, { description })} placeholder="Item or service" />
                    </td>
                    <td className="po-center">
                      <GrowSlot value={row.hsn} edit={on} onChange={(hsn) => edit?.onRowChange(row.id, { hsn })} />
                    </td>
                    <td className="po-center">
                      <Slot value={row.gst} edit={on} onChange={(gst) => edit?.onRowChange(row.id, { gst })} />
                    </td>
                    <td className="po-center">
                      <Slot value={row.qty} edit={on} onChange={(qty) => edit?.onRowChange(row.id, { qty })} />
                    </td>
                    <td className="po-center">
                      <Slot value={row.rate} edit={on} onChange={(rate) => edit?.onRowChange(row.id, { rate })} />
                    </td>
                    <td className="po-center">
                      {computed || !on ? (
                        amount === null ? "" : money(amount)
                      ) : (
                        <Slot value={row.amount} edit onChange={(value) => edit?.onRowChange(row.id, { amount: value })} placeholder="amount" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {on && (
            <div className="po-hint inv-noprint">
              Amount = Qty × Rate. Leave Qty or Rate empty to type an amount (e.g. Freight).
            </div>
          )}

          <table className="po-totals">
            <tbody>
              <tr>
                <td>Subtotal / Taxable Value</td>
                <td>{symbol} {money(totals.subtotal)}</td>
              </tr>
              {order.taxes.map((tax, i) => {
                const amount = totals.taxes[i]?.amount ?? null;
                return (
                  <tr key={tax.id}>
                    <td className={on ? "q-rel" : ""}>
                      {on && <Remove label="Remove this tax" onClick={() => edit?.onRemoveTax(tax.id)} className="po-del-left" />}
                      <span className="po-tax-label">
                        <Slot value={tax.label} edit={on} onChange={(label) => edit?.onTaxChange(tax.id, { label })} placeholder="Tax" className="po-w-label" />
                        {on ? (
                          <span className="po-tax-rate inv-noprint">
                            @
                            <Slot value={tax.rate} edit onChange={(rate) => edit?.onTaxChange(tax.id, { rate })} placeholder="NA or 9" className="po-w-rate" />
                            %
                          </span>
                        ) : (
                          amount !== null && <> @ {tax.rate.replace(/%/g, "")}%</>
                        )}
                      </span>
                    </td>
                    <td>{amount === null ? "NA" : `${symbol} ${money(amount)}`}</td>
                  </tr>
                );
              })}
              {totals.roundOff !== 0 && (
                <tr>
                  <td>Round Off</td>
                  <td>{roundOffText(totals.roundOff)}</td>
                </tr>
              )}
              <tr className="po-grand">
                <td>
                  GRAND TOTAL
                  {on && <AddLink onClick={() => edit?.onAddTax()}>+ Add tax line</AddLink>}
                </td>
                <td>{symbol} {money(totals.grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="po-words">
            <b>Amount in Words: {order.currency.toUpperCase()}</b>{" "}
            {on ? (
              <span className="po-words-edit">
                <GrowSlot value={words} edit onChange={(amountWords) => edit?.onChange({ amountWords })} />
                {order.amountWords.trim() && (
                  <AddLink onClick={() => edit?.onChange({ amountWords: "" })}>↺ auto</AddLink>
                )}
              </span>
            ) : (
              words
            )}
          </div>

          <h2 className="po-section po-section-gap">ORDER DETAILS</h2>
          <table className="po-details">
            <tbody>
              {order.details.map((detail) => (
                <tr key={detail.id}>
                  <th className={on ? "q-rel" : ""}>
                    {on && <Remove label="Remove this line" onClick={() => edit?.onRemoveDetail(detail.id)} className="po-del-left" />}
                    <Slot value={detail.label} edit={on} onChange={(label) => edit?.onDetailChange(detail.id, { label })} placeholder="Label" />
                  </th>
                  <td>
                    <GrowSlot value={detail.value} edit={on} onChange={(value) => edit?.onDetailChange(detail.id, { value })} placeholder="Value" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {on && <AddLink onClick={() => edit?.onAddDetail()}>+ Add order detail</AddLink>}

          <div className="po-sign">
            <div className="po-for">
              <Slot value={order.forCompany} edit={on} onChange={(forCompany) => edit?.onChange({ forCompany })} placeholder="For FLYBIT DYNAMICS PRIVATE LIMITED" className="po-right" />
            </div>
            <div className="po-signer">
              <Slot value={order.signerName} edit={on} onChange={(signerName) => edit?.onChange({ signerName })} placeholder="Name" className="po-right" />
              <br />
              <Slot value={order.signerRole} edit={on} onChange={(signerRole) => edit?.onChange({ signerRole })} placeholder="Designation" className="po-right" />
            </div>
          </div>
        </div>

        <Footer settings={settings} />
      </div>

      {/* ---------------- page two: terms ---------------- */}
      <div className="po-page po-page-two">
        <Letterhead settings={settings} />

        <div className="po-body">
          <h1 className="po-title po-terms-title">
            <Slot value={order.termsTitle} edit={on} onChange={(termsTitle) => edit?.onChange({ termsTitle })} className="po-center-input" />
          </h1>
          <div className="po-terms-sub">
            <Slot value={order.termsSubtitle} edit={on} onChange={(termsSubtitle) => edit?.onChange({ termsSubtitle })} className="po-center-input" />
          </div>

          <ol className="po-terms">
            {order.terms.map((term, index) => (
              <li key={term.id} className={on ? "q-rel" : ""}>
                {on && <Remove label="Remove this term" onClick={() => edit?.onRemoveTerm(term.id)} className="po-del-left" />}
                <div className="po-term-title">
                  {index + 1}.{" "}
                  <Slot value={term.title} edit={on} onChange={(title) => edit?.onTermChange(term.id, { title })} placeholder="Heading" className="po-w-term" />
                </div>
                <GrowSlot value={term.body} edit={on} onChange={(body) => edit?.onTermChange(term.id, { body })} placeholder="Wording" />
              </li>
            ))}
          </ol>
          {on && <AddLink onClick={() => edit?.onAddTerm()}>+ Add term</AddLink>}

          <div className="po-terms-note">
            <GrowSlot value={order.termsNote} edit={on} onChange={(termsNote) => edit?.onChange({ termsNote })} placeholder="Closing note" />
          </div>
        </div>

        <Footer settings={settings} />
      </div>
    </div>
  );
}

/** Reads as 12-Nov-2026; typed however you like. */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="inv-edit"
      defaultValue={poDate(value)}
      placeholder="12-Nov-2026"
      onBlur={(e) => {
        const iso = readPoDate(e.target.value);
        onChange(iso ?? e.target.value);
        e.target.value = iso ? poDate(iso) : e.target.value;
      }}
    />
  );
}
