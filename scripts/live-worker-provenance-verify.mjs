#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{40}$/i;
const EXPECTED_COMMIT = String(process.env.EXPECTED_COMMIT || '').trim().toLowerCase();

if (!SHA_RE.test(EXPECTED_COMMIT)) {
  console.error('EXPECTED_COMMIT must be a 40-character repository commit SHA');
  process.exit(1);
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

const commitObject = git(['cat-file', '-e', `${EXPECTED_COMMIT}^{commit}`]);
if (!commitObject.ok) {
  throw new Error(`EXPECTED_COMMIT ${EXPECTED_COMMIT} is not a commit in this repository`);
}

const reachableFromMain = git(['merge-base', '--is-ancestor', EXPECTED_COMMIT, 'origin/main']);
if (!reachableFromMain.ok) {
  throw new Error(`EXPECTED_COMMIT ${EXPECTED_COMMIT} is not reachable from origin/main`);
}

const targets = [
  ['moonboys-api', 'https://moonboys-api.sercullen.workers.dev/deployment-info'],
  ['moonboys-leaderboard', 'https://moonboys-leaderboard.sercullen.workers.dev/deployment-info'],
  ['moonboys-anti-cheat', 'https://moonboys-anti-cheat.sercullen.workers.dev/deployment-info'],
];

const results = [];
for (const [service, url] of targets) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${service}: deployment-info did not return JSON`);
  }

  if (!response.ok) {
    throw new Error(`${service}: deployment-info returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.service !== service) throw new Error(`${service}: service field mismatch`);
  if (!SHA_RE.test(String(payload.commit || ''))) throw new Error(`${service}: commit is not a full Git SHA`);
  if (String(payload.commit).toLowerCase() !== EXPECTED_COMMIT) {
    throw new Error(`${service}: deployed commit ${payload.commit} does not match ${EXPECTED_COMMIT}`);
  }
  const deployedAt = new Date(String(payload.deployed_at || ''));
  if (!Number.isFinite(deployedAt.getTime()) || deployedAt.toISOString() !== payload.deployed_at) {
    throw new Error(`${service}: deployed_at is not a canonical UTC timestamp`);
  }
  if (payload.environment !== 'production') throw new Error(`${service}: environment must be production`);

  const keys = Object.keys(payload).sort();
  const expectedKeys = ['commit', 'deployed_at', 'environment', 'service'].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${service}: deployment-info exposed unexpected fields: ${keys.join(', ')}`);
  }

  results.push({ service, commit: payload.commit, deployed_at: payload.deployed_at, url });
}

const commits = new Set(results.map((result) => result.commit));
if (commits.size !== 1) {
  throw new Error('Tracked Workers did not report one consistent expected commit');
}

console.log(JSON.stringify({
  verified_at: new Date().toISOString(),
  expected_commit: EXPECTED_COMMIT,
  workers: results,
}, null, 2));
