import { Dashboard } from "./components/Dashboard";
import { RequireAccess } from "./components/RequireAccess";

export default function Page() {
  return (
    <RequireAccess module="shows">
      <Dashboard />
    </RequireAccess>
  );
}
