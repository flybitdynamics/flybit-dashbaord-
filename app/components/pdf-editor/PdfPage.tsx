"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { CSS_FAMILY, EditObj, LINE, OrigText, PageRef, TextObj, Tool, overrideId, penBounds, penPath, textChanged } from "../../lib/pdf-editor/model";
import { extractText } from "../../lib/pdf-editor/pdfjs";

export type DownMode = "move" | "resize";

export const pageRotation = (p: PageRef) => (((p.baseRot + p.rot) % 360) + 360) % 360;

interface Props {
  page: PageRef;
  number: number;
  pdf: PDFDocumentProxy | null;
  zoom: number;
  objects: EditObj[];
  origs: OrigText[] | undefined;
  needOrigs: boolean;
  tool: Tool;
  selectedId: string | null;
  editingId: string | null;
  onOrigs: (list: OrigText[]) => void;
  onPageDown: (e: React.PointerEvent) => void;
  onObjectDown: (e: React.PointerEvent, o: EditObj, mode: DownMode) => void;
  onOrigDown: (e: React.PointerEvent, orig: OrigText) => void;
  onEditDone: (id: string, text: string) => void;
  register: (el: HTMLDivElement | null) => void;
}

/** One page: the PDF drawn by pdf.js, with the edits laid over it. */
export function PdfPage(props: Props) {
  const { page, pdf, zoom, objects, origs, tool, selectedId, editingId } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const { needOrigs, onOrigs } = props;

  // Draw the page only once it scrolls near the screen.
  useEffect(() => {
    const el = outerRef.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || !pdf || !page.src) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    const index = page.src.index;
    (async () => {
      const p = await pdf.getPage(index + 1);
      if (cancelled) return;
      const scale = Math.min(zoom * (window.devicePixelRatio || 1), 4);
      const vp = p.getViewport({ scale, rotation: 0 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const off = document.createElement("canvas");
      off.width = Math.ceil(vp.width);
      off.height = Math.ceil(vp.height);
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      task = p.render({ canvasContext: ctx, viewport: vp });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
      setRendered(true);
      if (needOrigs) {
        try {
          onOrigs(await extractText(p, off, scale));
        } catch {
          onOrigs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
    // needOrigs/onOrigs are read once per draw; a new draw is only needed for these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, pdf, page.src, zoom]);

  const W = page.w * zoom;
  const H = page.h * zoom;
  const rot = pageRotation(page);
  const sideways = rot === 90 || rot === 270;
  const select = tool === "select";
  const overridden = new Set(objects.filter((o) => o.kind === "text" && o.orig).map((o) => o.id));
  const z = (v: number) => v * zoom;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={(el) => {
          outerRef.current = el;
          props.register(el);
        }}
        className="relative shrink-0"
        style={{ width: sideways ? H : W, height: sideways ? W : H }}
      >
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
          style={{
            width: W,
            height: H,
            transform: `translate(-50%, -50%) rotate(${rot}deg)`,
            cursor: select ? "default" : tool === "text" ? "text" : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={props.onPageDown}
        >
          {page.src && <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full select-none" />}
          {page.src && !rendered && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">Drawing page…</div>
          )}

          {/* Patches over text that changed. */}
          {objects.map((o) =>
            o.kind === "text" && o.orig && (textChanged(o) || editingId === o.id) ? (
              <div
                key={`cover-${o.id}`}
                className="pointer-events-none absolute"
                style={{ left: z(o.orig.cover.x), top: z(o.orig.cover.y), width: z(o.orig.cover.w), height: z(o.orig.cover.h), background: o.orig.cover.color }}
              />
            ) : null,
          )}

          {/* The PDF's own text, clickable to edit or move. */}
          {origs?.map((t) =>
            overridden.has(overrideId(page.id, t.id)) ? null : (
              <div
                key={t.id}
                title="Click to select · drag to move · double-click to edit"
                onPointerDown={(e) => props.onOrigDown(e, t)}
                className="absolute rounded-[1px] hover:bg-sky-400/10 hover:outline hover:outline-1 hover:outline-sky-400/60"
                style={{
                  left: z(t.cover.x),
                  top: z(t.cover.y),
                  width: z(t.cover.w),
                  height: z(t.cover.h),
                  pointerEvents: select ? "auto" : "none",
                  cursor: "move",
                }}
              />
            ),
          )}

          {objects.map((o) => (
            <ObjectView
              key={o.id}
              o={o}
              zoom={zoom}
              interactive={select}
              selected={selectedId === o.id}
              editing={editingId === o.id}
              onDown={props.onObjectDown}
              onEditDone={props.onEditDone}
            />
          ))}
        </div>
      </div>
      <span className="text-[11px] tabular-nums text-neutral-400">{props.number}</span>
    </div>
  );
}

function ObjectView({
  o,
  zoom,
  interactive,
  selected,
  editing,
  onDown,
  onEditDone,
}: {
  o: EditObj;
  zoom: number;
  interactive: boolean;
  selected: boolean;
  editing: boolean;
  onDown: Props["onObjectDown"];
  onEditDone: Props["onEditDone"];
}) {
  const z = (v: number) => v * zoom;
  const ring = selected ? "outline outline-[1.5px] outline-offset-2 outline-sky-500" : "";
  const pe = interactive ? "auto" : "none";

  if (o.kind === "text") {
    const visible = editing || textChanged(o);
    const style: React.CSSProperties = {
      left: z(o.x),
      top: z(o.y),
      fontSize: z(o.size),
      lineHeight: LINE,
      fontFamily: CSS_FAMILY[o.family],
      fontWeight: o.bold ? 700 : 400,
      fontStyle: o.italic ? "italic" : "normal",
      color: visible ? o.color : "transparent",
      opacity: visible ? o.opacity : 1,
      whiteSpace: "pre",
      pointerEvents: pe,
      minWidth: z(Math.max(4, o.size * 0.6)),
      minHeight: z(o.size * LINE),
    };
    if (editing) return <EditableText o={o} style={style} onDone={onEditDone} />;
    return (
      <div
        className={`absolute cursor-move select-none ${ring} ${!selected && interactive ? "hover:outline hover:outline-1 hover:outline-sky-400/60" : ""}`}
        style={style}
        onPointerDown={(e) => onDown(e, o, "move")}
      >
        {o.text || "​"}
      </div>
    );
  }

  if (o.kind === "pen") {
    const b = penBounds(o);
    const d = penPath(o.points, zoom);
    return (
      <>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path d={d} fill="none" stroke={o.color} strokeWidth={z(o.width)} strokeOpacity={o.opacity} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(12, z(o.width) + 8)}
            style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "move" }}
            onPointerDown={(e) => onDown(e, o, "move")}
          />
        </svg>
        {selected && <div className={`pointer-events-none absolute ${ring}`} style={{ left: z(b.x), top: z(b.y), width: z(b.w), height: z(b.h) }} />}
      </>
    );
  }

  const box: React.CSSProperties = { left: z(o.x), top: z(o.y), width: z(o.w), height: z(o.h), pointerEvents: pe };
  return (
    <div className={`absolute cursor-move ${ring}`} style={box} onPointerDown={(e) => onDown(e, o, "move")}>
      {o.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.src} alt="" draggable={false} className="pointer-events-none h-full w-full select-none" style={{ opacity: o.opacity }} />
      ) : (
        <div
          className="h-full w-full"
          style={{
            background: o.fill ?? "transparent",
            border: o.stroke && o.strokeWidth > 0 ? `${z(o.strokeWidth)}px solid ${o.stroke}` : undefined,
            borderRadius: o.kind === "ellipse" ? "50%" : 0,
            opacity: o.opacity,
            outline: o.kind === "whiteout" && !selected && interactive ? "1px dashed rgba(0,0,0,0.12)" : undefined,
          }}
        />
      )}
      {selected && (
        <div
          title="Drag to resize"
          className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-white bg-sky-500 shadow"
          onPointerDown={(e) => onDown(e, o, "resize")}
        />
      )}
    </div>
  );
}

function EditableText({ o, style, onDone }: { o: TextObj; style: React.CSSProperties; onDone: Props["onEditDone"] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = o.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    if (o.text && !o.orig) range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only when editing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      className="absolute cursor-text outline outline-[1.5px] outline-offset-2 outline-sky-500"
      style={{ ...style, pointerEvents: "auto", background: "rgba(255,255,255,0.0)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") (e.target as HTMLElement).blur();
      }}
      onBlur={(e) => onDone(o.id, e.currentTarget.innerText.replace(/\n+$/, ""))}
    />
  );
}
