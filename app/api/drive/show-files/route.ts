import { NextRequest, NextResponse } from "next/server";
import { showFolder, startUpload } from "@/app/lib/google-drive";

/** Show files into Google Drive.
 *  { action: "folder", name, folderId? } → the show's folder, made if needed.
 *  { action: "start", folderId, path, name, mimeType, size } → an upload URL
 *  the browser sends that one file to directly. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: string;
      name?: string;
      folderId?: string;
      path?: string;
      mimeType?: string;
      size?: number;
    };

    if (body.action === "folder") {
      const name = (body.name ?? "").replace(/[\\/]+/g, " ").trim();
      if (!name) return NextResponse.json({ error: "The show needs a name for its folder." }, { status: 400 });
      return NextResponse.json(await showFolder(name, body.folderId));
    }

    if (body.action === "start") {
      if (!body.folderId || !body.name) {
        return NextResponse.json({ error: "Which folder and which file?" }, { status: 400 });
      }
      const uploadUrl = await startUpload({
        folderId: body.folderId,
        path: body.path ?? "",
        name: body.name,
        mimeType: body.mimeType ?? "",
        size: Number(body.size) || 0,
        origin: request.headers.get("origin") ?? request.nextUrl.origin,
      });
      return NextResponse.json({ uploadUrl });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Google Drive did not respond.";
    console.error("Drive show-files error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
