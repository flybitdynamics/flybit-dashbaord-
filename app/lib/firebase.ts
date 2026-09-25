import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";

/** Browser-side values by design — a Firebase web config ships in every
 *  client bundle. The data is protected by firestore.rules, not by hiding
 *  these. */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

/** Null when the environment variables are missing, so the desk can say so
 *  instead of throwing on load. */
/** The one app instance shared by Firestore and Authentication. */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getDb(): Firestore | null {
  const instance = getFirebaseApp();
  if (!instance) return null;
  if (!firestore) firestore = getFirestore(instance);
  return firestore;
}

/** Collection names, in one place. */
export const SHOWS = "shows";
export const PAYMENTS = "payments";
export const EXPENSES = "expenses";
export const CLIENTS = "clients";
export const PILOTS = "pilots";
export const PLACES = "places";
export const INVOICES = "invoices";
export const USERS = "users";
export const ROLES = "roles";
export const LOGS = "audit_logs";
/** Public marker written once the first super admin exists. */
export const SETUP_DOC = ["meta", "setup"] as const;
export const SETTINGS_DOC = ["settings", "company"] as const;
