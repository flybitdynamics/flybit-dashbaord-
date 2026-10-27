import { NextResponse } from "next/server";
import { lookUpZone } from "@/app/lib/digitalsky";
import { parseCoordinates, type ZoneCheck } from "@/app/lib/types";

/** The zone for a point, straight from DigitalSky. Quick on purpose: the map
 *  image is made separately by /api/zone-check/image, so a slow tile server
 *  never holds up the answer. */
export async function POST(req: Request) {
  let coordinates = "";
  try {
    ({ coordinates = "" } = (await req.json()) as { coordinates?: string });
  } catch {
    // Falls through to the coordinates check below.
  }

  const point = parseCoordinates(coordinates);
  if (!point) {
    return NextResponse.json(
      { error: "Enter coordinates as latitude, longitude in India — e.g. 21.704094, 72.998823." },
      { status: 400 },
    );
  }

  try {
    const [lat, lon] = point;
    const result = await lookUpZone(lat, lon);
    const check: ZoneCheck = {
      zone: result.zone,
      coordinates: coordinates.trim(),
      screenshotUrl: "",
      checkedAt: new Date().toISOString(),
      details: result.details,
    };
    return NextResponse.json({ check });
  } catch (err) {
    console.error("Zone check failed:", err);
    const message = err instanceof Error ? err.message : "The DigitalSky lookup failed.";
    return NextResponse.json({ error: `Could not check DigitalSky: ${message}` }, { status: 502 });
  }
}
