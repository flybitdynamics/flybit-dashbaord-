import { jsPDF } from "jspdf";
import {
  CLIENT_TYPES,
  PERMISSION_STATUSES,
  SHOW_STATUSES,
  ZONES,
  certificateState,
  formatDate,
  formatTime,
  type CertificateState,
  type Client,
  type Pilot,
  type Settings,
  type Show,
  type Zone,
} from "./types";

/** The whole-show report for management: one PDF with everything about a
 *  booking except invoices and quotations — the show, client, venue, crew,
 *  the DigitalSky airspace check with its map, and the formation planned in
 *  Maps. Money is the show amount alone; the activity log stays out. Built in the
 *  browser with jsPDF; images come through /api/report-image. */

export interface ShowReportInput {
  show: Show;
  client: Client | undefined;
  pilots: Pilot[];
  settings: Settings;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 18; // keep clear of the footer

const INK: [number, number, number] = [23, 23, 23];
const MUTED: [number, number, number] = [115, 115, 115];
const RULE: [number, number, number] = [229, 229, 229];
const ACCENT: [number, number, number] = [234, 88, 12];
const ZONE_RGB: Record<Zone, [number, number, number]> = {
  green: [16, 185, 129],
  yellow: [245, 158, 11],
  red: [239, 68, 68],
};

/** jsPDF's built-in font covers Western European text only: anything else
 *  would print as junk, so it is swapped for something it can print. */
function printable(text: string): string {
  return text
    .replace(/₹/g, "Rs. ")
    .replace(/[^\n\x20-\xFF–—‘’“”…•×]/g, "?");
}

const money = (amount: number) => `Rs. ${Math.round(amount || 0).toLocaleString("en-IN")}`;
const or = (value: string | number | undefined | null, fallback = "—") =>
  value === undefined || value === null || String(value).trim() === "" ? fallback : String(value);
const stamp = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const when = (iso: string) => (iso ? stamp.format(new Date(iso)) : "—");

interface LoadedImage {
  data: string;
  width: number;
  height: number;
}

/** Maps go in as JPEG — a fraction of the size of the PNGs they are saved
 *  as. The logo stays PNG to keep its transparent background. */
async function blobToImage(blob: Blob, asJpeg: boolean): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  let data: string;
  if (asJpeg) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    data = canvas.toDataURL("image/jpeg", 0.85);
  } else {
    data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  bitmap.close();
  return { data, width, height };
}

/** An image for the PDF, or null if it cannot be had — a missing picture
 *  is noted in the report rather than stopping it. */
async function loadImage(url: string, viaProxy: boolean): Promise<LoadedImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(viaProxy ? `/api/report-image?url=${encodeURIComponent(url)}` : url);
    if (!res.ok) return null;
    return await blobToImage(await res.blob(), viaProxy);
  } catch {
    return null;
  }
}

class ReportWriter {
  doc = new jsPDF({ unit: "mm", format: "a4" });
  y = MARGIN;

  constructor(
    private readonly logo: LoadedImage | null,
    private readonly settings: Settings,
    private readonly reportTitle: string,
  ) {
    this.header();
  }

  private header() {
    const { doc } = this;
    if (this.logo) {
      const h = 9;
      doc.addImage(this.logo.data, "PNG", MARGIN, 10, (this.logo.width / this.logo.height) * h, h);
    } else {
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
      doc.text(printable(this.settings.companyShortName || this.settings.companyName), MARGIN, 16);
    }
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...ACCENT);
    doc.text("DRONE SHOW REPORT", PAGE_W - MARGIN, 14, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(printable(this.reportTitle), PAGE_W - MARGIN, 18.5, { align: "right" });
    doc.setDrawColor(...RULE).setLineWidth(0.3).line(MARGIN, 23, PAGE_W - MARGIN, 23);
    this.y = 30;
  }

  newPage() {
    this.doc.addPage();
    this.header();
  }

  /** Start a new page if `height` more millimetres will not fit. */
  room(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }

  section(title: string) {
    this.room(16);
    const { doc } = this;
    doc.setFillColor(...ACCENT).rect(MARGIN, this.y - 3.6, 1.2, 4.6, "F");
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...INK);
    doc.text(title.toUpperCase(), MARGIN + 3.5, this.y);
    this.y += 6;
  }

  note(text: string) {
    const { doc } = this;
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
    const lines = doc.splitTextToSize(printable(text), CONTENT_W);
    this.room(lines.length * 4.4 + 2);
    doc.text(lines, MARGIN, this.y);
    this.y += lines.length * 4.4 + 4;
  }

  paragraph(text: string) {
    const { doc } = this;
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
    for (const line of doc.splitTextToSize(printable(text), CONTENT_W) as string[]) {
      this.room(5);
      doc.text(line, MARGIN, this.y);
      this.y += 4.8;
    }
    this.y += 3;
  }

  /** Label / value pairs, two to a row; a `wide` pair takes the full row. */
  fields(pairs: Array<{ label: string; value: string; wide?: boolean; color?: [number, number, number] }>) {
    const { doc } = this;
    const colW = (CONTENT_W - 6) / 2;
    let i = 0;
    while (i < pairs.length) {
      const row = pairs[i].wide || !pairs[i + 1] || pairs[i + 1].wide ? [pairs[i]] : [pairs[i], pairs[i + 1]];
      const widths = row.length === 1 && row[0].wide ? [CONTENT_W] : [colW, colW];
      doc.setFont("helvetica", "normal").setFontSize(9.5);
      const wrapped = row.map((p, k) => doc.splitTextToSize(printable(p.value), widths[k]) as string[]);
      const height = 4 + Math.max(...wrapped.map((w) => w.length)) * 4.6 + 2.5;
      this.room(height);
      row.forEach((p, k) => {
        const x = MARGIN + k * (colW + 6);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
        doc.text(p.label.toUpperCase(), x, this.y);
        doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...(p.color ?? INK));
        doc.text(wrapped[k], x, this.y + 4.4);
      });
      this.y += height;
      doc.setDrawColor(...RULE).setLineWidth(0.2).line(MARGIN, this.y - 1.6, PAGE_W - MARGIN, this.y - 1.6);
      this.y += 1.5;
      i += row.length;
    }
    this.y += 3;
  }

  table(headers: string[], widths: number[], rows: string[][]) {
    const { doc } = this;
    const drawHead = () => {
      doc.setFillColor(245, 245, 245).rect(MARGIN, this.y - 4, CONTENT_W, 6.5, "F");
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
      let x = MARGIN + 1.5;
      headers.forEach((h, k) => {
        doc.text(h.toUpperCase(), x, this.y);
        x += widths[k];
      });
      this.y += 6;
    };
    this.room(14);
    drawHead();
    for (const row of rows) {
      doc.setFont("helvetica", "normal").setFontSize(9);
      const wrapped = row.map((cell, k) => doc.splitTextToSize(printable(cell), widths[k] - 3) as string[]);
      const height = Math.max(...wrapped.map((w) => w.length)) * 4.3 + 2.4;
      if (this.y + height > BOTTOM) {
        this.newPage();
        drawHead();
      }
      let x = MARGIN + 1.5;
      doc.setTextColor(...INK);
      wrapped.forEach((lines, k) => {
        doc.text(lines, x, this.y);
        x += widths[k];
      });
      this.y += height;
      doc.setDrawColor(...RULE).setLineWidth(0.2).line(MARGIN, this.y - 3.2, PAGE_W - MARGIN, this.y - 3.2);
    }
    this.y += 4;
  }

  /** An image across the content width (or up to `maxHeight`), keeping its shape. */
  image(img: LoadedImage, maxHeight = 150) {
    let w = CONTENT_W;
    let h = (img.height / img.width) * w;
    if (h > maxHeight) {
      h = maxHeight;
      w = (img.width / img.height) * h;
    }
    this.room(h + 4);
    const x = MARGIN + (CONTENT_W - w) / 2;
    this.doc.addImage(img.data, img.data.startsWith("data:image/jpeg") ? "JPEG" : "PNG", x, this.y, w, h);
    this.doc.setDrawColor(...RULE).setLineWidth(0.3).rect(x, this.y, w, h);
    this.y += h + 6;
  }

  /** Company line and page numbers on every page, once all pages exist. */
  finish() {
    const { doc } = this;
    const total = doc.getNumberOfPages();
    const company = [this.settings.companyName, this.settings.companyPhone, this.settings.companyEmail]
      .filter(Boolean)
      .join("  ·  ");
    for (let page = 1; page <= total; page++) {
      doc.setPage(page);
      doc.setDrawColor(...RULE).setLineWidth(0.3).line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13);
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
      doc.text(printable(company), MARGIN, PAGE_H - 8.5);
      doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - 8.5, { align: "right" });
    }
    return doc;
  }
}

/** Build the report and start the download. */
export async function downloadShowReport(input: ShowReportInput): Promise<void> {
  const { doc, fileName } = await buildShowReport(input);
  doc.save(fileName);
}

/** The report as a jsPDF document, with the file name it should save as. */
export async function buildShowReport({ show, client, pilots, settings }: ShowReportInput): Promise<{ doc: jsPDF; fileName: string }> {
  const [logo, zoneImage, layoutImage] = await Promise.all([
    loadImage("/logo-on-light.png", false),
    loadImage(show.zoneCheck?.screenshotUrl ?? "", true),
    loadImage(show.layout?.imageUrl ?? "", true),
  ]);

  const clientName = client?.name || show.client || "Client not set";
  const generated = `Generated ${stamp.format(new Date())}`;
  const r = new ReportWriter(logo, settings, generated);
  const { doc } = r;

  /* ---------- title ---------- */
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
  doc.text(printable(clientName), MARGIN, r.y + 2);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  const where = [show.area, show.location, show.state].filter((v) => v?.trim()).join(", ");
  doc.text(printable([where, show.showDate ? formatDate(show.showDate) : ""].filter(Boolean).join("  ·  ")), MARGIN, r.y + 8);
  // Stage and zone as small coloured tags on the right.
  const tag = (label: string, rgb: [number, number, number], right: number) => {
    doc.setFont("helvetica", "bold").setFontSize(8);
    const w = doc.getTextWidth(label) + 6;
    doc.setFillColor(...rgb).roundedRect(right - w, r.y - 2.5, w, 6, 3, 3, "F");
    doc.setTextColor(255, 255, 255).text(label, right - w / 2, r.y + 1.6, { align: "center" });
    return right - w - 2;
  };
  const next = tag(`${ZONES[show.zone].label.toUpperCase()} ZONE`, ZONE_RGB[show.zone], PAGE_W - MARGIN);
  tag(SHOW_STATUSES[show.showStatus].toUpperCase(), [64, 64, 64], next);
  r.y += 16;

  /* ---------- show ---------- */
  r.section("Show summary");
  const time = [formatTime(show.showStartTime), formatTime(show.showEndTime)].filter(Boolean).join(" – ");
  r.fields([
    { label: "Show date", value: show.showDate ? formatDate(show.showDate) : "Not fixed yet" },
    { label: "Show time", value: or(time) },
    { label: "Drones", value: show.droneCount ? String(show.droneCount) : "—" },
    { label: "Show amount", value: show.showAmount ? money(show.showAmount) : "—" },
    { label: "Stage", value: SHOW_STATUSES[show.showStatus] },
    { label: "Booked on", value: show.bookingDate ? formatDate(show.bookingDate) : "—" },
    { label: "Permission", value: PERMISSION_STATUSES[show.permission] },
    { label: "Zone", value: `${ZONES[show.zone].label} — ${ZONES[show.zone].hint}`, color: ZONE_RGB[show.zone] },
  ]);

  /* ---------- client ---------- */
  r.section("Client & contact");
  r.fields([
    { label: "Client", value: clientName },
    { label: "Client type", value: client ? CLIENT_TYPES[client.type] : "—" },
    { label: "Contact person", value: or(show.contactName || client?.contactName || show.person) },
    { label: "Phone", value: or(show.contactPhone || client?.contactPhone || show.contact) },
    { label: "Email", value: or(client?.email) },
    { label: "GSTIN", value: or(client?.gstin) },
    { label: "Client address", value: or([client?.address, client?.city, client?.state].filter((v) => v?.trim()).join(", ")), wide: true },
  ]);

  /* ---------- venue ---------- */
  r.section("Venue");
  r.fields([
    { label: "State", value: or(show.state) },
    { label: "City / district", value: or(show.location) },
    { label: "Area / locality", value: or(show.area) },
    { label: "Takeoff coordinates", value: or(show.coordinates) },
    { label: "Venue address", value: or(show.venueAddress), wide: true },
  ]);

  /* ---------- crew ---------- */
  r.section("Flight crew");
  const crew = show.pilotIds.map((id) => pilots.find((p) => p.id === id)).filter((p): p is Pilot => Boolean(p));
  if (crew.length === 0) {
    r.note(show.person ? `Pilot (older record): ${show.person}` : "No pilots assigned to this show.");
  } else {
    const certificate: Record<CertificateState, string> = {
      valid: "Valid",
      expiring: "Expiring soon",
      expired: "Expired",
      missing: "Not on file",
    };
    r.table(
      ["#", "Pilot", "Phone", "DGCA RPC no.", "Valid until", "Certificate"],
      [8, 42, 28, 46, 28, 30],
      crew.map((p, i) => [
        String(i + 1),
        p.name,
        or(p.phone),
        or(p.rpcNumber),
        p.rpcValidUntil ? formatDate(p.rpcValidUntil) : "—",
        certificate[certificateState(p)],
      ]),
    );
  }

  if (show.notes?.trim()) {
    r.section("Notes");
    r.paragraph(show.notes);
  }

  /* ---------- airspace ---------- */
  r.newPage();
  r.section("Airspace check — DigitalSky");
  const check = show.zoneCheck;
  if (!check) {
    r.note("The coordinates have not been checked on the DigitalSky airspace map. Open the show, edit it and use Check zone.");
  } else {
    const stale = check.coordinates.trim() !== show.coordinates.trim();
    r.fields([
      { label: "DigitalSky result", value: `${ZONES[check.zone].label} zone`, color: ZONE_RGB[check.zone] },
      { label: "Checked on", value: when(check.checkedAt) },
      { label: "Coordinates checked", value: check.coordinates },
      { label: "Zone on the show", value: `${ZONES[show.zone].label}${show.zone !== check.zone ? " (changed by hand)" : ""}` },
    ]);
    if (stale) r.note(`The show's coordinates (${show.coordinates || "none"}) have changed since this check.`);
    if (check.details.length > 0) {
      r.table(["#", "Restricted area the point falls in"], [10, CONTENT_W - 10], check.details.map((d, i) => [String(i + 1), d]));
    } else {
      r.note("Not inside any restricted area on the DigitalSky map.");
    }
    if (zoneImage) r.image(zoneImage, 120);
    else if (check.screenshotUrl) r.note("The zone map image could not be loaded for this report.");
  }

  /* ---------- layout ---------- */
  r.newPage();
  r.section("Show layout — Maps");
  const layout = show.layout;
  if (!layout) {
    r.note("No layout has been saved to this show. Use Plan layout on the show, then Save to show in the planner's report window.");
  } else {
    if (layoutImage) r.image(layoutImage, 125);
    else r.note("The layout map image could not be loaded for this report.");
    const sq = (m2: number) => `${Math.round(m2).toLocaleString("en-IN")} m² (${Math.round(m2 * 10.7639).toLocaleString("en-IN")} ft²)`;
    r.fields([
      { label: "Formation", value: `${layout.rows} × ${layout.cols} grid — ${layout.drones} drones` },
      { label: "Spacing", value: `${layout.spacingMeters} m between drones` },
      { label: "Flight altitude", value: `${layout.altitudeMeters} m AGL` },
      { label: "Grid rotation", value: `${layout.angleDeg}°` },
      { label: "Formation footprint", value: sq(layout.droneAreaSqM) },
      { label: "Pilot station", value: layout.operator },
      {
        label: "Safety barricade",
        value: layout.barricadeFeet
          ? `${layout.barricadeWidthM.toFixed(1)} m × ${layout.barricadeHeightM.toFixed(1)} m, ${layout.barricadeFeet} ft buffer`
          : "Not set",
      },
      { label: "Barricaded area", value: layout.barricadeAreaSqM ? sq(layout.barricadeAreaSqM) : "—" },
      { label: "Layout centre", value: `${layout.center.lat.toFixed(6)}, ${layout.center.lng.toFixed(6)}` },
      { label: "Saved on", value: when(layout.savedAt) },
    ]);
  }

  const file = [clientName, show.location, show.showDate].filter(Boolean).join(" ").replace(/[^a-zA-Z0-9]+/g, "-");
  return { doc: r.finish(), fileName: `Show-report-${file || show.id}.pdf` };
}
