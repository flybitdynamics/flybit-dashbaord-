"use client";

import { useMemo, useState } from "react";
import { ImportRow, readSheet } from "../lib/import-shows";
import { importShows } from "../lib/store";
import { SHOW_STATUSES, Show, formatMoney } from "../lib/types";
import { Modal, inputClass } from "./Modal";

/** Bringing the inquiry tracker in.
 *
 *  The sheet is read, not trusted: what each row turns into is shown before
 *  anything is written, and the row's own words are kept in the notes so a
 *  wrong guess can be put right on the show itself. */
export function ImportShowsDialog({
  shows,
  onDone,
  onClose,
}: {
  shows: Show[];
  onDone: (count: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { rows, columns } = useMemo(() => {
    if (!text.trim()) return { rows: [] as ImportRow[], columns: null };
    try {
      return readSheet(text, shows);
    } catch {
      return { rows: [] as ImportRow[], columns: null };
    }
  }, [text, shows]);

  const chosen = rows.filter((row) => !row.skip && !(skipDuplicates && row.duplicate));
  const duplicates = rows.filter((row) => row.duplicate).length;
  const skipped = rows.filter((row) => row.skip).length;
  const found = columns && columns.name >= 0;

  async function run() {
    if (chosen.length === 0) return;
    setBusy(true);
    setProblem(null);
    try {
      await importShows(chosen.map((row) => row.draft));
      onDone(chosen.length);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Firestore refused the import.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Import from a spreadsheet"
      subtitle="Select the rows in Excel, copy, and paste them here."
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          <span className="text-xs text-neutral-500">
            {rows.length === 0
              ? "Nothing pasted yet"
              : `${chosen.length} of ${rows.length} row${rows.length === 1 ? "" : "s"} will come in`}
            {duplicates > 0 && ` · ${duplicates} already on the desk`}
            {skipped > 0 && ` · ${skipped} without a name`}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={chosen.length === 0 || busy}
              onClick={run}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? "Importing…" : `Import ${chosen.length || ""}`.trim()}
            </button>
          </div>
        </>
      }
    >
      <div className="flex max-h-[68vh] flex-col gap-3 overflow-y-auto p-5">
        {problem && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>
        )}

        <textarea
          rows={rows.length ? 3 : 8}
          className={`${inputClass} resize-y font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Paste here — include the header row (name, purpose, city/state, how much drones, result, deal)."}
        />

        {text.trim() && !found && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No header row found. The paste needs a line naming the columns — at least a
            <strong> name</strong> column — so each one can be read.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="size-4 accent-neutral-900"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              Skip rows whose name is already on the desk
            </label>

            <div className="overflow-x-auto rounded-xl ring-1 ring-neutral-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Where</th>
                    <th className="px-3 py-2 text-right">Drones</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const out = row.skip || (skipDuplicates && row.duplicate);
                    return (
                      <tr
                        key={row.line}
                        className={`row-line ${out ? "text-neutral-400" : "text-neutral-800"}`}
                      >
                        <td className="max-w-56 truncate px-3 py-1.5">
                          {row.draft.client || row.draft.contactPhone || "—"}
                        </td>
                        <td className="px-3 py-1.5">{SHOW_STATUSES[row.draft.showStatus]}</td>
                        <td className="max-w-48 truncate px-3 py-1.5">
                          {[row.draft.area, row.draft.location, row.draft.state]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="tnum px-3 py-1.5 text-right font-mono text-xs">
                          {row.draft.droneCount || "—"}
                        </td>
                        <td className="tnum px-3 py-1.5 text-right font-mono text-xs">
                          {row.draft.showAmount ? formatMoney(row.draft.showAmount) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[11px]">
                          {row.skip
                            ? row.skip
                            : row.duplicate
                              ? skipDuplicates
                                ? "already here"
                                : "duplicate"
                              : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-neutral-500">
              Every row keeps its original wording in the show&rsquo;s notes, so anything read
              wrongly here — a price written as &ldquo;4.50 lakhs&rdquo;, a count written as
              &ldquo;400 or 500&rdquo; — can be corrected on the show afterwards. Dates are not
              taken from the sheet: set the show date when the booking firms up.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
