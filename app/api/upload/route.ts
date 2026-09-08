import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  R2_BUCKET_NAME,
  R2_FOLDER,
  R2_PUBLIC_URL,
  R2_SETUP_HINT,
  getR2Client,
  isR2Configured,
} from "@/app/lib/r2";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const customFolder = (formData.get("folder") as string) || R2_FOLDER;

    if (!file) {
      return NextResponse.json({ error: "No file provided in request." }, { status: 400 });
    }

    if (!isR2Configured) {
      return NextResponse.json({ error: R2_SETUP_HINT }, { status: 500 });
    }

    // Without these the route would take a file of any size or kind.
    if (file.size > MAX_UPLOAD_BYTES) {
      const limit = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      return NextResponse.json(
        { error: `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${limit} MB.` },
        { status: 413 },
      );
    }

    const type = file.type || "application/octet-stream";
    if (!ALLOWED_UPLOAD_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Only images (JPG, PNG, WebP, HEIC) and PDFs can be attached." },
        { status: 415 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize filename and construct key in CRM/ folder
    const timestamp = Date.now();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${customFolder}/${timestamp}_${sanitizedOriginalName}`;

    const r2Client = getR2Client();

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: type,
      })
    );

    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      key,
      fileName: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown upload error";
    console.error("R2 Upload Error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
