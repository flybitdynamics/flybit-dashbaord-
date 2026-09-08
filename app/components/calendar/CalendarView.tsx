"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { addPayment, getServerSnapshot, getSnapshot, removePayment, subscribe } from "../../lib/store";
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
  const { canEdit } = useAuth();
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const expenses = useMemo(() => state?.expenses ?? [], [state]);
  const settings = state?.settings;

  return (
    <>
      <ShowCalendar onOpenShow={(show) => setDialog({ kind: "detail", show })} />

      {dialog.kind === "detail" && (
        <ShowDetailDialog
          key={dialog.show.id}
          show={dialog.show}
          payments={payments}
          expenses={expenses}
          canEdit={false}
          onEdit={() => {}}
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
          canEdit={canEdit}
          onAdd={addPayment}
          onRemove={removePayment}
          onClose={() => setDialog({ kind: "detail", show: dialog.show })}
        />
      )}

      {dialog.kind === "documents" && settings && (
        <DocumentsDialog
          key={dialog.show.id}
          show={dialog.show}
          settings={settings}
          onClose={() => setDialog({ kind: "detail", show: dialog.show })}
        />
      )}
    </>
  );
}
