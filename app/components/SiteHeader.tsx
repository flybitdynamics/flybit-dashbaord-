/** Page header: what this screen is, plus its actions. Navigation and
 *  sign-out live in the sidebar. */
export function SiteHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-100 pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
