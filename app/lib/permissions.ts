/** Who may do what.
 *
 *  A role is a named matrix of module × action. Users get one role; the
 *  super admin sits above every role and is the only one who can manage
 *  users and roles at all. */

export type Action = "view" | "create" | "edit" | "delete";

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Add",
  edit: "Edit",
  delete: "Delete",
};

/** Every area of the desk, and the actions that mean something in it. */
export const MODULES = {
  shows: { label: "Shows", hint: "Bookings and their stages", actions: ["view", "create", "edit", "delete"] },
  calendar: { label: "Calendar", hint: "Shows by date", actions: ["view"] },
  clients: { label: "Clients", hint: "Direct and B2B clients", actions: ["view", "create", "edit", "delete"] },
  pilots: { label: "Pilots", hint: "Remote pilots and DGCA certificates", actions: ["view", "create", "edit", "delete"] },
  documents: { label: "Permission documents", hint: "Generate MoCA letters and annexures", actions: ["view"] },
  invoices: { label: "Invoices", hint: "Tax invoices raised against shows", actions: ["view", "create", "edit", "delete"] },
  finance: { label: "Finance & payments", hint: "Payments, expenses, salary run", actions: ["view", "create", "edit", "delete"] },
  team: { label: "Team", hint: "Staff, attendance and leave", actions: ["view", "create", "edit", "delete"] },
  settings: { label: "Company settings", hint: "Values the documents are filled from", actions: ["view", "edit"] },
} as const satisfies Record<string, { label: string; hint: string; actions: readonly Action[] }>;

export type Module = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as Module[];

export type PermissionMatrix = Partial<Record<Module, Partial<Record<Action, boolean>>>>;

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: PermissionMatrix;
}

export type UserStatus = "active" | "disabled";

/** A person who can sign in. Keyed by their Firebase Auth uid; the password
 *  lives in Firebase Authentication, never in this document. */
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  employeeId: string;
  phone: string;
  roleId: string;
  superAdmin: boolean;
  status: UserStatus;
  createdAt: string;
}

function matrix(spec: Partial<Record<Module, readonly Action[]>>): PermissionMatrix {
  const out: PermissionMatrix = {};
  for (const key of MODULE_KEYS) {
    const allowed = spec[key] ?? [];
    out[key] = Object.fromEntries(
      (MODULES[key].actions as readonly Action[]).map((a) => [a, allowed.includes(a)]),
    );
  }
  return out;
}

const ALL = ["view", "create", "edit", "delete"] as const;

/** Starting roles, written the first time the super admin sets up. They are
 *  ordinary roles after that — rename, change or delete them freely. */
export const DEFAULT_ROLES: Role[] = [
  {
    id: "admin",
    name: "Admin",
    description: "Runs the desk day to day — everything except users and roles.",
    permissions: matrix({
      shows: ALL, calendar: ["view"], clients: ALL, pilots: ALL, documents: ["view"],
      invoices: ALL, finance: ALL, team: ALL, settings: ["view", "edit"],
    }),
  },
  {
    id: "operations",
    name: "Operations",
    description: "Takes inquiries, books shows, crews them and files the paperwork. No money.",
    permissions: matrix({
      shows: ["view", "create", "edit"], calendar: ["view"], clients: ["view", "create", "edit"],
      pilots: ["view", "create", "edit"], documents: ["view"], invoices: ["view"],
      team: ["view"], settings: ["view"],
    }),
  },
  {
    id: "accounts",
    name: "Accounts",
    description: "Payments, expenses and payroll. Can read shows, cannot change them.",
    permissions: matrix({
      shows: ["view"], calendar: ["view"], clients: ["view"], invoices: ALL, finance: ALL,
      team: ["view", "edit"], settings: ["view"],
    }),
  },
  {
    id: "pilot",
    name: "Pilot",
    description: "Sees the schedule and the crew list. Changes nothing.",
    permissions: matrix({ shows: ["view"], calendar: ["view"], pilots: ["view"] }),
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Can look at everything, change nothing.",
    permissions: matrix({
      shows: ["view"], calendar: ["view"], clients: ["view"], pilots: ["view"],
      documents: ["view"], invoices: ["view"], finance: ["view"], team: ["view"], settings: ["view"],
    }),
  },
];

export function emptyMatrix(): PermissionMatrix {
  return matrix({});
}

/** The single question every screen asks. */
export function allows(
  profile: Pick<UserProfile, "superAdmin" | "status"> | null,
  role: Pick<Role, "permissions"> | null,
  module: Module,
  action: Action,
): boolean {
  if (!profile || profile.status !== "active") return false;
  if (profile.superAdmin) return true;
  return role?.permissions?.[module]?.[action] === true;
}
