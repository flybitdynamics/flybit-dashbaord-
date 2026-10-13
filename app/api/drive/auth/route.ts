import { NextResponse } from "next/server";
import { getDriveAuthUrl } from "@/app/lib/google-drive";

export async function GET() {
  try {
    const url = getDriveAuthUrl();
    return NextResponse.redirect(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initiate Google Drive authorization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
