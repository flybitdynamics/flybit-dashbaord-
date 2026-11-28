"use client";

/** The printed work order: an A4 page laid out from the Patel Family work
 *  order. A gold client name over a navy WORK ORDER title, the parties in a
 *  shaded table, numbered sections with gold numbers, the value and payment
 *  terms, and a sign-off for both sides. Pass `edit` and every printed value
 *  becomes a field typed on the page. */

import { Fragment } from "react";
import { WorkOrder, WorkOrderBullet, WorkOrderDetail, footerText } from "../../lib/work-orders";
import { GrowSlot, Slot } from "../sheet/Fields";

type Draft = Omit<WorkOrder, "id">;
type BulletKey = "scope" | "requirements" | "terms";

export interface WorkOrderEdit {
  onChange: (patch: Partial<Draft>) => void;
  onDetailChange: (id: string, patch: Partial<WorkOrderDetail>) => void;
  onAddDetail: (wide: boolean) => void;
  onRemoveDetail: (id: string) => void;
  onBulletChange: (key: BulletKey, id: string, text: string) => void;
  onAddBullet: (key: BulletKey) => void;
  onRemoveBullet: (key: BulletKey, id: string) => void;
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} className="inv-noprint wo-del" onClick={onClick}>
      ✕
    </button>
  );
}

function AddLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="inv-noprint wo-add" onClick={onClick}>
      {children}
    </button>
  );
}

/** A shaded cell: small grey label over a bold value. */
function Cell({
  label,
  value,
  edit,
  onLabel,
  onValue,
  placeholder,
  wide,
  onRemove,
}: {
  label: string;
  value: string;
  edit: boolean;
  onLabel?: (v: string) => void;
  onValue: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className={`wo-cell ${wide ? "wo-wide" : ""}`}>
      {edit && onRemove && <Remove label="Remove this line" onClick={onRemove} />}
      <div className="wo-label">
        {onLabel ? <Slot value={label} edit={edit} onChange={onLabel} placeholder="Label" /> : label}
      </div>
      <div className="wo-value">
        <GrowSlot value={value} edit={edit} onChange={onValue} placeholder={placeholder} />
      </div>
    </div>
  );
}

function Bullets({
  items,
  edit,
  name,
  onEdit,
  columns,
}: {
  items: WorkOrderBullet[];
  edit?: WorkOrderEdit;
  name: BulletKey;
  onEdit: boolean;
  columns?: boolean;
}) {
  // The scope list sits in two columns, filled top to bottom.
  const split = columns ? Math.ceil(items.length / 2) : items.length;
  const groups = columns ? [items.slice(0, split), items.slice(split)] : [items];
  return (
    <div className={columns ? "wo-scope" : ""}>
      {groups.map((group, g) => (
        <ul key={g} className={columns ? "wo-bullets wo-bullets-plain" : "wo-bullets"}>
          {group.map((item) => (
            <li key={item.id}>
              {onEdit && <Remove label="Remove this line" onClick={() => edit?.onRemoveBullet(name, item.id)} />}
              <GrowSlot value={item.text} edit={onEdit} onChange={(text) => edit?.onBulletChange(name, item.id, text)} placeholder="Write a line" />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="wo-section">
      <h2 className="wo-heading">
        <span className="wo-num">{n}</span> {title}
      </h2>
      {children}
    </section>
  );
}

export function WorkOrderSheet({ order, edit }: { order: Draft; edit?: WorkOrderEdit }) {
  const on = Boolean(edit);
  const set = (patch: Partial<Draft>) => edit?.onChange(patch);

  return (
    <div className="wo-sheet">
      <div className="wo-page">
        <header className="wo-top">
          <div className="wo-client">
            <Slot value={order.clientName} edit={on} onChange={(clientName) => set({ clientName })} placeholder="CLIENT NAME" className="wo-center-input" />
          </div>
          <h1 className="wo-title">
            <Slot value={order.title} edit={on} onChange={(title) => set({ title })} className="wo-center-input" />
          </h1>
          <div className="wo-subtitle">
            <Slot value={order.subtitle} edit={on} onChange={(subtitle) => set({ subtitle })} className="wo-center-input" />
          </div>
        </header>

        <div className="wo-grid wo-parties">
          <Cell label="Issued by / Client" value={order.issuedBy} edit={on} onValue={(issuedBy) => set({ issuedBy })} placeholder="Client name" />
          <Cell label="Issued to / Service provider" value={order.issuedTo} edit={on} onValue={(issuedTo) => set({ issuedTo })} />
          <Cell label="Date of issue" value={order.issueDate} edit={on} onValue={(issueDate) => set({ issueDate })} placeholder="26 November 2026" />
          <div className="wo-cell" />
        </div>

        <Section n="01" title="EVENT AND SERVICE DETAILS">
          <div className="wo-grid wo-details">
            {order.details.map((detail, index) => {
              // A lone half-width line before a wide one gets an empty partner.
              const halfBefore = order.details.slice(0, index).filter((d) => !d.wide).length;
              const next = order.details[index + 1];
              const pad = !detail.wide && halfBefore % 2 === 0 && (!next || next.wide);
              return (
                <Fragment key={detail.id}>
                  <Cell
                    label={detail.label}
                    value={detail.value}
                    edit={on}
                    wide={detail.wide}
                    onLabel={(label) => edit?.onDetailChange(detail.id, { label })}
                    onValue={(value) => edit?.onDetailChange(detail.id, { value })}
                    onRemove={() => edit?.onRemoveDetail(detail.id)}
                  />
                  {pad && <div className="wo-cell" />}
                </Fragment>
              );
            })}
          </div>
          {on && (
            <div className="wo-adds">
              <AddLink onClick={() => edit?.onAddDetail(false)}>+ Add detail</AddLink>
              <AddLink onClick={() => edit?.onAddDetail(true)}>+ Add full-width detail</AddLink>
            </div>
          )}
        </Section>

        <Section n="02" title="SCOPE OF WORK">
          <div className="wo-text">
            <GrowSlot value={order.scopeIntro} edit={on} onChange={(scopeIntro) => set({ scopeIntro })} placeholder="The Client hereby appoints…" />
          </div>
          <div className="wo-box">
            <Bullets items={order.scope} edit={edit} name="scope" onEdit={on} columns />
          </div>
          {on && <AddLink onClick={() => edit?.onAddBullet("scope")}>+ Add formation / item</AddLink>}
        </Section>

        <Section n="03" title="TECHNICAL AND OPERATIONAL REQUIREMENTS">
          <Bullets items={order.requirements} edit={edit} name="requirements" onEdit={on} />
          {on && <AddLink onClick={() => edit?.onAddBullet("requirements")}>+ Add requirement</AddLink>}
        </Section>

        <Section n="04" title="DELIVERABLE">
          <div className="wo-text">
            <GrowSlot value={order.deliverable} edit={on} onChange={(deliverable) => set({ deliverable })} placeholder="One customized drone light show of … minutes for …" />
          </div>
        </Section>

        <Section n="05" title="TERMS AND CONDITIONS">
          <Bullets items={order.terms} edit={edit} name="terms" onEdit={on} />
          {on && <AddLink onClick={() => edit?.onAddBullet("terms")}>+ Add term</AddLink>}
          <div className="wo-grid wo-money">
            <Cell label="Work order value" value={order.value} edit={on} onValue={(value) => set({ value })} placeholder="₹ 300000/- + GST" />
            <Cell label="Payment terms (if applicable)" value={order.paymentTerms} edit={on} onValue={(paymentTerms) => set({ paymentTerms })} placeholder="50% advance, 50% on event day" />
          </div>
        </Section>

        <div className="wo-note">
          <GrowSlot value={order.closingNote} edit={on} onChange={(closingNote) => set({ closingNote })} placeholder="Closing note" />
        </div>

        <div className="wo-sign">
          <div>
            <div className="wo-sign-for">
              <Slot value={order.clientSignFor} edit={on} onChange={(clientSignFor) => set({ clientSignFor })} placeholder="FOR CLIENT NAME" />
            </div>
            <div className="wo-sign-lines">
              <div>Signature:</div>
              <div>
                Name:{" "}
                <Slot value={order.clientSignName} edit={on} onChange={(clientSignName) => set({ clientSignName })} placeholder="Name" className="wo-inline" />
              </div>
              <div>
                Date:{" "}
                <Slot value={order.clientSignDate} edit={on} onChange={(clientSignDate) => set({ clientSignDate })} placeholder="26th Nov 2026" className="wo-inline" />
              </div>
            </div>
          </div>
          <div>
            <div className="wo-sign-for">
              <Slot value={order.providerSignFor} edit={on} onChange={(providerSignFor) => set({ providerSignFor })} />
            </div>
            <div className="wo-sign-lines">
              <div>Authorized Signature:</div>
              <div>
                Name / Designation:{" "}
                <Slot value={order.providerSignName} edit={on} onChange={(providerSignName) => set({ providerSignName })} placeholder="Name" className="wo-inline" />
              </div>
              <div>
                Date:{" "}
                <Slot value={order.providerSignDate} edit={on} onChange={(providerSignDate) => set({ providerSignDate })} placeholder="26th Nov 2026" className="wo-inline" />
              </div>
            </div>
          </div>
        </div>

        <footer className="wo-footer">
          {on ? (
            <Slot
              value={order.footer || footerText(order)}
              edit
              onChange={(footer) => set({ footer })}
              className="wo-center-input"
            />
          ) : (
            footerText(order)
          )}
        </footer>
      </div>
    </div>
  );
}
