/** Reading the inquiry tracker into the desk.
 *
 *  The sheet is a working document, not a database: drone counts read
 *  "400 or 500", prices read "4.50 lakhs +gst", and the result column is
 *  whatever was true that week. So every row keeps its original text in the
 *  notes, and what is derived below is only ever a starting point the desk
 *  can correct. */

import { INDIAN_STATES, Show, ShowStatus, Zone, emptyShow, todayISO } from "./types";

export interface ImportColumns {
  /** Index into the row's cells, or -1 when the sheet has no such column. */
  name: number;
  purpose: number;
  place: number;
  drones: number;
  result: number;
  /** Everything else is kept as notes. */
  notes: number[];
}

export interface ImportRow {
  /** 1-based line in what was pasted, for the preview. */
  line: number;
  cells: string[];
  draft: Omit<Show, "id">;
  /** Why a row will not be brought in. */
  skip: string | null;
  /** Already on the desk under this name. */
  duplicate: boolean;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/* ---------------- the header ---------------- */

const HEADERS: Array<[keyof Omit<ImportColumns, "notes">, RegExp]> = [
  ["name", /\bname\b|client|party/i],
  ["purpose", /purpose|occasion|event type/i],
  ["place", /city|state|place|location/i],
  ["drones", /drone|qty|quantity/i],
  ["result", /result|status|stage/i],
];

/** Finds the header row and what each column holds. */
export function readColumns(rows: string[][]): { columns: ImportColumns; headerAt: number } {
  let headerAt = -1;
  let best = 0;
  rows.forEach((cells, index) => {
    const hits = HEADERS.filter(([, test]) => cells.some((cell) => test.test(cell))).length;
    if (hits > best) {
      best = hits;
      headerAt = index;
    }
  });

  const columns: ImportColumns = { name: -1, purpose: -1, place: -1, drones: -1, result: -1, notes: [] };
  if (headerAt < 0) return { columns, headerAt };

  const header = rows[headerAt];
  for (const [key, test] of HEADERS) {
    columns[key] = header.findIndex((cell) => test.test(cell));
  }
  const taken = [columns.name, columns.purpose, columns.place, columns.drones, columns.result];
  const serial = serialColumn(rows, headerAt);
  columns.notes = header
    .map((_, index) => index)
    .filter((index) => !taken.includes(index) && index !== serial);

  return { columns, headerAt };
}

/** The sheet numbers its rows down the left. That column is not data — and
 *  read as data it turns into a price, so it is found and dropped. */
function serialColumn(rows: string[][], headerAt: number): number {
  const width = Math.max(...rows.map((cells) => cells.length), 0);
  for (let index = 0; index < width; index += 1) {
    const values = rows
      .slice(headerAt + 1)
      .map((cells) => clean(cells[index] ?? ""))
      .filter(Boolean);
    if (values.length < 5) continue;
    if (!values.every((value) => /^[0-9]{1,3}$/.test(value))) continue;
    const numbers = values.map(Number);
    const climbing = numbers.every((value, i) => i === 0 || value > numbers[i - 1]);
    if (climbing && numbers[0] <= 2) return index;
  }
  return -1;
}

/* ---------------- what the cells mean ---------------- */

/** The result column, in the words the sheet uses. */
export function statusFrom(result: string): ShowStatus {
  const text = result.toLowerCase();
  if (/cancel/.test(text)) return "cancelled";
  if (/\bgone\b|no budget|not interest|fail|decline/.test(text)) return "lost";
  if (/confirm|book|advance|token/.test(text)) return "confirmed";
  if (/done|complete|flown/.test(text)) return "completed";
  return "inquiry";
}

/** "400 or 500" → 400. "2500*3" → 2500. "100150200" is three counts run
 *  together with nothing between them, so the first three digits are taken
 *  and the row keeps its own words for whoever checks it. */
export function dronesFrom(text: string): number {
  const bounded = text.match(/\b\d{2,4}\b/);
  if (bounded) return Number(bounded[0]);
  const run = text.match(/\d{5,}/);
  return run ? Number(run[0].slice(0, 3)) : 0;
}

/** What one cell says the money is. "4.50 lakhs +gst" → 450000,
 *  "1,70,000" → 170000. A cell holding nothing but "3.5" is lakhs too, the
 *  way the sheet's later rows write it — but only when it is small enough
 *  to be a price in lakhs rather than a drone count or a date. */
export function amountFrom(text: string): number {
  const cell = clean(text);

  const lakh = cell.match(/(\d+(?:[.,]\d+)?)\s*(?:lakh|lakhs|lac)/i);
  if (lakh) return Math.round(Number(lakh[1].replace(",", ".")) * 100_000);

  const grouped = cell.match(/\d{1,3}(?:,\d{2,3})+/);
  if (grouped) {
    const value = Number(grouped[0].replace(/,/g, ""));
    if (value >= 10_000) return value;
  }

  const alone = cell.match(/^(\d{1,2}(?:\.\d+)?)$/);
  if (alone && Number(alone[1]) <= 50) return Math.round(Number(alone[1]) * 100_000);

  return 0;
}

/** The first cell that names a price wins, so a later note about something
 *  else cannot overwrite it. */
function amountAcross(cells: string[]): number {
  for (const cell of cells) {
    const value = amountFrom(cell);
    if (value) return value;
  }
  return 0;
}

export function zoneFrom(text: string): Zone {
  if (/red zone/i.test(text)) return "red";
  if (/green zone/i.test(text)) return "green";
  return "yellow";
}

/** "songadh ,surat" → area Songadh, city Surat. "west bengal" → the state. */
export function placeFrom(text: string): { state: string; location: string; area: string } {
  const bits = clean(text)
    .split(/[,/]/)
    .map((bit) => bit.trim())
    .filter(Boolean);
  if (bits.length === 0) return { state: "", location: "", area: "" };

  const known = (value: string) =>
    INDIAN_STATES.find((state) => state.toLowerCase() === value.toLowerCase());

  const last = bits[bits.length - 1];
  const state = known(last);
  if (state && bits.length > 1) {
    return { state, location: title(bits[bits.length - 2]), area: bits.length > 2 ? title(bits[0]) : "" };
  }
  if (state) return { state, location: "", area: "" };
  if (bits.length === 1) return { state: "", location: title(bits[0]), area: "" };
  return { state: "", location: title(last), area: title(bits[0]) };
}

function title(value: string): string {
  return clean(value).replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** A bare 10-digit cell in the name column is a phone number, not a name. */
const PHONE = /^\+?\d[\d\s-]{8,}$/;

/* ---------------- a row becomes a show ---------------- */

export function toDraft(cells: string[], columns: ImportColumns): Omit<Show, "id"> {
  const at = (index: number) => (index >= 0 ? clean(cells[index] ?? "") : "");
  const name = at(columns.name);
  const purpose = at(columns.purpose);
  const place = at(columns.place);
  const result = at(columns.result);
  const extra = columns.notes.map((index) => clean(cells[index] ?? "")).filter(Boolean);

  const { state, location, area } = placeFrom(place);

  /* Everything the sheet said, kept verbatim under what was derived. */
  const notes = [
    purpose && `Purpose: ${purpose}`,
    result && `Result: ${result}`,
    ...extra,
    "— imported from the inquiry tracker",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...emptyShow(),
    showStatus: statusFrom(result),
    client: PHONE.test(name) ? "" : title(name),
    contactPhone: PHONE.test(name) ? name : "",
    state,
    location,
    area,
    zone: zoneFrom([...extra, result].join(" ")),
    droneCount: dronesFrom(at(columns.drones)),
    showAmount: amountAcross(extra),
    bookingDate: todayISO(),
    showDate: "",
    notes,
  };
}

/** Splits what was pasted, finds the header, and maps every row under it. */
export function readSheet(text: string, existing: Show[]): { rows: ImportRow[]; columns: ImportColumns } {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t"));

  const { columns, headerAt } = readColumns(lines);
  const names = new Set(
    existing.map((show) => show.client.trim().toLowerCase()).filter(Boolean),
  );

  const rows: ImportRow[] = [];
  lines.forEach((cells, index) => {
    if (index <= headerAt) return;
    const filled = cells.filter((cell) => clean(cell)).length;
    if (filled === 0) return;

    const draft = toDraft(cells, columns);
    const named = draft.client || draft.contactPhone;
    const duplicate = Boolean(draft.client) && names.has(draft.client.trim().toLowerCase());

    rows.push({
      line: index + 1,
      cells,
      draft,
      duplicate,
      skip: !named ? "no name in the row" : null,
    });
  });

  return { rows, columns };
}
