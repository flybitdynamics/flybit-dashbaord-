import fs from "node:fs/promises";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import {
  DOCUMENTS,
  DocumentId,
  SHOW_LABEL_TRIAL,
  TRIAL_SUFFIX,
} from "../../lib/documents";
import { INSTALL_HINT, convertToPdf, findConverter } from "../../lib/pdf";

/** Reads templates off disk, so it must run on the Node runtime. */
export const runtime = "nodejs";

const TEMPLATE_DIR = path.join(process.cwd(), "templates");
/** Same content, with LibreOffice's rendering quirks corrected — used only
 *  as the conversion source, never handed over as a .docx. */
const PDF_TEMPLATE_DIR = path.join(TEMPLATE_DIR, "pdf");

interface Body {
  fields?: Record<string, string>;
  documents?: DocumentId[];
  baseName?: string;
  /** Formats to put in the zip. Both default to on. */
  includeWord?: boolean;
  includePdf?: boolean;
  /** Adds a second MoCA letter worded for the rehearsal show. */
  includeTrialLetter?: boolean;
  /** The rehearsal's own date and time, when it differs from the show. */
  trialWindow?: string;
}

/** The dialog asks whether PDFs can be produced on this machine. */
export async function GET() {
  const converter = await findConverter();
  return Response.json({
    pdf: converter !== null,
    installHint: converter === null ? INSTALL_HINT : null,
  });
}

function safeName(value: string, fallback: string): string {
  const cleaned = (value || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the document fields as JSON." }, { status: 400 });
  }

  const fields = body.fields ?? {};
  const wanted = body.documents?.length
    ? DOCUMENTS.filter((d) => body.documents!.includes(d.id))
    : DOCUMENTS;

  if (wanted.length === 0) {
    return Response.json({ error: "Choose at least one document to generate." }, { status: 400 });
  }

  const wantWord = body.includeWord !== false;
  const wantPdf = body.includePdf === true;
  if (!wantWord && !wantPdf) {
    return Response.json({ error: "Choose Word, PDF, or both." }, { status: 400 });
  }

  // Every tag is a plain string; a missing one renders empty rather than
  // leaving "{tag}" visible in a document that goes to the ministry.
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = value == null ? "" : String(value);
  }

  const base = safeName(body.baseName ?? "", "Flybit-Permission");
  const bundle = new PizZip();

  for (const entry of wanted) {
    const fill = async (dir: string, values: Record<string, string>) => {
      const template = await fs.readFile(path.join(dir, `${entry.id}.docx`));
      const doc = new Docxtemplater(new PizZip(template), {
        paragraphLoop: true,
        linebreaks: false,
        nullGetter: () => "",
      });
      doc.render(values);
      return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
    };

    // The MoCA letter can go out twice: once for the show, once for the
    // rehearsal, differing only in that one line.
    const variants = [{ suffix: "", values: data }];
    if (body.includeTrialLetter && entry.id === "moca-letter") {
      variants.push({
        suffix: TRIAL_SUFFIX,
        values: {
          ...data,
          showLabel: SHOW_LABEL_TRIAL,
          showWindow: body.trialWindow?.trim() || data.showWindow,
        },
      });
    }

    try {
      for (const variant of variants) {
        const stem = entry.file.replace(/\.docx$/, "") + variant.suffix;

        if (wantWord) {
          bundle.file(`${base}/${stem}.docx`, await fill(TEMPLATE_DIR, variant.values));
        }
        if (wantPdf) {
          const pdf = await convertToPdf(await fill(PDF_TEMPLATE_DIR, variant.values), stem);
          bundle.file(`${base}/${stem}.pdf`, pdf);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return Response.json(
          { error: `Template "${entry.id}.docx" is missing. Run: npm run templates:build` },
          { status: 500 },
        );
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json(
        { error: `Could not produce "${entry.label}": ${message}` },
        { status: 500 },
      );
    }
  }

  // A single document still comes back as a zip so the download path and
  // the folder naming stay the same either way.
  const out = bundle.generate({ type: "nodebuffer", compression: "DEFLATE" });

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}.zip"`,
      "Content-Length": String(out.length),
    },
  });
}
