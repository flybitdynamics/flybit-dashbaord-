"use client";

import { useEffect } from "react";

export const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm outline-none placeholder:text-neutral-400 focus-visible:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900";

export const labelClass =
  "text-[11px] font-medium uppercase tracking-wider text-neutral-500";

export function Field({
  label,
  htmlFor,
  children,
  wide = false,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        {children}

        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
