#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-assets.generated.json");
const OUT_PATH = path.join(REPO_ROOT, "output", "moonpets", "moonpet-contact-sheet.png");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const generatedAssets = [];

  for (const asset of manifest.assets || []) {
    const imagePath = path.join(REPO_ROOT, asset.image);
    if (asset.status === "generated" && await exists(imagePath)) {
      generatedAssets.push({ ...asset, imagePath });
    }
  }

  if (generatedAssets.length === 0) {
    console.log("No generated Moonpet PNG assets found for a contact sheet.");
    return;
  }

  const thumb = 220;
  const label = 48;
  const gap = 20;
  const columns = Math.min(6, generatedAssets.length);
  const rows = Math.ceil(generatedAssets.length / columns);
  const width = columns * thumb + (columns + 1) * gap;
  const height = rows * (thumb + label) + (rows + 1) * gap;

  const composites = [];

  for (const [index, asset] of generatedAssets.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const left = gap + col * (thumb + gap);
    const top = gap + row * (thumb + label + gap);
    const imageBuffer = await sharp(asset.imagePath)
      .resize({ width: thumb, height: thumb, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const labelSvg = Buffer.from(`
      <svg width="${thumb}" height="${label}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111827"/>
        <text x="10" y="19" font-family="Arial, sans-serif" font-size="13" fill="#f8fafc">${escapeXml(asset.skin)}</text>
        <text x="10" y="38" font-family="Arial, sans-serif" font-size="12" fill="#93c5fd">${escapeXml(asset.action)}</text>
      </svg>
    `);

    composites.push({ input: imageBuffer, left, top });
    composites.push({ input: labelSvg, left, top: top + thumb });
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(OUT_PATH);

  console.log(`Contact sheet written to ${path.relative(REPO_ROOT, OUT_PATH).replace(/\\/g, "/")}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
