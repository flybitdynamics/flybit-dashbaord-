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
  const bharuchId = newId();
  const vyaraId = newId();
  const vadodaraId = newId();

  const shows: Show[] = [
    {
      id: bharuchId,
      location: "Bharuch",
      zone: "green",
      droneCount: 120,
      person: "Jehan Patel",
      bookingDate: offsetDate(-18),
      showAmount: 151_000,
      showDate: offsetDate(-11),
      showStartTime: "20:00",
      showEndTime: "21:00",
      showStatus: "completed",
      b2b: "Shivam Events",
      permission: "na",
      notes: "Balance pending with the organiser.",
      commission: 0,
      client: "Bharuch Utsav Committee",
      contact: "+91 99043 22110",
      venueAddress: "Golden Chowkdi Ground, Station Road, Bharuch, Gujarat 392001",
      coordinates: "21.702900, 72.997100",
    },
    {
      id: vyaraId,
      location: "Vyara",
      zone: "yellow",
      droneCount: 150,
      person: "Jehan Patel",
      bookingDate: offsetDate(-6),
      showAmount: 180_000,
      showDate: offsetDate(9),
      showStartTime: "20:30",
      showEndTime: "21:30",
      showStatus: "upcoming",
      b2b: "",
      permission: "applied",
      notes: "Advance received in cash. MoCA filing due this week.",
      commission: 10_000,
      client: "Jai Sindhi",
      contact: "9722455898",
      venueAddress: "Municipal Ground, Bardoli Road, Vyara, Gujarat 394650",
      coordinates: "21.111600, 73.396800",
    },
    {
      id: vadodaraId,
      location: "Vadodara",
      zone: "red",
      droneCount: 150,
      person: "Jehan Patel",
      bookingDate: offsetDate(-2),
      showAmount: 260_000,
      showDate: offsetDate(21),
      showStartTime: "20:30",
      showEndTime: "21:30",
      showStatus: "upcoming",
      b2b: "Metro Events",
      permission: "applied",
      notes: "Inside controlled airspace — MoCA and ATC clearance both needed.",
      commission: 25_000,
      client: "Reliance Foundation School",
      contact: "+91 92274 28262",
      venueAddress:
        "Reliance Foundation School Ground, New IPCL Rd, Subhanpura, Vadodara, Gujarat 390023",
      coordinates: "22.323547, 73.156645",
    },
  ];

  const payments: Payment[] = [
    {
      id: newId(),
      showId: bharuchId,
      amount: 76_000,
      date: offsetDate(-18),
      mode: "bank",
      notes: "Booking advance",
    },
    {
      id: newId(),
      showId: vyaraId,
      amount: 60_000,
      date: offsetDate(-6),
      mode: "cash",
      notes: "Advance collected on site",
    },
  ];

  return { shows, payments };
}
