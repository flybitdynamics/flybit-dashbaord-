"use client";

import { LineCapStyle, PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { BASELINE, CSS_FAMILY, DocState, Family, LINE, Source, TextObj, penPath, textChanged } from "./model";

/* Builds the edited PDF in the browser with pdf-lib. The original pages are
 * copied as they are (so their text stays real text), then the edits are drawn
 * on top: a patch in the background colour over text that changed, then the
 * new text, images, shapes and pen strokes. */

const STD: Record<Family, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

function color(hex: string | null | undefined) {
  const h = (hex ?? "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0"), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Text the standard PDF fonts cannot spell (₹, Hindi, emoji…) is drawn as a
 *  sharp picture instead. */
function rasterText(o: TextObj) {
  const scale = 4;
  const lines = o.text.split("\n");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.size * scale}px ${CSS_FAMILY[o.family]}`;
  ctx.font = font;
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width)) + 2 * scale;
  const height = lines.length * LINE * o.size * scale + 2 * scale;
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  ctx.font = font;
  ctx.fillStyle = o.color;
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, 0, (BASELINE[o.family] * o.size + i * LINE * o.size) * scale));
  return { png: canvas.toDataURL("image/png"), w: canvas.width / scale, h: canvas.height / scale };
}

export async function exportPdf(sources: Source[], state: DocState): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = await Promise.all(sources.map((s) => PDFDocument.load(s.bytes, { ignoreEncryption: true })));

  const fonts = new Map<string, PDFFont>();
  const font = async (o: TextObj) => {
    const name = STD[o.family][(o.bold ? 1 : 0) + (o.italic ? 2 : 0)];
    if (!fonts.has(name)) fonts.set(name, await out.embedFont(name));
    return fonts.get(name)!;
  };
  const images = new Map<string, PDFImage>();
  const image = async (src: string) => {
    if (!images.has(src)) {
      const bytes = dataUrlBytes(src);
      images.set(src, src.startsWith("data:image/png") ? await out.embedPng(bytes) : await out.embedJpg(bytes));
    }
    return images.get(src)!;
  };

  for (const p of state.pages) {
    let page: PDFPage;
    if (p.src) {
      const [copy] = await out.copyPages(loaded[p.src.doc], [p.src.index]);
      page = out.addPage(copy);
    } else {
      page = out.addPage([p.w, p.h]);
    }
    page.setRotation(degrees((((p.baseRot + p.rot) % 360) + 360) % 360));

    const [vx, , , vy] = p.view;
    const X = (x: number) => vx + x;
    const Y = (y: number) => vy - y;
    const objects = state.objects.filter((o) => o.pageId === p.id);

    // Patches over the text that changed, under everything else.
    for (const o of objects) {
      if (o.kind !== "text" || !o.orig || !textChanged(o)) continue;
      const c = o.orig.cover;
      page.drawRectangle({ x: X(c.x), y: Y(c.y + c.h), width: c.w, height: c.h, color: color(c.color) });
    }

    for (const o of objects) {
      if (o.kind === "text") {
        if (o.orig && !textChanged(o)) continue;
        if (!o.text.trim()) continue;
        const f = await font(o);
        const lines = o.text.split("\n");
        let spellable = true;
        try {
          lines.forEach((l) => f.encodeText(l));
        } catch {
          spellable = false;
        }
        if (spellable) {
          lines.forEach((line, i) => {
            if (!line) return;
            page.drawText(line, {
              x: X(o.x),
              y: Y(o.y + BASELINE[o.family] * o.size + i * LINE * o.size),
              size: o.size,
              font: f,
              color: color(o.color),
              opacity: o.opacity,
            });
          });
        } else {
          const r = rasterText(o);
          const img = await image(r.png);
          page.drawImage(img, { x: X(o.x), y: Y(o.y + r.h), width: r.w, height: r.h, opacity: o.opacity });
        }
      } else if (o.kind === "image") {
        const img = await image(o.src);
        page.drawImage(img, { x: X(o.x), y: Y(o.y + o.h), width: o.w, height: o.h, opacity: o.opacity });
      } else if (o.kind === "pen") {
        if (o.points.length === 0) continue;
        page.drawSvgPath(penPath(o.points), {
          x: vx,
          y: vy,
          borderColor: color(o.color),
          borderWidth: o.width,
          borderOpacity: o.opacity,
          borderLineCap: LineCapStyle.Round,
        });
      } else {
        const fill = o.fill ? color(o.fill) : undefined;
        const stroke = o.stroke && o.strokeWidth > 0 ? color(o.stroke) : undefined;
        if (o.kind === "ellipse") {
          page.drawEllipse({
            x: X(o.x + o.w / 2),
            y: Y(o.y + o.h / 2),
            xScale: o.w / 2,
            yScale: o.h / 2,
            color: fill,
            borderColor: stroke,
            borderWidth: stroke ? o.strokeWidth : 0,
            opacity: o.opacity,
            borderOpacity: o.opacity,
          });
        } else {
          page.drawRectangle({
            x: X(o.x),
            y: Y(o.y + o.h),
            width: o.w,
            height: o.h,
            color: fill,
            borderColor: stroke,
            borderWidth: stroke ? o.strokeWidth : 0,
            opacity: o.opacity,
            borderOpacity: o.opacity,
          });
        }
      }
    }
  }

  return out.save();
}
