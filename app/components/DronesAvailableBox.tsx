"use client";

import { useState } from "react";

/** The fleet size beside Export CSV: type a number and it is saved for
 *  everyone. The red count opens the shows that need more drones. */
export function DronesAvailableBox({
  value,
  short,
  canEdit,
  active,
  onSave,
  onShowShort,
}: {
  value: number;
  /** Open shows asking for more drones than the fleet has. */
  short: number;
  canEdit: boolean;
  active: boolean;
  onSave: (count: number) => void;
  onShowShort: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? String(value) : "");

  function commit() {
    if (text === null) return;
    const count = Math.max(0, Math.round(Number(text) || 0));
    setText(null);
    if (count !== value) onSave(count);
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-neutral-100 py-1 pl-3 pr-1 text-sm text-neutral-700">
      <label htmlFor="drones-available" className="whitespace-nowrap">
        Drones available
      </label>
      <input
        id="drones-available"
        type="number"
        inputMode="numeric"
        min={0}
        value={shown}
        placeholder="Set"
        disabled={!canEdit}
        title={canEdit ? "How many drones are ready to fly. Shows that need more are flagged." : "Your role can't change this."}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(null);
            e.currentTarget.blur();
          }
        }}
        className="tnum w-16 rounded bg-white px-2 py-1 text-right font-mono text-sm text-neutral-900 outline-none ring-1 ring-neutral-200 placeholder:text-neutral-400 focus-visible:ring-neutral-900 disabled:bg-transparent disabled:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {value > 0 && short > 0 && (
        <button
          type="button"
          onClick={onShowShort}
          title="Show the shows that need more drones than are available"
          className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${
            active ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
          }`}
        >
          {short} short
        </button>
      )}
    </div>
  );
}
