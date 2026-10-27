import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET_NAME, R2_FOLDER, R2_PUBLIC_URL, R2_SETUP_HINT, getR2Client, isR2Configured } from "@/app/lib/r2";
import { lookUpZone } from "@/app/lib/digitalsky";
import { renderZoneMap } from "@/app/lib/zone-map";
import { parseCoordinates } from "@/app/lib/types";

/** Tiles from a cold tile server can take a while. */
export const maxDuration = 60;

/** Draws the map image for a zone check and saves it to R2. The zone is
 *  looked up again here rather than taken from the request, so the caption
 *  can only ever say what DigitalSky said. */
export async function POST(req: Request) {
  let coordinates = "";
  try {
    ({ coordinates = "" } = (await req.json()) as { coordinates?: string });
  } catch {
    // Falls through to the coordinates check below.
  }

  const point = parseCoordinates(coordinates);
  if (!point) {
    return NextResponse.json({ error: "Enter coordinates as latitude, longitude in India." }, { status: 400 });
  }
  if (!isR2Configured) {
    return NextResponse.json({ error: R2_SETUP_HINT }, { status: 500 });
  }

  try {
    const [lat, lon] = point;
    const checkedAt = new Date();
    const { zone, details } = await lookUpZone(lat, lon);
    const image = await renderZoneMap({ lat, lon, zone, details, checkedAt });
    const key = `${R2_FOLDER}/zone-checks/${checkedAt.getTime()}_${lat.toFixed(6)}_${lon.toFixed(6)}.png`;
    await getR2Client().send(
      new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: image, ContentType: "image/png" }),
    );
    return NextResponse.json({ url: `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`, zone });
  } catch (err) {
    console.error("Zone check map image failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `The map image could not be made: ${message}` }, { status: 502 });
  }
}
