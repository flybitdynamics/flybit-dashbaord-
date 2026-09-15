"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, signOut, subscribe } from "../lib/auth";
import {
  Action,
  MODULES,
  MODULE_KEYS,
  Module,
  Role,
  UserProfile,
  allows,
} from "../lib/permissions";
import { SignInScreen } from "./auth/SignInScreen";

interface AuthContextType {
  profile: UserProfile | null;
  role: Role | null;
  isSuperAdmin: boolean;
  /** The one question every screen asks before showing a control. */
  can: (module: Module, action: Action) => boolean;
  /** False when this person's role cannot change anything anywhere. */
  canEdit: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  role: null,
  isSuperAdmin: false,
  can: () => false,
  canEdit: false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

/** Signs people in with Firebase Authentication and hands every screen their
 *  role. The Firestore rules enforce the same permissions on the server, so
 *  hiding a button here is a convenience, not the protection. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<AuthContextType>(() => {
    const can = (module: Module, action: Action) => allows(state.profile, state.role, module, action);
    const canEdit = MODULE_KEYS.some((module) =>
      (MODULES[module].actions as readonly Action[]).some((a) => a !== "view" && can(module, a)),
    );
    return {
      profile: state.profile,
      role: state.role,
      isSuperAdmin: state.profile?.superAdmin === true && state.profile.status === "active",
      can,
      canEdit,
      logout: () => {
        void signOut();
      },
    };
  }, [state.profile, state.role]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-xs text-neutral-400">
        Loading…
      </div>
    );
  }

  if (state.status !== "ready") return <SignInScreen state={state} />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
