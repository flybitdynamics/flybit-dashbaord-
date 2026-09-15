"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "../lib/store";
import { SiteHeader } from "../components/SiteHeader";
import { ActivityLogsPanel } from "../components/logs/ActivityLogsPanel";

export default function LogsPage() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = state !== null;
  const logs = useMemo(() => state?.logs ?? [], [state]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <SiteHeader
        title="Activity & Audit Logs"
        subtitle="Complete history of user actions across shows, payments, clients, pilots, and system settings"
      />

      {!ready ? (
        <div className="card flex h-24 items-center justify-center text-sm text-neutral-500">
          Loading audit logs from Firebase…
        </div>
      ) : (
        <ActivityLogsPanel logs={logs} />
      )}
    </div>
  );
}
