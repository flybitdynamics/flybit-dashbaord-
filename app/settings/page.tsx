import { SettingsView } from "../components/settings/SettingsView";
import { SiteHeader } from "../components/SiteHeader";

export const metadata = { title: "Settings — FlyBit" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Settings"
        subtitle="Manage company document defaults, users, roles & permission matrices"
      />
      <SettingsView />
    </div>
  );
}
