/**
 * Round-trip proof: fill each template with the values the ORIGINAL document
 * had, then compare the result to that original character by character —
 * text, bold, italic, underline, size, font and colour.
 *
 * If templating is lossless, the two must be identical.
 *
 *   node scripts/verify-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

const ROOT = path.resolve(import.meta.dirname, "..");

const { COMPANY, JOBS } = await import("./roundtrip-data.mjs");

const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const R_RE = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const T_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

function decode(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Every run property that shows on the page. */
function marks(runXml) {
  const pr = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  const props = pr ? pr[1] : "";
  const out = [];
  if (/<w:b\/>|<w:b /.test(props)) out.push("b");
  if (/<w:i\/>|<w:i /.test(props)) out.push("i");
  if (/<w:u /.test(props)) out.push("u");
  if (/<w:strike/.test(props)) out.push("s");
  if (/<w:caps/.test(props)) out.push("caps");
  if (/<w:vertAlign/.test(props)) out.push("va");
  const sz = props.match(/<w:sz w:val="(\d+)"/);
  if (sz) out.push(`sz${sz[1]}`);
  const font = props.match(/w:ascii="([^"]+)"/);
  if (font) out.push(font[1]);
  const color = props.match(/<w:color w:val="([^"]+)"/);
  if (color) out.push(`#${color[1]}`);
  const highlight = props.match(/<w:highlight w:val="([^"]+)"/);
  if (highlight) out.push(`hl:${highlight[1]}`);
  return out.sort().join(",");
}

/** One entry per visible character: [char, formatting]. */
function charStream(buffer, part = "word/document.xml") {
  const file = new PizZip(buffer).file(part);
  if (!file) return [];
  const xml = file.asText();
  const chars = [];
  for (const [paragraph] of xml.matchAll(P_RE)) {
    for (const [runXml] of paragraph.matchAll(R_RE)) {
      const style = marks(runXml);
      for (const t of runXml.matchAll(T_RE)) {
        for (const ch of decode(t[1])) chars.push([ch, style]);
      }
    }
    chars.push(["\n", ""]);
  }
  return chars;
}

let failures = 0;

for (const job of JOBS) {
  const template = fs.readFileSync(path.join(ROOT, "templates", job.template));
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: false,
    nullGetter: () => "",
  });
  doc.render({ ...COMPANY, ...job.data });
  const filled = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  const original = fs.readFileSync(path.join(ROOT, "templates", "source", job.source));

  const parts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];
  let mismatches = 0;
  let compared = 0;

  for (const part of parts) {
    const a = charStream(original, part);
    const b = charStream(filled, part);
    compared += a.length;

    if (a.length !== b.length) {
      console.log(`  ${part}: LENGTH DIFFERS — original ${a.length} chars, filled ${b.length}`);
      mismatches += 1;
    }

    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) {
        const context = a.slice(Math.max(0, i - 40), i + 40).map((c) => c[0]).join("");
        console.log(`  ${part} @${i}: "${a[i][0]}" [${a[i][1]}]  ->  "${b[i][0]}" [${b[i][1]}]`);
        console.log(`      near: ...${context.replace(/\n/g, "⏎")}...`);
        mismatches += 1;
        break;
      }
    }
  }

  if (mismatches === 0) {
    console.log(`PASS  ${job.template}  — ${compared} characters identical to the original, formatting included`);
  } else {
    console.log(`FAIL  ${job.template}  — ${mismatches} mismatch(es)`);
    failures += 1;
  }
}

process.exit(failures > 0 ? 1 : 0);
