/**
 * Turns the original permission documents into docxtemplater templates.
 *
 * The originals are edited only where a value has to change per show: each
 * literal below is swapped for a {tag}, in place, inside the same run — so
 * every style, table, header and page break survives untouched.
 *
 *   node scripts/build-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "templates", "source");
const OUT = path.join(ROOT, "templates");
const PDF_OUT = path.join(ROOT, "templates", "pdf");

/** `exact` matches a whole paragraph (safe for one-word table cells like
 *  "VLOS", which also appears inside a neighbouring label).
 *  `within` swaps a substring wherever it appears. */
/** Rules replace ONLY the value, never the label around it, so a
 *  replacement lands inside the value's own run and keeps that run's bold,
 *  size and font. `where` narrows a rule to paragraphs containing that
 *  text; `exact` matches a whole paragraph (a one-value table cell). */
const PLAN = [
  {
    source: "moca-letter.source.docx",
    out: "moca-letter.docx",
    dropEmbeddedFonts: ["Angsana New"],
    pdfTopMarginTwips: 2686,
    replacements: [
      { find: "Reliance Foundation School Ground, New IPCL Rd, Subhanpura, Vadodara, Gujarat 390023", put: "{venueAddress}" },
      { find: "Vivekkumar Patel", where: "Show Coordinator", put: "{coordinatorName}" },
      { find: "+91 92274 28262", where: "Show Coordinator", put: "{coordinatorPhone}" },
      { find: "511, Satyamev Eminence, Sola, Science City Road,", put: "{companyAddressLine1}" },
      { find: "Ahmedabad, Gujarat - 380060", put: "{companyAddressLine2}" },
      { find: "8:30 PM \u2013 09:30 PM, 6th Sep, 2026", where: "Date & Time of Trial Show", put: "{showWindow}" },
      // "Trial Show" for the rehearsal letter, "the Show" for the main one.
      // Sits inside the bold run, so the label keeps its weight either way.
      { find: "Trial Show", where: "Date & Time of Trial Show", put: "{showLabel}" },
      { find: "22.323547, 73.156645", where: "Coordinates", put: "{coordinates}" },
      { find: "200", where: "Within 200 meters of takeoff point", put: "{operatingRadius}" },
      { find: "120", where: "Maximum Height: 120 meters", put: "{maxHeight}" },
      { find: "150", where: "Number of Drones: 150", put: "{droneCount}" },
      { find: "29th August, 2026", where: "Date:", put: "{letterDate}" },
      { find: "flybitdynamics@gmail.com", put: "{companyEmail}" },
      { find: "+91 92274 28262", put: "{companyPhone}" },
      { find: "Director,", put: "{signatoryTitle}," },
      { find: "Vivekkumar Patel", put: "{signatoryName}" },
      { find: "Flybit Dynamics Private Limited", put: "{companyName}" },
      // Whatever "Vadodara" is left is the city in the subject and heading.
      { find: "Vadodara", put: "{city}" },
    ],
  },
  {
    source: "undertaking.source.docx",
    out: "undertaking.docx",
    dropEmbeddedFonts: ["Angsana New"],
    replacements: [
      { find: "Flybit Dynamics Private Limited", put: "{companyName}" },
      { find: "29th August, 2026", where: "Date:", put: "{letterDate}" },
      { find: "Vivekkumar Patel", where: "Name:", put: "{signatoryName}" },
      { find: "Director", where: "Designation:", put: "{signatoryTitle}" },
    ],
  },
  {
    source: "annexures.source.docx",
    out: "annexures.docx",
    dropEmbeddedFonts: ["Angsana New"],
    pdfTopMarginTwips: 2237,
    replacements: [
      { mode: "exact", find: "511, Satyamev Eminence, Science City Rd, Sola, Ahmedabad, 380006", put: "{companyAddress}" },
      { find: "Flybit Dynamics Pvt. Ltd.", where: "UNDERTAKING BY", put: "{companyShortName}" },
      { find: "AV-22031/106/2025-SDIT-MOCA", put: "{previousPermissionNo}" },
      { find: "Vadodara", where: "Start and End Date", put: "{city}" },
      // This cell is two paragraphs: the date on one line, the times below.
      { mode: "exact", find: "6th Sep, 2026", put: "{showDateLong}" },
      { mode: "exact", find: "8:30 PM to 9:30 PM", put: "{showTimeRange}" },
      { find: "29-Aug-2026", where: "Date:", put: "{letterDateShort}" },
      { find: "Vivek Patel", where: "Name: Vivek Patel", put: "{signatoryName}" },
      { find: "Director", where: "Designation: Director", put: "{signatoryTitle}" },
      { find: "120", where: "Maximum 120 Meters", put: "{maxHeight}" },
      { mode: "exact", find: "Flybit Dynamics Private Limited", put: "{companyName}" },
      { mode: "exact", find: "Vivek Patel", put: "{signatoryName}" },
      { mode: "exact", find: "Director", put: "{signatoryTitle}" },
      { mode: "exact", find: "Shivam Patel", put: "{pilotName}" },
      { mode: "exact", find: "Technical Head", put: "{pilotQualification}" },
      { mode: "exact", find: "15-20 mins", put: "{operatingTime}" },
      { mode: "exact", find: "Normal", put: "{weather}" },
      { mode: "exact", find: "VLOS", put: "{operationType}" },
      { mode: "exact", find: "flybitdynamics@gmail.com", put: "{companyEmail}" },
      { mode: "exact", find: "+91 9227428262", put: "{nodalPhone}" },
      { mode: "exact", find: "Mentioned in PDF", put: "{uin}" },
    ],
  },
];

const T_RE = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t(?:\s[^>]*)?\/>/g;
const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;

function decode(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function encode(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The <w:t> nodes of one paragraph, with their text and offsets. */
function textNodes(paragraph) {
  const nodes = [];
  let m;
  T_RE.lastIndex = 0;
  while ((m = T_RE.exec(paragraph)) !== null) {
    const whole = m[0];
    if (whole.endsWith("/>")) continue; // empty <w:t/>
    const open = whole.indexOf(">") + 1;
    const close = whole.lastIndexOf("</w:t>");
    nodes.push({
      start: m.index,
      end: m.index + whole.length,
      openTag: whole.slice(0, open),
      inner: whole.slice(open, close),
      text: decode(whole.slice(open, close)),
    });
  }
  return nodes;
}

/** Replace concat-text range [from, to) across runs, putting `put` in the
 *  run where the match starts so it keeps that run's formatting. */
function spliceParagraph(paragraph, nodes, from, to, put) {
  let cursor = 0;
  const edits = [];
  for (const node of nodes) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.text.length;
    cursor = nodeEnd;
    if (nodeEnd <= from || nodeStart >= to) continue;

    const localFrom = Math.max(0, from - nodeStart);
    const localTo = Math.min(node.text.length, to - nodeStart);
    let next = node.text.slice(0, localFrom) + node.text.slice(localTo);
    if (from >= nodeStart && from < nodeEnd) {
      next = node.text.slice(0, localFrom) + put + node.text.slice(localTo);
    }
    let openTag = node.openTag;
    if (!openTag.includes("xml:space")) {
      openTag = openTag.replace(/>$/, ' xml:space="preserve">');
    }
    edits.push({
      start: node.start,
      end: node.end,
      html: `${openTag}${encode(next)}</w:t>`,
    });
  }
  let out = paragraph;
  for (const edit of edits.reverse()) {
    out = out.slice(0, edit.start) + edit.html + out.slice(edit.end);
  }
  return out;
}

function applyReplacements(xml, replacements, report) {
  const paragraphs = [];
  let m;
  P_RE.lastIndex = 0;
  while ((m = P_RE.exec(xml)) !== null) {
    paragraphs.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
  }

  for (const paragraph of paragraphs) {
    for (const rule of replacements) {
      // Re-read nodes each pass: an earlier rule may have rewritten them.
      let nodes = textNodes(paragraph.xml);
      let concat = nodes.map((n) => n.text).join("");

      if (rule.where && !concat.includes(rule.where)) continue;

      if (rule.mode === "exact") {
        if (concat.trim() !== rule.find) continue;
        const at = concat.indexOf(rule.find);
        paragraph.xml = spliceParagraph(paragraph.xml, nodes, at, at + rule.find.length, rule.put);
        report.set(rule.find, (report.get(rule.find) ?? 0) + 1);
        continue;
      }

      let guard = 0;
      while (guard++ < 20) {
        nodes = textNodes(paragraph.xml);
        concat = nodes.map((n) => n.text).join("");
        const at = concat.indexOf(rule.find);
        if (at === -1) break;
        paragraph.xml = spliceParagraph(paragraph.xml, nodes, at, at + rule.find.length, rule.put);
        report.set(rule.find, (report.get(rule.find) ?? 0) + 1);
      }
    }
  }

  let out = xml;
  for (const paragraph of [...paragraphs].reverse()) {
    out = out.slice(0, paragraph.start) + paragraph.xml + out.slice(paragraph.end);
  }
  return out;
}

/** Drop a font Word embedded but never uses — pure weight, no visual change. */
function dropFonts(zip, names) {
  let fontTable = zip.file("word/fontTable.xml")?.asText();
  const rels = zip.file("word/_rels/fontTable.xml.rels")?.asText();
  if (!fontTable || !rels) return 0;

  const relTargets = new Map(
    [...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  let removed = 0;
  let nextRels = rels;

  for (const name of names) {
    const re = new RegExp(`<w:font w:name="${name}">[\\s\\S]*?</w:font>`, "g");
    const match = fontTable.match(re);
    if (!match) continue;
    for (const block of match) {
      for (const [, id] of block.matchAll(/r:id="([^"]+)"/g)) {
        const target = relTargets.get(id);
        if (target) {
          zip.remove(`word/${target}`);
          removed += 1;
        }
        nextRels = nextRels.replace(
          new RegExp(`<Relationship Id="${id}"[^>]*/>`, "g"),
          "",
        );
      }
      // Keep the font declared, just not embedded.
      fontTable = fontTable.replace(
        block,
        block.replace(/<w:embed[A-Za-z]+[^>]*\/>/g, ""),
      );
    }
  }
  zip.file("word/fontTable.xml", fontTable);
  zip.file("word/_rels/fontTable.xml.rels", nextRels);
  return removed;
}


/**
 * Word crops a picture with <a:srcRect> — a percentage cut off each edge —
 * and keeps the whole image in the file. LibreOffice ignores srcRect and
 * scales the UNCROPPED image up to fill the same box, so the letterhead
 * renders ~13% taller and collides with the first line of the body.
 *
 * Fix: cut the pixels for real, then drop the srcRect. Word shows exactly
 * the same picture at the same size, and LibreOffice now agrees.
 */
async function bakeImageCrops(zip, parts) {
  const applied = [];

  for (const part of parts) {
    const file = zip.file(part);
    if (!file) continue;
    let xml = file.asText();
    if (!xml.includes("<a:srcRect")) continue;

    const relsPath = part.replace("word/", "word/_rels/") + ".rels";
    const relsFile = zip.file(relsPath);
    if (!relsFile) continue;
    const rels = new Map(
      [...relsFile.asText().matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );

    for (const drawing of xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) ?? []) {
      const crop = drawing.match(/<a:srcRect([^/>]*)\/>/);
      const embed = drawing.match(/r:embed="([^"]+)"/);
      if (!crop || !embed) continue;

      const attr = (name) => {
        const m = crop[1].match(new RegExp(`${name}="(-?\\d+)"`));
        // Word stores these as thousandths of a percent.
        return m ? Number(m[1]) / 100000 : 0;
      };
      const [l, t, r, b] = [attr("l"), attr("t"), attr("r"), attr("b")];
      if (l + t + r + b === 0) continue;

      const target = rels.get(embed[1]);
      const mediaPath = target ? `word/${target.replace(/^\.\//, "")}` : null;
      const media = mediaPath ? zip.file(mediaPath) : null;
      if (!media) continue;

      const source = Buffer.from(media.asUint8Array());
      const meta = await sharp(source).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      const left = Math.round(width * l);
      const top = Math.round(height * t);
      const cropWidth = Math.max(1, Math.round(width * (1 - l - r)));
      const cropHeight = Math.max(1, Math.round(height * (1 - t - b)));

      const pipeline = sharp(source).extract({ left, top, width: cropWidth, height: cropHeight });
      const cropped =
        meta.format === "png"
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
          : await pipeline.jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer();

      zip.file(mediaPath, cropped);
      applied.push(
        `${mediaPath} ${width}x${height} -> ${cropWidth}x${cropHeight}` +
          ` (l${(l * 100).toFixed(2)}% t${(t * 100).toFixed(2)}%` +
          ` r${(r * 100).toFixed(2)}% b${(b * 100).toFixed(2)}%)`,
      );
    }

    // The pixels are gone now, so the crop instruction has to go too.
    xml = xml.replace(/<a:srcRect[^/>]*\/>/g, "");
    zip.file(part, xml);
  }

  return applied;
}


/**
 * Word lets a header picture hang off the top of the page — the anchor sits
 * at header-distance + a negative offset, so part of the image is simply not
 * printed. LibreOffice clamps that to the page top instead, pushing the whole
 * letterhead down into the first line of the body.
 *
 * Fix: cut off the strip Word never prints and re-anchor at the page top.
 * The printed result is identical in Word; LibreOffice now matches it.
 */
async function bakeHeaderBleed(zip, headerParts, headerDistanceTwips) {
  const applied = [];
  const headerPt = headerDistanceTwips / 20;

  for (const part of headerParts) {
    const file = zip.file(part);
    if (!file) continue;
    let xml = file.asText();
    if (!xml.includes("<wp:anchor")) continue;

    const relsFile = zip.file(part.replace("word/", "word/_rels/") + ".rels");
    if (!relsFile) continue;
    const rels = new Map(
      [...relsFile.asText().matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );

    for (const drawing of xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) ?? []) {
      const anchor = drawing.match(
        /<wp:positionV relativeFrom="paragraph">\s*<wp:posOffset>(-?\d+)<\/wp:posOffset>\s*<\/wp:positionV>/,
      );
      const extent = drawing.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
      const embed = drawing.match(/r:embed="([^"]+)"/);
      if (!anchor || !extent || !embed) continue;

      const topPt = headerPt + Number(anchor[1]) / 12700;
      if (topPt >= -0.5) continue; // nothing hangs off the page

      const cutPt = -topPt;
      const heightPt = Number(extent[2]) / 12700;
      const fraction = cutPt / heightPt;
      if (fraction <= 0 || fraction >= 1) continue;

      const mediaPath = `word/${rels.get(embed[1])?.replace(/^\.\//, "")}`;
      const media = zip.file(mediaPath);
      if (!media) continue;

      const source = Buffer.from(media.asUint8Array());
      const meta = await sharp(source).metadata();
      const height = meta.height ?? 0;
      const top = Math.round(height * fraction);

      const pipeline = sharp(source).extract({
        left: 0,
        top,
        width: meta.width ?? 0,
        height: Math.max(1, height - top),
      });
      zip.file(
        mediaPath,
        meta.format === "png"
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
          : await pipeline.jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toBuffer(),
      );

      const newCy = Math.round((heightPt - cutPt) * 12700);
      const newOffset = Math.round(-headerPt * 12700);
      const fixed = drawing
        .replace(/<wp:extent cx="(\d+)" cy="\d+"\/>/, `<wp:extent cx="$1" cy="${newCy}"/>`)
        .replace(/<a:ext cx="(\d+)" cy="\d+"\/>/, `<a:ext cx="$1" cy="${newCy}"/>`)
        .replace(
          /(<wp:positionV relativeFrom="paragraph">\s*<wp:posOffset>)-?\d+(<\/wp:posOffset>)/,
          `$1${newOffset}$2`,
        );
      xml = xml.replace(drawing, fixed);

      applied.push(
        `${part} letterhead: trimmed ${cutPt.toFixed(1)}pt that Word prints off-page,` +
          ` height ${heightPt.toFixed(1)}pt -> ${(heightPt - cutPt).toFixed(1)}pt`,
      );
    }

    zip.file(part, xml);
  }

  return applied;
}


/**
 * LibreOffice starts the body directly under the header picture; Word starts
 * it lower, because the picture's wrap space is reserved. Forcing the top
 * margin fixes it — but only in the PDF-conversion copy, never in the Word
 * file, where the same change WOULD move text. Values are measured against
 * the customer's Word-exported PDFs by scripts/compare-pdf-layout.mjs.
 */
function setTopMargin(zip, twips) {
  if (!twips) return null;
  const file = zip.file("word/document.xml");
  if (!file) return null;
  let from = null;
  const xml = file.asText().replace(/<w:pgMar([^>]*?)w:top="(\d+)"/g, (whole, rest, top) => {
    from = Number(top);
    return `<w:pgMar${rest}w:top="${twips}"`;
  });
  if (from === null) return null;
  zip.file("word/document.xml", xml);
  return `top margin ${from} -> ${twips} twips`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PDF_OUT, { recursive: true });

let misses = 0;

for (const job of PLAN) {
  const buffer = fs.readFileSync(path.join(SRC, job.source));
  const report = new Map();

  /** Fill in the {tags}; shared by both copies. Only the first pass records
   *  hits, so the counts below reflect the document, not the copies. */
  function templated(collect = false) {
    const zip = new PizZip(buffer);
    for (const part of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"]) {
      const file = zip.file(part);
      if (!file) continue;
      zip.file(part, applyReplacements(file.asText(), job.replacements, collect ? report : new Map()));
    }
    dropFonts(zip, job.dropEmbeddedFonts ?? []);
    return zip;
  }

  // 1. The Word file the customer opens — byte-faithful to the original.
  const wordZip = templated(true);
  const wordOut = wordZip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(path.join(OUT, job.out), wordOut);

  // 2. The copy LibreOffice converts to PDF, with its rendering quirks
  //    corrected. Never handed to the customer as a .docx.
  const pdfZip = templated();
  const headerParts = ["word/header1.xml", "word/header2.xml", "word/header3.xml"];
  const notes = await bakeImageCrops(pdfZip, [
    ...headerParts,
    "word/footer1.xml", "word/footer2.xml", "word/footer3.xml",
    "word/document.xml",
  ]);
  const headerDistance = Number(
    pdfZip.file("word/document.xml")?.asText().match(/<w:pgMar[^>]*w:header="(\d+)"/)?.[1] ?? 720,
  );
  notes.push(...(await bakeHeaderBleed(pdfZip, headerParts, headerDistance)));
  const margin = setTopMargin(pdfZip, job.pdfTopMarginTwips ?? 0);
  if (margin) notes.push(margin);

  const pdfOut = pdfZip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(path.join(PDF_OUT, job.out), pdfOut);

  console.log(`\n${job.out}  ${(buffer.length / 1e6).toFixed(1)} MB -> ${(wordOut.length / 1e6).toFixed(1)} MB`);
  for (const note of notes) {
    console.log(`  pdf copy: ${note}`);
  }
  for (const rule of job.replacements) {
    const hits = report.get(rule.find) ?? 0;
    if (hits === 0) misses += 1;
    console.log(`  ${hits > 0 ? "ok " : "MISS"} ${String(hits).padStart(2)}x  ${rule.find.slice(0, 62)}`);
  }
}

if (misses > 0) {
  console.error(`\n${misses} rule(s) matched nothing — the source documents changed. Fix the rules before shipping.`);
  process.exit(1);
}
console.log("\nNow run: node scripts/verify-templates.mjs && node scripts/compare-pdf-layout.mjs");
