"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import {
  Session,
  getServerSnapshot,
  getSnapshot,
  signIn,
  signOut,
  subscribe,
} from "../lib/session";
import { LoginForm } from "./LoginForm";

interface AuthContextType {
  user: Session | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Undefined means the browser has not been checked yet.
  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-xs text-neutral-400">
        Loading…
      </div>
    );
  }

  if (session === null) {
    return <LoginForm onLogin={signIn} />;
  }

  return (
    <AuthContext.Provider value={{ user: session, logout: signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
