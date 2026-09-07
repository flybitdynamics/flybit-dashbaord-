import {
  Settings,
  Show,
  formatDateDashed,
  formatDateLetter,
  formatDateOrdinal,
  formatTime,
  todayISO,
} from "./types";

/** Every value the three permission templates ask for. */
export interface DocumentFields {
  companyName: string;
  companyShortName: string;
  companyAddress: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyEmail: string;
  companyPhone: string;
  nodalPhone: string;
  signatoryName: string;
  signatoryTitle: string;
  coordinatorName: string;
  coordinatorPhone: string;
  pilotName: string;
  pilotQualification: string;
  previousPermissionNo: string;
  uin: string;
  city: string;
  venueAddress: string;
  coordinates: string;
  letterDate: string;
  letterDateShort: string;
  showDateLong: string;
  showTimeRange: string;
  showWindow: string;
  droneCount: string;
  maxHeight: string;
  operatingRadius: string;
  operatingTime: string;
  weather: string;
  operationType: string;
  /** Reads "Date & Time of <showLabel>:" in the MoCA letter. */
  showLabel: string;
}

/** The main filing is for the show itself; the rehearsal needs its own letter. */
export const SHOW_LABEL_MAIN = "the Show";
export const SHOW_LABEL_TRIAL = "Trial Show";

/** Filename suffix for the second letter. */
export const TRIAL_SUFFIX = " (Trial)";

export const DOCUMENTS = [
  { id: "moca-letter", label: "MoCA Permission Letter", file: "MoCA Permission Letter.docx" },
  { id: "annexures", label: "Annexures 1–5", file: "Annexures for drone permission.docx" },
  { id: "undertaking", label: "Undertaking Form", file: "Under Taking Form.docx" },
] as const;

export type DocumentId = (typeof DOCUMENTS)[number]["id"];

/** Pre-fill the paperwork from a booking. Every value stays editable
 *  before the documents are generated. */
export function fieldsFor(
  show: Show,
  settings: Settings,
  letterDateISO = todayISO(),
): DocumentFields {
  const start = formatTime(show.showStartTime);
  const end = formatTime(show.showEndTime);
  const dateLong = formatDateOrdinal(show.showDate);

  return {
    companyName: settings.companyName,
    companyShortName: settings.companyShortName,
    companyAddress: settings.companyAddress,
    companyAddressLine1: settings.companyAddressLine1,
    companyAddressLine2: settings.companyAddressLine2,
    companyEmail: settings.companyEmail,
    companyPhone: settings.companyPhone,
    nodalPhone: settings.nodalPhone,
    signatoryName: settings.signatoryName,
    signatoryTitle: settings.signatoryTitle,
    coordinatorName: settings.coordinatorName,
    coordinatorPhone: settings.coordinatorPhone,
    pilotName: settings.pilotName,
    pilotQualification: settings.pilotQualification,
    previousPermissionNo: settings.previousPermissionNo,
    uin: settings.uin,
    city: show.location,
    venueAddress: show.venueAddress,
    coordinates: show.coordinates,
    letterDate: formatDateLetter(letterDateISO),
    letterDateShort: formatDateDashed(letterDateISO),
    showDateLong: dateLong,
    showTimeRange: `${start} to ${end}`,
    showWindow: `${start} – ${end}, ${dateLong}`,
    droneCount: String(show.droneCount || 0),
    maxHeight: settings.maxHeight,
    operatingRadius: settings.operatingRadius,
    operatingTime: settings.operatingTime,
    weather: settings.weather,
    operationType: settings.operationType,
    showLabel: SHOW_LABEL_MAIN,
  };
}

/** Which fields the admin should check before generating — the ones that
 *  change per show and are blank often enough to be worth flagging. */
export const REQUIRED_FIELDS: (keyof DocumentFields)[] = [
  "city",
  "venueAddress",
  "coordinates",
  "droneCount",
];

/** Blank, or a drone count of zero. "NA" counts as filled — the original
 *  forms use it, and a label with nothing after it looks like a mistake. */
export function missingFields(fields: DocumentFields): string[] {
  return REQUIRED_FIELDS.filter((key) => {
    const value = String(fields[key] ?? "").trim();
    if (!value) return true;
    return key === "droneCount" && value === "0";
  });
}

/** Flybit-Permission-JaiSindhi-Bharuch-2026-08-27 */
export function documentBaseName(show: Show): string {
  const safe = (value: string) =>
    (value || "").replace(/[^A-Za-z0-9]+/g, "") || "Unnamed";
  return `Flybit-Permission-${safe(show.client)}-${safe(show.location)}-${show.showDate}`;
}
