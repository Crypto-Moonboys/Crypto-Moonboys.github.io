#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HTTP_RE = /^https:\/\//i;

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function validateCanonicalTimestamp(value, label) {
  const text = String(value || '');
  const parsed = Date.parse(text);
  if (!ISO_RE.test(text) || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
}

function normalizeWorkers(payload, expectedServices, label) {
  requireRecord(payload, label);
  if (!SHA_RE.test(String(payload.expected_commit || ''))) {
    throw new Error(`${label}.expected_commit must be a full Git SHA`);
  }
  if (!Array.isArray(payload.workers)) throw new Error(`${label}.workers must be an array`);

  const byService = new Map();
  for (const [index, raw] of payload.workers.entries()) {
    const worker = requireRecord(raw, `${label}.workers[${index}]`);
    const service = String(worker.service || '');
    if (!expectedServices.includes(service)) {
      throw new Error(`${label}.workers[${index}] has unsupported service ${service || '<empty>'}`);
    }
    if (byService.has(service)) throw new Error(`${label}.workers contains duplicate service ${service}`);
    if (!SHA_RE.test(String(worker.commit || ''))) {
      throw new Error(`${label}.${service}.commit must be a full Git SHA`);
    }
    validateCanonicalTimestamp(worker.deployed_at, `${label}.${service}.deployed_at`);
    if (!HTTP_RE.test(String(worker.url || ''))) {
      throw new Error(`${label}.${service}.url must be HTTPS`);
    }
    byService.set(service, {
      service,
      commit: String(worker.commit).toLowerCase(),
      deployed_at: String(worker.deployed_at),
      url: String(worker.url),
    });
  }

  if (byService.size !== expectedServices.length) {
    const missing = expectedServices.filter((service) => !byService.has(service));
    throw new Error(`${label}.workers is missing services: ${missing.join(', ')}`);
  }

  return {
    expected_commit: String(payload.expected_commit).toLowerCase(),
    workers: expectedServices.map((service) => byService.get(service)),
  };
}

export function compareWorkerProvenanceEvidence({ generated, committed, request }) {
  const requestRecord = requireRecord(request, 'request');
  if (requestRecord.schema_version !== 1) throw new Error('request.schema_version must equal 1');
  if (!SHA_RE.test(String(requestRecord.expected_commit || ''))) {
    throw new Error('request.expected_commit must be a full Git SHA');
  }
  if (!Array.isArray(requestRecord.services) || requestRecord.services.length === 0) {
    throw new Error('request.services must be a non-empty array');
  }

  const expectedServices = requestRecord.services.map(String);
  if (new Set(expectedServices).size !== expectedServices.length) {
    throw new Error('request.services contains duplicates');
  }

  const generatedNormalized = normalizeWorkers(generated, expectedServices, 'generated');
  const committedRecord = requireRecord(committed, 'committed');
  if (committedRecord.schema_version !== 1) throw new Error('committed.schema_version must equal 1');
  validateCanonicalTimestamp(committedRecord.verified_at, 'committed.verified_at');
  const committedNormalized = normalizeWorkers(committedRecord, expectedServices, 'committed');

  const requestedCommit = String(requestRecord.expected_commit).toLowerCase();
  if (generatedNormalized.expected_commit !== requestedCommit) {
    throw new Error(`generated expected_commit ${generatedNormalized.expected_commit} does not match request ${requestedCommit}`);
  }
  if (committedNormalized.expected_commit !== requestedCommit) {
    throw new Error(`committed expected_commit ${committedNormalized.expected_commit} does not match request ${requestedCommit}`);
  }

  const generatedJson = JSON.stringify(generatedNormalized);
  const committedJson = JSON.stringify(committedNormalized);
  if (generatedJson !== committedJson) {
    throw new Error(
      `Committed Worker evidence does not match freshly captured production output.\n` +
      `generated=${JSON.stringify(generatedNormalized, null, 2)}\n` +
      `committed=${JSON.stringify(committedNormalized, null, 2)}`,
    );
  }

  return generatedNormalized;
}

function main() {
  const [generatedPath, committedPath, requestPath = 'deployments/worker-evidence-request.json'] = process.argv.slice(2);
  if (!generatedPath || !committedPath) {
    throw new Error('Usage: node scripts/compare-worker-provenance-evidence.mjs <generated.json> <committed.json> [request.json]');
  }

  const result = compareWorkerProvenanceEvidence({
    generated: readJson(path.resolve(generatedPath), 'generated evidence'),
    committed: readJson(path.resolve(committedPath), 'committed evidence'),
    request: readJson(path.resolve(requestPath), 'evidence request'),
  });
  console.log(`Worker provenance evidence matches live production for ${result.expected_commit}.`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(`[worker-evidence-compare] ${error.message}`);
    process.exit(1);
  }
}
