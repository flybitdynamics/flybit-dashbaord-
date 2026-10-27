import { ReceiptsDashboard } from "../components/receipts/ReceiptsDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Receipts — FlyBit" };

/** `?invoice=<id>` or `?show=<id>` opens a new receipt pre-filled with data from that invoice or show. */
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; show?: string; view?: string }>;
}) {
  const { invoice, show, view } = await searchParams;

  return (
    <RequireAccess module="receipts">
      <ReceiptsDashboard
        fromInvoiceId={invoice ?? ""}
        fromShowId={show ?? ""}
        initialViewParam={view ?? ""}
      />
    </RequireAccess>
  );
}
