/**
 * Worker deploy readiness audit.
 *
 * Scans workers/DEPLOY_STATUS.json and each Worker's wrangler.toml to verify:
 *
 *  1. Every Worker listed as "live-deployable" has no placeholder KV/binding IDs.
 *  2. Workers listed as "stub-blocked" are expected to have placeholders — they pass.
 *  3. Workers listed as "needs-binding-setup" are reported as warnings, not failures.
 *  4. Any Worker folder with a wrangler.toml not listed in DEPLOY_STATUS.json is flagged.
 *
 * Placeholder patterns detected:
 *  - YOUR_*   (e.g. YOUR_CACHE_KV_ID)
 *  - your-*   (e.g. your-kv-namespace)
 *  - empty id = ""
 *
 * Exit code 0 = all live-deployable workers are clean.
 * Exit code 1 = a live-deployable worker contains placeholder bindings, or an
 *               unlisted worker folder was found.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.WORKER_AUDIT_ROOT
  ? path.resolve(process.env.WORKER_AUDIT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_STATUS_PATH = path.join(ROOT, 'workers', 'DEPLOY_STATUS.json');
const WORKERS_DIR = path.join(ROOT, 'workers');

// ── placeholder detection ─────────────────────────────────────────────────────

const PLACEHOLDER_VALUE_PATTERNS = [
  /\bYOUR_[A-Z0-9_]+\b/,
  /\byour-[a-z0-9-]+\b/,
];

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inDouble && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function isBindingValueField(key) {
  return key === 'id' || key.endsWith('_id') || key === 'bucket_name';
}

function parseTomlQuotedValue(rawValue) {
  const value = rawValue.trim();
  if (value.length < 2) return null;
  if (value.startsWith('"') && value.endsWith('"')) {
    return { quote: '"', value: value.slice(1, -1) };
  }
  if (value.startsWith('\'') && value.endsWith('\'')) {
    return { quote: '\'', value: value.slice(1, -1) };
  }
  return null;
}

function detectPlaceholders(tomlContent) {
  const found = [];
  const lines = tomlContent.split('\n');
  for (const line of lines) {
    const lineWithoutComments = stripTomlComment(line).trim();
    if (!lineWithoutComments) continue;
    const match = lineWithoutComments.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!isBindingValueField(key)) continue;
    const parsed = parseTomlQuotedValue(rawValue);
    if (!parsed) continue;
    const { quote, value } = parsed;
    const isPlaceholder = value === '' || PLACEHOLDER_VALUE_PATTERNS.some(pattern => pattern.test(value));
    if (isPlaceholder) {
      const token = `${key}=${quote}${value}${quote}`;
      if (!found.includes(token)) {
        found.push(token);
      }
    }
  }
  return found;
}

// ── load DEPLOY_STATUS.json ───────────────────────────────────────────────────

let deployStatus;
try {
  const raw = await readFile(DEPLOY_STATUS_PATH, 'utf8');
  deployStatus = JSON.parse(raw);
} catch (err) {
  console.error(`[FAIL] Could not read workers/DEPLOY_STATUS.json: ${err.message}`);
  process.exit(1);
}

// ── discover worker folders ───────────────────────────────────────────────────

const entries = await readdir(WORKERS_DIR, { withFileTypes: true });
const workerFolders = entries
  .filter(e => e.isDirectory())
  .map(e => `workers/${e.name}`)
  .filter(folder => existsSync(path.join(ROOT, folder, 'wrangler.toml')));

// ── audit ─────────────────────────────────────────────────────────────────────

const deployable = [];
const blocked = [];
const needsSetup = [];
const failures = [];
const unlisted = [];

for (const folder of workerFolders) {
  const tomlPath = path.join(ROOT, folder, 'wrangler.toml');
  const tomlContent = await readFile(tomlPath, 'utf8');
  const placeholders = detectPlaceholders(tomlContent);

  const entry = deployStatus[folder];

  if (!entry) {
    unlisted.push({ folder, placeholders });
    continue;
  }

  const { status } = entry;

  if (status === 'live-deployable') {
    if (placeholders.length > 0) {
      failures.push({
        folder,
        reason: `marked live-deployable but contains placeholder bindings: ${placeholders.join(', ')}`,
      });
    } else {
      deployable.push({ folder, command: entry.deploy_command || `cd ${folder} && npx wrangler deploy` });
    }
  } else if (status === 'stub-blocked') {
    blocked.push({
      folder,
      reason: entry.reason || `placeholder bindings: ${placeholders.join(', ')}`,
      placeholders,
    });
  } else if (status === 'needs-binding-setup') {
    needsSetup.push({
      folder,
      reason: entry.reason || 'bindings need verification before first deploy',
    });
  } else {
    failures.push({ folder, reason: `unknown status "${status}" in DEPLOY_STATUS.json` });
  }
}

// ── print summary ──────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  Worker Deploy Readiness Audit');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log(`✅ Deployable workers (${deployable.length}):`);
for (const { folder, command } of deployable) {
  console.log(`   ${folder}`);
  console.log(`     deploy: ${command}`);
}

if (needsSetup.length > 0) {
  console.log(`\n⚠️  Needs binding setup (${needsSetup.length}) — not ready to deploy:`);
  for (const { folder, reason } of needsSetup) {
    console.log(`   ${folder}`);
    console.log(`     reason: ${reason}`);
  }
}

console.log(`\n🚫 Blocked workers (${blocked.length}) — do NOT deploy:`);
for (const { folder, reason } of blocked) {
  console.log(`   ${folder}`);
  console.log(`     reason: ${reason}`);
}

if (unlisted.length > 0) {
  console.log(`\n❓ Unlisted worker folders (${unlisted.length}) — add to DEPLOY_STATUS.json:`);
  for (const { folder } of unlisted) {
    console.log(`   ${folder}`);
  }
}

if (failures.length > 0) {
  console.log(`\n❌ Failures (${failures.length}):`);
  for (const { folder, reason } of failures) {
    console.log(`   ${folder}`);
    console.log(`     ${reason}`);
  }
}

console.log('\n══════════════════════════════════════════════════════════════════');

const totalProblems = failures.length + unlisted.length;

if (totalProblems > 0) {
  console.log(`  RESULT: FAILED — ${totalProblems} problem(s) found`);
  console.log('══════════════════════════════════════════════════════════════════\n');
  process.exit(1);
} else {
  console.log(`  RESULT: PASSED — ${deployable.length} deployable, ${blocked.length} blocked (expected), ${needsSetup.length} needs-setup`);
  console.log('══════════════════════════════════════════════════════════════════\n');
}
