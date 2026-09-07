import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** LibreOffice does the docx → PDF conversion. It is the only converter
 *  that keeps the letterhead, tables and page breaks intact; without it we
 *  hand over the Word files alone rather than a degraded PDF. */
const CANDIDATES = [
  process.env.SOFFICE_PATH,
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/opt/homebrew/bin/soffice",
  "/usr/local/bin/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
].filter((p): p is string => Boolean(p));

let cached: string | null | undefined;

export async function findConverter(): Promise<string | null> {
  if (cached !== undefined) return cached;
  for (const candidate of CANDIDATES) {
    try {
      await fs.access(candidate);
      cached = candidate;
      return cached;
    } catch {
      /* try the next one */
    }
  }
  cached = null;
  return null;
}

/** How to switch PDFs on, for the message the dialog shows. */
export const INSTALL_HINT = "brew install --cask libreoffice";

export async function convertToPdf(
  docx: Buffer,
  baseName: string,
): Promise<Buffer> {
  const converter = await findConverter();
  if (!converter) {
    throw new Error(`No PDF converter found. Install one with: ${INSTALL_HINT}`);
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flybit-pdf-"));
  const source = path.join(dir, `${baseName}.docx`);

  try {
    await fs.writeFile(source, docx);
    await run(
      converter,
      [
        "--headless",
        // A private profile per run, so concurrent conversions don't
        // fight over LibreOffice's shared user directory.
        `-env:UserInstallation=file://${path.join(dir, "profile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        dir,
        source,
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024 * 64 },
    );

    return await fs.readFile(path.join(dir, `${baseName}.pdf`));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
