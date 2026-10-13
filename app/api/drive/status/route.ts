import { NextResponse } from "next/server";
import { getSavedRefreshToken } from "@/app/lib/google-drive";

export async function GET() {
  try {
    const hasCredentials = Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
    const token = await getSavedRefreshToken();

    return NextResponse.json({
      configured: hasCredentials,
      connected: Boolean(token),
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error checking Drive status";
    return NextResponse.json({
      configured: false,
      connected: false,
      error: message,
    });
  }
}
