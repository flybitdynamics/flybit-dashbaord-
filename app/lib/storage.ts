import { DEFAULT_SETTINGS, Payment, Settings, Show, toISO } from "./types";

const SHOWS_KEY = "flybit-shows-v2";
const PAYMENTS_KEY = "flybit-payments-v2";
const SETTINGS_KEY = "flybit-settings-v2";
const SAMPLE_KEY = "flybit-samples-v2";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the desk keeps working in memory */
  }
}

export function loadShows(): Show[] | null {
  const rows = read<Record<string, unknown>[]>(SHOWS_KEY);
  if (!Array.isArray(rows)) return null;
  // Rows saved before "Company" became "B2B" keep their value; the old
  // Flybit/Shivam split columns are dropped.
  return rows.map((row) => {
    const next = { ...row };
    next.b2b = next.b2b ?? next.company ?? "";
    delete next.company;
    delete next.flybitAmount;
    delete next.shivamAmount;
    return next as unknown as Show;
  });
}
export function saveShows(shows: Show[]): void {
  write(SHOWS_KEY, shows);
}

export function loadPayments(): Payment[] {
  const rows = read<Payment[]>(PAYMENTS_KEY);
  return Array.isArray(rows) ? rows : [];
}
export function savePayments(payments: Payment[]): void {
  write(PAYMENTS_KEY, payments);
}

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}
export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

/** Remembered so the "clear samples" escape hatch survives a refresh. */
export function loadSampleFlag(): boolean {
  return read<boolean>(SAMPLE_KEY) === true;
}
export function saveSampleFlag(usingSamples: boolean): void {
  write(SAMPLE_KEY, usingSamples);
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  }
}

export function sortShows(shows: Show[]): Show[] {
  return [...shows].sort(
    (a, b) =>
      a.showDate.localeCompare(b.showDate) ||
      a.showStartTime.localeCompare(b.showStartTime),
  );
}

/** Dates are relative to today so the sample sheet always looks live. */
function offsetDate(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function sampleData(): { shows: Show[]; payments: Payment[] } {
  return { shows: [], payments: [] };
}
