import { TeamDashboard } from "../components/team/TeamDashboard";

export const metadata = { title: "Team — FlyBit" };

export default function TeamPage() {
  return (
    <main className="flex-1">
      <TeamDashboard />
    </main>
  );
}
