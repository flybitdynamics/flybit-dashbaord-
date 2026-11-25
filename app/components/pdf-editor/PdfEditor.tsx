"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  DocState,
  EditObj,
  FAMILY_LABEL,
  Family,
  ImageObj,
  OrigText,
  PageRef,
  PenObj,
  ShapeObj,
  Source,
  TextObj,
  Tool,
  blankPage,
  moved,
  overrideId,
  overrideOf,
  uid,
} from "../../lib/pdf-editor/model";
import { openPdf } from "../../lib/pdf-editor/pdfjs";
import { DownMode, PdfPage, pageRotation } from "./PdfPage";

/* ---------- history ---------- */

type Hist = { past: DocState[]; present: DocState; future: DocState[]; key?: string; at?: number };
type Act =
  | { t: "live"; fn: (d: DocState) => DocState }
  | { t: "commit"; fn: (d: DocState) => DocState; base?: DocState; key?: string; at?: number }
  | { t: "mark"; base: DocState }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "reset"; doc: DocState };

const EMPTY: DocState = { pages: [], objects: [] };
const LIMIT = 150;

function history(h: Hist, a: Act): Hist {
  switch (a.t) {
    case "live":
      return { ...h, present: a.fn(h.present) };
    case "commit": {
      const present = a.fn(h.present);
      if (present === h.present) return h;
      // Quick repeats of the same change (dragging a colour picker) are one step.
      if (a.key && a.key === h.key && a.at && h.at && a.at - h.at < 800) return { ...h, present, at: a.at };
      return { past: [...h.past, a.base ?? h.present].slice(-LIMIT), present, future: [], key: a.key, at: a.at };
    }
    case "mark":
      if (a.base === h.present) return h;
      return { past: [...h.past, a.base].slice(-LIMIT), present: h.present, future: [] };
    case "undo": {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    }
    case "redo": {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    }
    case "reset":
      return { past: [], present: a.doc, future: [] };
  }
}

const replaceObj = (d: DocState, o: EditObj): DocState => ({ ...d, objects: d.objects.map((x) => (x.id === o.id ? o : x)) });
const addObj = (d: DocState, o: EditObj): DocState => ({ ...d, objects: [...d.objects, o] });
const dropObj = (d: DocState, id: string): DocState => ({ ...d, objects: d.objects.filter((x) => x.id !== id) });

/* ---------- pointer maths ---------- */

type Pt = { x: number; y: number };

/** Screen point → page points, undoing the page's rotation. */
function toPage(clientX: number, clientY: number, el: HTMLElement, page: PageRef, zoom: number): Pt {
  const r = el.getBoundingClientRect();
  const dx = clientX - (r.left + r.width / 2);
  const dy = clientY - (r.top + r.height / 2);
  const a = (-pageRotation(page) * Math.PI) / 180;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return { x: lx / zoom + page.w / 2, y: ly / zoom + page.h / 2 };
}

type Session =
  | { kind: "move" | "resize"; pageId: string; start: Pt; base: DocState; o0: EditObj; moved: boolean }
  | { kind: "create"; pageId: string; start: Pt; base: DocState; o0: ShapeObj }
  | { kind: "pen"; pageId: string; base: DocState; id: string };

type LoadedSource = Source & { pdf: PDFDocumentProxy };

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

async function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
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
  // Other formats (webp, gif, svg…) become PNG, which PDFs can hold.
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 400;
  c.height = img.naturalHeight || 400;
  c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL("image/png"), w: c.width, h: c.height };
}

const TOOLS: Array<{ id: Tool; label: string; hint: string; icon: React.ReactNode }> = [
  { id: "select", label: "Select", hint: "Select, move and edit (V). Double-click text to change it.", icon: <path d="M4 3l11 6.5-5 1.2-2.2 4.8z" /> },
  { id: "text", label: "Text", hint: "Add text: click where it goes (T)", icon: <path d="M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5" /> },
  { id: "whiteout", label: "Whiteout", hint: "Hide anything on the page under a white box (W)", icon: <><rect x="3" y="5" width="14" height="10" rx="1" /><path d="M6 12.5l3-3 2 2 3-3" opacity=".35" /></> },
  { id: "highlight", label: "Highlight", hint: "Highlight (H)", icon: <><path d="M4 16h12" /><path d="M6 13l6.5-8.5 3 2.3L9 15H6z" /></> },
  { id: "rect", label: "Box", hint: "Rectangle (R)", icon: <rect x="3.5" y="5" width="13" height="10" rx="1" /> },
  { id: "ellipse", label: "Circle", hint: "Ellipse (E)", icon: <ellipse cx="10" cy="10" rx="7" ry="5.5" /> },
  { id: "pen", label: "Draw", hint: "Draw freehand, e.g. sign (P)", icon: <path d="M3 15c2.5-4 4-6 5.5-5S8 14.5 10 14s3-6 4.5-6 1.5 3 2.5 3" /> },
];

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent";
const svgProps = { viewBox: "0 0 20 20", className: "size-[17px]", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function PdfEditor() {
  const [hist, dispatch] = useReducer(history, { past: [], present: EMPTY, future: [] });
  const doc = hist.present;
  const [sources, setSources] = useState<LoadedSource[]>([]);
  const [origs, setOrigs] = useState<Record<string, OrigText[]>>({});
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [textStyle, setTextStyle] = useState({ family: "helvetica" as Family, size: 12, color: "#000000", bold: false, italic: false });
  const [shapeStyle, setShapeStyle] = useState({ stroke: "#dc2626", fill: null as string | null, strokeWidth: 1.5 });
  const [penStyle, setPenStyle] = useState({ color: "#1d3a8a", width: 2 });
  const [highlightColor, setHighlightColor] = useState("#fde047");

  const pageEls = useRef(new Map<string, HTMLDivElement>());
  const session = useRef<Session | null>(null);
  const lastClick = useRef<{ id: string; at: number } | null>(null);
  const editBase = useRef<{ base: DocState; isNew: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const loaded = doc.pages.length > 0;
  const dirty = hist.past.length > 0;
  const selected = doc.objects.find((o) => o.id === selectedId) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------- files ---------- */

  async function pagesOf(pdf: PDFDocumentProxy, docIndex: number): Promise<PageRef[]> {
    const out: PageRef[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const p = await pdf.getPage(i + 1);
      const [x0, y0, x1, y1] = p.view;
      out.push({ id: uid("p"), src: { doc: docIndex, index: i }, w: x1 - x0, h: y1 - y0, view: [x0, y0, x1, y1], baseRot: p.rotate || 0, rot: 0 });
    }
    return out;
  }

  function fitZoom(pages: PageRef[]) {
    const width = (scroller.current?.clientWidth ?? 900) - 64;
    const widest = Math.max(...pages.map((p) => (pageRotation(p) % 180 ? p.h : p.w)), 1);
    return Math.max(0.4, Math.min(1.6, Math.floor((width / widest) * 20) / 20));
  }

  async function openFile(file: File) {
    if (dirty && !window.confirm("Open another PDF? The changes to this one that you haven't downloaded will be lost.")) return;
    setError(null);
    setBusy("Opening PDF…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await openPdf(bytes);
      const pages = await pagesOf(pdf, 0);
      sources.forEach((s) => s.pdf.destroy());
      setSources([{ name: file.name, bytes, pdf }]);
      setOrigs({});
      setFileName(file.name.replace(/\.pdf$/i, ""));
      setSelectedId(null);
      setEditingId(null);
      setTool("select");
      setActivePage(pages[0]?.id ?? null);
      setZoom(fitZoom(pages));
      dispatch({ t: "reset", doc: { pages, objects: [] } });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      setError(/password/i.test(msg) ? "This PDF is password-protected. Remove the password first, then open it here." : `Couldn't open that PDF: ${msg}`);
    } finally {
      setBusy(null);
    }
  }

  async function addPdf(file: File) {
    setError(null);
    setBusy("Adding pages…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await openPdf(bytes);
      const index = sources.length;
      const pages = await pagesOf(pdf, index);
      setSources((prev) => [...prev, { name: file.name, bytes, pdf }]);
      dispatch({ t: "commit", fn: (d) => ({ ...d, pages: [...d.pages, ...pages] }) });
    } catch (e) {
      setError(`Couldn't add that PDF: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(null);
    }
  }

  function startBlank() {
    const p = blankPage();
    setSources([]);
    setOrigs({});
    setFileName("New document");
    setActivePage(p.id);
    setZoom(fitZoom([p]));
    dispatch({ t: "reset", doc: { pages: [p], objects: [] } });
  }

  function closeDoc() {
    if (dirty && !window.confirm("Close this PDF? Changes you haven't downloaded will be lost.")) return;
    sources.forEach((s) => s.pdf.destroy());
    setSources([]);
    setOrigs({});
    setFileName("");
    setSelectedId(null);
    setEditingId(null);
    dispatch({ t: "reset", doc: EMPTY });
  }

  async function insertImage(file: File) {
    const pageId = activePage ?? doc.pages[0]?.id;
    const page = doc.pages.find((p) => p.id === pageId);
    if (!page) return;
    try {
      const img = await readImage(file);
      const w = Math.min(220, page.w * 0.4, img.w);
      const h = (w * img.h) / img.w;
      const o: ImageObj = { id: uid(), pageId: page.id, kind: "image", src: img.src, x: (page.w - w) / 2, y: (page.h - h) / 2, w, h, opacity: 1 };
      dispatch({ t: "commit", fn: (d) => addObj(d, o) });
      setTool("select");
      setSelectedId(o.id);
      pageEls.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      setError("Couldn't read that image.");
    }
  }

  async function download() {
    setBusy("Building PDF…");
    setError(null);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      const { exportPdf } = await import("../../lib/pdf-editor/export");
      const bytes = await exportPdf(sources, doc);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName || "document"}${sources.length ? " (edited)" : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(`Couldn't build the PDF: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- pointer ---------- */

  const finishPointer = useCallback(() => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    if (s.kind === "move" || s.kind === "resize") {
      if (s.moved) dispatch({ t: "mark", base: s.base });
      return;
    }
    if (s.kind === "create") {
      dispatch({
        t: "live",
        fn: (d) => {
          const o = d.objects.find((x) => x.id === s.o0.id) as ShapeObj | undefined;
          if (!o || o.w > 3 || o.h > 3) return d;
          const size = { rect: [140, 60], ellipse: [90, 90], highlight: [140, 16], whiteout: [140, 22] }[o.kind];
          return replaceObj(d, { ...o, x: o.x - size[0] / 2, y: o.y - size[1] / 2, w: size[0], h: size[1] });
        },
      });
      dispatch({ t: "mark", base: s.base });
      setSelectedId(s.o0.id);
      setTool("select");
      return;
    }
    dispatch({ t: "mark", base: s.base });
  }, []);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      const el = pageEls.current.get(s.pageId);
      const page = s.base.pages.find((p) => p.id === s.pageId);
      if (!el || !page) return;
      const pt = toPage(e.clientX, e.clientY, el, page, zoom);
      if (s.kind === "pen") {
        dispatch({
          t: "live",
          fn: (d) => {
            const o = d.objects.find((x) => x.id === s.id) as PenObj | undefined;
            return o ? replaceObj(d, { ...o, points: [...o.points, [pt.x, pt.y]] }) : d;
          },
        });
        return;
      }
      const dx = pt.x - s.start.x;
      const dy = pt.y - s.start.y;
      if (s.kind === "create") {
        const o = { ...s.o0, x: Math.min(s.start.x, pt.x), y: Math.min(s.start.y, pt.y), w: Math.abs(dx), h: Math.abs(dy) };
        dispatch({ t: "live", fn: (d) => replaceObj(d, o) });
        return;
      }
      if (!s.moved && Math.abs(dx) + Math.abs(dy) < 2 / zoom) return;
      s.moved = true;
      const o0 = s.o0;
      let next: EditObj;
      if (s.kind === "move") next = moved(o0, dx, dy);
      else if (o0.kind === "image") {
        const w = Math.max(6, o0.w + dx);
        next = { ...o0, w, h: e.shiftKey ? Math.max(6, o0.h + dy) : (w * o0.h) / o0.w };
      } else if (o0.kind === "text" || o0.kind === "pen") next = o0;
      else next = { ...o0, w: Math.max(4, o0.w + dx), h: Math.max(4, o0.h + dy) };
      dispatch({ t: "live", fn: (d) => replaceObj(d, next) });
    },
    [zoom],
  );

  useEffect(() => {
    const up = () => finishPointer();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onMove, finishPointer]);

  function pointOn(e: React.PointerEvent, page: PageRef): Pt | null {
    const el = pageEls.current.get(page.id);
    return el ? toPage(e.clientX, e.clientY, el, page, zoom) : null;
  }

  function onPageDown(e: React.PointerEvent, page: PageRef) {
    if (e.button !== 0) return;
    setActivePage(page.id);
    if (editingId) return;
    const pt = pointOn(e, page);
    if (!pt) return;
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    e.preventDefault();
    if (tool === "text") {
      const o: TextObj = { id: uid(), pageId: page.id, kind: "text", x: pt.x, y: pt.y - textStyle.size * 0.6, text: "", ...textStyle, opacity: 1 };
      editBase.current = { base: doc, isNew: true };
      dispatch({ t: "live", fn: (d) => addObj(d, o) });
      setSelectedId(o.id);
      setEditingId(o.id);
      setTool("select");
      return;
    }
    if (tool === "pen") {
      const o: PenObj = { id: uid(), pageId: page.id, kind: "pen", points: [[pt.x, pt.y]], color: penStyle.color, width: penStyle.width, opacity: 1 };
      session.current = { kind: "pen", pageId: page.id, base: doc, id: o.id };
      dispatch({ t: "live", fn: (d) => addObj(d, o) });
      return;
    }
    const style =
      tool === "whiteout"
        ? { fill: "#ffffff", stroke: null, strokeWidth: 0, opacity: 1 }
        : tool === "highlight"
          ? { fill: highlightColor, stroke: null, strokeWidth: 0, opacity: 0.4 }
          : { ...shapeStyle, opacity: 1 };
    const o: ShapeObj = { id: uid(), pageId: page.id, kind: tool, x: pt.x, y: pt.y, w: 0, h: 0, ...style };
    session.current = { kind: "create", pageId: page.id, start: pt, base: doc, o0: o };
    dispatch({ t: "live", fn: (d) => addObj(d, o) });
  }

  function onObjectDown(e: React.PointerEvent, o: EditObj, mode: DownMode) {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    if (editingId === o.id) return;
    e.preventDefault();
    setActivePage(o.pageId);
    const now = e.timeStamp;
    const last = lastClick.current;
    lastClick.current = { id: o.id, at: now };
    if (o.kind === "text" && mode === "move" && last?.id === o.id && now - last.at < 450) {
      editBase.current = { base: doc, isNew: false };
      setSelectedId(o.id);
      setEditingId(o.id);
      return;
    }
    setSelectedId(o.id);
    const page = doc.pages.find((p) => p.id === o.pageId);
    const pt = page && pointOn(e, page);
    if (!pt) return;
    session.current = { kind: mode, pageId: o.pageId, start: pt, base: doc, o0: o, moved: false };
  }

  function onOrigDown(e: React.PointerEvent, page: PageRef, orig: OrigText) {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setActivePage(page.id);
    const ov = overrideOf(page.id, orig);
    lastClick.current = { id: ov.id, at: e.timeStamp };
    // The original stays as it is until it is actually changed, so a click alone adds no undo step.
    dispatch({ t: "live", fn: (d) => (d.objects.some((x) => x.id === ov.id) ? d : addObj(d, ov)) });
    setSelectedId(ov.id);
    const pt = pointOn(e, page);
    if (pt) session.current = { kind: "move", pageId: page.id, start: pt, base: doc, o0: ov, moved: false };
  }

  function onEditDone(id: string, text: string) {
    const eb = editBase.current;
    editBase.current = null;
    setEditingId(null);
    const o = doc.objects.find((x) => x.id === id) as TextObj | undefined;
    if (!o) return;
    if (!text.trim() && !o.orig) {
      dispatch({ t: "live", fn: (d) => dropObj(d, id) });
      if (!eb?.isNew) dispatch({ t: "mark", base: eb?.base ?? doc });
      setSelectedId(null);
      return;
    }
    if (text === o.text && !eb?.isNew) return;
    dispatch({ t: "commit", fn: (d) => replaceObj(d, { ...o, text }), base: eb?.base });
  }

  /* ---------- editing the selection ---------- */

  function patchSelected(patch: Partial<TextObj> | Partial<ShapeObj> | Partial<ImageObj> | Partial<PenObj>, key: string) {
    if (!selected) return;
    const next = { ...selected, ...patch } as EditObj;
    dispatch({ t: "commit", fn: (d) => replaceObj(d, next), key: `${selected.id}:${key}`, at: Date.now() });
  }

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === "text" && selected.orig) {
      dispatch({ t: "commit", fn: (d) => replaceObj(d, { ...selected, text: "" }) });
    } else {
      dispatch({ t: "commit", fn: (d) => dropObj(d, selected.id) });
      setSelectedId(null);
    }
  }, [selected]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = { ...moved(selected, 12, 12), id: uid() } as EditObj;
    if (copy.kind === "text") delete copy.orig;
    dispatch({ t: "commit", fn: (d) => addObj(d, copy) });
    setSelectedId(copy.id);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!loaded) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ t: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ t: "redo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setTool("select");
        return;
      }
      if (e.key === "Enter" && selected?.kind === "text") {
        e.preventDefault();
        editBase.current = { base: doc, isNew: false };
        setEditingId(selected.id);
        return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const next = moved(selected, arrows[e.key][0] * step, arrows[e.key][1] * step);
        dispatch({ t: "commit", fn: (d) => replaceObj(d, next), key: `${selected.id}:nudge`, at: Date.now() });
        return;
      }
      const keys: Record<string, Tool> = { v: "select", t: "text", w: "whiteout", h: "highlight", r: "rect", e: "ellipse", p: "pen" };
      const k = keys[e.key.toLowerCase()];
      if (k) {
        setTool(k);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loaded, selected, doc, deleteSelected, duplicateSelected]);

  /* ---------- pages ---------- */

  function pageOp(id: string, op: "left" | "right" | "up" | "down" | "delete" | "duplicate" | "blank") {
    if (op === "delete" && doc.pages.length === 1) {
      setError("A PDF needs at least one page.");
      return;
    }
    dispatch({
      t: "commit",
      fn: (d) => {
        const i = d.pages.findIndex((p) => p.id === id);
        if (i < 0) return d;
        const pages = [...d.pages];
        const p = pages[i];
        switch (op) {
          case "left":
          case "right":
            pages[i] = { ...p, rot: p.rot + (op === "left" ? -90 : 90) };
            return { ...d, pages };
          case "up":
          case "down": {
            const j = op === "up" ? i - 1 : i + 1;
            if (j < 0 || j >= pages.length) return d;
            [pages[i], pages[j]] = [pages[j], pages[i]];
            return { ...d, pages };
          }
          case "delete":
            pages.splice(i, 1);
            return { pages, objects: d.objects.filter((o) => o.pageId !== id) };
          case "blank":
            pages.splice(i + 1, 0, blankPage(p.w, p.h));
            return { ...d, pages };
          case "duplicate": {
            const copy = { ...p, id: uid("p") };
            pages.splice(i + 1, 0, copy);
            const objs = d.objects
              .filter((o) => o.pageId === id)
              .map((o) => ({ ...o, pageId: copy.id, id: o.kind === "text" && o.orig ? overrideId(copy.id, o.orig.id) : uid() }) as EditObj);
            return { pages, objects: [...d.objects, ...objs] };
          }
        }
      },
    });
  }

  function goTo(id: string) {
    setActivePage(id);
    pageEls.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- drop ---------- */

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find(isPdf);
    const img = files.find((f) => f.type.startsWith("image/"));
    if (pdf) void (loaded ? addPdf(pdf) : openFile(pdf));
    else if (img && loaded) void insertImage(img);
  }

  const hiddenInputs = (
    <>
      <input ref={openInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
      <input ref={addInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPdf(f); }} />
      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void insertImage(f); }} />
    </>
  );

  /* ---------- empty state ---------- */

  if (!loaded) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-10 sm:px-6">
        {hiddenInputs}
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">PDF Editor</h1>
          <p className="mt-1 text-sm text-neutral-500">Change the text in a PDF, move things around, cover them up, add text, images, highlights and a drawn signature, and rearrange the pages.</p>
        </div>
        <button
          type="button"
          onClick={() => openInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
            dragOver ? "border-sky-500 bg-sky-50" : "border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50"
          }`}
        >
          <svg {...svgProps} className="size-9 text-neutral-400">
            <path d="M11.5 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5z" />
            <path d="M11.5 2.5v4h4M10 9.5v5M7.8 11.7 10 9.5l2.2 2.2" />
          </svg>
          <span className="text-sm font-medium text-neutral-900">{busy ?? "Drop a PDF here, or click to choose one"}</span>
          <span className="text-xs text-neutral-500">It opens in this browser only. Nothing is uploaded or saved to the server.</span>
        </button>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-center">
          <button type="button" onClick={startBlank} className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline">
            or start from a blank A4 page
          </button>
        </div>
      </div>
    );
  }

  /* ---------- editor ---------- */

  const textSel = selected?.kind === "text" ? selected : null;
  const showTextProps = textSel || tool === "text";
  const ts = textSel ?? { ...textStyle, opacity: 1 };
  const setText = (patch: Partial<typeof textStyle>, key: string) => (textSel ? patchSelected(patch, key) : setTextStyle((s) => ({ ...s, ...patch })));

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      {hiddenInputs}

      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2">
          <button type="button" onClick={closeDoc} className={btn} title="Close this PDF">
            <svg {...svgProps}><path d="M12 4.5 6.5 10l5.5 5.5" /></svg>
          </button>
          <div className="mr-2 min-w-0 max-w-56">
            <div className="truncate text-sm font-semibold text-neutral-900" title={fileName}>{fileName}</div>
            <div className="text-[11px] text-neutral-500">{doc.pages.length} page{doc.pages.length === 1 ? "" : "s"}{dirty ? " · edited" : ""}</div>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                onClick={() => { setTool(t.id); if (t.id !== "select") setSelectedId(null); }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium ${
                  tool === t.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                <svg {...svgProps}>{t.icon}</svg>
                <span className="hidden xl:inline">{t.label}</span>
              </button>
            ))}
            <button type="button" title="Add an image or logo to the current page" onClick={() => imageInput.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900">
              <svg {...svgProps}><rect x="3" y="4" width="14" height="12" rx="1.5" /><circle cx="7.5" cy="8.5" r="1.3" /><path d="m3.5 14.5 4-4 3 3 2-2 4 3.5" /></svg>
              <span className="hidden xl:inline">Image</span>
            </button>
          </div>

          <div className="ml-1 flex items-center">
            <button type="button" className={btn} title="Undo (⌘Z)" disabled={!hist.past.length} onClick={() => dispatch({ t: "undo" })}>
              <svg {...svgProps}><path d="M7 5 3.5 8.5 7 12" /><path d="M3.5 8.5h8a4.5 4.5 0 0 1 0 9H9" /></svg>
            </button>
            <button type="button" className={btn} title="Redo (⇧⌘Z)" disabled={!hist.future.length} onClick={() => dispatch({ t: "redo" })}>
              <svg {...svgProps}><path d="M13 5l3.5 3.5L13 12" /><path d="M16.5 8.5h-8a4.5 4.5 0 0 0 0 9H11" /></svg>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <div className="flex items-center rounded-md ring-1 ring-neutral-200">
              <button type="button" className="h-8 px-2 text-neutral-600 hover:bg-neutral-100" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}>−</button>
              <button type="button" className="h-8 min-w-14 px-1 text-xs tabular-nums text-neutral-700 hover:bg-neutral-100" title="Fit to width" onClick={() => setZoom(fitZoom(doc.pages))}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className="h-8 px-2 text-neutral-600 hover:bg-neutral-100" title="Zoom in" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.1) * 10) / 10))}>+</button>
            </div>
            <button type="button" className={btn} title="Add the pages of another PDF at the end" onClick={() => addInput.current?.click()}>
              <svg {...svgProps}><path d="M10 4v12M4 10h12" /></svg>
              <span className="hidden lg:inline">Add PDF</span>
            </button>
            <button type="button" className={btn} title="Open a different PDF" onClick={() => openInput.current?.click()}>
              <span>Open</span>
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void download()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              <svg {...svgProps}><path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4 16.5h12" /></svg>
              {busy === "Building PDF…" ? "Building…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* Properties of the selection, or of what the tool will add */}
        <div className="flex min-h-10 flex-wrap items-center gap-2 border-t border-neutral-100 px-3 py-1.5 text-[13px] text-neutral-600">
          {showTextProps ? (
            <>
              <select
                value={ts.family}
                onChange={(e) => setText({ family: e.target.value as Family }, "family")}
                className="h-7 rounded-md bg-white px-1.5 text-[13px] ring-1 ring-neutral-200"
              >
                {(Object.keys(FAMILY_LABEL) as Family[]).map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
              </select>
              <label className="flex items-center gap-1">
                Size
                <input
                  type="number"
                  min={4}
                  max={200}
                  step={0.5}
                  value={Math.round(ts.size * 10) / 10}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) setText({ size: v }, "size"); }}
                  className="h-7 w-16 rounded-md px-1.5 tabular-nums ring-1 ring-neutral-200"
                />
              </label>
              <button type="button" onClick={() => setText({ bold: !ts.bold }, "bold")} className={`h-7 w-7 rounded-md font-bold ${ts.bold ? "bg-neutral-900 text-white" : "ring-1 ring-neutral-200 hover:bg-neutral-50"}`}>B</button>
              <button type="button" onClick={() => setText({ italic: !ts.italic }, "italic")} className={`h-7 w-7 rounded-md italic ${ts.italic ? "bg-neutral-900 text-white" : "ring-1 ring-neutral-200 hover:bg-neutral-50"}`}>I</button>
              <label className="flex items-center gap-1">
                Colour
                <input type="color" value={ts.color} onChange={(e) => setText({ color: e.target.value }, "color")} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200" />
              </label>
              {textSel && (
                <>
                  <button type="button" className="h-7 rounded-md px-2 ring-1 ring-neutral-200 hover:bg-neutral-50" onClick={() => { editBase.current = { base: doc, isNew: false }; setEditingId(textSel.id); }}>
                    Edit text
                  </button>
                  {textSel.orig && (
                    <button
                      type="button"
                      title="Put this text back as it was in the PDF"
                      className="h-7 rounded-md px-2 ring-1 ring-neutral-200 hover:bg-neutral-50"
                      onClick={() => { dispatch({ t: "commit", fn: (d) => dropObj(d, textSel.id) }); setSelectedId(null); }}
                    >
                      Restore original
                    </button>
                  )}
                </>
              )}
              {!textSel && <span className="text-neutral-400">Click on a page to type.</span>}
            </>
          ) : selected && (selected.kind === "rect" || selected.kind === "ellipse" || selected.kind === "highlight" || selected.kind === "whiteout") ? (
            <>
              <label className="flex items-center gap-1">
                Fill
                <input type="checkbox" checked={!!selected.fill} onChange={(e) => patchSelected({ fill: e.target.checked ? selected.fill ?? "#ffffff" : null }, "fillOn")} />
                <input type="color" value={selected.fill ?? "#ffffff"} disabled={!selected.fill} onChange={(e) => patchSelected({ fill: e.target.value }, "fill")} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200 disabled:opacity-40" />
              </label>
              <label className="flex items-center gap-1">
                Border
                <input type="checkbox" checked={!!selected.stroke && selected.strokeWidth > 0} onChange={(e) => patchSelected(e.target.checked ? { stroke: selected.stroke ?? "#000000", strokeWidth: selected.strokeWidth || 1.5 } : { stroke: null }, "strokeOn")} />
                <input type="color" value={selected.stroke ?? "#000000"} disabled={!selected.stroke} onChange={(e) => patchSelected({ stroke: e.target.value }, "stroke")} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200 disabled:opacity-40" />
                <input type="number" min={0.5} max={20} step={0.5} value={selected.strokeWidth} disabled={!selected.stroke} onChange={(e) => patchSelected({ strokeWidth: parseFloat(e.target.value) || 0 }, "sw")} className="h-7 w-14 rounded-md px-1.5 tabular-nums ring-1 ring-neutral-200 disabled:opacity-40" />
              </label>
              <Opacity value={selected.opacity} onChange={(v) => patchSelected({ opacity: v }, "opacity")} />
            </>
          ) : selected?.kind === "pen" ? (
            <>
              <label className="flex items-center gap-1">Colour<input type="color" value={selected.color} onChange={(e) => patchSelected({ color: e.target.value }, "color")} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200" /></label>
              <label className="flex items-center gap-1">Width<input type="number" min={0.5} max={30} step={0.5} value={selected.width} onChange={(e) => patchSelected({ width: parseFloat(e.target.value) || 1 }, "width")} className="h-7 w-14 rounded-md px-1.5 tabular-nums ring-1 ring-neutral-200" /></label>
              <Opacity value={selected.opacity} onChange={(v) => patchSelected({ opacity: v }, "opacity")} />
            </>
          ) : selected?.kind === "image" ? (
            <>
              <Opacity value={selected.opacity} onChange={(v) => patchSelected({ opacity: v }, "opacity")} />
              <span className="text-neutral-400">Drag the corner to resize (hold Shift to stretch).</span>
            </>
          ) : tool === "pen" ? (
            <>
              <label className="flex items-center gap-1">Colour<input type="color" value={penStyle.color} onChange={(e) => setPenStyle((s) => ({ ...s, color: e.target.value }))} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200" /></label>
              <label className="flex items-center gap-1">Width<input type="number" min={0.5} max={30} step={0.5} value={penStyle.width} onChange={(e) => setPenStyle((s) => ({ ...s, width: parseFloat(e.target.value) || 1 }))} className="h-7 w-14 rounded-md px-1.5 tabular-nums ring-1 ring-neutral-200" /></label>
              <span className="text-neutral-400">Draw on a page. Press V or Esc when done.</span>
            </>
          ) : tool === "highlight" ? (
            <>
              <label className="flex items-center gap-1">Colour<input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200" /></label>
              <span className="text-neutral-400">Drag across the text to highlight.</span>
            </>
          ) : tool === "rect" || tool === "ellipse" ? (
            <>
              <label className="flex items-center gap-1">Border<input type="color" value={shapeStyle.stroke} onChange={(e) => setShapeStyle((s) => ({ ...s, stroke: e.target.value }))} className="h-7 w-9 cursor-pointer rounded-md bg-white p-0.5 ring-1 ring-neutral-200" /></label>
              <span className="text-neutral-400">Drag on a page to draw it.</span>
            </>
          ) : tool === "whiteout" ? (
            <span className="text-neutral-400">Drag over anything you want gone. It is covered in white in the downloaded PDF.</span>
          ) : (
            <span className="text-neutral-400">
              Click any text in the PDF to select it, drag to move it, double-click to change it. Delete removes it. ⌘Z undoes.
            </span>
          )}
          {selected && (
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="h-7 rounded-md px-2 ring-1 ring-neutral-200 hover:bg-neutral-50" title="Duplicate (⌘D)" onClick={duplicateSelected}>Duplicate</button>
              <button type="button" className="h-7 rounded-md px-2 text-red-600 ring-1 ring-neutral-200 hover:bg-red-50" title="Delete" onClick={deleteSelected}>Delete</button>
            </div>
          )}
        </div>
        {(error || (busy && busy !== "Building PDF…")) && (
          <div className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${error ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}>
            {error ?? busy}
            {error && <button type="button" className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>}
          </div>
        )}
      </div>

      <div className="flex flex-1">
        {/* Page list */}
        <aside className="sticky top-[88px] hidden h-[calc(100vh-88px)] w-44 shrink-0 overflow-y-auto border-r border-neutral-200 bg-neutral-50/70 p-3 md:block">
          <div className="flex flex-col gap-3">
            {doc.pages.map((p, i) => (
              <Thumb
                key={p.id}
                page={p}
                number={i + 1}
                count={doc.pages.length}
                pdf={p.src ? sources[p.src.doc]?.pdf ?? null : null}
                active={activePage === p.id}
                onClick={() => goTo(p.id)}
                onOp={(op) => pageOp(p.id, op)}
              />
            ))}
          </div>
        </aside>

        {/* Pages */}
        <div ref={scroller} className={`relative min-w-0 flex-1 bg-neutral-100 ${dragOver ? "ring-2 ring-inset ring-sky-400" : ""}`}>
          <div className="flex flex-col items-center gap-5 px-6 py-6">
            {doc.pages.map((p, i) => {
              const key = p.src ? `${p.src.doc}:${p.src.index}` : "";
              return (
                <PdfPage
                  key={p.id}
                  page={p}
                  number={i + 1}
                  pdf={p.src ? sources[p.src.doc]?.pdf ?? null : null}
                  zoom={zoom}
                  objects={doc.objects.filter((o) => o.pageId === p.id)}
                  origs={key ? origs[key] : undefined}
                  needOrigs={!!key && !origs[key]}
                  tool={tool}
                  selectedId={selectedId}
                  editingId={editingId}
                  onOrigs={(list) => setOrigs((prev) => (prev[key] ? prev : { ...prev, [key]: list }))}
                  onPageDown={(e) => onPageDown(e, p)}
                  onObjectDown={onObjectDown}
                  onOrigDown={(e, t) => onOrigDown(e, p, t)}
                  onEditDone={onEditDone}
                  register={(el) => {
                    if (el) pageEls.current.set(p.id, el);
                    else pageEls.current.delete(p.id);
                  }}
                />
              );
            })}
            <p className="max-w-lg pb-6 text-center text-xs text-neutral-400">
              Everything happens in this browser; the PDF is never uploaded. Changed text is redrawn in Helvetica, Times or Courier, the closest standard font, so check it after downloading.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Opacity({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      Opacity
      <input type="range" min={0.1} max={1} step={0.05} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-24" />
      <span className="w-8 tabular-nums text-neutral-500">{Math.round(value * 100)}%</span>
    </label>
  );
}

function Thumb({
  page,
  number,
  count,
  pdf,
  active,
  onClick,
  onOp,
}: {
  page: PageRef;
  number: number;
  count: number;
  pdf: PDFDocumentProxy | null;
  active: boolean;
  onClick: () => void;
  onOp: (op: "left" | "right" | "up" | "down" | "delete" | "duplicate" | "blank") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 120;
  const scale = width / page.w;
  const rot = pageRotation(page);
  const sideways = rot % 180 !== 0;

  useEffect(() => {
    if (!pdf || !page.src) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    const index = page.src.index;
    (async () => {
      const p = await pdf.getPage(index + 1);
      if (cancelled || !canvasRef.current) return;
      const vp = p.getViewport({ scale: scale * 2, rotation: 0 });
      const c = canvasRef.current;
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page.src, scale]);

  const W = width;
  const H = page.h * scale;
  const tiny = "flex size-6 items-center justify-center rounded text-neutral-600 hover:bg-white hover:text-neutral-900 disabled:opacity-30";

  return (
    <div className="group flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={`relative overflow-hidden rounded-sm bg-white shadow-sm ring-2 ${active ? "ring-sky-500" : "ring-transparent hover:ring-neutral-300"}`}
        style={{ width: sideways ? H : W, height: sideways ? W : H }}
      >
        <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}>
          {page.src && <canvas ref={canvasRef} className="h-full w-full" />}
        </div>
      </button>
      <div className="flex items-center gap-0.5 text-[11px] text-neutral-500">
        <span className="w-5 text-center tabular-nums">{number}</span>
        <div className="flex items-center opacity-60 transition-opacity group-hover:opacity-100">
          <button type="button" className={tiny} title="Rotate left" onClick={() => onOp("left")}>⟲</button>
          <button type="button" className={tiny} title="Rotate right" onClick={() => onOp("right")}>⟳</button>
          <button type="button" className={tiny} title="Move up" disabled={number === 1} onClick={() => onOp("up")}>↑</button>
          <button type="button" className={tiny} title="Move down" disabled={number === count} onClick={() => onOp("down")}>↓</button>
          <button type="button" className={tiny} title="Duplicate page" onClick={() => onOp("duplicate")}>⧉</button>
          <button type="button" className={tiny} title="Insert a blank page after" onClick={() => onOp("blank")}>＋</button>
          <button type="button" className={`${tiny} hover:text-red-600`} title="Delete page" disabled={count === 1} onClick={() => onOp("delete")}>✕</button>
        </div>
      </div>
    </div>
  );
}
