import { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { newId } from "./storage";
import { UserProfile } from "./permissions";

/* Every browser someone signs in on gets a session document. The browser
   keeps an eye on its own document: when it is marked ended — by the person
   from another device, or by the super admin — it signs itself out. Firebase
   Authentication cannot end another device's sign-in from the browser, so
   this is how the desk does it. */

export const SESSIONS = "sessions";

/** Counted as online when seen within this long. */
export const ONLINE_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 4 * 60 * 1000;
const KICKED_KEY = "flybit_signed_out_by";

export interface DeviceSession {
  id: string;
  uid: string;
  name: string;
  email: string;
  /** "Mac", "Windows PC", "iPhone", "Android phone"… */
  device: string;
  /** "Chrome 131" */
  browser: string;
  signedInAt: string;
  lastSeen: string;
  /** Set when someone ends this session; the device then signs out. */
  revoked?: boolean;
  revokedBy?: string;
}

/** A plain description of the browser and device from its user agent. */
export function describeDevice(ua: string): { device: string; browser: string } {
  const device = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android phone"
          : "Android tablet"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows PC"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux PC"
                : "Unknown device";
  const pick = (re: RegExp, label: string) => {
    const m = ua.match(re);
    return m ? `${label} ${m[1].split(".")[0]}` : null;
  };
  const browser =
    pick(/Edg\/([\d.]+)/, "Edge") ??
    pick(/OPR\/([\d.]+)/, "Opera") ??
    pick(/SamsungBrowser\/([\d.]+)/, "Samsung Internet") ??
    pick(/Firefox\/([\d.]+)/, "Firefox") ??
    pick(/CriOS\/([\d.]+)/, "Chrome") ??
    pick(/Chrome\/([\d.]+)/, "Chrome") ??
    pick(/Version\/([\d.]+).*Safari/, "Safari") ??
    "Browser";
  return { device, browser };
}

const keyFor = (uid: string) => `flybit_session_${uid}`;

function storedId(uid: string): string | null {
  try {
    return localStorage.getItem(keyFor(uid));
  } catch {
    return null;
  }
}

function storeId(uid: string, id: string | null) {
  try {
    if (id) localStorage.setItem(keyFor(uid), id);
    else localStorage.removeItem(keyFor(uid));
  } catch {
    /* private window: the session lasts this tab only */
  }
}

/** This browser's session id for the signed-in person, if any. */
export function currentSessionId(uid: string): string | null {
  return active?.uid === uid ? active.id : storedId(uid);
}

let active: { uid: string; id: string; stop: () => void } | null = null;
/** Set while a session is being registered, so a second profile update
 *  arriving meanwhile does not register the browser twice. */
let starting: string | null = null;

/** Called once someone is signed in and allowed in: registers this browser
 *  (or picks its session up again), keeps it fresh, and signs out the moment
 *  the session is ended elsewhere. */
export async function startSession(
  user: User,
  profile: Pick<UserProfile, "name" | "email">,
  onEnded: (by: string) => void,
): Promise<void> {
  if (active?.uid === user.uid || starting === user.uid) return;
  starting = user.uid;
  try {
    await register(user, profile, onEnded);
  } finally {
    starting = null;
  }
}

async function register(
  user: User,
  profile: Pick<UserProfile, "name" | "email">,
  onEnded: (by: string) => void,
): Promise<void> {
  active?.stop();
  active = null;
  const db = getDb();
  if (!db || typeof window === "undefined") return;

  const now = new Date().toISOString();
  let id = storedId(user.uid);
  try {
    const existing = id ? await getDoc(doc(db, SESSIONS, id)) : null;
    if (id && existing?.exists() && !existing.data().revoked) {
      await updateDoc(doc(db, SESSIONS, id), { lastSeen: now });
    } else {
      id = newId();
      const session: Omit<DeviceSession, "id"> = {
        uid: user.uid,
        name: profile.name || user.email || "",
        email: profile.email || user.email || "",
        ...describeDevice(navigator.userAgent),
        signedInAt: now,
        lastSeen: now,
      };
      await setDoc(doc(db, SESSIONS, id), session);
      storeId(user.uid, id);
    }
  } catch (err) {
    // Rules not published for sessions yet: the desk works, just untracked.
    console.warn("Could not record this device's session:", err);
    return;
  }

  const sessionId = id!;
  const ref = doc(db, SESSIONS, sessionId);
  const beat = () => void updateDoc(ref, { lastSeen: new Date().toISOString() }).catch(() => {});
  const timer = window.setInterval(beat, HEARTBEAT_MS);
  const onVisible = () => document.visibilityState === "visible" && beat();
  document.addEventListener("visibilitychange", onVisible);

  let ended = false;
  const stopWatch = onSnapshot(
    ref,
    (snap) => {
      if (ended) return;
      if (!snap.exists() || snap.data().revoked) {
        ended = true;
        const by = (snap.exists() && (snap.data().revokedBy as string)) || "another device";
        storeId(user.uid, null);
        void deleteDoc(ref).catch(() => {});
        try {
          sessionStorage.setItem(KICKED_KEY, by);
        } catch {
          /* message is a nicety */
        }
        onEnded(by);
      }
    },
    () => {},
  );

  active = {
    uid: user.uid,
    id: sessionId,
    stop: () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      stopWatch();
    },
  };
}

/** Signing out by hand: this device's session goes away with it. */
export async function endOwnSession(): Promise<void> {
  if (!active) return;
  const { uid, id, stop } = active;
  stop();
  active = null;
  storeId(uid, null);
  const db = getDb();
  if (db) await deleteDoc(doc(db, SESSIONS, id)).catch(() => {});
}

/** Stop watching without ending (the account was signed out some other way). */
export function dropSession(): void {
  active?.stop();
  active = null;
}

/** Ends another session; that device signs out within moments. */
export async function revokeSession(id: string, by: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await updateDoc(doc(db, SESSIONS, id), { revoked: true, revokedBy: by });
}

/** Who ended this browser's last session, for the sign-in screen. */
export function signedOutBy(): string | null {
  try {
    return sessionStorage.getItem(KICKED_KEY);
  } catch {
    return null;
  }
}

/** Shown once: forget it after the sign-in screen has shown it. */
export function clearSignedOutBy(): void {
  try {
    sessionStorage.removeItem(KICKED_KEY);
  } catch {
    /* nothing kept */
  }
}

/** Live sessions: one person's (uid), or everyone's for the super admin. */
export function watchSessions(
  uid: string | null,
  onSessions: (sessions: DeviceSession[]) => void,
  onError: (message: string) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  const source = uid ? query(collection(db, SESSIONS), where("uid", "==", uid)) : collection(db, SESSIONS);
  return onSnapshot(
    source,
    (snap) =>
      onSessions(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<DeviceSession, "id">), id: d.id }))
          .filter((s) => !s.revoked)
          .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
      ),
    (err) =>
      onError(
        (err as { code?: string }).code === "permission-denied"
          ? "Firestore refused to list devices. Publish the updated security rules (sessions)."
          : err.message,
      ),
  );
}
