#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMMIT_RE = /^[0-9a-f]{40}$/i;
const BASE_URL = String(process.env.MOONPET_CANARY_BASE_URL || 'https://moonboys-api.sercullen.workers.dev').replace(/\/$/, '');
const REQUEST_MAX_MS = Number(process.env.MOONPET_HEALTH_REQUEST_MAX_MS || 15000);
const CANARY_SCRIPT = new URL('./moonpet-production-canary.mjs', import.meta.url);

function fail(message) {
  throw new Error(`Moonpet production health probe failed: ${message}`);
}

async function requestJson(path) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_MAX_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: controller.signal,
    });
    let payload;
    try { payload = await response.json(); } catch { fail(`${path} returned non-JSON HTTP ${response.status}`); }
    if (response.status !== 200) fail(`${path} returned HTTP ${response.status}`);
    return { payload, elapsed_ms: Math.round(performance.now() - started) };
  } catch (error) {
    if (error?.message?.startsWith('Moonpet production health probe failed:')) throw error;
    fail(`${path} ${error?.name === 'AbortError' ? `exceeded ${REQUEST_MAX_MS}ms` : `failed: ${error?.message || error}`}`);
  } finally {
    clearTimeout(timeout);
  }
}

function assertCommitOnMain(commit) {
  if (process.env.MOONPET_HEALTH_SKIP_GIT_CHECK === '1') return;
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { stdio: 'ignore' });
  } catch {
    fail(`deployed commit ${commit} is not present in checked-out main history`);
  }
}

function runCanary(commit) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(CANARY_SCRIPT)], {
      env: {
        ...process.env,
        MOONPET_EXPECTED_COMMIT: commit,
        MOONPET_CANARY_ACTION: 'none',
        MOONPET_CANARY_ALLOW_ACTION: '0',
        MOONPET_CANARY_ALLOW_WRITES: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

if (!Number.isFinite(REQUEST_MAX_MS) || REQUEST_MAX_MS < 100) fail('MOONPET_HEALTH_REQUEST_MAX_MS must be at least 100');
const parsedBase = new URL(BASE_URL);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsedBase.hostname);
if (parsedBase.protocol !== 'https:' && !loopback) fail('the health base URL must use HTTPS except for loopback tests');

const health = await requestJson('/health');
if (health.payload?.ok !== true) fail('/health did not report ok:true');

const deployment = await requestJson('/deployment-info');
const commit = String(deployment.payload?.commit || '').trim().toLowerCase();
if (!COMMIT_RE.test(commit)) fail('/deployment-info did not return a full commit SHA');
assertCommitOnMain(commit);

const canary = await runCanary(commit);
if (canary.status !== 0) {
  const safeMessage = String(canary.stderr || 'canary exited without an error message').trim().slice(-2000);
  fail(safeMessage);
}

let canaryReport;
try { canaryReport = JSON.parse(canary.stdout); } catch { fail('canary returned invalid JSON'); }
if (canaryReport?.ok !== true) fail('canary did not report ok:true');

console.log(JSON.stringify({
  ok: true,
  checked_at: new Date().toISOString(),
  deployed_commit: commit,
  checks: {
    health_ms: health.elapsed_ms,
    deployment_info_ms: deployment.elapsed_ms,
    canary: canaryReport.checks,
  },
}, null, 2));
