/* The PDF editor's model. Everything is kept in PDF points, measured from the
 * top-left of the page as it is stored (before any page rotation), so the
 * screen and the exported file use the same numbers. */

export type Family = "helvetica" | "times" | "courier";
export type Tool = "select" | "text" | "whiteout" | "rect" | "ellipse" | "highlight" | "pen";

export interface Source {
  name: string;
  bytes: Uint8Array;
}

export interface PageRef {
  id: string;
  /** The page in an uploaded PDF, or null for a blank page added here. */
  src: { doc: number; index: number } | null;
  w: number;
  h: number;
  /** The page's box in PDF user space: [x0, y0, x1, y1]. */
  view: [number, number, number, number];
  /** Rotation saved in the PDF, and the turns added here, in degrees. */
  baseRot: number;
  rot: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A run of text that was already in the PDF. */
export interface OrigText {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
  family: Family;
  bold: boolean;
  italic: boolean;
  color: string;
  /** What gets painted over the old words once they change. */
  cover: Box & { color: string };
}

interface Base {
  id: string;
  pageId: string;
}

export interface TextObj extends Base {
  kind: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  family: Family;
  bold: boolean;
  italic: boolean;
  color: string;
  opacity: number;
  /** Set when this replaces text that was in the PDF. */
  orig?: OrigText;
}

export interface ImageObj extends Base, Box {
  kind: "image";
  src: string;
  opacity: number;
}

export interface ShapeObj extends Base, Box {
  kind: "rect" | "ellipse" | "highlight" | "whiteout";
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface PenObj extends Base {
  kind: "pen";
  points: Array<[number, number]>;
  color: string;
  width: number;
  opacity: number;
}

export type EditObj = TextObj | ImageObj | ShapeObj | PenObj;

export interface DocState {
  pages: PageRef[];
  objects: EditObj[];
}

/** Line height, and where the first baseline sits in a line, per font. These
 *  match how the browser lays out the same fonts at line-height 1.2. */
export const LINE = 1.2;
export const BASELINE: Record<Family, number> = { helvetica: 0.95, times: 0.94, courier: 0.87 };

export const CSS_FAMILY: Record<Family, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
};

export const FAMILY_LABEL: Record<Family, string> = { helvetica: "Sans (Helvetica)", times: "Serif (Times)", courier: "Mono (Courier)" };

let seq = 0;
export const uid = (prefix = "o") => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The id an override of an original text run gets, so it is found again. */
export const overrideId = (pageId: string, origId: string) => `ov:${pageId}:${origId}`;

export function textChanged(o: TextObj): boolean {
  const a = o.orig;
  if (!a) return true;
  return (
    a.text !== o.text ||
    Math.abs(a.x - o.x) > 0.01 ||
    Math.abs(a.y - o.y) > 0.01 ||
    Math.abs(a.size - o.size) > 0.01 ||
    a.family !== o.family ||
    a.bold !== o.bold ||
    a.italic !== o.italic ||
    a.color.toLowerCase() !== o.color.toLowerCase() ||
    o.opacity !== 1
  );
}

export function overrideOf(pageId: string, orig: OrigText): TextObj {
  return {
    id: overrideId(pageId, orig.id),
    pageId,
    kind: "text",
    x: orig.x,
    y: orig.y,
    text: orig.text,
    size: orig.size,
    family: orig.family,
    bold: orig.bold,
    italic: orig.italic,
    color: orig.color,
    opacity: 1,
    orig,
  };
}

export function familyOf(name: string): { family: Family; bold: boolean; italic: boolean } {
  const n = name.toLowerCase();
  const family: Family = /courier|mono|consol/.test(n)
    ? "courier"
    : /times|serif|georgia|garamond|cambria|book|roman|minion/.test(n) && !/sans/.test(n)
      ? "times"
      : "helvetica";
  return { family, bold: /bold|black|heavy|semibold|demi/.test(n), italic: /italic|oblique/.test(n) };
}

export function penBounds(o: PenObj): Box {
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const x = Math.min(...xs) - o.width / 2;
  const y = Math.min(...ys) - o.width / 2;
  return { x, y, w: Math.max(...xs) - x + o.width / 2, h: Math.max(...ys) - y + o.width / 2 };
}

export function penPath(points: Array<[number, number]>, scale = 1): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (rest.length === 0) return `M${first[0] * scale} ${first[1] * scale} l0.01 0`;
  return `M${first[0] * scale} ${first[1] * scale}` + rest.map((p) => ` L${p[0] * scale} ${p[1] * scale}`).join("");
}

export function moved<T extends EditObj>(o: T, dx: number, dy: number): T {
  if (o.kind === "pen") return { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

/** A4 portrait in points. */
export const A4: [number, number] = [595.28, 841.89];

export function blankPage(w = A4[0], h = A4[1]): PageRef {
  return { id: uid("p"), src: null, w, h, view: [0, 0, w, h], baseRot: 0, rot: 0 };
}
