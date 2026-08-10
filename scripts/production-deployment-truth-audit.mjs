#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DEPLOYMENT_TRUTH_ROOT
  ? path.resolve(process.env.DEPLOYMENT_TRUTH_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIT_ROOT = process.env.DEPLOYMENT_TRUTH_GIT_ROOT
  ? path.resolve(process.env.DEPLOYMENT_TRUTH_GIT_ROOT)
  : ROOT;

const READINESS_PATH = path.join(ROOT, 'workers', 'DEPLOY_STATUS.json');
const TRUTH_PATH = path.join(ROOT, 'deployments', 'production.json');
const SHA_RE = /^[0-9a-f]{40}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LIVE_STATUSES = new Set(['unverified', 'verification-pending', 'verified-live']);
const BLOCKED_STATUSES = new Set(['blocked', 'not-deployed', 'unverified']);
const SUPPORTED_SURFACES = new Set(['github-pages']);
const REQUIRED_D1_DATABASES = Object.freeze({
  wikicoms: Object.freeze([
    '038_telegram_pet_equipment_progression.sql',
    '039_telegram_pet_runtime_progression.sql',
    '041_telegram_pet_repeat_reward_slots.sql',
    '042_telegram_pet_roguelite_foundation.sql',
    '043_telegram_pet_identity_expansion.sql',
    '044_telegram_pet_daily_runs.sql',
  ]),
});

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[FAIL] Could not read ${label}: ${error.message}`);
    process.exit(1);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidUtcTimestamp(value) {
  const timestamp = String(value || '');
  if (!ISO_RE.test(timestamp)) return false;

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;

  const normalizedInput = timestamp.includes('.')
    ? timestamp
    : timestamp.replace(/Z$/, '.000Z');
  return new Date(parsed).toISOString() === normalizedInput;
}

function isRepositoryCommit(value) {
  const sha = String(value || '');
  if (!SHA_RE.test(sha)) return false;

  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: GIT_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function validateCommit(value, label, failures) {
  const sha = String(value || '');
  if (!SHA_RE.test(sha)) {
    failures.push(`${label} must be a 40-character commit SHA`);
    return;
  }
  if (!isRepositoryCommit(sha)) {
    failures.push(`${label} does not resolve to a commit in this repository`);
  }
}

function validateTimestamp(value, label, failures) {
  if (!isValidUtcTimestamp(value)) {
    failures.push(`${label} must be a real UTC ISO-8601 timestamp`);
  }
}

function validateEvidenceRecord(record, label, failures) {
  if (!isRecord(record)) {
    failures.push(`${label}: evidence entries must be objects`);
    return;
  }
  if (!String(record.type || '').trim()) failures.push(`${label}: evidence.type is required`);
  if (!isHttpUrl(String(record.url || ''))) failures.push(`${label}: evidence.url must be an HTTP(S) URL`);
  validateTimestamp(record.recorded_at, `${label}: evidence.recorded_at`, failures);
}

function validateVerifiedDeployment(record, label, failures) {
  validateCommit(record.deployed_commit, `${label}: verified-live deployed_commit`, failures);
  validateTimestamp(record.deployed_at, `${label}: verified-live deployed_at`, failures);

  const urls = Array.isArray(record.verification_urls) ? record.verification_urls : [];
  if (urls.length === 0 || urls.some(url => !isHttpUrl(String(url)))) {
    failures.push(`${label}: verified-live requires at least one valid verification URL`);
  }

  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  if (evidence.length === 0) failures.push(`${label}: verified-live requires deployment evidence`);
  evidence.forEach((entry, index) => validateEvidenceRecord(entry, `${label} evidence[${index}]`, failures));
}

const readiness = readJson(READINESS_PATH, 'workers/DEPLOY_STATUS.json');
const truth = readJson(TRUTH_PATH, 'deployments/production.json');
const failures = [];
const warnings = [];

if (truth.schema_version !== 1) failures.push('deployments/production.json schema_version must equal 1');
validateTimestamp(truth.last_reviewed_at, 'last_reviewed_at', failures);
validateCommit(truth.repository_main_commit_at_review, 'repository_main_commit_at_review', failures);

const workerTruth = isRecord(truth.workers) ? truth.workers : {};
for (const [folder, readinessEntry] of Object.entries(readiness)) {
  const productionEntry = workerTruth[folder];
  if (!productionEntry) {
    failures.push(`${folder}: missing from deployments/production.json`);
    continue;
  }
  if (!isRecord(productionEntry)) {
    failures.push(`${folder}: production truth entry must be an object`);
    continue;
  }
  if (productionEntry.readiness !== readinessEntry.status) {
    failures.push(`${folder}: readiness ${productionEntry.readiness} does not match DEPLOY_STATUS.json ${readinessEntry.status}`);
  }

  if (readinessEntry.status === 'live-deployable') {
    if (!LIVE_STATUSES.has(productionEntry.deployment_status)) {
      failures.push(`${folder}: live-deployable Worker has invalid deployment_status ${productionEntry.deployment_status}`);
    }
    if (productionEntry.deployment_status === 'verified-live') {
      validateVerifiedDeployment(productionEntry, folder, failures);
    } else {
      warnings.push(`${folder}: deployment remains ${productionEntry.deployment_status}`);
    }
  } else {
    if (!BLOCKED_STATUSES.has(productionEntry.deployment_status)) {
      failures.push(`${folder}: blocked/setup Worker cannot be marked ${productionEntry.deployment_status}`);
    }
    if (productionEntry.deployment_status === 'verified-live') {
      failures.push(`${folder}: blocked/setup Worker cannot be marked verified-live`);
    }
    if (!String(productionEntry.block_reason || '').trim()) {
      failures.push(`${folder}: blocked/setup Worker requires block_reason`);
    }
  }
}

for (const folder of Object.keys(workerTruth)) {
  if (!readiness[folder]) failures.push(`${folder}: production truth entry has no matching DEPLOY_STATUS.json entry`);
}

const surfaces = isRecord(truth.surfaces) ? truth.surfaces : {};
for (const surfaceName of Object.keys(surfaces)) {
  if (!SUPPORTED_SURFACES.has(surfaceName)) {
    failures.push(`surfaces.${surfaceName}: unsupported production surface`);
  }
}

for (const surfaceName of SUPPORTED_SURFACES) {
  const surface = surfaces[surfaceName];
  const label = `surfaces.${surfaceName}`;
  if (!surface) {
    failures.push(`${label} is required`);
  } else if (!isRecord(surface)) {
    failures.push(`${label} must be an object`);
  } else if (!LIVE_STATUSES.has(surface.deployment_status)) {
    failures.push(`${label} has invalid deployment_status ${surface.deployment_status}`);
  } else if (surface.deployment_status === 'verified-live') {
    validateVerifiedDeployment(surface, label, failures);
  } else {
    warnings.push(`${label}: deployment remains ${surface.deployment_status}`);
  }
}

const databases = isRecord(truth.d1_databases) ? truth.d1_databases : {};
for (const [name, expectedMigrations] of Object.entries(REQUIRED_D1_DATABASES)) {
  const database = databases[name];
  if (!database) {
    failures.push(`D1 ${name}: required database is missing from deployments/production.json`);
    continue;
  }
  if (!isRecord(database)) {
    failures.push(`D1 ${name}: database entry must be an object`);
    continue;
  }

  const required = Array.isArray(database.required_migrations) ? database.required_migrations : [];
  for (const migration of expectedMigrations) {
    if (!required.includes(migration)) {
      failures.push(`D1 ${name}: required migration is missing from tracking: ${migration}`);
    }
  }
}

for (const [name, database] of Object.entries(databases)) {
  if (!isRecord(database)) {
    failures.push(`D1 ${name}: database entry must be an object`);
    continue;
  }

  const required = Array.isArray(database.required_migrations) ? database.required_migrations : [];
  const verified = Array.isArray(database.verified_migrations) ? database.verified_migrations : [];
  if (required.length === 0) failures.push(`D1 ${name}: required_migrations must not be empty`);
  if (new Set(required).size !== required.length) failures.push(`D1 ${name}: required_migrations contains duplicates`);
  if (new Set(verified).size !== verified.length) failures.push(`D1 ${name}: verified_migrations contains duplicates`);

  for (const migration of verified) {
    if (!required.includes(migration)) failures.push(`D1 ${name}: verified migration is not listed as required: ${migration}`);
  }

  if (database.deployment_status === 'verified-live') {
    const missing = required.filter(migration => !verified.includes(migration));
    if (missing.length > 0) failures.push(`D1 ${name}: verified-live is missing migrations: ${missing.join(', ')}`);
    validateTimestamp(database.verified_at, `D1 ${name}: verified-live verified_at`, failures);
    const evidence = Array.isArray(database.evidence) ? database.evidence : [];
    if (evidence.length === 0) failures.push(`D1 ${name}: verified-live requires evidence`);
    evidence.forEach((entry, index) => validateEvidenceRecord(entry, `D1 ${name} evidence[${index}]`, failures));
  } else if (database.deployment_status === 'unverified' || database.deployment_status === 'verification-pending') {
    warnings.push(`D1 ${name}: migration state remains ${database.deployment_status}`);
  } else {
    failures.push(`D1 ${name}: invalid deployment_status ${database.deployment_status}`);
  }
}

console.log('\nProduction Deployment Truth Audit');
console.log('================================');
for (const warning of warnings) console.log(`[UNVERIFIED] ${warning}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  console.error(`\nRESULT: FAILED — ${failures.length} invalid or unsupported production claim(s)`);
  process.exit(1);
}

console.log(`\nRESULT: PASSED — manifest is truthful; ${warnings.length} item(s) remain explicitly unverified`);
