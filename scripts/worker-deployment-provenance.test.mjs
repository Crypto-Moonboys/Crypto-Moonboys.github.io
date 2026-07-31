#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWranglerDeployArgs } from './deploy-worker-with-provenance.mjs';
import { readDeploymentProvenance, withDeploymentProvenance } from '../workers/shared/deployment-provenance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = '3c9ce0484bcb34867345ff103d2309d25afd20ec';
const TIMESTAMP = '2026-07-31T02:46:24.000Z';

const validEnv = {
  CF_VERSION_METADATA: {
    id: 'must-not-be-exposed',
    tag: SHA,
    timestamp: TIMESTAMP,
  },
};

const provenance = readDeploymentProvenance('example-worker', validEnv);
assert.equal(provenance.valid, true);
assert.deepEqual(provenance.payload, {
  service: 'example-worker',
  commit: SHA,
  deployed_at: TIMESTAMP,
  environment: 'production',
});
assert.equal('id' in provenance.payload, false, 'Cloudflare version IDs must not be exposed');

const invalid = readDeploymentProvenance('example-worker', {
  CF_VERSION_METADATA: { tag: 'not-a-commit', timestamp: 'not-a-date' },
});
assert.equal(invalid.valid, false);
assert.equal(invalid.payload.commit, null);
assert.equal(invalid.payload.deployed_at, null);

let delegated = 0;
let scheduled = 0;
const wrapped = withDeploymentProvenance({
  async fetch() {
    delegated += 1;
    return new Response('base');
  },
  async scheduled() {
    scheduled += 1;
  },
}, 'example-worker');

const infoResponse = await wrapped.fetch(new Request('https://worker.example/deployment-info'), validEnv, {});
assert.equal(infoResponse.status, 200);
assert.deepEqual(await infoResponse.json(), provenance.payload);
assert.equal(delegated, 0, 'deployment-info must not call the base Worker or storage routes');
assert.equal(infoResponse.headers.get('Cache-Control'), 'no-store');
assert.equal(infoResponse.headers.get('Access-Control-Allow-Origin'), '*');

const missingMetadata = await wrapped.fetch(new Request('https://worker.example/deployment-info'), {}, {});
assert.equal(missingMetadata.status, 503, 'missing provenance metadata must fail closed');
assert.equal(delegated, 0);

const ordinaryResponse = await wrapped.fetch(new Request('https://worker.example/health'), validEnv, {});
assert.equal(await ordinaryResponse.text(), 'base');
assert.equal(delegated, 1, 'ordinary routes must delegate unchanged');
await wrapped.scheduled({}, validEnv, {});
assert.equal(scheduled, 1, 'scheduled handlers must remain attached through object spreading');

for (const [service, expectedPath] of Object.entries({
  'moonboys-api': 'workers/moonboys-api',
  leaderboard: 'workers/leaderboard',
  'anti-cheat': 'workers/anti-cheat',
})) {
  const args = buildWranglerDeployArgs(service, SHA);
  assert.deepEqual(args.slice(0, 2), ['wrangler', 'deploy']);
  assert.equal(args[args.indexOf('--tag') + 1], SHA);
  assert.ok(args.includes('--message'));
  assert.ok(expectedPath.startsWith('workers/'));
}
assert.throws(() => buildWranglerDeployArgs('unknown', SHA), /Unsupported Worker/);
assert.throws(() => buildWranglerDeployArgs('moonboys-api', 'e'.repeat(39)), /40-character Git SHA/);

const configContracts = [
  ['workers/moonboys-api/wrangler.toml', 'main = "deployment-entry.js"'],
  ['workers/leaderboard/wrangler.toml', 'main               = "deployment-entry.js"'],
  ['workers/anti-cheat/wrangler.toml', 'main               = "deployment-entry.js"'],
];
for (const [relativePath, mainContract] of configContracts) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.ok(text.includes(mainContract), `${relativePath} must use the provenance entrypoint`);
  assert.match(text, /\[version_metadata\][\s\S]*binding\s*=\s*"CF_VERSION_METADATA"/);
}

for (const relativePath of [
  'workers/moonboys-api/deployment-entry.js',
  'workers/leaderboard/deployment-entry.js',
  'workers/anti-cheat/deployment-entry.js',
]) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.ok(text.includes('withDeploymentProvenance'));
}

const deployStatus = JSON.parse(fs.readFileSync(path.join(ROOT, 'workers/DEPLOY_STATUS.json'), 'utf8'));
for (const service of ['moonboys-api', 'leaderboard', 'anti-cheat']) {
  const folder = `workers/${service}`;
  assert.ok(
    String(deployStatus[folder]?.deploy_command || '').includes(`deploy-worker-with-provenance.mjs ${service}`),
    `${folder} must deploy through the provenance wrapper`,
  );
}

const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments/production.json'), 'utf8'));
for (const folder of ['workers/moonboys-api', 'workers/leaderboard', 'workers/anti-cheat']) {
  const urls = truth.workers[folder]?.verification_urls || [];
  assert.ok(urls.some((url) => String(url).endsWith('/deployment-info')), `${folder} must track its provenance endpoint`);
  assert.notEqual(truth.workers[folder].deployment_status, 'verified-live', 'this PR must not claim an undeployed Worker is live');
}

console.log('worker-deployment-provenance.test.mjs passed');
