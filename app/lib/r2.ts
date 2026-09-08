import { S3Client } from "@aws-sdk/client-s3";

/** Cloudflare R2 speaks the S3 API, so the AWS SDK talks to it directly.
 *
 *  Unlike the Firebase config, these are real secrets: no NEXT_PUBLIC_
 *  prefix, so they stay on the server and never reach the browser bundle.
 *  Uploads go through /api/upload rather than straight from the page. */
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "";
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";

/** Where uploaded objects are read back from — the bucket's public r2.dev
 *  address or a custom domain. Trailing slash is trimmed at use. */
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

/** Default top-level folder inside the bucket. */
export const R2_FOLDER = process.env.R2_FOLDER || "CRM";

export const isR2Configured = Boolean(
  R2_ACCOUNT_ID && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY,
);

export const R2_SETUP_HINT =
  "Add R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_URL to .env.local.";

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!isR2Configured) throw new Error(R2_SETUP_HINT);
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/** Size and type limits for a receipt: a photo or a PDF. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
