import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";

/** Browser-side values by design — a Firebase web config ships in every
 *  client bundle. The data is protected by firestore.rules, not by hiding
 *  these. */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

/** Null when the environment variables are missing, so the desk can say so
 *  instead of throwing on load. */
export function getDb(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (!firestore) {
    app = getApps().length ? getApp() : initializeApp(config);
    firestore = getFirestore(app);
  }
  return firestore;
}

/** Collection names, in one place. */
export const SHOWS = "shows";
export const PAYMENTS = "payments";
export const SETTINGS_DOC = ["settings", "company"] as const;
