"use client";

/** The fields a printed sheet is edited with.
 *
 *  A field inherits the document's type and carries no box of its own, so
 *  the page reads the same whether you are typing into it or printing it.
 *  Shared by the invoice and the quotation so the two never drift apart. */

import { useState } from "react";
import { amountText, invoiceDate, parseInvoiceDate } from "../../lib/invoices";
import { formatDate } from "../../lib/types";

/** A single-line value. */
export function Slot({
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
export function GrowSlot({
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
export function MoneySlot({
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
export function DateSlot({
  value,
  edit,
  onChange,
  className = "",
}: {
  value: string;
  edit: boolean;
  onChange?: (iso: string) => void;
  className?: string;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  if (!edit || !onChange) return <>{invoiceDate(value)}</>;
  return (
    <input
      className={`inv-edit ${className}`}
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

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** "28 SEP 2026" ⇄ "2026-09-28". Anything that is not a date is kept as
 *  typed, so a quotation can still say "sep end". */
export function readDayMonthYear(text: string): string | null {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const named = value.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,})[\s/-]+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toUpperCase());
    if (month >= 0) {
      return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
    }
    return null;
  }

  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    const month = Number(numeric[2]);
    if (month >= 1 && month <= 12) {
      return `${numeric[3]}-${String(month).padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** Shows a stored date as "28 SEP 2026"; leaves any other wording alone. */
export function dayMonthYear(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? formatDate(value.trim()) : value;
}

/** A date on a letter: reads as 28 SEP 2026, typed however you like. */
export function LongDateSlot({
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
  const [typing, setTyping] = useState<string | null>(null);
  if (!edit || !onChange) return <>{dayMonthYear(value)}</>;
  return (
    <input
      className={`inv-edit ${className}`}
      placeholder={placeholder}
      value={typing ?? dayMonthYear(value)}
      onFocus={() => setTyping(dayMonthYear(value))}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        setTyping(e.target.value);
        onChange(readDayMonthYear(e.target.value) ?? e.target.value);
      }}
    />
  );
}
