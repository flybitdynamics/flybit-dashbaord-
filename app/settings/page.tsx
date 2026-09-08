import { SettingsForm } from "../components/SettingsForm";
import { SettingsHeader } from "../components/SettingsHeader";

export const metadata = { title: "Settings — FlyBit" };

export default function SettingsPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <SettingsHeader />

        <SettingsForm />
      </div>
    </main>
  );
}
