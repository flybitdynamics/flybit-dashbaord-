import { InventoryDashboard } from "../components/inventory/InventoryDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Inventory — FlyBit" };

export default function InventoryPage() {
  return <RequireAccess module="inventory">
      <InventoryDashboard />
    </RequireAccess>;
}
