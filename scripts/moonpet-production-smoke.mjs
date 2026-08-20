#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const COMMIT_RE = /^[0-9a-f]{40}$/i;
const TIMEOUT_MS = Number(process.env.MOONPET_PRODUCTION_SMOKE_TIMEOUT_MS || 15000);

const ENDPOINTS = Object.freeze({
  workerHealth: 'https://moonboys-api.sercullen.workers.dev/health',
  deploymentInfo: 'https://moonboys-api.sercullen.workers.dev/deployment-info',
  gameHtml: 'https://cryptomoonboys.com/moonpet-game.html',
  miniAppJs: 'https://cryptomoonboys.com/js/moonpet-mini-app.js?v=20260820-weekly-journey-live-polish',
  miniAppCss: 'https://cryptomoonboys.com/css/moonpet-mini-app.css?v=20260820-weekly-journey-live-polish',
});

function fail(message) {
  throw new Error(`Moonpet production smoke failed: ${message}`);
}

function resolveExpectedCommit() {
  const supplied = process.argv[2] || process.env.MOONPET_EXPECTED_COMMIT || '';
  if (supplied) return supplied.trim().toLowerCase();

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    return '';
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const { accept, headers, ...fetchOptions } = options;
  try {
    return await fetch(url, {
      cache: 'no-store',
      redirect: 'manual',
      ...fetchOptions,
      headers: {
        Accept: accept || '*/*',
        'Cache-Control': 'no-cache',
        ...(headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    fail(`${url} request failed: ${error?.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : error?.message || error}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    fail(`${label} did not return JSON`);
  }
}

async function assertJsonEndpoint(label, url, validate) {
  const response = await fetchWithTimeout(url, { accept: 'application/json' });
  const payload = await readJson(response, label);
  if (response.status !== 200) fail(`${label} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  validate(payload);
  return { label, status: response.status, payload };
}

async function assertStatus(label, url) {
  const response = await fetchWithTimeout(url, { method: 'HEAD' });
  if (response.status === 405 || response.status === 501) {
    const getResponse = await fetchWithTimeout(url, { method: 'GET' });
    getResponse.body?.cancel();
    if (getResponse.status !== 200) fail(`${label} returned HTTP ${getResponse.status}`);
    return { label, status: getResponse.status, method: 'GET', url };
  }

  response.body?.cancel();
  if (response.status !== 200) fail(`${label} returned HTTP ${response.status}`);
  return { label, status: response.status, method: 'HEAD', url };
}

const expectedCommit = resolveExpectedCommit();
if (!COMMIT_RE.test(expectedCommit)) {
  fail('expected commit is missing or invalid. Pass it as an argument, set MOONPET_EXPECTED_COMMIT, or run from a git checkout.');
}

const health = await assertJsonEndpoint('Worker health', ENDPOINTS.workerHealth, (payload) => {
  if (payload?.ok !== true) fail(`Worker health ok was not true: ${JSON.stringify(payload)}`);
});

const deploymentInfo = await assertJsonEndpoint('Worker deployment-info', ENDPOINTS.deploymentInfo, (payload) => {
  const deployedCommit = String(payload?.commit || '').toLowerCase();
  if (!COMMIT_RE.test(deployedCommit)) {
    fail(`deployment-info commit is missing or invalid: ${JSON.stringify(payload)}`);
  }
  if (deployedCommit !== expectedCommit) {
    fail(`deployment-info commit ${payload.commit} did not match expected ${expectedCommit}`);
  }
});

const staticChecks = [];
staticChecks.push(await assertStatus('Moonpet game HTML', ENDPOINTS.gameHtml));
staticChecks.push(await assertStatus('Moonpet Mini App JS', ENDPOINTS.miniAppJs));
staticChecks.push(await assertStatus('Moonpet Mini App CSS', ENDPOINTS.miniAppCss));

console.log(JSON.stringify({
  ok: true,
  verified_at: new Date().toISOString(),
  expected_commit: expectedCommit,
  worker: {
    health: { status: health.status, ok: health.payload.ok },
    deployment_info: {
      status: deploymentInfo.status,
      commit: deploymentInfo.payload.commit,
      deployed_at: deploymentInfo.payload.deployed_at || null,
      service: deploymentInfo.payload.service || null,
    },
  },
  static: staticChecks.map(({ label, status, method, url }) => ({ label, status, method, url })),
}, null, 2));
