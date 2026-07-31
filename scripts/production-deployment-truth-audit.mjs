#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DEPLOYMENT_TRUTH_ROOT
  ? path.resolve(process.env.DEPLOYMENT_TRUTH_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const READINESS_PATH = path.join(ROOT, 'workers', 'DEPLOY_STATUS.json');
const TRUTH_PATH = path.join(ROOT, 'deployments', 'production.json');
const SHA_RE = /^[0-9a-f]{40}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LIVE_STATUSES = new Set(['unverified', 'verification-pending', 'verified-live']);
const BLOCKED_STATUSES = new Set(['blocked', 'not-deployed', 'unverified']);

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[FAIL] Could not read ${label}: ${error.message}`);
    process.exit(1);
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateEvidenceRecord(record, label, failures) {
  if (!record || typeof record !== 'object') {
    failures.push(`${label}: evidence entries must be objects`);
    return;
  }
  if (!String(record.type || '').trim()) failures.push(`${label}: evidence.type is required`);
  if (!isHttpUrl(String(record.url || ''))) failures.push(`${label}: evidence.url must be an HTTP(S) URL`);
  if (!ISO_RE.test(String(record.recorded_at || ''))) failures.push(`${label}: evidence.recorded_at must be UTC ISO-8601`);
}

function validateVerifiedDeployment(record, label, failures) {
  if (!SHA_RE.test(String(record.deployed_commit || ''))) {
    failures.push(`${label}: verified-live requires a 40-character deployed_commit`);
  }
  if (!ISO_RE.test(String(record.deployed_at || ''))) {
    failures.push(`${label}: verified-live requires deployed_at in UTC ISO-8601 format`);
  }
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
if (!ISO_RE.test(String(truth.last_reviewed_at || ''))) failures.push('last_reviewed_at must be UTC ISO-8601');
if (!SHA_RE.test(String(truth.repository_main_commit_at_review || ''))) {
  failures.push('repository_main_commit_at_review must be a 40-character commit SHA');
}

const workerTruth = truth.workers && typeof truth.workers === 'object' ? truth.workers : {};
for (const [folder, readinessEntry] of Object.entries(readiness)) {
  const productionEntry = workerTruth[folder];
  if (!productionEntry) {
    failures.push(`${folder}: missing from deployments/production.json`);
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

const surfaces = truth.surfaces && typeof truth.surfaces === 'object' ? truth.surfaces : {};
const pages = surfaces['github-pages'];
if (!pages) {
  failures.push('surfaces.github-pages is required');
} else if (!LIVE_STATUSES.has(pages.deployment_status)) {
  failures.push(`surfaces.github-pages has invalid deployment_status ${pages.deployment_status}`);
} else if (pages.deployment_status === 'verified-live') {
  validateVerifiedDeployment(pages, 'surfaces.github-pages', failures);
} else {
  warnings.push(`surfaces.github-pages: deployment remains ${pages.deployment_status}`);
}

const databases = truth.d1_databases && typeof truth.d1_databases === 'object' ? truth.d1_databases : {};
for (const [name, database] of Object.entries(databases)) {
  const required = Array.isArray(database.required_migrations) ? database.required_migrations : [];
  const verified = Array.isArray(database.verified_migrations) ? database.verified_migrations : [];
  if (required.length === 0) failures.push(`D1 ${name}: required_migrations must not be empty`);
  for (const migration of verified) {
    if (!required.includes(migration)) failures.push(`D1 ${name}: verified migration is not listed as required: ${migration}`);
  }

  if (database.deployment_status === 'verified-live') {
    const missing = required.filter(migration => !verified.includes(migration));
    if (missing.length > 0) failures.push(`D1 ${name}: verified-live is missing migrations: ${missing.join(', ')}`);
    if (!ISO_RE.test(String(database.verified_at || ''))) failures.push(`D1 ${name}: verified-live requires verified_at`);
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
