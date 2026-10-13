import { NextRequest, NextResponse } from "next/server";
import { uploadInvoiceToDrive } from "@/app/lib/google-drive";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileName = (formData.get("fileName") as string) || "Invoice.pdf";
    const folderId = (formData.get("folderId") as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadInvoiceToDrive({
      fileName,
      pdfBuffer: buffer,
      folderId,
    });

    return NextResponse.json({
      success: true,
      fileId: result.id,
      fileName: result.name,
      webViewLink: result.webViewLink,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upload invoice to Google Drive.";
    console.error("Drive upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
