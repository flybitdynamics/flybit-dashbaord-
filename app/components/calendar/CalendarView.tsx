"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  addPayment,
  getServerSnapshot,
  getSnapshot,
  removePayment,
  setShowStatus,
  subscribe,
} from "../../lib/store";
import { Show } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { DocumentsDialog } from "../DocumentsDialog";
import { PaymentsDialog } from "../PaymentsDialog";
import { ShowDetailDialog } from "../ShowDetailDialog";
import { ShowCalendar } from "./ShowCalendar";

type Dialog =
  | { kind: "none" }
  | { kind: "detail"; show: Show }
  | { kind: "payments"; show: Show }
  | { kind: "documents"; show: Show };

export function CalendarView() {
  const { can } = useAuth();
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const expenses = useMemo(() => state?.expenses ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const pilots = useMemo(() => state?.pilots ?? [], [state]);
  const settings = state?.settings;
  const live = (show: Show) => state?.shows.find((s) => s.id === show.id) ?? show;

  return (
    <>
      <ShowCalendar onOpenShow={(show) => setDialog({ kind: "detail", show })} />

      {dialog.kind === "detail" && (
        <ShowDetailDialog
          key={dialog.show.id}
          show={live(dialog.show)}
          clients={clients}
          pilots={pilots}
          payments={payments}
          expenses={expenses}
          canEdit={can("shows", "edit")}
          canDocuments={can("documents", "view")}
          canInvoice={can("invoices", "create")}
          onStage={(status) => setShowStatus(dialog.show.id, status)}
          onPayments={() => setDialog({ kind: "payments", show: dialog.show })}
          onDocuments={() => setDialog({ kind: "documents", show: dialog.show })}
          onClose={() => setDialog({ kind: "none" })}
        />
      )}

      {dialog.kind === "payments" && (
        <PaymentsDialog
          key={dialog.show.id}
          show={dialog.show}
          payments={payments}
          canEdit={can("finance", "create")}
          canRemove={can("finance", "delete")}
          onAdd={addPayment}
          onRemove={removePayment}
          onClose={() => setDialog({ kind: "detail", show: dialog.show })}
        />
      )}

      {dialog.kind === "documents" && settings && (
        <DocumentsDialog
          key={dialog.show.id}
          show={live(dialog.show)}
          settings={settings}
          pilots={pilots}
          onClose={() => setDialog({ kind: "detail", show: dialog.show })}
        />
      )}
    </>
  );
}
