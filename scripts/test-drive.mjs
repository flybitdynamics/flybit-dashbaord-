import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const clientEmail = env.GOOGLE_DRIVE_CLIENT_EMAIL?.replace(/^"|"$/g, "");
let privateKey = env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/^"|"$/g, "");
if (privateKey) privateKey = privateKey.replace(/\\n/g, "\n");
const folderId = env.GOOGLE_DRIVE_FOLDER_ID?.replace(/^"|"$/g, "");

const dateRes = await fetch("https://oauth2.googleapis.com");
const serverNow = Math.floor(new Date(dateRes.headers.get("date")).getTime() / 1000);

const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
const claim = Buffer.from(JSON.stringify({
  iss: clientEmail,
  scope: "https://www.googleapis.com/auth/drive",
  aud: "https://oauth2.googleapis.com/token",
  exp: serverNow + 3600,
  iat: serverNow - 10,
})).toString("base64url");

const sign = crypto.createSign("RSA-SHA256");
sign.update(`${header}.${claim}`);
const signature = sign.sign(privateKey, "base64url");
const jwt = `${header}.${claim}.${signature}`;

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }),
});

const tokenData = await tokenRes.json();
console.log("Token obtained!");

// Check folder metadata first
const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name,driveId,capabilities`, {
  headers: { Authorization: `Bearer ${tokenData.access_token}` },
});
const folderInfo = await folderRes.json();
console.log("Folder info:", folderInfo);

// Try upload with supportsAllDrives
const metadata = {
  name: "FlyBit_Test_Invoice.pdf",
  parents: [folderId],
};

const boundary = "-------314159265358979323846";
const delimiter = `\r\n--${boundary}\r\n`;
const closeDelimiter = `\r\n--${boundary}--`;

const body = Buffer.concat([
  Buffer.from(
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/pdf\r\n\r\n"
  ),
  Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 300]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF"),
  Buffer.from(closeDelimiter),
]);

const uploadRes = await fetch(
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  }
);

console.log("Upload response:", await uploadRes.json());
