"use client";

import { useEffect, useState } from "react";
import {
  DOCUMENTS,
  DocumentFields,
  DocumentId,
  documentBaseName,
  fieldsFor,
  missingFields,
} from "../lib/documents";
import {
  Settings,
  Show,
  formatDateOrdinal,
  formatTime,
  todayISO,
} from "../lib/types";
import { Field, Modal, inputClass } from "./Modal";

const FIELD_LABELS: Partial<Record<keyof DocumentFields, string>> = {
  city: "City / location",
  venueAddress: "Event location (full address)",
  coordinates: "Coordinates",
  droneCount: "Number of drones",
  showDateLong: "Show date (as printed)",
  showTimeRange: "Show time (as printed)",
  letterDate: "Letter date",
  maxHeight: "Maximum height (m)",
  operatingRadius: "Operating radius (m)",
  operatingTime: "Operating time",
  weather: "Operating weather",
  operationType: "Type of operation",
  uin: "UIN",
  previousPermissionNo: "Previous MoCA permission no.",
  signatoryName: "Signatory name",
  signatoryTitle: "Signatory designation",
  coordinatorName: "Show coordinator",
  coordinatorPhone: "Coordinator phone",
  pilotName: "Remote pilot",
  pilotQualification: "Pilot qualification",
};

const EVENT_KEYS: (keyof DocumentFields)[] = [
  "city",
  "venueAddress",
  "coordinates",
  "droneCount",
  "showDateLong",
  "showTimeRange",
  "letterDate",
];

const OPERATION_KEYS: (keyof DocumentFields)[] = [
  "maxHeight",
  "operatingRadius",
  "operatingTime",
  "weather",
  "operationType",
  "uin",
  "previousPermissionNo",
];

const PEOPLE_KEYS: (keyof DocumentFields)[] = [
  "signatoryName",
  "signatoryTitle",
  "coordinatorName",
  "coordinatorPhone",
  "pilotName",
  "pilotQualification",
];

interface PdfSupport {
  pdf: boolean;
  installHint: string | null;
}

export function DocumentsDialog({
  show,
  settings,
  onClose,
}: {
  show: Show;
  settings: Settings;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<DocumentFields>(() =>
    fieldsFor(show, settings, todayISO()),
  );
  const [chosen, setChosen] = useState<DocumentId[]>(() => DOCUMENTS.map((d) => d.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantWord, setWantWord] = useState(true);
  const [wantPdf, setWantPdf] = useState(true);
  const [wantTrial, setWantTrial] = useState(false);
  const [trialDate, setTrialDate] = useState(show.showDate);
  const [trialStart, setTrialStart] = useState(show.showStartTime);
  const [trialEnd, setTrialEnd] = useState(show.showEndTime);
  const [pdfSupport, setPdfSupport] = useState<PdfSupport | null>(null);

  /* Whether PDFs can be produced depends on the machine, so ask the
     server rather than guessing. */
  useEffect(() => {
    let live = true;
    fetch("/api/permission-docs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PdfSupport | null) => {
        if (live && data) setPdfSupport(data);
      })
      .catch(() => {
        if (live) setPdfSupport({ pdf: false, installHint: null });
      });
    return () => {
      live = false;
    };
  }, []);

  const pdfReady = pdfSupport?.pdf === true;
  const includePdf = wantPdf && pdfReady;
  const includeWord = wantWord;
  const formatCount = (includeWord ? 1 : 0) + (includePdf ? 1 : 0);
  const letterChosen = chosen.includes("moca-letter");
  const includeTrialLetter = wantTrial && letterChosen;
  const fileCount = (chosen.length + (includeTrialLetter ? 1 : 0)) * formatCount;

  // Printed exactly the way the main show's line is built.
  const trialWindow = `${formatTime(trialStart)} – ${formatTime(trialEnd)}, ${formatDateOrdinal(trialDate)}`;

  const missing = missingFields(fields);
  const baseName = documentBaseName({ ...show, location: fields.city });

  const set = (key: keyof DocumentFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  function toggle(id: DocumentId) {
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/permission-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          documents: chosen,
          baseName,
          includeWord,
          includePdf,
          includeTrialLetter,
          trialWindow,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "The documents could not be generated.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The documents could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  const renderFields = (keys: (keyof DocumentFields)[]) =>
    keys.map((key) => (
      <Field
        key={key}
        label={FIELD_LABELS[key] ?? key}
        htmlFor={`doc-${key}`}
        wide={key === "venueAddress"}
      >
        <input
          id={`doc-${key}`}
          className={inputClass}
          value={fields[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    ));

  return (
    <Modal
      title="Permission documents"
      subtitle="Filled into your original Word files — layout, tables and letterhead untouched."
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <span className="font-mono text-xs text-neutral-600">
            {fileCount} file{fileCount === 1 ? "" : "s"} → {baseName}.zip
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy || chosen.length === 0 || missing.length > 0 || formatCount === 0}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {busy
                ? includePdf
                  ? "Generating Word + PDF…"
                  : "Generating…"
                : "Generate & save"}
            </button>
          </div>
        </>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto p-5">
        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {missing.length > 0 && (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Still blank: {missing.map((key) => FIELD_LABELS[key as keyof DocumentFields] ?? key).join(", ")}.
            The documents would print the label with nothing after it, so fill these in — or type{" "}
            <strong className="font-semibold">NA</strong>, the way the original forms do.
          </p>
        )}

        <fieldset className="mb-5">
          <legend className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Documents to generate
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DOCUMENTS.map((doc) => {
              const active = chosen.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    onChange={() => toggle(doc.id)}
                  />
                  {doc.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mb-5">
          <legend className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Trial show
          </legend>
          <label
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm ${
              letterChosen
                ? "cursor-pointer border-neutral-300 hover:bg-neutral-50"
                : "border-neutral-200 bg-neutral-50 text-neutral-400"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-neutral-900"
              checked={includeTrialLetter}
              disabled={!letterChosen}
              onChange={(e) => setWantTrial(e.target.checked)}
            />
            <span>
              <span className="block font-medium">
                Also generate the trial-show permission letter
              </span>
              <span className="block text-xs">
                {letterChosen
                  ? 'A second letter reading "Date & Time of Trial Show", saved as MoCA Permission Letter (Trial).'
                  : "Select the MoCA Permission Letter above to enable this."}
              </span>
            </span>
          </label>

          {includeTrialLetter && (
            <div className="mt-3 rounded-xl bg-neutral-100/70 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Trial date" htmlFor="trial-date">
                  <input
                    id="trial-date"
                    type="date"
                    className={inputClass}
                    value={trialDate}
                    onChange={(e) => setTrialDate(e.target.value)}
                  />
                </Field>
                <Field label="Trial start" htmlFor="trial-start">
                  <input
                    id="trial-start"
                    type="time"
                    className={inputClass}
                    value={trialStart}
                    onChange={(e) => setTrialStart(e.target.value)}
                  />
                </Field>
                <Field label="Trial end" htmlFor="trial-end">
                  <input
                    id="trial-end"
                    type="time"
                    className={inputClass}
                    value={trialEnd}
                    onChange={(e) => setTrialEnd(e.target.value)}
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-neutral-600">
                The trial letter will read{" "}
                <span className="font-medium text-neutral-900">
                  Date &amp; Time of Trial Show: {trialWindow}
                </span>
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="mb-5">
          <legend className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Format
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-neutral-900"
                checked={includeWord}
                onChange={(e) => setWantWord(e.target.checked)}
              />
              <span>
                <span className="block font-medium">Word (.docx)</span>
                <span className="block text-xs text-neutral-500">
                  Editable — for changes before filing.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm ${
                pdfReady
                  ? "cursor-pointer border-neutral-300 hover:bg-neutral-50"
                  : "border-neutral-200 bg-neutral-50 text-neutral-400"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-neutral-900"
                checked={includePdf}
                disabled={!pdfReady}
                onChange={(e) => setWantPdf(e.target.checked)}
              />
              <span>
                <span className="block font-medium">PDF</span>
                <span className="block text-xs">
                  {pdfSupport === null
                    ? "Checking whether this machine can make PDFs…"
                    : pdfReady
                      ? "Final — for emailing to the ministry."
                      : `Not set up here. Install LibreOffice: ${pdfSupport.installHint ?? "brew install --cask libreoffice"}`}
                </span>
              </span>
            </label>
          </div>
          {formatCount === 0 && (
            <p className="mt-2 text-xs font-medium text-red-600">
              Pick at least one format — nothing would be downloaded otherwise.
            </p>
          )}
        </fieldset>

        <Section title="Event details">{renderFields(EVENT_KEYS)}</Section>
        <Section title="Operations">{renderFields(OPERATION_KEYS)}</Section>
        <Section
          title="People"
          note="Defaults come from Settings — change them here for this filing only."
        >
          {renderFields(PEOPLE_KEYS)}
        </Section>
      </div>
    </Modal>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
          {title}
        </h3>
        {note && <span className="text-[11px] text-neutral-500">{note}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
