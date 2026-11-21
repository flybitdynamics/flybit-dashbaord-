import { PurchaseOrdersDashboard } from "../components/purchase-orders/PurchaseOrdersDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Purchase Orders — FlyBit" };

export default function PurchaseOrdersPage() {
  return (
    <RequireAccess module="finance">
      <PurchaseOrdersDashboard />
    </RequireAccess>
  );
}
