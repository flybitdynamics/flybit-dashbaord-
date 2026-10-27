import "server-only";

import https from "node:https";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import sharp from "sharp";
import type { Zone } from "./types";

/** Draws the evidence image for a zone check: an OpenStreetMap view around
 *  the takeoff point, DigitalSky's own zone shapes over it in the colours its
 *  map uses, a pin, and a caption saying what DigitalSky answered. Built from
 *  map tiles with sharp, so the server needs no browser. */

const WIDTH = 960;
const HEIGHT = 600;
const CAPTION = 132;
/** Zoom 15 is about 4 m a pixel in India — the image spans 3–4 km, enough to
 *  see the venue and what is around it. */
const ZOOM = 15;
const TILE = 256;
/** Any XYZ raster tile server works; set MAP_TILE_URL (with {z}, {x}, {y})
 *  and MAP_TILE_ATTRIBUTION to use another. OpenStreetMap's own server
 *  renders uncached tiles on demand, so a first look at a new area can take
 *  a while — hence the long wait per tile. */
const TILE_URL = process.env.MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.MAP_TILE_ATTRIBUTION || "Map © OpenStreetMap contributors";
const TILE_TIMEOUT = 20_000;
/** Tile servers ask apps to name themselves and keep connections few. */
const USER_AGENT = "FlyBit-Dashboard/1.0 (drone show zone check)";
const tileAgent = new https.Agent({ keepAlive: true, maxSockets: 4, family: 4 });

/** DigitalSky's zone shapes, as vector tiles from the server its map draws
 *  from. Zoom 13 needs only a few tiles for the whole image and still places
 *  edges to about a pixel. */
const ZONE_TILES = "https://digitalsky.aai.aero/maps/dataserver_5000";
const ZONE_ZOOM = 13;

/** The DigitalSky map's own layers, in its drawing order and with its paint:
 *  every state is tinted green, then the restricted areas go over it at 50%,
 *  then their outlines. Widths are the map's at zoom 15. */
const ZONE_LAYERS: Array<{ source: string; fill?: string; line?: string; width?: number }> = [
  { source: "state", line: "#000000", width: 5 },
  { source: "state", fill: "rgb(193, 229, 153)" },
  { source: "subdistrict", line: "#a9a9a9", width: 5 },
  { source: "airport_red", fill: "rgb(255, 0, 0)" },
  { source: "airport_yellow_5_8", fill: "rgb(255, 255, 0)" },
  { source: "airport_yellow_8_12", fill: "rgb(255, 255, 0)" },
  { source: "ib_25", fill: "rgb(255, 0, 0)" },
  { source: "red_zones", fill: "rgb(255, 0, 0)" },
  { source: "tem_red_zones", fill: "rgb(255, 0, 0)" },
  { source: "airport_red", line: "#000000", width: 1 },
  { source: "airport_yellow_5_8", line: "#000000", width: 1 },
  { source: "airport_yellow_8_12", line: "#000000", width: 1 },
  { source: "ib_25", line: "#000000", width: 1 },
  { source: "red_zones", line: "#000000", width: 1 },
  { source: "tem_red_zones", line: "#000000", width: 1 },
];

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "Geist-Regular.ttf");

const ZONE_STYLE: Record<Zone, { fill: string; label: string }> = {
  green: { fill: "#10b981", label: "GREEN ZONE" },
  yellow: { fill: "#f59e0b", label: "YELLOW ZONE" },
  red: { fill: "#ef4444", label: "RED ZONE" },
};

export interface ZoneMapInput {
  lat: number;
  lon: number;
  zone: Zone;
  details: string[];
  checkedAt: Date;
}

/** Web Mercator: where a point sits, in pixels, on the whole world at `zoom`. */
function worldPixel(lat: number, lon: number, zoom: number): [number, number] {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return [x, y];
}

/** Over IPv4 (see the agent): tile servers publish IPv6 addresses first,
 *  and on a network without an IPv6 route Node waits on those until it
 *  times out. */
function download(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { agent: tileAgent, headers: { "User-Agent": USER_AGENT }, timeout: TILE_TIMEOUT },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${url} answered ${res.statusCode}.`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`${url} timed out.`)));
    req.on("error", reject);
  });
}

/** The zone layers over the map, as SVG the size of the map area. Each tile's
 *  shapes are clipped to that tile, so the edges a tile server adds where it
 *  cuts a shape never show as lines. */
async function zoneOverlay(left: number, top: number, width: number, height: number): Promise<string> {
  const scale = TILE * 2 ** (ZOOM - ZONE_ZOOM); // one zone tile, in image pixels
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = Math.floor(left / scale); x <= Math.floor((left + width - 1) / scale); x++) {
    for (let y = Math.floor(top / scale); y <= Math.floor((top + height - 1) / scale); y++) tiles.push({ x, y });
  }

  const sources = Array.from(new Set(ZONE_LAYERS.map((layer) => layer.source)));
  const shapes = new Map<string, string[]>(); // source → one SVG path per tile, already clipped
  await Promise.all(
    sources.flatMap((source) =>
      tiles.map(async ({ x, y }, i) => {
        let buffer: Buffer;
        try {
          buffer = await download(`${ZONE_TILES}/${source}/${ZONE_ZOOM}/${x}/${y}`);
        } catch (err) {
          console.warn("Zone tile failed:", err instanceof Error ? err.message : err);
          return;
        }
        const layer = buffer.length ? new VectorTile(new PbfReader(buffer)).layers.default : undefined;
        if (!layer) return;
        const unit = scale / layer.extent;
        const ox = x * scale - left;
        const oy = y * scale - top;
        let d = "";
        for (let f = 0; f < layer.length; f++) {
          const feature = layer.feature(f);
          if (feature.type !== 3) continue; // polygons only
          for (const ring of feature.loadGeometry()) {
            d += ring
              .map((p, k) => `${k ? "L" : "M"}${(ox + p.x * unit).toFixed(1)} ${(oy + p.y * unit).toFixed(1)}`)
              .join("") + "Z";
          }
        }
        if (!d) return;
        const list = shapes.get(source) ?? [];
        list[i] = d;
        shapes.set(source, list);
      }),
    ),
  );

  const clips = tiles
    .map(({ x, y }, i) => `<clipPath id="t${i}"><rect x="${x * scale - left}" y="${y * scale - top}" width="${scale}" height="${scale}"/></clipPath>`)
    .join("");
  const drawn = ZONE_LAYERS.flatMap((layer) =>
    (shapes.get(layer.source) ?? []).flatMap((d, i) =>
      d
        ? [
            layer.fill
              ? `<path clip-path="url(#t${i})" d="${d}" fill="${layer.fill}" fill-opacity="0.5"/>`
              : `<path clip-path="url(#t${i})" d="${d}" fill="none" stroke="${layer.line}" stroke-width="${layer.width}" stroke-linejoin="round"/>`,
          ]
        : [],
    ),
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${clips}</defs>${drawn}</svg>`;
}

/** One tile, or null — a missing tile leaves a grey square rather than
 *  losing the whole image. */
async function fetchTile(x: number, y: number): Promise<Buffer | null> {
  const url = TILE_URL.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
  // One retry: a tile server under load drops the odd request.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await download(url);
    } catch (err) {
      console.warn(`Zone map tile failed (try ${attempt} of 2):`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

const escapeMarkup = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One line of caption text as a transparent image. */
function renderLine(text: string, size: number, color: string) {
  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      font: `Geist ${size}`,
      fontfile: FONT_FILE,
      dpi: 72,
      rgba: true,
      wrap: "none",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

/** One line of caption text, never wider than `width`: a long line (a point
 *  inside many restricted areas, say) is cut short with an ellipsis, since
 *  sharp refuses to paste anything bigger than the image. */
async function textImage(text: string, size: number, color: string, width: number): Promise<Buffer> {
  let line = text;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, info } = await renderLine(line, size, color);
    if (info.width <= width) return data;
    // Cut in proportion to the overflow, a little extra for the ellipsis.
    const keep = Math.floor(line.length * (width / info.width)) - 2;
    line = `${text.slice(0, Math.max(1, keep)).trimEnd()}…`;
  }
  // Still too wide after several cuts: crop it rather than lose the image.
  const { data, info } = await renderLine(line, size, color);
  return sharp(data).extract({ left: 0, top: 0, width: Math.min(info.width, width), height: info.height }).png().toBuffer();
}

const PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
  <path d="M18 47C18 47 34 28.5 34 18A16 16 0 0 0 2 18C2 28.5 18 47 18 47Z" fill="#111827" stroke="#fff" stroke-width="2.5"/>
  <circle cx="18" cy="18" r="6" fill="#fff"/>
</svg>`;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export async function renderZoneMap({ lat, lon, zone, details, checkedAt }: ZoneMapInput): Promise<Buffer> {
  const mapHeight = HEIGHT - CAPTION;
  const [px, py] = worldPixel(lat, lon, ZOOM);
  const left = Math.round(px - WIDTH / 2);
  const top = Math.round(py - mapHeight / 2);

  const firstX = Math.floor(left / TILE);
  const firstY = Math.floor(top / TILE);
  const lastX = Math.floor((left + WIDTH - 1) / TILE);
  const lastY = Math.floor((top + mapHeight - 1) / TILE);

  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = firstX; x <= lastX; x++) for (let y = firstY; y <= lastY; y++) tiles.push({ x, y });
  const [images, overlay] = await Promise.all([
    Promise.all(tiles.map(({ x, y }) => fetchTile(x, y))),
    zoneOverlay(left, top, WIDTH, mapHeight),
  ]);
  if (images.every((image) => !image)) throw new Error("No map tiles could be loaded.");

  const map = await sharp({
    create: { width: WIDTH, height: mapHeight, channels: 4, background: "#e5e7eb" },
  })
    .composite(
      tiles.flatMap(({ x, y }, i) => {
        const input = images[i];
        return input ? [{ input, left: x * TILE - left, top: y * TILE - top }] : [];
      }),
    )
    .png()
    .toBuffer();

  const style = ZONE_STYLE[zone];
  const pillWidth = 150;
  const captionSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${CAPTION}">
    <rect width="${WIDTH}" height="${CAPTION}" fill="#ffffff"/>
    <rect width="${WIDTH}" height="1" fill="#d4d4d4"/>
    <rect x="20" y="18" width="${pillWidth}" height="30" rx="15" fill="${style.fill}"/>
  </svg>`;

  const restricted =
    details.length === 0
      ? "Not inside any restricted area on the DigitalSky map."
      : details.slice(0, 2).join("  ·  ") + (details.length > 2 ? `  ·  and ${details.length - 2} more` : "");

  const textWidth = WIDTH - 40;
  const [pill, heading, where, areas, credit] = await Promise.all([
    textImage(style.label, 15, "#ffffff", pillWidth),
    textImage("DigitalSky airspace check (digitalsky.aai.aero)", 17, "#111827", textWidth - pillWidth - 16),
    textImage(`${lat.toFixed(6)}, ${lon.toFixed(6)}  ·  checked ${timeFormat.format(checkedAt)} IST`, 14, "#525252", textWidth),
    textImage(restricted, 13, "#404040", textWidth),
    textImage(`${TILE_ATTRIBUTION}  ·  Zones: DigitalSky airspace map (AAI)`, 11, "#a3a3a3", textWidth),
  ]);
  const pillMeta = await sharp(pill).metadata();

  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: "#ffffff" },
  })
    .composite([
      { input: map, left: 0, top: 0 },
      { input: Buffer.from(overlay), left: 0, top: 0 },
      // The pin's tip is the point.
      { input: Buffer.from(PIN), left: Math.round(WIDTH / 2 - 18), top: Math.round(mapHeight / 2 - 48) },
      { input: Buffer.from(captionSvg), left: 0, top: mapHeight },
      { input: pill, left: 20 + Math.round((pillWidth - (pillMeta.width ?? 0)) / 2), top: mapHeight + 24 },
      { input: heading, left: 20 + pillWidth + 16, top: mapHeight + 23 },
      { input: where, left: 20, top: mapHeight + 60 },
      { input: areas, left: 20, top: mapHeight + 84 },
      { input: credit, left: 20, top: mapHeight + 108 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
