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

import { Action, Module, Role, UserProfile } from "../lib/permissions";

interface AuthContextType {
  user: Session | null;
  /** False for the viewer account: it may read everything, change nothing. */
  canEdit: boolean;
  logout: () => void;
  can: (module: Module, action: Action) => boolean;
  role: Role | null;
  isSuperAdmin: boolean;
  profile: UserProfile | null;
}

const defaultRole: Role = {
  id: "admin",
  name: "Super Admin",
  description: "Full access to all desk capabilities",
  permissions: {},
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  canEdit: false,
  logout: () => {},
  can: () => true,
  role: defaultRole,
  isSuperAdmin: true,
  profile: null,
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

  const isAdmin = session.role === "admin";

  const userProfile: UserProfile = {
    uid: session.username || "admin",
    name: session.username || "Admin",
    email: `${session.username || "admin"}@flybit.com`,
    employeeId: "EMP-01",
    phone: "",
    roleId: session.role || "admin",
    superAdmin: isAdmin,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  const userRole: Role = {
    id: session.role || "admin",
    name: isAdmin ? "Super Admin" : "Viewer",
    description: isAdmin ? "Full access" : "View-only access",
    permissions: {},
  };

  const can = (_module: Module, action: Action): boolean => {
    if (isAdmin) return true;
    return action === "view";
  };

  return (
    <AuthContext.Provider
      value={{
        user: session,
        canEdit: isAdmin,
        logout: signOut,
        can,
        role: userRole,
        isSuperAdmin: isAdmin,
        profile: userProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
