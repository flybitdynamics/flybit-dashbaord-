"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  addPayment,
  getServerSnapshot,
  getSnapshot,
  removeExpense,
  removePayment,
  setShowStatus,
  subscribe,
  upsertExpense,
} from "../../lib/store";
import {
  getServerSnapshot as teamServerSnapshot,
  getSnapshot as teamSnapshot,
  subscribe as teamSubscribe,
} from "../../lib/team-store";
import { Show } from "../../lib/types";
import { useAuth } from "../AuthProvider";
import { DocumentsDialog } from "../DocumentsDialog";
import { ExpenseDialog } from "../finance/ExpenseDialog";
import { PaymentsDialog } from "../PaymentsDialog";
import { ShowDetailDialog } from "../ShowDetailDialog";
import { ShowCalendar } from "./ShowCalendar";

type Dialog =
  | { kind: "none" }
  | { kind: "detail"; show: Show }
  | { kind: "payments"; show: Show }
  | { kind: "expense"; show: Show }
  | { kind: "documents"; show: Show };

export function CalendarView() {
  const { can } = useAuth();
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const team = useSyncExternalStore(teamSubscribe, teamSnapshot, teamServerSnapshot);
  const payments = useMemo(() => state?.payments ?? [], [state]);
  const shows = useMemo(() => state?.shows ?? [], [state]);
  const clients = useMemo(() => state?.clients ?? [], [state]);
  const members = useMemo(() => team?.members ?? [], [team]);
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
          canEdit={can("shows", "edit")}
          canDocuments={can("documents", "view")}
          canInvoice={can("invoices", "create")}
          canQuote={can("quotations", "create")}
          canExpense={can("finance", "create")}
          onStage={(status) => setShowStatus(dialog.show.id, status)}
          onPayments={() => setDialog({ kind: "payments", show: dialog.show })}
          onExpense={() => setDialog({ kind: "expense", show: dialog.show })}
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

      {dialog.kind === "expense" && (
        <ExpenseDialog
          key={dialog.show.id}
          expense={null}
          shows={shows}
          team={members}
          showId={dialog.show.id}
          canDelete={false}
          onSave={(draft, id) => {
            upsertExpense(draft, id);
            setDialog({ kind: "detail", show: dialog.show });
          }}
          onDelete={(expense) => removeExpense(expense.id)}
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
