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

/** The signed-in Google account, ready to call Drive with. */
async function getAuthorizedClient() {
  const refreshToken = await getSavedRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Google Drive is not connected yet. Please connect your Google account to authorize invoice uploads."
    );
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/** Gets an authenticated Google Drive client using saved refresh token */
export async function getAuthenticatedDrive() {
  return google.drive({ version: "v3", auth: await getAuthorizedClient() });
}

/* ---------------- show files ---------------- */

const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Every show's folder sits in this one, inside the desk's Drive folder. */
const SHOWS_FOLDER_NAME = "Show files";

const quoteForQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The folder called `name` inside `parentId`, made if it is not there yet. */
export async function ensureFolder(name: string, parentId: string): Promise<{ id: string; url: string }> {
  const drive = await getAuthenticatedDrive();
  const found = await drive.files.list({
    q: `'${parentId}' in parents and name = '${quoteForQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, webViewLink)",
    spaces: "drive",
    pageSize: 1,
  });
  const existing = found.data.files?.[0];
  if (existing?.id) return { id: existing.id, url: existing.webViewLink ?? "" };

  const made = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id, webViewLink",
  });
  if (!made.data.id) throw new Error(`Drive did not make the folder "${name}".`);
  return { id: made.data.id, url: made.data.webViewLink ?? "" };
}

/** A show's own folder: Show files / <name>. A folder saved on the show earlier
 *  is reused as long as it still exists and is not in the bin. */
export async function showFolder(name: string, savedId?: string): Promise<{ id: string; url: string }> {
  const drive = await getAuthenticatedDrive();
  if (savedId) {
    try {
      const saved = await drive.files.get({ fileId: savedId, fields: "id, webViewLink, trashed" });
      if (saved.data.id && !saved.data.trashed) return { id: saved.data.id, url: saved.data.webViewLink ?? "" };
    } catch {
      /* gone — make it again below */
    }
  }
  const root = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!root) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured in .env.");
  const shows = await ensureFolder(SHOWS_FOLDER_NAME, root);
  return ensureFolder(name, shows.id);
}

/** Opens a resumable upload straight from the browser into `folderId`, after
 *  making the sub-folders in `path` ("Photos/Day 1"). The file itself never
 *  passes through this server, so its size is not limited by it. Drive only
 *  lets the browser use the session if it was opened for the page's origin. */
export async function startUpload({
  folderId,
  path: subPath,
  name,
  mimeType,
  size,
  origin,
}: {
  folderId: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
}): Promise<string> {
  let parent = folderId;
  for (const part of subPath.split("/").map((p) => p.trim()).filter(Boolean)) {
    parent = (await ensureFolder(part, parent)).id;
  }

  const auth = await getAuthorizedClient();
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("Could not get a Google Drive access token.");

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(size),
      Origin: origin,
    },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    throw new Error(`Drive would not start the upload (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return location;
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
