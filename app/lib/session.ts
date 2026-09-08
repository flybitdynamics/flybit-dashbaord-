/** The signed-in admin session, kept in localStorage.
 *
 *  Read through useSyncExternalStore so the server render sees "signed out"
 *  and the browser fills it in without a setState-in-effect. */
const KEY = "flybit_auth_session";

export type Role = "admin" | "viewer";

export interface Session {
  username: string;
  role: Role;
}

/** The accounts that can sign in. Change a password here and it takes effect
 *  on the next sign-in.
 *
 *  NOTE: this is a gate on the interface only. Firestore's rules are open, so
 *  it does not stop anyone reaching the data directly — see firestore.rules. */
const ACCOUNTS: Record<string, { password: string; role: Role }> = {
  admin: { password: "admin@123", role: "admin" },
  viewer: { password: "viewer@123", role: "viewer" },
};

let cached: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const account = ACCOUNTS[parsed?.username];
    if (!account) return null;
    // Take the role from the account list, never from stored JSON, so
    // editing localStorage cannot promote a viewer to admin.
    return { username: parsed.username, role: account.role };
  } catch {
    return null;
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) {
    cached = read();
    loaded = true;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = read();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Undefined until the browser has looked; null means signed out. */
export function getSnapshot(): Session | null | undefined {
  return loaded ? cached : undefined;
}

export function getServerSnapshot(): Session | null | undefined {
  return undefined;
}

export function signIn(username: string, password: string): boolean {
  const id = username.trim().toLowerCase();
  const account = ACCOUNTS[id];
  if (!account || account.password !== password) return false;
  cached = { username: id, role: account.role };
  loaded = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* session lives in memory for this tab only */
  }
  emit();
  return true;
}

export function signOut(): void {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  emit();
}
