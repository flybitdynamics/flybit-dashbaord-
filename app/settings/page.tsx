import Image from "next/image";
import Link from "next/link";
import { SettingsForm } from "../components/SettingsForm";

export const metadata = { title: "Settings — FlyBit" };

export default function SettingsPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-neutral-200 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-900"
          >
            ←
            <Image
              src="/logo-on-light.png"
              alt="FLYBIT Dynamics"
              width={666}
              height={276}
              className="h-4 w-auto"
            />
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            The fixed details the permission documents are filled from. Changing them here changes
            every document generated afterwards.
          </p>
        </header>

        <SettingsForm />
      </div>
    </main>
  );
}
