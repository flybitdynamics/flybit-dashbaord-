export type UnitStatus = "active" | "inactive" | "repair";

export const UNIT_STATUSES: Record<UnitStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  repair: "Under repair",
};

/** One physical piece of an item, such as a single drone with its own UIN. */
export interface InventoryUnit {
  /** The DGCA Unique Identification Number, or a serial number for other kit. */
  uin: string;
  status: UnitStatus;
  notes: string;
}

/** Equipment the company owns: drones, batteries, chargers, cases, tools. */
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  /** "pcs", "sets", "m" — what one unit of the quantity is. */
  unit: string;
  /** Price of one unit, in rupees. */
  unitPrice: number;
  /** Warn when the quantity falls to this or below; 0 means never. */
  reorderAt: number;
  /** Where it is kept: office, warehouse, a show site. */
  location: string;
  notes: string;
  /** Each piece listed by UIN. When there are any, the quantity is their count. */
  units: InventoryUnit[];
  updatedAt: string;
}

/** Offered in the category box; anything else typed there is kept as is. */
export const INVENTORY_CATEGORIES = [
  "Drones",
  "Batteries",
  "Chargers",
  "Controllers & GPS",
  "Networking",
  "Cases & transport",
  "Power & generators",
  "Tools & spares",
  "Safety",
  "Other",
];

export function emptyInventoryItem(): Omit<InventoryItem, "id"> {
  return {
    name: "",
    category: "",
    quantity: 0,
    unit: "pcs",
    unitPrice: 0,
    reorderAt: 0,
    location: "",
    notes: "",
    units: [],
    updatedAt: "",
  };
}

export function emptyUnit(): InventoryUnit {
  return { uin: "", status: "active", notes: "" };
}

/** How many units are in each status. */
export function unitCounts(units: InventoryUnit[]): Record<UnitStatus, number> {
  const counts: Record<UnitStatus, number> = { active: 0, inactive: 0, repair: 0 };
  for (const unit of units) counts[unit.status] += 1;
  return counts;
}

/** Quantity × unit price. */
export function itemValue(item: Pick<InventoryItem, "quantity" | "unitPrice">): number {
  return (item.quantity || 0) * (item.unitPrice || 0);
}

export function isLowStock(item: Pick<InventoryItem, "quantity" | "reorderAt">): boolean {
  return item.reorderAt > 0 && item.quantity <= item.reorderAt;
}

/** Older or hand-made documents may miss fields. */
export function normalizeInventoryItem(id: string, data: Partial<InventoryItem>): InventoryItem {
  const base = emptyInventoryItem();
  return {
    ...base,
    ...data,
    id,
    quantity: Number(data.quantity) || 0,
    unitPrice: Number(data.unitPrice) || 0,
    reorderAt: Number(data.reorderAt) || 0,
    units: Array.isArray(data.units)
      ? data.units.map((u) => ({
          uin: String(u?.uin ?? ""),
          status: u?.status && u.status in UNIT_STATUSES ? u.status : "active",
          notes: String(u?.notes ?? ""),
        }))
      : [],
  };
}
