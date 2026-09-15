"use client";

import { useState, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, Settings } from "../lib/types";
import { getServerSnapshot, getSnapshot, subscribe, updateSettings } from "../lib/store";
import { Field, inputClass } from "./Modal";
import { useAuth } from "./AuthProvider";

const GROUPS: { title: string; note?: string; keys: (keyof Settings)[] }[] = [
  {
    title: "Company",
    note: "Appears on the MoCA letter, the annexures and the undertaking.",
    keys: [
      "companyName",
      "companyShortName",
      "companyAddress",
      "companyAddressLine1",
      "companyAddressLine2",
      "companyEmail",
      "companyPhone",
      "nodalPhone",
    ],
  },
  {
    title: "People",
    note: "Signatory, coordinator and the remote pilot named in Annexure 3.",
    keys: [
      "signatoryName",
      "signatoryTitle",
      "coordinatorName",
      "coordinatorPhone",
      "pilotName",
      "pilotQualification",
    ],
  },
  {
    title: "Standard operation values",
    note: "Pre-filled on every filing; still editable per show.",
    keys: [
      "previousPermissionNo",
      "uin",
      "maxHeight",
      "operatingRadius",
      "operatingTime",
      "weather",
      "operationType",
    ],
  },
];

const LABELS: Record<keyof Settings, string> = {
  companyName: "Company name",
  companyShortName: "Short name (Annexure 2)",
  companyAddress: "Address (Annexure 1, one line)",
  companyAddressLine1: "Letterhead address line 1",
  companyAddressLine2: "Letterhead address line 2",
  companyEmail: "Email",
  companyPhone: "Phone (letter format)",
  nodalPhone: "Nodal officer mobile (Annexure 5 format)",
  signatoryName: "Signatory name",
  signatoryTitle: "Signatory designation",
  coordinatorName: "Show coordinator",
  coordinatorPhone: "Coordinator phone",
  pilotName: "Remote pilot",
  pilotQualification: "Pilot qualification",
  previousPermissionNo: "Previous MoCA permission no.",
  uin: "UIN",
  maxHeight: "Maximum height (m)",
  operatingRadius: "Operating radius (m)",
  operatingTime: "Operating time",
  weather: "Operating weather",
  operationType: "Type of operation",
};

export function SettingsForm() {
  const { can } = useAuth();
  const canEdit = can("settings", "edit");
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  const settings = draft ?? state?.settings ?? null;

  if (!settings) {
    return <div className="h-40 animate-pulse card" />;
  }

  const set = (key: keyof Settings, value: string) => {
    setSaved(false);
    setDraft({ ...settings, [key]: value });
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    updateSettings(settings);
    setDraft(null);
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <section
          key={group.title}
          className="overflow-hidden card"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
              {group.title}
            </h2>
            {group.note && <span className="text-xs text-neutral-500">{group.note}</span>}
          </div>
          <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2">
            {group.keys.map((key) => (
              <Field key={key} label={LABELS[key]} htmlFor={`s-${key}`}>
                <input
                  id={`s-${key}`}
                  className={`${inputClass} ${canEdit ? "" : "bg-neutral-50 text-neutral-500"}`}
                  value={settings[key]}
                  readOnly={!canEdit}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </section>
      ))}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({ ...DEFAULT_SETTINGS });
              setSaved(false);
            }}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Reset to document defaults
          </button>
          {saved && <span className="text-sm text-emerald-700">Saved.</span>}
          {draft && !saved && <span className="text-sm text-neutral-500">Unsaved changes.</span>}
        </div>
      ) : (
        <p className="rounded-xl bg-neutral-100/70 px-3 py-2 text-sm text-neutral-500">
          Your role can read these values but not change them.
        </p>
      )}
    </form>
  );
}
