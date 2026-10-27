import { NextResponse } from "next/server";
import { R2_PUBLIC_URL } from "@/app/lib/r2";

/** Hands an image from the desk's own R2 bucket to the browser, so the show
 *  report can put it in a PDF. The bucket's public address sends no CORS
 *  headers, so the page cannot read those images directly. Only addresses
 *  inside the bucket are passed through — this is not an open proxy. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const base = R2_PUBLIC_URL.replace(/\/$/, "");
  if (!base || !url.startsWith(`${base}/`)) {
    return NextResponse.json({ error: "Only images saved by the desk can be fetched." }, { status: 400 });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return NextResponse.json({ error: `The image answered ${res.status}.` }, { status: 502 });
    }
    return new NextResponse(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `The image could not be fetched: ${message}` }, { status: 502 });
  }
}
