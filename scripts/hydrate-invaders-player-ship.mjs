#!/usr/bin/env node
/**
 * hydrate-invaders-player-ship.mjs
 *
 * Decodes art/invaders/generated/player-ship.png.base64 into a hydrated PNG at
 * games/invaders-3008/assets/ships/player-ship.png (the runtime path wired in
 * render-system.js).
 *
 * Usage:
 *   node scripts/hydrate-invaders-player-ship.mjs
 *   node scripts/hydrate-invaders-player-ship.mjs --clean-base64
 *
 * --clean-base64  Remove the .png.base64 source file after hydration (deploy/
 *                 packaging mode).  Never use locally — the .base64 file is
 *                 the text-reviewable source of truth.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const MANIFEST_PATH = path.join(ROOT, 'art/invaders/manifest.json');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgs(argv) {
  const options = { cleanBase64: false, help: false };
  for (const arg of argv) {
    if (arg === '--clean-base64') options.cleanBase64 = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    'Invaders 3008 player-ship asset hydrator',
    '',
    'Usage:',
    '  node scripts/hydrate-invaders-player-ship.mjs [--clean-base64]',
    '',
    'Decodes art/invaders/generated/player-ship.png.base64 into the hydrated',
    'PNG at games/invaders-3008/assets/ships/player-ship.png.',
    '',
    'Options:',
    '  --clean-base64  Remove .png.base64 source after hydration (deploy mode).',
    '  --help, -h      Show this help output.',
  ].join('\n'));
}

function decodePngPayload(encodedFile, payload) {
  const buffer = Buffer.from(payload.replace(/\s+/gu, ''), 'base64');
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`Decoded file is not a PNG: ${encodedFile}`);
  }
  return buffer;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { printHelp(); return; }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const generatedAssets = (manifest.assets || []).filter(a => a.status === 'generated');

  if (generatedAssets.length === 0) {
    console.log('No generated assets in manifest — nothing to hydrate.');
    return;
  }

  let hydrated = 0;

  for (const asset of generatedAssets) {
    const encodedPath = path.join(ROOT, asset.encodedOutput);
    const runtimePng  = path.join(ROOT, asset.runtimePath.replace(/^\//, ''));

    let payload;
    try {
      payload = await readFile(encodedPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn(`[hydrate-invaders] Skipping ${asset.id}: .base64 source not found at ${asset.encodedOutput}`);
        continue;
      }
      throw err;
    }

    const buffer = decodePngPayload(encodedPath, payload);
    await mkdir(path.dirname(runtimePng), { recursive: true });
    await writeFile(runtimePng, buffer);
    console.log(`[hydrate-invaders] ${asset.id} → ${path.relative(ROOT, runtimePng)} (${buffer.length} bytes)`);
    hydrated++;

    if (options.cleanBase64) {
      await rm(encodedPath, { force: true });
    }
  }

  console.log(`Hydrated ${hydrated} Invaders asset(s) ✅`);
}

main().catch(err => { console.error(err); process.exit(1); });
