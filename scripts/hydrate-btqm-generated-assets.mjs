#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GENERATED_ASSET_ROOT = 'art/btqm/generated';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgs(argv) {
  const options = {
    cleanBase64: false,
  };

  for (const arg of argv) {
    if (arg === '--clean-base64') {
      options.cleanBase64 = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`BTQM generated asset hydrator\n\nUsage:\n  node scripts/hydrate-btqm-generated-assets.mjs [--clean-base64]\n\nBy default, local mode writes hydrated .png files next to .png.base64 source payloads and keeps the encoded files.\nUse --clean-base64 only for deploy/artifact packaging when encoded payloads should be removed from that output copy.`);
}

async function walkFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function decodePngPayload(encodedFile, payload) {
  const buffer = Buffer.from(payload.replace(/\s+/gu, ''), 'base64');
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`Decoded file is not a PNG: ${encodedFile}`);
  }
  return buffer;
}

async function hydrateEncodedPng(encodedFile, options) {
  const pngPath = encodedFile.replace(/\.base64$/u, '');
  const payload = await readFile(encodedFile, 'utf8');
  const buffer = decodePngPayload(encodedFile, payload);

  await mkdir(path.dirname(pngPath), { recursive: true });
  await writeFile(pngPath, buffer);

  if (options.cleanBase64) {
    await rm(encodedFile, { force: true });
  }

  return pngPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const encodedFiles = (await walkFiles(GENERATED_ASSET_ROOT))
    .filter((file) => file.endsWith('.png.base64'))
    .sort();

  for (const encodedFile of encodedFiles) {
    const pngPath = await hydrateEncodedPng(encodedFile, options);
    console.log(`Hydrated ${pngPath}`);
  }

  const mode = options.cleanBase64 ? 'deploy/artifact' : 'local';
  console.log(`Hydrated ${encodedFiles.length} BTQM generated PNG asset(s) in ${mode} mode.`);
}

main().catch((error) => {
  console.error(`BTQM asset hydration failed: ${error.message}`);
  process.exitCode = 1;
});
