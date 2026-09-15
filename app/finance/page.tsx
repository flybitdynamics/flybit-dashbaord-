import { FinanceDashboard } from "../components/finance/FinanceDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Finance — FlyBit" };

export default function FinancePage() {
  return <RequireAccess module="finance">
      <FinanceDashboard />
    </RequireAccess>;
}
