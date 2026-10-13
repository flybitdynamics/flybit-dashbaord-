import { NextRequest, NextResponse } from "next/server";
import { handleDriveAuthCallback } from "@/app/lib/google-drive";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      new URL(`/invoices?drive_error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/invoices?drive_error=missing_code", baseUrl)
    );
  }

  try {
    await handleDriveAuthCallback(code);
    return NextResponse.redirect(
      new URL("/invoices?drive=connected", baseUrl)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "auth_failed";
    console.error("Failed to exchange Google Drive auth code:", err);
    return NextResponse.redirect(
      new URL(`/invoices?drive_error=${encodeURIComponent(message)}`, baseUrl)
    );
  }
}
