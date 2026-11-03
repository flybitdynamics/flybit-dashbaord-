import PizZip from "pizzip";

/** An .xlsx file's first sheet as the tab-separated text Excel gives when you
 *  copy cells, so a chosen file and a paste take the same road into the import.
 *  Dates arrive as Excel's day numbers; the import turns those back. */

const unescapeXml = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** All the text runs inside a cell or shared string. */
const textOf = (xml: string) =>
  unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

/** "AA" → 26. */
function columnIndex(letters: string): number {
  return [...letters].reduce((sum, c) => sum * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function firstSheetPath(zip: PizZip): string {
  const workbook = zip.file("xl/workbook.xml")?.asText() ?? "";
  const rels = zip.file("xl/_rels/workbook.xml.rels")?.asText() ?? "";
  const rid = workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].find((m) => m[0].includes(`Id="${rid}"`));
  const target = rel?.[0].match(/Target="([^"]+)"/)?.[1] ?? "";
  if (!target) throw new Error("This file has no sheet to read.");
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

export function xlsxToText(file: ArrayBuffer): string {
  const zip = new PizZip(file);
  const shared = [...(zip.file("xl/sharedStrings.xml")?.asText() ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => textOf(m[1]),
  );
  const sheet = zip.file(firstSheetPath(zip))?.asText() ?? "";

  const lines: string[] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!at) continue;
      const type = cell[1].match(/\bt="(\w+)"/)?.[1];
      const body = cell[2] ?? "";
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const text = type === "s" ? shared[Number(value)] : type === "inlineStr" ? textOf(body) : unescapeXml(value);
      const index = columnIndex(at);
      while (cells.length < index) cells.push("");
      cells[index] = (text ?? "").replace(/[\t\r\n]+/g, " ");
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}
