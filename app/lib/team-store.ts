import {
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
import { AttendanceRecord, LeaveRequest, LeaveStatus, TeamMember } from "./team";
import { getDb, isFirebaseConfigured } from "./firebase";
import { newId } from "./storage";

const MEMBERS = "team";
const LEAVE = "leaveRequests";
const ATTENDANCE = "attendance";

export interface TeamState {
  members: TeamMember[];
  requests: LeaveRequest[];
  attendance: AttendanceRecord[];
  error: string | null;
}

/* Separate from the shows desk so the Team page only listens to what it
   shows. Same useSyncExternalStore contract. */
let members: TeamMember[] = [];
let requests: LeaveRequest[] = [];
let attendance: AttendanceRecord[] = [];
let error: string | null = null;
const seen = { members: false, requests: false, attendance: false };

let state: TeamState | null = null;
const listeners = new Set<() => void>();
let detach: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function publish() {
  const ready = (seen.members && seen.requests && seen.attendance) || error !== null;
  if (!ready) return;
  state = {
    members: [...members].sort((a, b) => a.name.localeCompare(b.name)),
    // Newest application first, so anything waiting is at the top.
    requests: [...requests].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)),
    attendance,
    error,
  };
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

function attach() {
  const db = getDb();
  if (!db) {
    error = isFirebaseConfigured
      ? "Firestore could not start."
      : "Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.";
    publish();
    return;
  }

  const stopMembers = onSnapshot(
    collection(db, MEMBERS),
    (snap) => {
      members = snap.docs.map((d) => ({ ...(d.data() as Omit<TeamMember, "id">), id: d.id }));
      seen.members = true;
      error = null;
      publish();
    },
    denied("members"),
  );

  const stopLeave = onSnapshot(
    collection(db, LEAVE),
    (snap) => {
      requests = snap.docs.map((d) => ({ ...(d.data() as Omit<LeaveRequest, "id">), id: d.id }));
      seen.requests = true;
      publish();
    },
    denied("requests"),
  );

  const stopAttendance = onSnapshot(
    collection(db, ATTENDANCE),
    (snap) => {
      attendance = snap.docs.map((d) => ({
        ...(d.data() as Omit<AttendanceRecord, "id">),
        id: d.id,
      }));
      seen.attendance = true;
      publish();
    },
    denied("attendance"),
  );

  detach = () => {
    stopMembers();
    stopLeave();
    stopAttendance();
  };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && !detach) attach();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): TeamState | null {
  return state;
}

export function getServerSnapshot(): TeamState | null {
  return null;
}

function db() {
  const instance = getDb();
  if (!instance) throw new Error("Firestore is not configured.");
  return instance;
}

/* ---------------- members ---------------- */

export function upsertMember(draft: Omit<TeamMember, "id">, id: string | null): void {
  setDoc(doc(db(), MEMBERS, id ?? newId()), draft).catch(fail);
}

/** Removing someone takes their leave and attendance history with them. */
export function removeMember(id: string): void {
  (async () => {
    const instance = db();
    const [leave, days] = await Promise.all([
      getDocs(query(collection(instance, LEAVE), where("memberId", "==", id))),
      getDocs(query(collection(instance, ATTENDANCE), where("memberId", "==", id))),
    ]);
    const batch = writeBatch(instance);
    batch.delete(doc(instance, MEMBERS, id));
    leave.forEach((row) => batch.delete(row.ref));
    days.forEach((row) => batch.delete(row.ref));
    await batch.commit();
  })().catch(fail);
}

/* ---------------- leave ---------------- */

export function applyForLeave(draft: Omit<LeaveRequest, "id">): void {
  setDoc(doc(db(), LEAVE, newId()), draft).catch(fail);
}

export function decideLeave(id: string, status: LeaveStatus, note: string, decidedOn: string): void {
  updateDoc(doc(db(), LEAVE, id), { status, decisionNote: note, decidedOn }).catch(fail);
}

export function removeLeave(id: string): void {
  deleteDoc(doc(db(), LEAVE, id)).catch(fail);
}

/* ---------------- attendance ---------------- */

/** One record per member per month, so saving twice updates rather than duplicates. */
export function saveAttendance(draft: Omit<AttendanceRecord, "id">): void {
  const existing = attendance.find(
    (a) => a.memberId === draft.memberId && a.month === draft.month,
  );
  setDoc(doc(db(), ATTENDANCE, existing?.id ?? newId()), draft).catch(fail);
}
