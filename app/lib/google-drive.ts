import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const DRIVE_SETTINGS_DOC = ["settings", "drive"] as const;
const TOKENS_FILE = path.join(process.cwd(), ".drive-tokens.json");

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/drive/callback`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/drive/callback`
        : "http://localhost:3000/api/drive/callback");

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env for Option 2 (Google Drive OAuth)."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Generates the Google sign-in consent URL */
export function getDriveAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

/** Exchanges authorization code for tokens and saves refresh token */
export async function handleDriveAuthCallback(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (tokens.refresh_token) {
    // 1. Save to local .drive-tokens.json
    try {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf8");
    } catch (err) {
      console.warn("Could not write .drive-tokens.json:", err);
    }

    // 2. Also try writing to .env if not present
    try {
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf8");
        if (envContent.includes("GOOGLE_DRIVE_REFRESH_TOKEN=")) {
          envContent = envContent.replace(
            /GOOGLE_DRIVE_REFRESH_TOKEN=.*/,
            `GOOGLE_DRIVE_REFRESH_TOKEN="${tokens.refresh_token}"`
          );
        } else {
          envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN="${tokens.refresh_token}"\n`;
        }
        fs.writeFileSync(envPath, envContent, "utf8");
      }
    } catch (err) {
      console.warn("Could not update .env with refresh token:", err);
    }

    // 3. Try to save to Firestore if available
    try {
      const db = getDb();
      if (db) {
        await setDoc(
          doc(db, ...DRIVE_SETTINGS_DOC),
          {
            refreshToken: tokens.refresh_token,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn("Could not save refresh token to Firestore:", err);
    }
  }

  return tokens;
}

/** Retrieves saved refresh token from environment variables, local file, or Firestore */
export async function getSavedRefreshToken(): Promise<string | null> {
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  }

  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
      if (data?.refresh_token) {
        return data.refresh_token;
      }
    }
  } catch (err) {
    console.warn("Could not read .drive-tokens.json:", err);
  }

  try {
    const db = getDb();
    if (db) {
      const snap = await getDoc(doc(db, ...DRIVE_SETTINGS_DOC));
      if (snap.exists() && snap.data()?.refreshToken) {
        return snap.data().refreshToken as string;
      }
    }
  } catch {
    // Ignore Firestore read error
  }

  return null;
}

/** Gets an authenticated Google Drive client using saved refresh token */
export async function getAuthenticatedDrive() {
  const refreshToken = await getSavedRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Google Drive is not connected yet. Please connect your Google account to authorize invoice uploads."
    );
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/** Uploads a PDF to the configured Google Drive folder, deleting any existing file with the same name to prevent duplicates */
export async function uploadInvoiceToDrive({
  fileName,
  pdfBuffer,
  folderId,
}: {
  fileName: string;
  pdfBuffer: Buffer;
  folderId?: string;
}) {
  const drive = await getAuthenticatedDrive();
  const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!targetFolder) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured in .env.");
  }

  // 1. Search for any existing file(s) with the same name in the target folder to prevent duplicates
  let hadExisting = false;
  try {
    const escapedName = fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const existingRes = await drive.files.list({
      q: `'${targetFolder}' in parents and name = '${escapedName}' and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
      pageSize: 50,
    });

    const existingFiles = existingRes.data.files || [];
    if (existingFiles.length > 0) {
      hadExisting = true;
      for (const f of existingFiles) {
        if (f.id) {
          try {
            await drive.files.delete({ fileId: f.id });
            console.log(`[Drive] Overwriting: deleted existing duplicate ${f.name} (${f.id})`);
          } catch (delErr) {
            console.warn(`[Drive] Could not delete existing file ${f.id}:`, delErr);
          }
        }
      }
    }
  } catch (searchErr) {
    console.warn("[Drive] Could not search for existing duplicate files:", searchErr);
  }

  // 2. Upload the new PDF
  const { Readable } = await import("node:stream");
  const stream = new Readable();
  stream.push(pdfBuffer);
  stream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [targetFolder],
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: stream,
    },
    fields: "id, name, webViewLink, webContentLink",
  });

  return {
    ...response.data,
    overwritten: hadExisting,
  };
}
