import { InvoicesDashboard } from "../components/invoices/InvoicesDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Invoices — FlyBit" };

/** `?show=<id>` comes from the Invoice button on a show, and opens a new
 *  invoice already filled in from that booking. */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;

  return (
    <RequireAccess module="invoices">
      <InvoicesDashboard fromShowId={show ?? ""} />
    </RequireAccess>
  );
}
