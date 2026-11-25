"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedImage {
  id: string;
  name: string;
  src: string;
  w: number;
  h: number;
}

export type PageSize = "a4" | "letter" | "fit";
export interface ImagePageOptions {
  size: PageSize;
  margin: number;
}

let seq = 0;

export async function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = url;
  await img.decode();
  if (/^data:image\/(png|jpe?g)/.test(url)) return { src: url, w: img.naturalWidth, h: img.naturalHeight };
  // Other formats (webp, gif, svg, heic where the browser reads it…) become PNG, which PDFs can hold.
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 400;
  c.height = img.naturalHeight || 400;
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL("image/png"), w: c.width, h: c.height };
}

async function readAll(files: File[]): Promise<{ out: PickedImage[]; failed: string[] }> {
  const images = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|heic)$/i.test(f.name));
  const out: PickedImage[] = [];
  const failed: string[] = [];
  for (const f of images) {
    try {
      const r = await readImage(f);
      out.push({ id: `img${++seq}`, name: f.name, ...r });
    } catch {
      failed.push(f.name);
    }
  }
  return { out, failed };
}

/** Turns an image a quarter turn clockwise. */
async function rotateImage(p: PickedImage): Promise<PickedImage> {
  const img = new Image();
  img.src = p.src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = p.h;
  c.height = p.w;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0, p.w, p.h);
  const png = p.src.startsWith("data:image/png");
  return { ...p, src: png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.92), w: p.h, h: p.w };
}

/** Pick several images, put them in order, and each becomes a page. */
export function ImagePagesDialog({
  appending,
  initial,
  onCancel,
  onMake,
}: {
  appending: boolean;
  initial: File[];
  onCancel: () => void;
  onMake: (images: PickedImage[], options: ImagePageOptions) => void;
}) {
  const [items, setItems] = useState<PickedImage[]>([]);
  const [size, setSize] = useState<PageSize>("a4");
  const [margin, setMargin] = useState(18);
  const [busy, setBusy] = useState(initial.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function finish({ out, failed }: { out: PickedImage[]; failed: string[] }) {
    setItems((prev) => [...prev, ...out]);
    setError(failed.length ? `Couldn't read ${failed.join(", ")}. Try saving it as JPG or PNG.` : null);
    setBusy(false);
  }

  async function add(files: File[]) {
    setBusy(true);
    finish(await readAll(files));
  }

  // The files chosen to open this dialog.
  useEffect(() => {
    if (initial.length) void readAll(initial).then(finish);
    // Only the files it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(from: number, to: number) {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  }

  async function rotate(id: string) {
    const p = items.find((i) => i.id === id);
    if (!p) return;
    const r = await rotateImage(p);
    setItems((prev) => prev.map((i) => (i.id === id ? r : i)));
  }

  function sortByName() {
    setItems((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  }

  const chip = (on: boolean) => `rounded-md px-2.5 py-1 text-xs font-medium ${on ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-neutral-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label="Images to PDF" className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{appending ? "Add images as pages" : "Images to PDF"}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">Each image becomes one page. Drag them into the order you want, or use the arrows.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">✕</button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-600">
          <div className="flex items-center gap-1.5">
            Page size
            <button type="button" className={chip(size === "a4")} onClick={() => setSize("a4")}>A4</button>
            <button type="button" className={chip(size === "letter")} onClick={() => setSize("letter")}>Letter</button>
            <button type="button" className={chip(size === "fit")} onClick={() => setSize("fit")}>Same as image</button>
          </div>
          <div className="flex items-center gap-1.5">
            Margin
            {[["None", 0], ["Small", 18], ["Large", 42]].map(([label, v]) => (
              <button key={label} type="button" className={chip(margin === v)} onClick={() => setMargin(v as number)}>{label}</button>
            ))}
          </div>
          {size !== "fit" && <span className="text-neutral-400">Wide images get a landscape page.</span>}
          <button type="button" className="ml-auto text-xs text-neutral-500 hover:text-neutral-900 hover:underline" onClick={sortByName} disabled={items.length < 2}>Sort by file name</button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-neutral-50 p-5"
          onDragOver={(e) => { if (!dragId) e.preventDefault(); }}
          onDrop={(e) => { if (dragId) return; e.preventDefault(); void add(Array.from(e.dataTransfer.files)); }}
        >
          {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((p, i) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id); } }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const from = items.findIndex((x) => x.id === dragId);
                  move(from, i);
                  setDragId(null);
                  setOverId(null);
                }}
                className={`group flex cursor-grab flex-col gap-1.5 rounded-lg bg-white p-2 shadow-sm ring-2 active:cursor-grabbing ${
                  overId === p.id && dragId !== p.id ? "ring-sky-500" : "ring-transparent"
                } ${dragId === p.id ? "opacity-40" : ""}`}
              >
                <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-neutral-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.name} draggable={false} className="max-h-full max-w-full object-contain" />
                  <span className="absolute left-1.5 top-1.5 rounded bg-neutral-900/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{i + 1}</span>
                </div>
                <div className="truncate text-[11px] text-neutral-500" title={p.name}>{p.name}</div>
                <div className="flex items-center justify-between text-neutral-600">
                  <div className="flex">
                    <button type="button" title="Earlier" disabled={i === 0} onClick={() => move(i, i - 1)} className="size-7 rounded hover:bg-neutral-100 disabled:opacity-30">←</button>
                    <button type="button" title="Later" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} className="size-7 rounded hover:bg-neutral-100 disabled:opacity-30">→</button>
                    <button type="button" title="Rotate" onClick={() => void rotate(p.id)} className="size-7 rounded hover:bg-neutral-100">⟳</button>
                  </div>
                  <button type="button" title="Remove" onClick={() => setItems((prev) => prev.filter((x) => x.id !== p.id))} className="size-7 rounded hover:bg-red-50 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-400 hover:bg-white"
            >
              <span className="text-2xl leading-none">+</span>
              {busy ? "Reading…" : items.length ? "Add more" : "Choose images"}
              <span className="px-3 text-center text-[11px] text-neutral-400">or drop them here</span>
            </button>
          </div>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void add(f); }} />
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <span className="text-xs text-neutral-500">{items.length} image{items.length === 1 ? "" : "s"} → {items.length} page{items.length === 1 ? "" : "s"}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200">Cancel</button>
            <button
              type="button"
              disabled={!items.length || busy}
              onClick={() => onMake(items, { size, margin })}
              className="rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-400"
            >
              {appending ? "Add pages" : "Make PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
