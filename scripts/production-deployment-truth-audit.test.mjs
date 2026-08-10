#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(ROOT, 'scripts', 'production-deployment-truth-audit.mjs');
const REPOSITORY_SHA = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
const NONEXISTENT_SHA = 'e'.repeat(40);
const REQUIRED_PETS_MIGRATIONS = [
  '038_telegram_pet_equipment_progression.sql',
  '039_telegram_pet_runtime_progression.sql',
  '041_telegram_pet_repeat_reward_slots.sql',
  '042_telegram_pet_roguelite_foundation.sql',
  '043_telegram_pet_identity_expansion.sql',
];

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
      env: {
        ...process.env,
        DEPLOYMENT_TRUTH_ROOT: fixtureRoot,
        DEPLOYMENT_TRUTH_GIT_ROOT: ROOT,
      },
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
    repository_main_commit_at_review: REPOSITORY_SHA,
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
      wikicoms: {
        deployment_status: 'unverified',
        verified_at: null,
        required_migrations: [...REQUIRED_PETS_MIGRATIONS],
        verified_migrations: [],
        evidence: [],
        ...d1Overrides,
      },
    },
  };
}

function verifiedWorker(overrides = {}) {
  return {
    readiness: 'live-deployable',
    deployment_status: 'verified-live',
    deployed_commit: REPOSITORY_SHA,
    deployed_at: '2026-07-31T02:27:00Z',
    verification_urls: ['https://example.com/health'],
    evidence: [{
      type: 'workflow-run',
      url: 'https://github.com/example/run/1',
      recorded_at: '2026-07-31T02:27:00Z',
    }],
    ...overrides,
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
    assert.match(result.output, /deployed_commit must be a 40-character commit SHA/);
    assert.match(result.output, /verified-live requires deployment evidence/);
  },
);

await withFixture(
  { 'workers/example': { status: 'stub-blocked' } },
  baseTruth({
    ...verifiedWorker(),
    readiness: 'stub-blocked',
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
      required_migrations: [...REQUIRED_PETS_MIGRATIONS],
      verified_migrations: [REQUIRED_PETS_MIGRATIONS[0]],
      evidence: [{
        type: 'wrangler-output',
        url: 'https://github.com/example/evidence/1',
        recorded_at: '2026-07-31T02:27:00Z',
      }],
    },
  ),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'verified D1 state must include every required migration');
    assert.match(result.output, /verified-live is missing migrations: 039_telegram_pet_runtime_progression\.sql/);
    assert.match(result.output, /041_telegram_pet_repeat_reward_slots\.sql/);
    assert.match(result.output, /042_telegram_pet_roguelite_foundation\.sql/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  (() => {
    const truth = baseTruth({
      readiness: 'live-deployable',
      deployment_status: 'unverified',
      deployed_commit: null,
      deployed_at: null,
      verification_urls: [],
      evidence: [],
    });
    delete truth.d1_databases.wikicoms;
    return truth;
  })(),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'wikicoms must remain explicitly tracked');
    assert.match(result.output, /D1 wikicoms: required database is missing/);
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
      required_migrations: [REQUIRED_PETS_MIGRATIONS[0]],
    },
  ),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'required Pets migration set cannot shrink');
    assert.match(result.output, /required migration is missing from tracking: 039_telegram_pet_runtime_progression\.sql/);
    assert.match(result.output, /required migration is missing from tracking: 041_telegram_pet_repeat_reward_slots\.sql/);
    assert.match(result.output, /required migration is missing from tracking: 042_telegram_pet_roguelite_foundation\.sql/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  baseTruth(verifiedWorker({ deployed_commit: NONEXISTENT_SHA })),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'verified-live deployed SHA must exist in this repository');
    assert.match(result.output, /does not resolve to a commit in this repository/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  baseTruth(verifiedWorker({
    deployed_at: '2026-99-99T99:99:99Z',
    evidence: [{
      type: 'workflow-run',
      url: 'https://github.com/example/run/1',
      recorded_at: '2026-02-30T02:27:00Z',
    }],
  })),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'impossible calendar timestamps must fail');
    assert.match(result.output, /deployed_at must be a real UTC ISO-8601 timestamp/);
    assert.match(result.output, /evidence\.recorded_at must be a real UTC ISO-8601 timestamp/);
  },
);

await withFixture(
  { 'workers/example': { status: 'live-deployable' } },
  (() => {
    const truth = baseTruth({
      readiness: 'live-deployable',
      deployment_status: 'unverified',
      deployed_commit: null,
      deployed_at: null,
      verification_urls: [],
      evidence: [],
    });
    truth.surfaces['github-page'] = {
      deployment_status: 'verified-live',
    };
    return truth;
  })(),
  async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'unknown or typoed production surfaces must fail');
    assert.match(result.output, /surfaces\.github-page: unsupported production surface/);
  },
);

console.log('production-deployment-truth-audit.test.mjs passed');
