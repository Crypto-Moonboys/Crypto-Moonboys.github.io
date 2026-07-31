#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(ROOT, 'scripts', 'production-deployment-truth-audit.mjs');
const SHA = 'a'.repeat(40);

async function withFixture(readiness, truth, run) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'deployment-truth-'));
  try {
    await mkdir(path.join(fixtureRoot, 'workers'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'deployments'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'workers', 'DEPLOY_STATUS.json'), JSON.stringify(readiness, null, 2));
    await writeFile(path.join(fixtureRoot, 'deployments', 'production.json'), JSON.stringify(truth, null, 2));
    await run(fixtureRoot);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function runAudit(fixtureRoot) {
  try {
    const output = execFileSync(process.execPath, [AUDIT], {
      cwd: ROOT,
      env: { ...process.env, DEPLOYMENT_TRUTH_ROOT: fixtureRoot },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

function baseTruth(workerEntry, d1Overrides = {}) {
  return {
    schema_version: 1,
    last_reviewed_at: '2026-07-31T02:27:00Z',
    repository_main_commit_at_review: SHA,
    surfaces: {
      'github-pages': {
        readiness: 'deployable',
        deployment_status: 'verification-pending',
        deployed_commit: null,
        deployed_at: null,
        verification_urls: ['https://example.com/'],
        evidence: [],
      },
    },
    workers: {
      'workers/example': workerEntry,
    },
    d1_databases: {
      example: {
        deployment_status: 'unverified',
        verified_at: null,
        required_migrations: ['001_example.sql'],
        verified_migrations: [],
        evidence: [],
        ...d1Overrides,
      },
    },
  };
}

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  baseTruth({
    readiness: 'live-deployable',
    deployment_status: 'unverified',
    deployed_commit: null,
    deployed_at: null,
    verification_urls: [],
    evidence: [],
  }),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, true, `explicitly unverified deployment state must pass\n${result.output}`);
    assert.match(result.output, /remain explicitly unverified/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  baseTruth({
    readiness: 'live-deployable',
    deployment_status: 'verified-live',
    deployed_commit: null,
    deployed_at: null,
    verification_urls: [],
    evidence: [],
  }),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'verified-live without evidence must fail');
    assert.match(result.output, /verified-live requires a 40-character deployed_commit/);
    assert.match(result.output, /verified-live requires deployment evidence/);
  },
);

await withFixture(
  { 'workers/example': { status: 'stub-blocked' } },
  baseTruth({
    readiness: 'stub-blocked',
    deployment_status: 'verified-live',
    deployed_commit: SHA,
    deployed_at: '2026-07-31T02:27:00Z',
    verification_urls: ['https://example.com/'],
    evidence: [{ type: 'workflow-run', url: 'https://github.com/example/run/1', recorded_at: '2026-07-31T02:27:00Z' }],
    block_reason: 'Placeholder binding remains.',
  }),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'blocked Worker cannot be marked verified-live');
    assert.match(result.output, /blocked\/setup Worker cannot be marked/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  baseTruth(
    {
      readiness: 'live-deployable',
      deployment_status: 'unverified',
      deployed_commit: null,
      deployed_at: null,
      verification_urls: [],
      evidence: [],
    },
    {
      deployment_status: 'verified-live',
      verified_at: '2026-07-31T02:27:00Z',
      required_migrations: ['001_example.sql', '002_example.sql'],
      verified_migrations: ['001_example.sql'],
      evidence: [{ type: 'wrangler-output', url: 'https://github.com/example/evidence/1', recorded_at: '2026-07-31T02:27:00Z' }],
    },
  ),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'verified D1 state must include every required migration');
    assert.match(result.output, /verified-live is missing migrations: 002_example.sql/);
  },
);

console.log('production-deployment-truth-audit.test.mjs passed');
