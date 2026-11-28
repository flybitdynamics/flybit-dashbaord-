import { WorkOrdersDashboard } from "../components/work-orders/WorkOrdersDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Work Orders — FlyBit" };

export default function WorkOrdersPage() {
  return (
    <RequireAccess module="finance">
      <WorkOrdersDashboard />
    </RequireAccess>
  );
}
