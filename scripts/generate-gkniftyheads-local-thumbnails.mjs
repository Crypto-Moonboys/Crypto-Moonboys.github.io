#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'gkniftyheads', 'template-rarity.json');
const PAGE_PATH = path.join(ROOT, 'wiki', 'gkniftyheads-nft-collection.html');
const THUMB_DIR = path.join(ROOT, 'img', 'gkniftyheads', 'thumbs');
const THUMB_PUBLIC_DIR = '/img/gkniftyheads/thumbs';
const TARGET_WIDTH = 265;
const QUALITY = 78;

function escAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function allRows(payload) {
  return [
    ...(payload.ranked_templates || []),
    ...(payload.utility_open_mint_templates || []),
    ...(payload.unissued_templates || []),
  ];
}

function assertMagick() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return 'magick';
  } catch {}
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return 'convert';
  } catch {}
  throw new Error('ImageMagick is required. Install it in the workflow before running thumbnail generation.');
}

async function download(url, target) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'CryptoMoonboysThumbnailGenerator/1.0' },
  });
  if (!response.ok) throw new Error(`download failed ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
}

async function makeThumbnail(row, magickBin) {
  if (!row.image_url) {
    row.thumbnail_url = '';
    row.thumbnail_status = 'missing-source-image';
    return;
  }

  const outputFile = path.join(THUMB_DIR, `${row.template_id}.webp`);
  const outputUrl = `${THUMB_PUBLIC_DIR}/${row.template_id}.webp`;

  if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
    row.thumbnail_url = outputUrl;
    row.thumbnail_status = 'cached-local-thumbnail';
    return;
  }

  const tempFile = path.join(os.tmpdir(), `gk-${row.template_id}-${Date.now()}`);
  try {
    await download(row.image_url, tempFile);
    execFileSync(magickBin, [
      tempFile,
      '-auto-orient',
      '-resize',
      `${TARGET_WIDTH}x`,
      '-strip',
      '-quality',
      String(QUALITY),
      outputFile,
    ], { stdio: 'pipe' });
    row.thumbnail_url = outputUrl;
    row.thumbnail_status = 'generated-local-thumbnail';
  } catch (error) {
    row.thumbnail_url = row.image_url;
    row.thumbnail_status = `original-image-fallback: ${error.message}`;
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

function updatePageImages(payload) {
  if (!fs.existsSync(PAGE_PATH)) return;
  let html = fs.readFileSync(PAGE_PATH, 'utf8');
  for (const row of allRows(payload)) {
    if (!row.image_url || !row.thumbnail_url || row.thumbnail_url === row.image_url) continue;
    html = html.split(`src="${escAttr(row.image_url)}"`).join(`src="${escAttr(row.thumbnail_url)}"`);
  }
  fs.writeFileSync(PAGE_PATH, html, 'utf8');
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`Missing ${DATA_PATH}. Run the rarity generator first.`);
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  const magickBin = assertMagick();
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const rows = allRows(payload);

  for (const row of rows) {
    await makeThumbnail(row, magickBin);
  }

  payload.thumbnail_generation = {
    mode: 'local-github-action-cache',
    target_width_px: TARGET_WIDTH,
    format: 'webp',
    quality: QUALITY,
    output_dir: THUMB_PUBLIC_DIR,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  updatePageImages(payload);

  const generated = rows.filter((row) => String(row.thumbnail_status || '').includes('thumbnail')).length;
  const fallback = rows.length - generated;
  console.log(`GKniftyHEADS thumbnails ready: ${generated} local thumbnails, ${fallback} fallbacks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
