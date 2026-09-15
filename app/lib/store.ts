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
import { getAuth } from "firebase/auth";
import {
  AuditLog,
  Client,
  DEFAULT_SETTINGS,
  LogAction,
  Payment,
  Pilot,
  Place,
  SHOW_STATUSES,
  Settings,
  Show,
  ShowStatus,
  formatMoney,
  normalizeShow,
  placeId,
} from "./types";
import { Expense } from "./finance";
import {
  CLIENTS,
  EXPENSES,
  LOGS,
  PAYMENTS,
  PILOTS,
  PLACES,
  SETTINGS_DOC,
  SHOWS,
  getDb,
  getFirebaseApp,
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
  logs: AuditLog[];
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
let logs: AuditLog[] = [];
let error: string | null = null;
const seen = {
  shows: false,
  payments: false,
  expenses: false,
  clients: false,
  pilots: false,
  places: false,
  settings: false,
  logs: false,
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
  const sortedLogs = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  state = { shows: sortShows(shows), payments, expenses, clients, pilots, places, settings, logs: sortedLogs, error };
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
    onSnapshot(
      collection(db, LOGS),
      (snap) => {
        logs = snap.docs.map((d) => ({ ...(d.data() as Omit<AuditLog, "id">), id: d.id }));
        seen.logs = true;
        publish();
      },
      denied("logs"),
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

export function recordActivity(
  action: LogAction,
  entityType: AuditLog["entityType"],
  entityId: string,
  entityTitle: string,
  details: string,
): void {
  try {
    const appInstance = getFirebaseApp();
    const authInstance = appInstance ? getAuth(appInstance) : null;
    const user = authInstance?.currentUser;
    const logId = newId();
    const entry: AuditLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      actorUid: user?.uid ?? "system",
      actorName: user?.displayName || (user?.email ? user.email.split("@")[0] : "System User"),
      actorEmail: user?.email || "",
      action,
      entityType,
      entityId,
      entityTitle,
      details,
    };
    setDoc(doc(db(), LOGS, logId), clean(entry)).catch(fail);
  } catch (err) {
    console.error("Failed to record activity log", err);
  }
}

/* ---------------- shows ---------------- */

/** Saving a show also remembers its place, so the next booking can pick it. */
export function upsertShow(draft: Omit<Show, "id">, id: string | null): string {
  const showId = id ?? newId();
  const oldShow = id ? shows.find((s) => s.id === id) : null;
  const body = clean({ ...draft } as Omit<Show, "id"> & { id?: string });
  delete body.id;
  setDoc(doc(db(), SHOWS, showId), body).catch(fail);
  rememberPlace(draft.state, draft.location, draft.area);

  const title = draft.client || draft.location || "Show";

  if (oldShow) {
    const changes: string[] = [];
    if (oldShow.showStatus !== draft.showStatus) {
      changes.push(`Stage: ${SHOW_STATUSES[oldShow.showStatus]} → ${SHOW_STATUSES[draft.showStatus]}`);
    }
    if (oldShow.showAmount !== draft.showAmount) {
      changes.push(`Show amount: ${formatMoney(oldShow.showAmount)} → ${formatMoney(draft.showAmount)}`);
    }
    if (oldShow.droneCount !== draft.droneCount) {
      changes.push(`Drone count: ${oldShow.droneCount || 0} → ${draft.droneCount}`);
    }
    if (oldShow.showDate !== draft.showDate) {
      changes.push(`Show date: ${oldShow.showDate || "—"} → ${draft.showDate}`);
    }
    if (oldShow.location !== draft.location) {
      changes.push(`City: "${oldShow.location || "—"}" → "${draft.location}"`);
    }
    if (oldShow.client !== draft.client) {
      changes.push(`Client: "${oldShow.client || "—"}" → "${draft.client}"`);
    }
    if (oldShow.commission !== draft.commission) {
      changes.push(`Commission: ${formatMoney(oldShow.commission)} → ${formatMoney(draft.commission)}`);
    }

    const detailText = changes.length > 0
      ? `Updated show "${title}": ${changes.join("; ")}`
      : `Updated show "${title}" details`;

    recordActivity("edit", "show", showId, title, detailText);
  } else {
    recordActivity(
      "create",
      "show",
      showId,
      title,
      `Created new show "${title}" (${SHOW_STATUSES[draft.showStatus]})${draft.showAmount > 0 ? ` with amount ${formatMoney(draft.showAmount)}` : ""}`
    );
  }
  return showId;
}

/** Move a show along the pipeline without rewriting the rest of it. */
export function setShowStatus(id: string, status: ShowStatus): void {
  const target = shows.find((s) => s.id === id);
  const title = target?.client || target?.location || "Show";
  const oldStatusLabel = target ? SHOW_STATUSES[target.showStatus] : "";
  const newStatusLabel = SHOW_STATUSES[status];
  updateDoc(doc(db(), SHOWS, id), { showStatus: status }).catch(fail);

  const detailText = oldStatusLabel
    ? `Changed stage of show "${title}" from ${oldStatusLabel} to ${newStatusLabel}`
    : `Changed stage of show "${title}" to ${newStatusLabel}`;

  recordActivity("stage_change", "show", id, title, detailText);
}

export function removeShow(id: string): void {
  const target = shows.find((s) => s.id === id);
  const title = target?.client || target?.location || "Show";
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
    recordActivity("delete", "show", id, title, `Deleted show "${title}"`);
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
  const oldClient = id ? clients.find((c) => c.id === id) : null;
  setDoc(doc(db(), CLIENTS, clientId), clean(draft)).catch(fail);
  if (draft.city.trim()) rememberPlace(draft.state, draft.city, "");

  if (oldClient) {
    const changes: string[] = [];
    if (oldClient.name !== draft.name) changes.push(`Name: "${oldClient.name}" → "${draft.name}"`);
    if (oldClient.type !== draft.type) changes.push(`Type: ${oldClient.type} → ${draft.type}`);
    recordActivity(
      "edit",
      "client",
      clientId,
      draft.name,
      `Updated client "${draft.name}": ${changes.join("; ") || "details updated"}`
    );
  } else {
    recordActivity(
      "create",
      "client",
      clientId,
      draft.name,
      `Created client "${draft.name}" (${draft.type === "b2b" ? "B2B" : "Direct"})`
    );
  }
  return clientId;
}

/** Shows keep the client's name, so they still read correctly afterwards. */
export function removeClient(id: string): void {
  const target = clients.find((c) => c.id === id);
  deleteDoc(doc(db(), CLIENTS, id)).catch(fail);
  recordActivity("delete", "client", id, target?.name || "Client", `Deleted client "${target?.name || id}"`);
}

/* ---------------- pilots ---------------- */

export function upsertPilot(draft: Omit<Pilot, "id">, id: string | null): string {
  const pilotId = id ?? newId();
  setDoc(doc(db(), PILOTS, pilotId), clean(draft)).catch(fail);
  recordActivity(
    id ? "edit" : "create",
    "pilot",
    pilotId,
    draft.name,
    `${id ? "Updated" : "Added"} pilot "${draft.name}"`
  );
  return pilotId;
}

/** Take the pilot off every show they were assigned to, then remove them. */
export function removePilot(id: string): void {
  const target = pilots.find((p) => p.id === id);
  (async () => {
    const instance = db();
    const assigned = await getDocs(
      query(collection(instance, SHOWS), where("pilotIds", "array-contains", id)),
    );
    const batch = writeBatch(instance);
    assigned.forEach((show) => batch.update(show.ref, { pilotIds: arrayRemove(id) }));
    batch.delete(doc(instance, PILOTS, id));
    await batch.commit();
    recordActivity("delete", "pilot", id, target?.name || "Pilot", `Removed pilot "${target?.name || id}"`);
  })().catch(fail);
}

/* ---------------- payments, expenses, settings ---------------- */

export function addPayment(draft: Omit<Payment, "id">): void {
  const payId = newId();
  setDoc(doc(db(), PAYMENTS, payId), draft).catch(fail);
  const target = shows.find((s) => s.id === draft.showId);
  const title = target?.client || target?.location || "Show";
  recordActivity(
    "payment",
    "payment",
    payId,
    title,
    `Logged payment of ${formatMoney(draft.amount)} (${draft.mode}) for "${title}"`
  );
}

export function removePayment(id: string): void {
  const targetPayment = payments.find((p) => p.id === id);
  const targetShow = targetPayment ? shows.find((s) => s.id === targetPayment.showId) : null;
  const title = targetShow?.client || targetShow?.location || "Show";
  deleteDoc(doc(db(), PAYMENTS, id)).catch(fail);
  recordActivity(
    "delete",
    "payment",
    id,
    title,
    `Removed payment of ${targetPayment ? formatMoney(targetPayment.amount) : "amount"} from "${title}"`
  );
}

export function upsertExpense(draft: Omit<Expense, "id">, id: string | null): void {
  const expId = id ?? newId();
  setDoc(doc(db(), EXPENSES, expId), clean(draft)).catch(fail);
  recordActivity(
    id ? "edit" : "expense",
    "expense",
    expId,
    draft.description || "Expense",
    `${id ? "Updated" : "Logged"} expense of ${formatMoney(draft.amount)} (${draft.category})`
  );
}

export function removeExpense(id: string): void {
  const target = expenses.find((e) => e.id === id);
  deleteDoc(doc(db(), EXPENSES, id)).catch(fail);
  recordActivity(
    "delete",
    "expense",
    id,
    target?.description || "Expense",
    `Removed expense of ${target ? formatMoney(target.amount) : "amount"}`
  );
}

export function updateSettings(next: Settings): void {
  setDoc(doc(db(), ...SETTINGS_DOC), next).catch(fail);
  recordActivity("edit", "settings", "company", "Settings", "Updated company document settings");
}

/** Point older shows at a client record without touching anything else. */
export function setShowClient(id: string, clientId: string, name: string): void {
  updateDoc(doc(db(), SHOWS, id), { clientId, client: name }).catch(fail);
}
