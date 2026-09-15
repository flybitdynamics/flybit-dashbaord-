import { ClientsDashboard } from "../components/clients/ClientsDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Clients — FlyBit" };

export default function ClientsPage() {
  return <RequireAccess module="clients">
      <ClientsDashboard />
    </RequireAccess>;
}
