/** The signed-in admin session, kept in localStorage.
 *
 *  Read through useSyncExternalStore so the server render sees "signed out"
 *  and the browser fills it in without a setState-in-effect. */
const KEY = "flybit_auth_session";

export interface Session {
  username: string;
}

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
    return parsed?.username === "admin" ? (parsed as Session) : null;
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
  if (username.trim().toLowerCase() !== "admin" || password !== "admin@123") return false;
  cached = { username: "admin" };
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
