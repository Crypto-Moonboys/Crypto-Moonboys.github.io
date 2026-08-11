#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/i;

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

const targetUrls = Object.freeze({
  'moonboys-api': 'https://moonboys-api.sercullen.workers.dev/deployment-info',
  'moonboys-leaderboard': 'https://moonboys-leaderboard.sercullen.workers.dev/deployment-info',
  'moonboys-anti-cheat': 'https://moonboys-anti-cheat.sercullen.workers.dev/deployment-info',
});

function loadExpectations() {
  const requestPath = process.argv[2];
  if (!requestPath) {
    const expectedCommit = String(process.env.EXPECTED_COMMIT || '').trim().toLowerCase();
    if (!SHA_RE.test(expectedCommit)) throw new Error('EXPECTED_COMMIT must be a 40-character repository commit SHA');
    const services = Object.keys(targetUrls);
    return { services, expectedCommits: Object.fromEntries(services.map((service) => [service, expectedCommit])), legacyExpectedCommit: expectedCommit };
  }

  const request = JSON.parse(fs.readFileSync(path.resolve(requestPath), 'utf8'));
  if (request.schema_version !== 2) throw new Error('Worker evidence request schema_version must equal 2');
  if (!Array.isArray(request.services) || request.services.length === 0) throw new Error('Worker evidence request services must be a non-empty array');
  const services = request.services.map(String);
  if (new Set(services).size !== services.length) throw new Error('Worker evidence request services contains duplicates');
  if (JSON.stringify([...services].sort()) !== JSON.stringify(Object.keys(targetUrls).sort())) throw new Error('Worker evidence request must contain exactly the tracked services');
  if (!request.expected_commits || typeof request.expected_commits !== 'object' || Array.isArray(request.expected_commits)) throw new Error('Worker evidence request expected_commits must be an object');
  if (JSON.stringify(Object.keys(request.expected_commits).sort()) !== JSON.stringify([...services].sort())) throw new Error('Worker evidence request expected_commits must contain exactly the tracked services');
  const expectedCommits = Object.fromEntries(services.map((service) => {
    const commit = String(request.expected_commits[service] || '').toLowerCase();
    if (!SHA_RE.test(commit)) throw new Error(`${service}: expected commit must be a full Git SHA`);
    return [service, commit];
  }));
  return { services, expectedCommits, legacyExpectedCommit: null };
}

const { services, expectedCommits, legacyExpectedCommit } = loadExpectations();
for (const expectedCommit of new Set(Object.values(expectedCommits))) {
  const commitObject = git(['cat-file', '-e', `${expectedCommit}^{commit}`]);
  if (!commitObject.ok) throw new Error(`Expected commit ${expectedCommit} is not a commit in this repository`);
  const reachableFromMain = git(['merge-base', '--is-ancestor', expectedCommit, 'origin/main']);
  if (!reachableFromMain.ok) throw new Error(`Expected commit ${expectedCommit} is not reachable from origin/main`);
}

const results = [];
for (const service of services) {
  const url = targetUrls[service];
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
    if (response.status === 404) {
      throw new Error(`${service}: /deployment-info is not live. Deploy this Worker through scripts/deploy-worker-with-provenance.mjs before running verification.`);
    }
    throw new Error(`${service}: deployment-info returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.service !== service) throw new Error(`${service}: service field mismatch`);
  if (!SHA_RE.test(String(payload.commit || ''))) throw new Error(`${service}: commit is not a full Git SHA`);
  if (String(payload.commit).toLowerCase() !== expectedCommits[service]) {
    throw new Error(`${service}: deployed commit ${payload.commit} does not match ${expectedCommits[service]}`);
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

const output = {
  verified_at: new Date().toISOString(),
  expected_commits: expectedCommits,
  workers: results,
};
if (legacyExpectedCommit) {
  delete output.expected_commits;
  output.expected_commit = legacyExpectedCommit;
}
console.log(JSON.stringify(output, null, 2));
