"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, saveShowLayout, subscribe } from "../lib/store";
import { SHOW_STATUSES, formatDate, type ShowLayout } from "../lib/types";
import { useAuth } from "../components/AuthProvider";

type LayoutFields = Omit<ShowLayout, "imageUrl" | "savedAt">;

const stamp = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

/** The show the planner was opened for, from "Plan layout" on a show. */
function linkedShowId(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("show") ?? "";
}

/** The bar over the map that ties the planner to a show: it names the show
 *  being planned, puts that show's saved layout back when Maps opens from it,
 *  and saves the layout on the map (snapshot and numbers) onto the show, so
 *  the show's report PDF can print it. */
export function ShowLink({
  capture,
  onRestore,
  onGoTo,
}: {
  /** The layout as it stands on the map, with a snapshot of it. */
  capture: () => Promise<{ imageDataUrl: string; layout: LayoutFields }>;
  /** Put a saved layout back on the map. */
  onRestore: (layout: ShowLayout) => void;
  /** Move the map to "lat, lng" — for a show with no layout yet. */
  onGoTo: (coordinates: string) => void;
}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { can } = useAuth();
  const [showId, setShowId] = useState(linkedShowId);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const opened = useRef(false);

  /* Shows still in play first — they are the ones being planned. */
  const shows = useMemo(() => {
    const all = state?.shows ?? [];
    const open = all.filter((s) => s.showStatus === "inquiry" || s.showStatus === "confirmed");
    return [...open, ...all.filter((s) => !open.includes(s))];
  }, [state]);
  const show = shows.find((s) => s.id === showId);

  /* Opened from a show: once its data is in, start from its saved layout, or
     from its takeoff point if nothing is saved yet. Only for that first show —
     picking another one below must not wipe what is on the map. */
  useEffect(() => {
    if (opened.current || !show || show.id !== linkedShowId()) return;
    opened.current = true;
    // Not cancelled on re-render: the planner hands over new callbacks every
    // render, and this has to happen exactly once.
    setTimeout(() => {
      if (show.layout) onRestore(show.layout);
      else if (show.coordinates.trim()) onGoTo(show.coordinates.trim());
    }, 300); // let the map finish mounting first
  }, [show, onRestore, onGoTo]);

  async function save() {
    if (!show || saving) return;
    if (show.layout && !window.confirm(`Replace the layout already saved on ${show.client || "this show"}?`)) return;
    setSaving(true);
    setNote(null);
    try {
      const { imageDataUrl, layout } = await capture();
      const blob = await (await fetch(imageDataUrl)).blob();
      const form = new FormData();
      form.append("file", new File([blob], `layout-${show.id}.png`, { type: "image/png" }));
      form.append("folder", "CRM/show-layouts");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "The map image could not be saved.");
      saveShowLayout(show.id, { ...layout, imageUrl: data.url, savedAt: new Date().toISOString() });
      setNote({ ok: true, text: "Saved — it will print in the show's report PDF." });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Could not save to the show." });
    } finally {
      setSaving(false);
    }
  }

  const canSave = can("shows", "edit");

  return (
    <div
      style={{
        position: "absolute",
        top: 76,
        left: 20,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        maxWidth: "calc(100% - 40px)",
        padding: "8px 10px",
        background: "rgba(255, 255, 255, 0.97)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
        boxShadow: "var(--shadow-md)",
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--text-main)" }}>Show</span>
      <select
        aria-label="Show this layout is for"
        value={showId}
        onChange={(e) => {
          setShowId(e.target.value);
          setNote(null);
        }}
        style={{
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid var(--border-subtle)",
          fontSize: 13,
          maxWidth: 300,
          background: "#fff",
        }}
      >
        <option value="">Not linked to a show</option>
        {shows.map((s) => (
          <option key={s.id} value={s.id}>
            {[s.client || "No client", s.location, s.showDate ? formatDate(s.showDate) : "", SHOW_STATUSES[s.showStatus]]
              .filter(Boolean)
              .join(" · ")}
          </option>
        ))}
      </select>
      {canSave && (
        <button
          type="button"
          className="btn-primary"
          onClick={() => void save()}
          disabled={!show || saving}
          style={{ padding: "7px 14px", width: "auto", fontSize: 13 }}
          title={show ? "Save this layout and a snapshot of the map onto the show" : "Choose a show first"}
        >
          {saving ? "Saving…" : "Save layout to show"}
        </button>
      )}
      {note ? (
        <span style={{ fontSize: 12, color: note.ok ? "#059669" : "#e11d48" }}>{note.text}</span>
      ) : show?.layout ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Saved: {show.layout.rows} × {show.layout.cols}, {show.layout.drones} drones · {stamp.format(new Date(show.layout.savedAt))}
        </span>
      ) : show ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No layout saved on this show yet</span>
      ) : null}
    </div>
  );
}
