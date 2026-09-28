"use client";

/** The printed quotation — two pages on the company letterhead.
 *
 *  Laid out from quotation #FD00069: the table's columns sit at the same
 *  proportions (Sr. No. 54pt, Description 237pt, Price 135pt of a 426pt
 *  block), the orange rule and contact strip are the letterhead's, and the
 *  body is 10pt. Pass `edit` and every printed value becomes a field you
 *  type into on the page itself. */

import Image from "next/image";
import { Settings } from "../../lib/types";
import { Quotation, QuotationRow } from "../../lib/quotations";
import { GrowSlot, LongDateSlot, Slot } from "../sheet/Fields";

export interface QuotationEdit {
  onChange: (patch: Partial<Omit<Quotation, "id">>) => void;
  onRowChange: (id: string, patch: Partial<QuotationRow>) => void;
  onAddRow: (afterId: string) => void;
  onRemoveRow: (id: string) => void;
  onListChange: (key: "paymentTerms" | "benefits", next: string[]) => void;
}

/* The letterhead's own marks, at the sizes they are on the printed page:
   14pt circles, the first of them the rounded end of the tab that runs off
   the top edge. */
const ICONS = {
  phone: (
    <path d="M6.6 10.8a17 17 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.2 2.2Z" />
  ),
  mail: (
    <>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" />
      <path d="m3.4 7.2 8.6 5.8 8.6-5.8" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M2.8 12h18.4M12 2.8c2.5 2.6 3.8 5.8 3.8 9.2s-1.3 6.6-3.8 9.2c-2.5-2.6-3.8-5.8-3.8-9.2S9.5 5.4 12 2.8Z" />
    </>
  ),
};

function ContactRow({
  icon,
  first = false,
  children,
}: {
  icon: keyof typeof ICONS;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="q-contact-row">
      <span className={`q-icon ${first ? "q-icon-first" : ""}`}>
        <svg
          viewBox="0 0 24 24"
          fill={icon === "phone" ? "currentColor" : "none"}
          stroke={icon === "phone" ? "none" : "currentColor"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[icon]}
        </svg>
      </span>
      <span>{children}</span>
    </div>
  );
}

function Letterhead({ settings }: { settings: Settings }) {
  return (
    <div className="q-head">
      <Image
        src="/logo-on-light.png"
        alt="FLYBIT Dynamics"
        width={666}
        height={276}
        unoptimized
        priority
        className="q-logo"
      />

      <div className="q-contact">
        <span className="q-tab" />
        <ContactRow icon="phone" first>
          {settings.companyPhone}
        </ContactRow>
        <ContactRow icon="mail">{settings.letterheadEmail}</ContactRow>
        <ContactRow icon="web">{settings.website}</ContactRow>
      </div>
    </div>
  );
}

function Footer({ settings }: { settings: Settings }) {
  return (
    <div className="q-footer">
      <div className="q-rule" />
      <div className="q-address">
        <span className="q-icon q-icon-pin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21.5s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
            <circle cx="12" cy="10.4" r="2.4" />
          </svg>
        </span>
        <span>
          {settings.companyAddressLine1}
          <br />
          {settings.companyAddressLine2}
        </span>
      </div>
    </div>
  );
}

/** One bullet in an editable list, with its own add and remove controls. */
function BulletList({
  items,
  edit,
  onChange,
  placeholder,
}: {
  items: string[];
  edit: boolean;
  onChange?: (next: string[]) => void;
  placeholder: string;
}) {
  const set = (index: number, value: string) =>
    onChange?.(items.map((item, i) => (i === index ? value : item)));

  return (
    <ul className="q-bullets">
      {items.map((item, index) => (
        <li key={index} className={edit ? "q-rel" : ""}>
          <GrowSlot
            value={item}
            edit={edit}
            onChange={(value) => set(index, value)}
            placeholder={placeholder}
          />
          {edit && items.length > 1 && (
            <button
              type="button"
              aria-label="Remove this point"
              className="inv-noprint q-row-del"
              onClick={() => onChange?.(items.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          )}
        </li>
      ))}
      {edit && (
        <li className="inv-noprint q-add-bullet">
          <button type="button" onClick={() => onChange?.([...items, ""])}>
            + Add point
          </button>
        </li>
      )}
    </ul>
  );
}

export function QuotationSheet({
  quotation,
  settings,
  edit,
}: {
  quotation: Quotation;
  settings: Settings;
  edit?: QuotationEdit;
}) {
  const on = Boolean(edit);

  return (
    <div className="q-sheet">
      {/* ---------------- page one: the letter ---------------- */}
      <div className="q-page">
        <Letterhead settings={settings} />

        <div className="q-body">
          <div className="q-meta">
            <div>
              Quotation #
              <Slot
                value={quotation.number}
                edit={on}
                onChange={(number) => edit?.onChange({ number })}
                className="q-edit-number"
                placeholder="FD00070"
              />
            </div>
            <div>
              Date :{" "}
              <LongDateSlot
                value={quotation.date}
                edit={on}
                onChange={(date) => edit?.onChange({ date })}
                className="q-edit-date"
                placeholder="28 SEP 2026"
              />
            </div>
          </div>

          <div className="q-to">
            <div>To,</div>
            <GrowSlot
              value={quotation.to}
              edit={on}
              onChange={(to) => edit?.onChange({ to })}
              placeholder="Name and place"
            />
          </div>

          <div className="q-subject">
            <GrowSlot
              value={quotation.subject}
              edit={on}
              onChange={(subject) => edit?.onChange({ subject })}
              placeholder="What this quotation is for"
            />
          </div>

          <table className="q-table">
            <colgroup>
              <col style={{ width: "12.7%" }} />
              <col style={{ width: "55.6%" }} />
              <col style={{ width: "31.7%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Description</th>
                <th>
                  <GrowSlot
                    value={quotation.priceHeading}
                    edit={on}
                    onChange={(priceHeading) => edit?.onChange({ priceHeading })}
                    placeholder="Drone Show Price for…"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {quotation.rows.map((row) => (
                <tr key={row.id}>
                  <td className={`q-c-sr ${on ? "q-rel" : ""}`}>
                    <Slot
                      value={row.serial}
                      edit={on}
                      onChange={(serial) => edit?.onRowChange(row.id, { serial })}
                    />
                    {on && quotation.rows.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove this row"
                        title="Remove this row"
                        className="inv-noprint q-row-del"
                        onClick={() => edit?.onRemoveRow(row.id)}
                      >
                        ✕
                      </button>
                    )}
                    {on && (
                      <button
                        type="button"
                        aria-label="Add a row below"
                        title="Add a row below"
                        className="inv-noprint q-row-add"
                        onClick={() => edit?.onAddRow(row.id)}
                      >
                        +
                      </button>
                    )}
                  </td>
                  <td>
                    <GrowSlot
                      value={row.description}
                      edit={on}
                      onChange={(description) => edit?.onRowChange(row.id, { description })}
                      placeholder="What is being quoted"
                    />
                  </td>
                  <td>
                    <GrowSlot
                      value={row.price}
                      edit={on}
                      onChange={(price) => edit?.onRowChange(row.id, { price })}
                      placeholder="₹ 0,00,000"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="q-tax-note">
            <GrowSlot
              value={quotation.taxNote}
              edit={on}
              onChange={(taxNote) => edit?.onChange({ taxNote })}
              placeholder="All above prices are excluding GST"
            />
          </div>

          <div className="q-scope-note">
            <GrowSlot
              value={quotation.scopeNote}
              edit={on}
              onChange={(scopeNote) => edit?.onChange({ scopeNote })}
              placeholder="What the price includes"
            />
          </div>

          <div className="q-closing">
            <Slot
              value={quotation.closing}
              edit={on}
              onChange={(closing) => edit?.onChange({ closing })}
              placeholder="Thanking You"
            />
          </div>

          <div className="q-signer">
            <Slot
              value={quotation.signerName}
              edit={on}
              onChange={(signerName) => edit?.onChange({ signerName })}
              placeholder="Name"
            />
            <Slot
              value={quotation.signerRole}
              edit={on}
              onChange={(signerRole) => edit?.onChange({ signerRole })}
              placeholder="Designation"
            />
            <Slot
              value={quotation.signerPhone}
              edit={on}
              onChange={(signerPhone) => edit?.onChange({ signerPhone })}
              placeholder="Phone"
            />
            <Slot
              value={quotation.signerCompany}
              edit={on}
              onChange={(signerCompany) => edit?.onChange({ signerCompany })}
              placeholder="Company"
            />
          </div>
        </div>

        <Footer settings={settings} />
      </div>

      {/* ---------------- page two: terms and benefits ---------------- */}
      <div className="q-page q-page-two">
        <Letterhead settings={settings} />

        <div className="q-body">
          <h2 className="q-heading">Payment Terms:</h2>
          <BulletList
            items={quotation.paymentTerms}
            edit={on}
            onChange={(next) => edit?.onListChange("paymentTerms", next)}
            placeholder="50% Advance while Drone Show Booking"
          />

          <h2 className="q-heading q-heading-gap">Our Benefits:</h2>
          <BulletList
            items={quotation.benefits}
            edit={on}
            onChange={(next) => edit?.onListChange("benefits", next)}
            placeholder="What sets the show apart"
          />

          <div className="q-confidential">
            <GrowSlot
              value={quotation.confidential}
              edit={on}
              onChange={(confidential) => edit?.onChange({ confidential })}
              placeholder="Confidentiality note"
            />
          </div>
        </div>

        <Footer settings={settings} />
      </div>
    </div>
  );
}
