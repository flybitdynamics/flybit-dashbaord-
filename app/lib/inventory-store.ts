import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./firebase";
import { InventoryItem, normalizeInventoryItem, unitCounts } from "./inventory";
import { newId } from "./storage";
import { recordActivity } from "./store";

const ITEMS = "inventory";

export interface InventoryState {
  items: InventoryItem[];
  error: string | null;
}

/* Separate from the shows desk so only the Inventory page listens to it.
   Same useSyncExternalStore contract. */
let items: InventoryItem[] = [];
let error: string | null = null;
let seen = false;

let state: InventoryState | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function publish() {
  if (!seen && error === null) return;
  state = { items: [...items].sort((a, b) => a.name.localeCompare(b.name)), error };
  emit();
}

function fail(reason: unknown) {
  const code = (reason as { code?: string })?.code ?? "";
  error =
    code === "permission-denied"
      ? "Firestore refused the request. Check the security rules for the inventory collection."
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

  detach = onSnapshot(
    collection(db, ITEMS),
    (snap) => {
      items = snap.docs.map((d) => normalizeInventoryItem(d.id, d.data() as Partial<InventoryItem>));
      seen = true;
      error = null;
      publish();
    },
    fail,
  );
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && !detach) attach();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): InventoryState | null {
  return state;
}

export function getServerSnapshot(): InventoryState | null {
  return null;
}

function db() {
  const instance = getDb();
  if (!instance) throw new Error("Firestore is not configured.");
  return instance;
}

export function upsertInventoryItem(draft: Omit<InventoryItem, "id" | "updatedAt">, id: string | null): void {
  const itemId = id ?? newId();
  const previous = id ? items.find((i) => i.id === id) : null;
  setDoc(doc(db(), ITEMS, itemId), { ...draft, updatedAt: new Date().toISOString() }).catch(fail);
  if (previous) {
    const qty = previous.quantity !== draft.quantity ? ` (quantity ${previous.quantity} → ${draft.quantity})` : "";
    const was = unitCounts(previous.units).active;
    const now = unitCounts(draft.units).active;
    const active = draft.units.length && was !== now ? ` (active units ${was} → ${now})` : "";
    recordActivity("edit", "inventory", itemId, draft.name, `Updated item "${draft.name}"${qty}${active}`);
  } else {
    recordActivity("create", "inventory", itemId, draft.name, `Added item "${draft.name}", quantity ${draft.quantity}`);
  }
}

export function removeInventoryItem(id: string): void {
  const target = items.find((i) => i.id === id);
  deleteDoc(doc(db(), ITEMS, id)).catch(fail);
  recordActivity("delete", "inventory", id, target?.name || "Item", `Removed item "${target?.name || id}"`);
}
