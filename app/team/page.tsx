import { TeamDashboard } from "../components/team/TeamDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Team — FlyBit" };

export default function TeamPage() {
  return (
    <RequireAccess module="team">
      <TeamDashboard />
    </RequireAccess>
  );
}
