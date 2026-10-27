import "server-only";

import type { Zone } from "./types";

/** Asks the DigitalSky airspace map which zones a point falls in.
 *
 *  This is the request the map itself sends when you click a point on
 *  digitalsky.aai.aero — not a published API, so it may change without
 *  notice. When it fails, the desk says so and the zone stays a manual pick. */
const CLICK_LOOKUP = "https://digitalsky.aai.aero/maps/server_8000/api/fetch_click_data";

/** The lookup answers with one list per layer; any entry means the point is
 *  inside that layer. Unknown layers count as yellow, so a new restriction
 *  on their side is never read as green on ours. */
const LAYERS: Record<string, { zone: Zone; label: string }> = {
  redzone: { zone: "red", label: "Red zone" },
  tempredzone: { zone: "red", label: "Temporary red zone" },
  airportred: { zone: "red", label: "Airport red zone" },
  airportyellow0_5: { zone: "yellow", label: "Airport yellow zone (0–5 km)" },
  airportyellow5_12: { zone: "yellow", label: "Airport yellow zone (5–12 km)" },
  costal_25: { zone: "yellow", label: "Coastal 25 km" },
};

const RANK: Record<Zone, number> = { green: 0, yellow: 1, red: 2 };

type ZoneEntry = Record<string, unknown>;

/** A readable name for one restricted area from the lookup. */
function describe(entry: ZoneEntry): string {
  const pick = (key: string) => {
    const value = entry[key];
    return typeof value === "string" && value && value !== "None" ? value : "";
  };
  const name = pick("air_name") || pick("agency_name") || pick("geozone_title");
  const code = pick("geozone_name") || pick("name");
  return [name, code && code !== name ? `(${code})` : ""].filter(Boolean).join(" ");
}

export function classify(zones: Record<string, ZoneEntry[] | undefined>): { zone: Zone; details: string[] } {
  let zone: Zone = "green";
  const details: string[] = [];
  for (const [key, entries] of Object.entries(zones)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const layer = LAYERS[key] ?? { zone: "yellow" as Zone, label: key };
    if (RANK[layer.zone] > RANK[zone]) zone = layer.zone;
    for (const entry of entries) {
      const what = describe(entry);
      details.push(what ? `${layer.label} — ${what}` : layer.label);
    }
  }
  return { zone, details: Array.from(new Set(details)) };
}

export async function lookUpZone(lat: number, lon: number): Promise<{ zone: Zone; details: string[] }> {
  const res = await fetch(CLICK_LOOKUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Latitude: lat, Longitude: lon }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`DigitalSky answered ${res.status} for this point.`);
  const body = (await res.json().catch(() => null)) as { zones?: Record<string, ZoneEntry[]> } | null;
  if (!body?.zones) throw new Error("DigitalSky did not return zone data for this point.");
  return classify(body.zones);
}
