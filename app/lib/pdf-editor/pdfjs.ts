"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { BASELINE, OrigText, familyOf } from "./model";

/* pdf.js reads and draws the uploaded PDFs, all inside the browser. Its worker,
 * character maps and fonts are served from public/pdfjs, copied from
 * node_modules/pdfjs-dist; copy them again after upgrading pdfjs-dist. */

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return m;
    });
  }
  return lib;
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  // pdf.js hands the buffer to its worker, so it gets a copy.
  return m.getDocument({
    data: bytes.slice(),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  }).promise;
}

type Rgb = [number, number, number];
const hex = ([r, g, b]: Rgb) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const dist = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Reads the background and text colour of a box off the drawn page. */
function sampleColors(ctx: CanvasRenderingContext2D, scale: number, x: number, y: number, w: number, h: number) {
  const pad = 2;
  const x0 = Math.max(0, Math.floor(x * scale) - pad);
  const y0 = Math.max(0, Math.floor(y * scale) - pad);
  const x1 = Math.min(ctx.canvas.width, Math.ceil((x + w) * scale) + pad);
  const y1 = Math.min(ctx.canvas.height, Math.ceil((y + h) * scale) + pad);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 2 || ch <= 2) return { bg: "#ffffff", fg: "#000000" };
  const data = ctx.getImageData(x0, y0, cw, ch).data;
  const at = (px: number, py: number): Rgb => {
    const i = (py * cw + px) * 4;
    const a = data[i + 3] / 255;
    // Transparent canvas pixels are the white paper.
    return [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)];
  };
  const counts = new Map<string, { n: number; sum: Rgb }>();
  const add = (c: Rgb) => {
    const key = c.map((v) => v >> 4).join(",");
    const e = counts.get(key) ?? { n: 0, sum: [0, 0, 0] as Rgb };
    e.n++;
    e.sum = [e.sum[0] + c[0], e.sum[1] + c[1], e.sum[2] + c[2]];
    counts.set(key, e);
  };
  for (let px = 0; px < cw; px++) {
    add(at(px, 0));
    add(at(px, ch - 1));
  }
  for (let py = 1; py < ch - 1; py++) {
    add(at(0, py));
    add(at(cw - 1, py));
  }
  let best = { n: 0, sum: [255, 255, 255] as Rgb };
  for (const e of counts.values()) if (e.n > best.n) best = e;
  const bg: Rgb = [best.sum[0] / best.n, best.sum[1] / best.n, best.sum[2] / best.n];
  let fg: Rgb = [0, 0, 0];
  let far = 0;
  for (let py = pad; py < ch - pad; py++) {
    for (let px = pad; px < cw - pad; px++) {
      const c = at(px, py);
      const d = dist(c, bg);
      if (d > far) {
        far = d;
        fg = c;
      }
    }
  }
  if (far < 60) fg = dist(bg, [0, 0, 0]) > 300 ? [0, 0, 0] : [255, 255, 255];
  return { bg: hex(bg), fg: hex(fg) };
}

interface Run {
  x: number;
  base: number;
  w: number;
  size: number;
  text: string;
  font: string;
}

/** The page's text as editable runs, with fonts and colours read off the page
 *  that has just been drawn into `canvas` at `scale`. */
export async function extractText(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number): Promise<OrigText[]> {
  const m = await pdfjs();
  const tc = await page.getTextContent();
  const vp = page.getViewport({ scale: 1, rotation: 0 });
  const runs: Run[] = [];
  for (const item of tc.items) {
    if (!("str" in item) || !item.str) continue;
    const t = m.Util.transform(vp.transform, item.transform);
    // Only level, upright text can be edited in place.
    if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 || t[0] <= 0 || t[3] >= 0) continue;
    const size = Math.abs(t[3]);
    if (size < 1) continue;
    const run: Run = { x: t[4], base: t[5], w: item.width, size, text: item.str, font: item.fontName };
    const prev = runs[runs.length - 1];
    const gap = prev ? run.x - (prev.x + prev.w) : 0;
    if (
      prev &&
      prev.font === run.font &&
      Math.abs(prev.size - run.size) < 0.1 &&
      Math.abs(prev.base - run.base) < 0.5 &&
      gap > -size * 0.3 &&
      gap < size * 0.6
    ) {
      const space = gap > size * 0.15 && !prev.text.endsWith(" ") && !run.text.startsWith(" ") ? " " : "";
      prev.text += space + run.text;
      prev.w = run.x + run.w - prev.x;
    } else {
      runs.push(run);
    }
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return runs
    .filter((r) => r.text.trim())
    .map((r, i) => {
      let name = tc.styles[r.font]?.fontFamily ?? "";
      try {
        const font = page.commonObjs.get(r.font) as { name?: string; loadedName?: string } | undefined;
        if (font?.name) name = font.name;
      } catch {
        // The font object is not ready; the family from the text layer will do.
      }
      const { family, bold, italic } = familyOf(name);
      const text = r.text.replace(/\s+$/, "");
      const top = r.base - r.size * 0.92;
      const coverH = r.size * 1.2;
      const cover = { x: r.x - 1, y: top - 0.5, w: r.w + 2, h: coverH };
      const colors = ctx ? sampleColors(ctx, scale, r.x, top, r.w, r.size * 1.12) : { bg: "#ffffff", fg: "#000000" };
      return {
        id: `t${i}`,
        x: r.x,
        y: r.base - BASELINE[family] * r.size,
        text,
        size: Math.round(r.size * 100) / 100,
        family,
        bold,
        italic,
        color: colors.fg,
        cover: { ...cover, color: colors.bg },
      };
    });
}
