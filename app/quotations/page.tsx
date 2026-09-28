import { QuotationsDashboard } from "../components/quotations/QuotationsDashboard";
import { RequireAccess } from "../components/RequireAccess";

export const metadata = { title: "Quotations — FlyBit" };

/** `?show=<id>` comes from the Quote button on a show, and opens a new
 *  quotation already filled in from that booking. */
export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;

  return (
    <RequireAccess module="quotations">
      <QuotationsDashboard fromShowId={show ?? ""} />
    </RequireAccess>
  );
}
