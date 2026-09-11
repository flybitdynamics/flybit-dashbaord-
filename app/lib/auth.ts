import { deleteApp, initializeApp } from "firebase/app";
import {
  Auth,
  EmailAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { DEFAULT_ROLES, Role, UserProfile } from "./permissions";
import { ROLES, SETUP_DOC, USERS, firebaseConfig, getDb, getFirebaseApp } from "./firebase";

/* Passwords live in Firebase Authentication and never touch Firestore. The
   `users` collection holds only who someone is and which role they have;
   the security rules read it to decide what each signed-in person may do. */

export type AuthStatus =
  | "loading"
  | "signed-out"
  | "no-profile"
  | "disabled"
  | "ready";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  /** True until the first super admin has been created. */
  setupNeeded: boolean;
  /** True once the setup marker has been read, so the login screen knows
   *  whether to offer first-time setup. */
  setupKnown: boolean;
}

let auth: Auth | null = null;

function authInstance(): Auth {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase is not configured. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.");
  if (!auth) auth = getAuth(app);
  return auth;
}

let state: AuthState = {
  status: "loading",
  user: null,
  profile: null,
  role: null,
  setupNeeded: false,
  setupKnown: false,
};
const listeners = new Set<() => void>();
let started = false;
let stopProfile: (() => void) | null = null;
let stopRole: (() => void) | null = null;

function emit(next: Partial<AuthState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function watchRole(roleId: string) {
  stopRole?.();
  stopRole = null;
  const db = getDb();
  if (!db || !roleId) {
    emit({ role: null });
    return;
  }
  stopRole = onSnapshot(
    doc(db, ROLES, roleId),
    (snap) => emit({ role: snap.exists() ? ({ ...(snap.data() as Omit<Role, "id">), id: snap.id }) : null }),
    () => emit({ role: null }),
  );
}

function watchProfile(user: User) {
  stopProfile?.();
  const db = getDb();
  if (!db) return;
  stopProfile = onSnapshot(
    doc(db, USERS, user.uid),
    (snap) => {
      if (!snap.exists()) {
        stopRole?.();
        emit({ status: "no-profile", profile: null, role: null });
        return;
      }
      const profile = { ...(snap.data() as Omit<UserProfile, "uid">), uid: snap.id };
      if (profile.status !== "active") {
        emit({ status: "disabled", profile, role: null });
        return;
      }
      // Roles change live: edit one and everyone holding it sees it at once.
      if (!profile.superAdmin) watchRole(profile.roleId);
      else {
        stopRole?.();
        emit({ role: null });
      }
      emit({ status: "ready", profile });
    },
    () => emit({ status: "no-profile", profile: null, role: null }),
  );
}

function start() {
  if (started) return;
  started = true;
  const db = getDb();
  if (!db) {
    emit({ status: "signed-out", setupKnown: true });
    return;
  }

  // Readable while signed out, so the login screen can offer setup.
  onSnapshot(
    doc(db, ...SETUP_DOC),
    (snap) => emit({ setupNeeded: !snap.exists(), setupKnown: true }),
    () => emit({ setupKnown: true }),
  );

  onAuthStateChanged(authInstance(), (user) => {
    if (!user) {
      stopProfile?.();
      stopRole?.();
      emit({ status: "signed-out", user: null, profile: null, role: null });
      return;
    }
    emit({ user, status: "loading" });
    watchProfile(user);
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): AuthState {
  return state;
}

const SERVER_STATE: AuthState = {
  status: "loading",
  user: null,
  profile: null,
  role: null,
  setupNeeded: false,
  setupKnown: false,
};

export function getServerSnapshot(): AuthState {
  return SERVER_STATE;
}

/* ---------------- messages people can act on ---------------- */

export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/configuration-not-found":
      return "Firebase Authentication is not switched on for this project yet. In the Firebase console open Authentication, click Get started, and enable Email/Password.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is turned off. In the Firebase console open Authentication → Sign-in method and enable Email/Password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password do not match.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, or reset the password.";
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/weak-password":
      return "Choose a longer password — at least 8 characters.";
    case "auth/invalid-email":
      return "That email address does not look right.";
    case "auth/requires-recent-login":
      return "For safety, sign out and back in, then try again.";
    case "auth/network-request-failed":
      return "Cannot reach Firebase. Check the connection and try again.";
    case "permission-denied":
      return "Firestore refused. Publish the rules in firestore.rules from the Firebase console.";
    default:
      return error instanceof Error ? error.message : "Something went wrong.";
  }
}

/* ---------------- signing in and out ---------------- */

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(authInstance(), email.trim(), password);
}

/** Reload after signing out so nothing the last person could see stays in
 *  memory for the next one. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(authInstance());
  if (typeof window !== "undefined") window.location.assign("/");
}

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(authInstance(), email.trim());
}

export async function changeOwnPassword(current: string, next: string): Promise<void> {
  const user = authInstance().currentUser;
  if (!user?.email) throw new Error("Not signed in.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

/* ---------------- first-time setup ---------------- */

export interface NewPerson {
  name: string;
  email: string;
  employeeId: string;
  phone: string;
}

/** Creates the first account, makes it super admin, and writes the starting
 *  roles — all in one batch, which the security rules allow exactly once. */
export async function setUpSuperAdmin(person: NewPerson, password: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firebase is not configured.");
  const cred = await createUserWithEmailAndPassword(authInstance(), person.email.trim(), password);

  const batch = writeBatch(db);
  const profile: Omit<UserProfile, "uid"> = {
    name: person.name.trim(),
    email: person.email.trim(),
    employeeId: person.employeeId.trim(),
    phone: person.phone.trim(),
    roleId: "admin",
    superAdmin: true,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  batch.set(doc(db, USERS, cred.user.uid), profile);
  for (const role of DEFAULT_ROLES) {
    batch.set(doc(db, ROLES, role.id), {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
  }
  batch.set(doc(db, ...SETUP_DOC), {
    done: true,
    superAdminUid: cred.user.uid,
    at: new Date().toISOString(),
  });

  try {
    await batch.commit();
  } catch (error) {
    // Do not leave a login behind that has no profile to go with it.
    await cred.user.delete().catch(() => {});
    throw error;
  }
}

/* ---------------- super admin: people ---------------- */

/** Creating an account signs that account in, which would sign the super
 *  admin out. So it is created on a short-lived second Firebase app, and the
 *  profile is written by the super admin's own session. */
export async function createUserAccount(
  person: NewPerson & { roleId: string; superAdmin: boolean },
  password: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firebase is not configured.");
  const secondary = initializeApp(firebaseConfig, `people-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, person.email.trim(), password);
    try {
      await setDoc(doc(db, USERS, cred.user.uid), {
        name: person.name.trim(),
        email: person.email.trim(),
        employeeId: person.employeeId.trim(),
        phone: person.phone.trim(),
        roleId: person.roleId,
        superAdmin: person.superAdmin,
        status: "active",
        createdAt: new Date().toISOString(),
      } satisfies Omit<UserProfile, "uid">);
    } catch (error) {
      await cred.user.delete().catch(() => {});
      throw error;
    }
    await firebaseSignOut(secondaryAuth);
  } finally {
    await deleteApp(secondary);
  }
}

export async function updateUserProfile(
  uid: string,
  changes: Partial<Omit<UserProfile, "uid" | "email" | "createdAt">>,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firebase is not configured.");
  await updateDoc(doc(db, USERS, uid), changes);
}

/* ---------------- super admin: roles ---------------- */

export async function saveRole(role: Role): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firebase is not configured.");
  const { id, ...body } = role;
  await setDoc(doc(db, ROLES, id), body);
}

export async function deleteRole(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Firebase is not configured.");
  await deleteDoc(doc(db, ROLES, id));
}

/** Live lists for the super admin's settings screen. */
export function watchPeople(
  onPeople: (people: UserProfile[]) => void,
  onRoles: (roles: Role[]) => void,
  onError: (message: string) => void,
): () => void {
  const db = getDb();
  if (!db) return () => {};
  const stopPeople = onSnapshot(
    collection(db, USERS),
    (snap) =>
      onPeople(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<UserProfile, "uid">), uid: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (e) => onError(describeAuthError(e)),
  );
  const stopRoles = onSnapshot(
    collection(db, ROLES),
    (snap) =>
      onRoles(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<Role, "id">), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (e) => onError(describeAuthError(e)),
  );
  return () => {
    stopPeople();
    stopRoles();
  };
}
