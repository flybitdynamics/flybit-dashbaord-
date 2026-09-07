/**
 * The brand logo ships white, for the dark marketing site. The dashboard is
 * light, so the wordmark is recoloured to ink while the orange sparkles are
 * left exactly as drawn — the same pairing the company letterhead uses.
 *
 *   node scripts/build-logo.mjs
 */
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "public", "logo.png");
const INK = [10, 10, 10];

const { data, info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const recoloured = Buffer.from(data);
let sparkleMinX = info.width;
let sparkleMinY = info.height;
let sparkleMaxX = 0;
let sparkleMaxY = 0;

for (let i = 0; i < recoloured.length; i += info.channels) {
  const [r, g, b, a] = [recoloured[i], recoloured[i + 1], recoloured[i + 2], recoloured[i + 3]];
  if (a < 8) continue;

  // The wordmark is the near-neutral, near-white ink; everything else is brand orange.
  const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 40;
  if (neutral && r > 120) {
    recoloured[i] = INK[0];
    recoloured[i + 1] = INK[1];
    recoloured[i + 2] = INK[2];
  } else if (!neutral) {
    const pixel = i / info.channels;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x < sparkleMinX) sparkleMinX = x;
    if (y < sparkleMinY) sparkleMinY = y;
    if (x > sparkleMaxX) sparkleMaxX = x;
    if (y > sparkleMaxY) sparkleMaxY = y;
  }
}

await sharp(recoloured, { raw: { width: info.width, height: info.height, channels: info.channels } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(ROOT, "public", "logo-on-light.png"));

console.log(`logo-on-light.png  ${info.width}x${info.height}  wordmark recoloured to #0A0A0A`);

// Square app icon: the sparkles alone, which read at 16px where the
// wordmark cannot. Everything that is not brand orange is erased first, so
// no stray letter strokes can creep into the crop.
const sparkleOnly = Buffer.from(data);
for (let i = 0; i < sparkleOnly.length; i += info.channels) {
  const [r, g, b, a] = [sparkleOnly[i], sparkleOnly[i + 1], sparkleOnly[i + 2], sparkleOnly[i + 3]];
  const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 40;
  if (a < 8 || neutral) sparkleOnly[i + 3] = 0;
}

const pad = 14;
const left = Math.max(0, sparkleMinX - pad);
const top = Math.max(0, sparkleMinY - pad);
const right = Math.min(info.width, sparkleMaxX + pad + 1);
const bottom = Math.min(info.height, sparkleMaxY + pad + 1);
const side = Math.max(right - left, bottom - top);

const sparkles = await sharp(sparkleOnly, {
  raw: { width: info.width, height: info.height, channels: info.channels },
})
  .extract({ left, top, width: right - left, height: bottom - top })
  .resize({ width: 340, height: 340, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#0A0A0A" },
})
  .composite([{ input: sparkles, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(ROOT, "app", "icon.png"));

console.log(`app/icon.png       512x512  sparkles only, cropped ${right - left}x${bottom - top} at ${left},${top} (square ${side})`);
