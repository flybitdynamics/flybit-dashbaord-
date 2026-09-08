import { SettingsForm } from "../components/SettingsForm";
import { SiteHeader } from "../components/SiteHeader";

export const metadata = { title: "Settings — FlyBit" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Settings"
        subtitle="The fixed details the permission documents are filled from. Changing them here changes every document generated afterwards."
      />
      <SettingsForm />
    </div>
  );
}
