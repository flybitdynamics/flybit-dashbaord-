import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { DEFAULT_SETTINGS, Payment, Settings, Show } from "./types";
import { Expense } from "./finance";
import { EXPENSES, PAYMENTS, SETTINGS_DOC, SHOWS, getDb, isFirebaseConfigured } from "./firebase";
import { newId, sortShows } from "./storage";

export interface DeskState {
  shows: Show[];
  payments: Payment[];
  expenses: Expense[];
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
let settings: Settings = DEFAULT_SETTINGS;
let error: string | null = null;
const seen = { shows: false, payments: false, expenses: false, settings: false };

let state: DeskState | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function publish() {
  const ready =
    (seen.shows && seen.payments && seen.expenses && seen.settings) || error !== null;
  if (!ready) return;
  state = { shows: sortShows(shows), payments, expenses, settings, error };
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

function attach() {
  const db = getDb();
  if (!db) {
    error = isFirebaseConfigured
      ? "Firestore could not start."
      : "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.";
    publish();
    return;
  }

  const stopShows = onSnapshot(
    collection(db, SHOWS),
    (snap) => {
      shows = snap.docs.map((d) => ({ ...(d.data() as Omit<Show, "id">), id: d.id }));
      seen.shows = true;
      error = null;
      publish();
    },
    fail,
  );

  const stopPayments = onSnapshot(
    collection(db, PAYMENTS),
    (snap) => {
      payments = snap.docs.map((d) => ({ ...(d.data() as Omit<Payment, "id">), id: d.id }));
      seen.payments = true;
      publish();
    },
    fail,
  );

  const stopExpenses = onSnapshot(
    collection(db, EXPENSES),
    (snap) => {
      expenses = snap.docs.map((d) => ({ ...(d.data() as Omit<Expense, "id">), id: d.id }));
      seen.expenses = true;
      publish();
    },
    fail,
  );

  const stopSettings = onSnapshot(
    doc(db, ...SETTINGS_DOC),
    (snap) => {
      settings = snap.exists()
        ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) }
        : DEFAULT_SETTINGS;
      seen.settings = true;
      publish();
    },
    fail,
  );

  detach = () => {
    stopShows();
    stopPayments();
    stopExpenses();
    stopSettings();
  };
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

/* ---------------- writes ---------------- */

export function upsertShow(draft: Omit<Show, "id">, id: string | null): void {
  setDoc(doc(db(), SHOWS, id ?? newId()), draft).catch(fail);
}

export function removeShow(id: string): void {
  (async () => {
    const instance = db();
    const owned = await getDocs(query(collection(instance, PAYMENTS), where("showId", "==", id)));
    const batch = writeBatch(instance);
    batch.delete(doc(instance, SHOWS, id));
    owned.forEach((payment) => batch.delete(payment.ref));
    await batch.commit();
  })().catch(fail);
}

export function addPayment(draft: Omit<Payment, "id">): void {
  setDoc(doc(db(), PAYMENTS, newId()), draft).catch(fail);
}

export function removePayment(id: string): void {
  deleteDoc(doc(db(), PAYMENTS, id)).catch(fail);
}

export function upsertExpense(draft: Omit<Expense, "id">, id: string | null): void {
  setDoc(doc(db(), EXPENSES, id ?? newId()), draft).catch(fail);
}

export function removeExpense(id: string): void {
  deleteDoc(doc(db(), EXPENSES, id)).catch(fail);
}

export function updateSettings(next: Settings): void {
  setDoc(doc(db(), ...SETTINGS_DOC), next).catch(fail);
}

/** Delete every show and payment. */
export function clearAll(): void {
  (async () => {
    const instance = db();
    const [allShows, allPayments] = await Promise.all([
      getDocs(collection(instance, SHOWS)),
      getDocs(collection(instance, PAYMENTS)),
    ]);
    const batch = writeBatch(instance);
    allShows.forEach((row) => batch.delete(row.ref));
    allPayments.forEach((row) => batch.delete(row.ref));
    await batch.commit();
  })().catch(fail);
}
