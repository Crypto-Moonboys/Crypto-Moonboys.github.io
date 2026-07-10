#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const PLACEHOLDER = '__MOONBOYS_BUILD_SHA__';
const buildSha = String(process.env.GITHUB_SHA || process.argv[2] || '').trim();

if (!/^[0-9a-f]{40}$/i.test(buildSha)) {
  console.error('Build metadata stamp requires a full 40-character Git commit SHA.');
  process.exit(1);
}

const source = await fs.readFile(INDEX_PATH, 'utf8');
const occurrences = source.split(PLACEHOLDER).length - 1;

if (occurrences !== 1) {
  console.error(`Expected exactly one ${PLACEHOLDER} marker in index.html; found ${occurrences}.`);
  process.exit(1);
}

await fs.writeFile(INDEX_PATH, source.replace(PLACEHOLDER, buildSha), 'utf8');
console.log(`Stamped index.html with build SHA ${buildSha}.`);
