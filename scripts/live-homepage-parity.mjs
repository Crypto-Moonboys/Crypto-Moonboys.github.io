#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const LIVE_URL = process.env.LIVE_HOMEPAGE_URL || 'https://cryptomoonboys.com/';
const LIVE_FILE = process.env.LIVE_HOMEPAGE_FILE || '';
const EXPECTED_SHA = String(process.env.EXPECTED_DEPLOY_SHA || '').trim();
const ATTEMPTS = integerEnv('LIVE_PARITY_ATTEMPTS', 6, 1, 12);
const RETRY_MS = integerEnv('LIVE_PARITY_RETRY_MS', 20000, 0, 120000);
const TIMEOUT_MS = integerEnv('LIVE_PARITY_TIMEOUT_MS', 20000, 1000, 120000);

if (!/^[0-9a-f]{40}$/i.test(EXPECTED_SHA)) {
  console.error('EXPECTED_DEPLOY_SHA must be a full 40-character Git commit SHA.');
  process.exit(1);
}

function integerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeText(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(tag) {
  const attrs = new Map();
  const pattern = /([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    attrs.set(match[1].toLowerCase(), decodeEntities(match[3]).trim());
  }
  return attrs;
}

function tags(html, tagName) {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')), (match) => match[0]);
}

function metaValue(html, key, value) {
  for (const tag of tags(html, 'meta')) {
    const attrs = parseAttributes(tag);
    if ((attrs.get(key) || '').toLowerCase() === value.toLowerCase()) {
      return attrs.get('content') || '';
    }
  }
  return '';
}

function canonicalHref(html) {
  for (const tag of tags(html, 'link')) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.get('rel') || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical')) return attrs.get('href') || '';
  }
  return '';
}

function firstInner(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? normalizeText(match[1]) : '';
}

function homepageContract(html) {
  return {
    title: firstInner(html, 'title'),
    description: metaValue(html, 'name', 'description'),
    ogTitle: metaValue(html, 'property', 'og:title'),
    ogDescription: metaValue(html, 'property', 'og:description'),
    canonical: canonicalHref(html),
    h1: firstInner(html, 'h1'),
    buildSha: metaValue(html, 'name', 'moonboys-build-sha'),
  };
}

function diffContracts(expected, actual) {
  const mismatches = [];
  for (const key of Object.keys(expected)) {
    if (expected[key] !== actual[key]) {
      mismatches.push({ key, expected: expected[key], actual: actual[key] || '(missing)' });
    }
  }
  return mismatches;
}

async function getLiveHtml(attempt) {
  if (LIVE_FILE) return fs.readFile(path.resolve(LIVE_FILE), 'utf8');

  const url = new URL(LIVE_URL);
  url.searchParams.set('deploy_check', `${EXPECTED_SHA.slice(0, 12)}-${attempt}`);
  const response = await fetch(url, {
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
      'user-agent': 'Crypto-Moonboys-live-parity/1.0',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Live homepage returned HTTP ${response.status}.`);
  }
  return response.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const localHtml = await fs.readFile(INDEX_PATH, 'utf8');
const expected = homepageContract(localHtml);
expected.buildSha = EXPECTED_SHA;

let lastError = null;
let lastMismatches = [];

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  try {
    const liveHtml = await getLiveHtml(attempt);
    const actual = homepageContract(liveHtml);
    const mismatches = diffContracts(expected, actual);

    if (mismatches.length === 0) {
      console.log(`Live homepage matches commit ${EXPECTED_SHA} and the checked-out homepage contract.`);
      process.exit(0);
    }

    lastMismatches = mismatches;
    lastError = null;
    console.error(`Homepage parity attempt ${attempt}/${ATTEMPTS} found ${mismatches.length} mismatch(es).`);
  } catch (error) {
    lastError = error;
    lastMismatches = [];
    console.error(`Homepage parity attempt ${attempt}/${ATTEMPTS} failed: ${error.message}`);
  }

  if (attempt < ATTEMPTS && RETRY_MS > 0) await sleep(RETRY_MS);
}

if (lastError) {
  console.error(`Live homepage parity failed: ${lastError.message}`);
} else {
  console.error('Live homepage does not match the deployed commit and checked-out copy:');
  for (const mismatch of lastMismatches) {
    console.error(`- ${mismatch.key}\n  expected: ${mismatch.expected}\n  actual:   ${mismatch.actual}`);
  }
}
process.exit(1);
