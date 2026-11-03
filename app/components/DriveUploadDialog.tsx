"use client";

import { useEffect, useRef, useState } from "react";
import { setShowDriveFolder } from "../lib/store";
import { Show } from "../lib/types";
import { Modal } from "./Modal";

type Status = "waiting" | "uploading" | "done" | "failed";

interface Queued {
  key: string;
  file: File;
  /** Folders above the file, inside the show's folder: "Photos/Day 1". */
  path: string;
  status: Status;
  progress: number;
  error?: string;
}

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Rushabh Swarnim Touch – 16 Oct 2026" — what the show's Drive folder is called. */
function folderName(show: Show): string {
  const who = show.client || show.location || "Show";
  return show.showDate ? `${who} – ${show.showDate}` : who;
}

/** Everything inside a dropped folder, keeping its folder structure. */
async function filesFromEntry(entry: FileSystemEntry, path: string): Promise<Array<{ file: File; path: string }>> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, path }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries hands them over in batches until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const inside = path ? `${path}/${entry.name}` : entry.name;
  return (await Promise.all(children.map((child) => filesFromEntry(child, inside)))).flat();
}

const post = async <T,>(body: object): Promise<T> => {
  const res = await fetch("/api/drive/show-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error || `Drive answered ${res.status}.`);
  return data;
};

/** Sends one file to the upload URL Drive gave us, reporting progress. */
function send(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Drive answered ${xhr.status}.`)));
    xhr.onerror = () => reject(new Error("The connection dropped."));
    xhr.send(file);
  });
}

/** Upload a show's files and whole folders into its own Google Drive folder:
 *  Show files / <client – date> / …, keeping the folders as they are. */
export function DriveUploadDialog({ show, canEdit, onClose }: { show: Show; canEdit: boolean; onClose: () => void }) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const [folder, setFolder] = useState(show.driveFolder ?? null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/drive/status")
      .then((r) => r.json())
      .then((s: { connected?: boolean }) => setConnected(Boolean(s.connected)))
      .catch(() => setConnected(false));
  }, []);

  /* The folder picker is not a standard attribute, so it is set by hand. */
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  function add(items: Array<{ file: File; path: string }>) {
    setQueue((prev) => {
      const known = new Set(prev.map((q) => q.key));
      const fresh = items
        .filter(({ file }) => !file.name.startsWith(".")) // .DS_Store and the like
        .map(({ file, path }) => ({
          key: `${path}/${file.name}/${file.size}/${file.lastModified}`,
          file,
          path,
          status: "waiting" as Status,
          progress: 0,
        }))
        .filter((q) => !known.has(q.key));
      return [...prev, ...fresh];
    });
  }

  function fromInput(list: FileList | null) {
    if (!list) return;
    add(
      [...list].map((file) => {
        const parts = (file.webkitRelativePath || file.name).split("/");
        return { file, path: parts.slice(0, -1).join("/") };
      }),
    );
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const entries = [...e.dataTransfer.items]
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));
    if (entries.length) add((await Promise.all(entries.map((entry) => filesFromEntry(entry, "")))).flat());
    else fromInput(e.dataTransfer.files);
  }

  const patch = (key: string, change: Partial<Queued>) =>
    setQueue((prev) => prev.map((q) => (q.key === key ? { ...q, ...change } : q)));

  async function upload() {
    const todo = queue.filter((q) => q.status !== "done");
    if (!todo.length || running) return;
    setRunning(true);
    setProblem(null);
    try {
      const target = await post<{ id: string; url: string }>({
        action: "folder",
        name: folderName(show),
        folderId: folder?.id,
      });
      setFolder(target);

      let uploaded = 0;
      /* One at a time, so two files never race to make the same sub-folder. */
      for (const item of todo) {
        patch(item.key, { status: "uploading", progress: 0, error: undefined });
        try {
          const { uploadUrl } = await post<{ uploadUrl: string }>({
            action: "start",
            folderId: target.id,
            path: item.path,
            name: item.file.name,
            mimeType: item.file.type,
            size: item.file.size,
          });
          await send(uploadUrl, item.file, (progress) => patch(item.key, { progress }));
          patch(item.key, { status: "done", progress: 1 });
          uploaded += 1;
        } catch (err) {
          patch(item.key, { status: "failed", error: err instanceof Error ? err.message : "Upload failed." });
        }
      }
      if (uploaded && canEdit) setShowDriveFolder(show.id, target, uploaded);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Google Drive did not respond.");
    } finally {
      setRunning(false);
    }
  }

  const done = queue.filter((q) => q.status === "done").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  const waiting = queue.filter((q) => q.status !== "done").length;
  const totalSize = queue.reduce((sum, q) => sum + q.file.size, 0);

  return (
    <Modal
      title="Upload to Google Drive"
      subtitle={`Into Show files / ${folderName(show)} — folders keep their structure.`}
      onClose={() => {
        if (running && !window.confirm("Uploads are still running. Close anyway? The rest will stop.")) return;
        onClose();
      }}
      width="max-w-3xl"
      footer={
        <>
          <span className="text-xs text-neutral-500">
            {queue.length === 0
              ? "Nothing chosen yet"
              : `${queue.length} file${queue.length === 1 ? "" : "s"} · ${sizeLabel(totalSize)}${done ? ` · ${done} uploaded` : ""}${failed ? ` · ${failed} failed` : ""}`}
          </span>
          <div className="ml-auto flex gap-2">
            {folder?.url && (
              <a
                href={folder.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
              >
                Open in Drive
              </a>
            )}
            <button
              type="button"
              onClick={() => void upload()}
              disabled={!waiting || running || connected === false}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {running ? "Uploading…" : failed && waiting === failed ? `Retry ${failed}` : `Upload ${waiting || ""}`.trim()}
            </button>
          </div>
        </>
      }
    >
      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto p-5">
        {connected === false && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Google Drive is not connected.{" "}
            <a href="/api/drive/auth" className="font-medium underline">
              Connect Google Drive
            </a>{" "}
            and then come back to this show.
          </p>
        )}
        {problem && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => void onDrop(e)}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center ${
            dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
          }`}
        >
          <p className="text-sm text-neutral-600">Drag files or whole folders here, or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => filesInput.current?.click()}
              disabled={running}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Choose files
            </button>
            <button
              type="button"
              onClick={() => folderInput.current?.click()}
              disabled={running}
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
            >
              Choose a folder
            </button>
          </div>
          <input
            ref={filesInput}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              fromInput(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              fromInput(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {queue.length > 0 && (
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
            {queue.map((q) => (
              <li key={q.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-neutral-900">
                    {q.path && <span className="text-neutral-400">{q.path}/</span>}
                    {q.file.name}
                  </div>
                  {q.status === "uploading" && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full bg-neutral-900 transition-[width]" style={{ width: `${Math.round(q.progress * 100)}%` }} />
                    </div>
                  )}
                  {q.error && <div className="text-xs text-red-600">{q.error}</div>}
                </div>
                <span className="tnum shrink-0 font-mono text-xs text-neutral-500">{sizeLabel(q.file.size)}</span>
                <span
                  className={`w-20 shrink-0 text-right text-xs ${
                    q.status === "done" ? "text-emerald-700" : q.status === "failed" ? "text-red-600" : "text-neutral-500"
                  }`}
                >
                  {q.status === "uploading" ? `${Math.round(q.progress * 100)}%` : q.status === "done" ? "Uploaded" : q.status === "failed" ? "Failed" : "Waiting"}
                </span>
                {q.status === "waiting" && !running && (
                  <button
                    type="button"
                    onClick={() => setQueue((prev) => prev.filter((x) => x.key !== q.key))}
                    aria-label={`Remove ${q.file.name}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
