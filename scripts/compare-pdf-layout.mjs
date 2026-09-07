/**
 * Layout proof for the PDFs: fill each template with the ORIGINAL values,
 * convert to PDF the same way the app does, and compare the printed page
 * against the customer's own Word-exported PDF.
 *
 * Two things are measured, in points from the top of page 1:
 *   - where the letterhead's ink ends
 *   - where the first line of body text begins
 *
 * macOS only — it uses Quick Look to rasterise. Needs LibreOffice.
 *
 *   node scripts/compare-pdf-layout.mjs
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import sharp from "sharp";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
const PAGE_HEIGHT_PT = 841.92;
const TOLERANCE_PT = 4;

const { COMPANY, JOBS } = await import("./roundtrip-data.mjs");

async function toPdf(docx, name, dir) {
  const source = path.join(dir, `${name}.docx`);
  await fs.writeFile(source, docx);
  await run(SOFFICE, [
    "--headless",
    `-env:UserInstallation=file://${path.join(dir, "profile")}`,
    "--convert-to", "pdf", "--outdir", dir, source,
  ], { timeout: 120_000, maxBuffer: 1 << 26 });
  return path.join(dir, `${name}.pdf`);
}

async function rasterise(pdf, dir) {
  await run("qlmanage", ["-t", "-s", "1500", "-o", dir, pdf], { timeout: 60_000 }).catch(() => {});
  return `${path.join(dir, path.basename(pdf))}.png`;
}

/** Rows of ink: where the letterhead ends and the body begins. */
async function profile(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const scale = PAGE_HEIGHT_PT / height;

  const ink = [];
  for (let y = 0; y < height; y += 1) {
    let dark = 0;
    for (let x = 0; x < width; x += 2) {
      if (data[y * width + x] < 128) dark += 1;
    }
    ink.push(dark);
  }

  const first = ink.findIndex((d) => d > 3);
  let end = first;
  let gap = 0;
  for (let y = first; y < height; y += 1) {
    if (ink[y] > 3) {
      end = y;
      gap = 0;
    } else if (++gap > 12) break;
  }
  let body = end + 12;
  while (body < height && ink[body] <= 3) body += 1;

  return { letterhead: end * scale, body: body * scale };
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flybit-layout-"));
let failures = 0;

try {
  for (const job of JOBS) {
    const name = job.template.replace(/\.docx$/, "");
    const template = await fs.readFile(path.join(ROOT, "templates", "pdf", job.template));
    const doc = new Docxtemplater(new PizZip(template), {
      paragraphLoop: true, linebreaks: false, nullGetter: () => "",
    });
    doc.render({ ...COMPANY, ...job.data });
    const filled = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

    const minePdf = await toPdf(filled, name, dir);
    const mine = await profile(await rasterise(minePdf, dir));

    const refPdf = path.join(ROOT, "templates", "reference", `${name}.pdf`);
    const refCopy = path.join(dir, `ref-${name}.pdf`);
    await fs.copyFile(refPdf, refCopy);
    const reference = await profile(await rasterise(refCopy, dir));

    const dh = Math.abs(reference.letterhead - mine.letterhead);
    const db = Math.abs(reference.body - mine.body);
    const ok = dh <= TOLERANCE_PT && db <= TOLERANCE_PT;
    if (!ok) failures += 1;

    console.log(`${ok ? "PASS" : "FAIL"}  ${job.template}`);
    console.log(`        letterhead ends  Word ${reference.letterhead.toFixed(1)}pt   mine ${mine.letterhead.toFixed(1)}pt   Δ ${dh.toFixed(1)}pt`);
    console.log(`        body text starts Word ${reference.body.toFixed(1)}pt   mine ${mine.body.toFixed(1)}pt   Δ ${db.toFixed(1)}pt`);
  }
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}

process.exit(failures > 0 ? 1 : 0);
