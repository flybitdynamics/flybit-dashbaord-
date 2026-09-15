import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Client,
  DEFAULT_SETTINGS,
  Payment,
  Pilot,
  Place,
  Settings,
  Show,
  ShowStatus,
  normalizeShow,
  placeId,
} from "./types";
import { Expense } from "./finance";
import {
  CLIENTS,
  EXPENSES,
  PAYMENTS,
  PILOTS,
  PLACES,
  SETTINGS_DOC,
  SHOWS,
  getDb,
  isFirebaseConfigured,
} from "./firebase";
import { newId, sortShows } from "./storage";

export interface DeskState {
  shows: Show[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  pilots: Pilot[];
  places: Place[];
  settings: Settings;
  /** Set when Firestore refuses or cannot be reached. */
  error: string | null;
}

/* The desk lives in Firestore. Components read it through
   useSyncExternalStore: the listeners below are the external system, and the
   server render sees null until the browser has data. */
let shows: Show[] = [];
let payments: Payment[] = [];
let expenses: Expense[] = [];
let clients: Client[] = [];
let pilots: Pilot[] = [];
let places: Place[] = [];
let settings: Settings = DEFAULT_SETTINGS;
let error: string | null = null;
const seen = {
  shows: false,
  payments: false,
  expenses: false,
  clients: false,
  pilots: false,
  places: false,
  settings: false,
};

let state: DeskState | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function publish() {
  const ready = Object.values(seen).every(Boolean) || error !== null;
  if (!ready) return;
  state = { shows: sortShows(shows), payments, expenses, clients, pilots, places, settings, error };
  emit();
}

function fail(reason: unknown) {
  const code = (reason as { code?: string })?.code ?? "";
  error =
    code === "permission-denied"
      ? "Firestore refused the request. Check the security rules for this project."
      : code === "unavailable"
        ? "Cannot reach Firestore right now. Changes will sync when the connection returns."
        : reason instanceof Error
          ? reason.message
          : "Something went wrong talking to Firestore.";
  publish();
}

/** A role that cannot read one collection still gets the rest of the page:
 *  that listener reports nothing instead of failing everything. */
function denied(key: keyof typeof seen) {
  return (reason: unknown) => {
    if ((reason as { code?: string })?.code === "permission-denied") {
      seen[key] = true;
      publish();
      return;
    }
    fail(reason);
  };
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

function attach() {
  const db = getDb();
  if (!db) {
    error = isFirebaseConfigured
      ? "Firestore could not start."
      : "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.";
    publish();
    return;
  }

  const stops = [
    onSnapshot(
      collection(db, SHOWS),
      (snap) => {
        shows = snap.docs.map((d) => normalizeShow(d.id, d.data()));
        seen.shows = true;
        error = null;
        publish();
      },
      denied("shows"),
    ),
    onSnapshot(
      collection(db, PAYMENTS),
      (snap) => {
        payments = snap.docs.map((d) => ({ ...(d.data() as Omit<Payment, "id">), id: d.id }));
        seen.payments = true;
        publish();
      },
      denied("payments"),
    ),
    onSnapshot(
      collection(db, EXPENSES),
      (snap) => {
        expenses = snap.docs.map((d) => ({ ...(d.data() as Omit<Expense, "id">), id: d.id }));
        seen.expenses = true;
        publish();
      },
      denied("expenses"),
    ),
    onSnapshot(
      collection(db, CLIENTS),
      (snap) => {
        clients = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Client, "id">), id: d.id }))
          .sort(byName);
        seen.clients = true;
        publish();
      },
      denied("clients"),
    ),
    onSnapshot(
      collection(db, PILOTS),
      (snap) => {
        pilots = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Pilot, "id">), id: d.id }))
          .sort(byName);
        seen.pilots = true;
        publish();
      },
      denied("pilots"),
    ),
    onSnapshot(
      collection(db, PLACES),
      (snap) => {
        places = snap.docs.map((d) => ({ ...(d.data() as Omit<Place, "id">), id: d.id }));
        seen.places = true;
        publish();
      },
      denied("places"),
    ),
    onSnapshot(
      doc(db, ...SETTINGS_DOC),
      (snap) => {
        settings = snap.exists()
          ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) }
          : DEFAULT_SETTINGS;
        seen.settings = true;
        publish();
      },
      denied("settings"),
    ),
  ];

  detach = () => stops.forEach((stop) => stop());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && !detach) attach();
  return () => {
    listeners.delete(listener);
  };
}

/** Null until the first snapshots arrive. */
export function getSnapshot(): DeskState | null {
  return state;
}

export function getServerSnapshot(): DeskState | null {
  return null;
}

function db() {
  const instance = getDb();
  if (!instance) throw new Error("Firestore is not configured.");
  return instance;
}

/** Firestore rejects a document holding `undefined`, and legacy show fields
 *  are optional — so drop any key that is not set. */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/* ---------------- shows ---------------- */

/** Saving a show also remembers its place, so the next booking can pick it. */
export function upsertShow(draft: Omit<Show, "id">, id: string | null): string {
  const showId = id ?? newId();
  const body = clean({ ...draft } as Omit<Show, "id"> & { id?: string });
  delete body.id;
  setDoc(doc(db(), SHOWS, showId), body).catch(fail);
  rememberPlace(draft.state, draft.location, draft.area);
  return showId;
}

/** Move a show along the pipeline without rewriting the rest of it. */
export function setShowStatus(id: string, status: ShowStatus): void {
  updateDoc(doc(db(), SHOWS, id), { showStatus: status }).catch(fail);
}

export function removeShow(id: string): void {
  (async () => {
    const instance = db();
    const [ownedPayments, ownedExpenses] = await Promise.all([
      getDocs(query(collection(instance, PAYMENTS), where("showId", "==", id))),
      getDocs(query(collection(instance, EXPENSES), where("showId", "==", id))),
    ]);
    const batch = writeBatch(instance);
    batch.delete(doc(instance, SHOWS, id));
    ownedPayments.forEach((payment) => batch.delete(payment.ref));
    ownedExpenses.forEach((expense) => batch.delete(expense.ref));
    await batch.commit();
  })().catch(fail);
}

/* ---------------- places ---------------- */

export function rememberPlace(state: string, city: string, area: string): void {
  if (!city.trim()) return;
  setDoc(doc(db(), PLACES, placeId(state, city, area)), {
    state: state.trim(),
    city: city.trim(),
    area: area.trim(),
  }).catch(fail);
}

export function removePlace(id: string): void {
  deleteDoc(doc(db(), PLACES, id)).catch(fail);
}

/* ---------------- clients ---------------- */

/** Returns the id straight away so a show being created alongside can point
 *  at the new client before Firestore confirms. */
export function upsertClient(draft: Omit<Client, "id">, id: string | null): string {
  const clientId = id ?? newId();
  setDoc(doc(db(), CLIENTS, clientId), clean(draft)).catch(fail);
  if (draft.city.trim()) rememberPlace(draft.state, draft.city, "");
  return clientId;
}

/** Shows keep the client's name, so they still read correctly afterwards. */
export function removeClient(id: string): void {
  deleteDoc(doc(db(), CLIENTS, id)).catch(fail);
}

/* ---------------- pilots ---------------- */

export function upsertPilot(draft: Omit<Pilot, "id">, id: string | null): string {
  const pilotId = id ?? newId();
  setDoc(doc(db(), PILOTS, pilotId), clean(draft)).catch(fail);
  return pilotId;
}

/** Take the pilot off every show they were assigned to, then remove them. */
export function removePilot(id: string): void {
  (async () => {
    const instance = db();
    const assigned = await getDocs(
      query(collection(instance, SHOWS), where("pilotIds", "array-contains", id)),
    );
    const batch = writeBatch(instance);
    assigned.forEach((show) => batch.update(show.ref, { pilotIds: arrayRemove(id) }));
    batch.delete(doc(instance, PILOTS, id));
    await batch.commit();
  })().catch(fail);
}

/* ---------------- payments, expenses, settings ---------------- */

export function addPayment(draft: Omit<Payment, "id">): void {
  setDoc(doc(db(), PAYMENTS, newId()), draft).catch(fail);
}

export function removePayment(id: string): void {
  deleteDoc(doc(db(), PAYMENTS, id)).catch(fail);
}

export function upsertExpense(draft: Omit<Expense, "id">, id: string | null): void {
  setDoc(doc(db(), EXPENSES, id ?? newId()), clean(draft)).catch(fail);
}

export function removeExpense(id: string): void {
  deleteDoc(doc(db(), EXPENSES, id)).catch(fail);
}

export function updateSettings(next: Settings): void {
  setDoc(doc(db(), ...SETTINGS_DOC), next).catch(fail);
}

/** Point older shows at a client record without touching anything else. */
export function setShowClient(id: string, clientId: string, name: string): void {
  updateDoc(doc(db(), SHOWS, id), { clientId, client: name }).catch(fail);
}
