import {
  CLIENT_TYPES,
  CertificateState,
  ClientType,
  PERMISSION_STATUSES,
  PaymentState,
  PermissionStatus,
  SHOW_STATUSES,
  STAGE_HINTS,
  ShowStatus,
  Zone,
  ZONES,
  formatCompactMoney,
} from "../lib/types";

/* The zone signal is the only colour on the page — everything else is
   black, white and gray, so a red row reads at a glance. */
const zoneStyles: Record<Zone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  yellow: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

const zoneDots: Record<Zone, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export function ZoneDot({ zone }: { zone: Zone }) {
  return <span className={`size-2 shrink-0 rounded-full ${zoneDots[zone]}`} />;
}

export function ZoneBar({ zone }: { zone: Zone }) {
  return <span className={`block h-9 w-[3px] rounded-full ${zoneDots[zone]}`} />;
}

export function ZoneBadge({ zone }: { zone: Zone }) {
  return (
    <span
      title={ZONES[zone].hint}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${zoneStyles[zone]}`}
    >
      <ZoneDot zone={zone} />
      {ZONES[zone].label}
    </span>
  );
}

/* The pipeline stays in greys so the zone colours keep their meaning: an
   inquiry is outlined (not real yet), a confirmed show is solid (committed),
   and the further along a show gets, the quieter it reads. */
const showStatusStyles: Record<ShowStatus, string> = {
  inquiry: "bg-white text-neutral-700 ring-neutral-300",
  confirmed: "bg-neutral-900 text-white ring-neutral-900",
  completed: "bg-neutral-200 text-neutral-800 ring-neutral-200",
  closed: "bg-neutral-100 text-neutral-500 ring-neutral-100",
  lost: "bg-neutral-100 text-neutral-400 ring-neutral-100 line-through",
  cancelled: "bg-neutral-100 text-neutral-400 ring-neutral-100 line-through",
};

export function ShowStatusBadge({ status }: { status: ShowStatus }) {
  return (
    <span
      title={STAGE_HINTS[status]}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${showStatusStyles[status]}`}
    >
      {SHOW_STATUSES[status]}
    </span>
  );
}

export function ClientTypeBadge({ type }: { type: ClientType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
        type === "b2b" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {CLIENT_TYPES[type]}
    </span>
  );
}

const certificateStyles: Record<CertificateState, { label: string; className: string }> = {
  valid: { label: "Valid", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  expiring: { label: "Expiring", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  expired: { label: "Expired", className: "bg-red-50 text-red-700 ring-red-200" },
  missing: { label: "Not on file", className: "bg-neutral-100 text-neutral-500 ring-neutral-200" },
};

/** DGCA remote pilot certificate: the only colour on the Pilots page,
 *  because an expired one grounds the pilot. */
export function CertificateBadge({ state }: { state: CertificateState }) {
  const style = certificateStyles[state];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}

const permissionStyles: Record<PermissionStatus, string> = {
  na: "text-neutral-400",
  applied: "text-neutral-700",
  approved: "text-emerald-700",
  rejected: "text-red-600",
};

export function PermissionLabel({ status }: { status: PermissionStatus }) {
  return (
    <span className={`text-xs font-medium ${permissionStyles[status]}`}>
      {PERMISSION_STATUSES[status]}
    </span>
  );
}

export function PaymentMeter({
  amount,
  received,
  state,
}: {
  amount: number;
  received: number;
  state: PaymentState;
}) {
  const pending = Math.max(0, amount - received);
  const pct =
    amount > 0 ? Math.min(100, Math.round((received / amount) * 100)) : received > 0 ? 100 : 0;

  return (
    <div className="flex min-w-36 flex-col gap-1">
      <div className="tnum flex items-baseline justify-between gap-3 font-mono text-xs text-neutral-600">
        <span>{formatCompactMoney(received)}</span>
        <span className="font-semibold text-neutral-900">{formatCompactMoney(amount)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-full ${state === "paid" ? "bg-neutral-900" : "bg-neutral-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-neutral-500">
        {pending > 0
          ? `${formatCompactMoney(pending)} pending`
          : amount > 0
            ? "Settled"
            : "No amount set"}
      </span>
    </div>
  );
}
