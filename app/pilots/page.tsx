import { PilotsDashboard } from "../components/pilots/PilotsDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Pilots — FlyBit" };

export default function PilotsPage() {
  return <RequireAccess module="pilots">
      <PilotsDashboard />
    </RequireAccess>;
}
