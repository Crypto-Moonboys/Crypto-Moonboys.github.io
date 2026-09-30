#!/usr/bin/env node

import { createHmac } from 'node:crypto';
import { MOONPET_D1_PERFORMANCE_BUDGETS } from './moonpet-d1-performance-budget.mjs';

const COMMIT_RE = /^[0-9a-f]{40}$/i;
const TELEGRAM_ID_RE = /^\d{1,20}$/;
const SAFE_ACTIONS = new Set(['feed', 'play', 'clean']);
const BASE_URL = String(process.env.MOONPET_CANARY_BASE_URL || 'https://moonboys-api.sercullen.workers.dev').replace(/\/$/, '');
const EXPECTED_COMMIT = String(process.env.MOONPET_EXPECTED_COMMIT || process.argv[2] || '').trim().toLowerCase();
const BOT_TOKEN = String(process.env.MOONPET_CANARY_BOT_TOKEN || '');
const TELEGRAM_ID = String(process.env.MOONPET_CANARY_TELEGRAM_ID || '').trim();
const ACTION = String(process.env.MOONPET_CANARY_ACTION || 'none').trim().toLowerCase();
const REQUEST_MAX_MS = Number(process.env.MOONPET_CANARY_REQUEST_MAX_MS || MOONPET_D1_PERFORMANCE_BUDGETS.production_request_max_ms);

function fail(message) {
  throw new Error(`Moonpet production canary failed: ${message}`);
}

function requireSafeConfiguration() {
  let parsed;
  try { parsed = new URL(BASE_URL); } catch { fail('MOONPET_CANARY_BASE_URL is invalid'); }
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopback) fail('the canary base URL must use HTTPS (except loopback tests)');
  if (!COMMIT_RE.test(EXPECTED_COMMIT)) fail('MOONPET_EXPECTED_COMMIT must be a full 40-character commit');
  if (!BOT_TOKEN) fail('MOONPET_CANARY_BOT_TOKEN is required');
  if (!TELEGRAM_ID_RE.test(TELEGRAM_ID)) fail('MOONPET_CANARY_TELEGRAM_ID must be a numeric dedicated test account');
  if (process.env.MOONPET_CANARY_ALLOW_WRITES !== '1') {
    fail('MOONPET_CANARY_ALLOW_WRITES=1 is required because state refresh can initialize or recover saved state');
  }
  if (!Number.isFinite(REQUEST_MAX_MS) || REQUEST_MAX_MS < 100) fail('MOONPET_CANARY_REQUEST_MAX_MS must be at least 100');
  if (ACTION !== 'none' && !SAFE_ACTIONS.has(ACTION)) fail(`MOONPET_CANARY_ACTION must be one of: none, ${[...SAFE_ACTIONS].join(', ')}`);
  if (ACTION !== 'none' && process.env.MOONPET_CANARY_ALLOW_ACTION !== '1') {
    fail('MOONPET_CANARY_ALLOW_ACTION=1 is required before sending a gameplay action');
  }
}

function buildTelegramInitData() {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `moonpet-canary-${EXPECTED_COMMIT.slice(0, 12)}`,
    user: JSON.stringify({ id: TELEGRAM_ID, first_name: 'Moonpet Canary', username: 'moonpet_canary' }),
  });
  const checkString = [...values.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  values.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  return values.toString();
}

async function requestJson(path, options = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_MAX_MS);
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      cache: 'no-store',
      ...options,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...(options.headers || {}) },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    fail(`${path} request ${error?.name === 'AbortError' ? `exceeded ${REQUEST_MAX_MS}ms` : `failed: ${error?.message || error}`}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    if (controller.signal.aborted) fail(`${path} request exceeded ${REQUEST_MAX_MS}ms`);
    fail(`${path} returned non-JSON HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
  const elapsedMs = Math.round(performance.now() - started);
  if (elapsedMs > REQUEST_MAX_MS) fail(`${path} request exceeded ${REQUEST_MAX_MS}ms`);
  return { response, payload, elapsedMs };
}

function assertState(state) {
  if (!state || state.adopted !== true) fail('dedicated canary account must have an adopted Moonpet');
  if (!state.pet || !String(state.pet.pet_id || '')) fail('state is missing its authoritative pet identity');
  for (const key of ['pet_xp', 'energy', 'health']) {
    if (!Number.isFinite(Number(state.pet[key]))) fail(`state.pet.${key} is not numeric`);
  }
  if (!state.capabilities || !Array.isArray(state.cooldowns?.entries)) fail('state capabilities or cooldown timeline is missing');
  if (!Array.isArray(state.inventory) || !Array.isArray(state.guidance?.missions)) fail('state inventory or mission guidance is missing');
  if (!state.season_slots || !Array.isArray(state.season_slots.slots)) fail('state season roster is missing');
}

requireSafeConfiguration();

const deployment = await requestJson('/deployment-info');
if (deployment.response.status !== 200) fail(`/deployment-info returned HTTP ${deployment.response.status}`);
const deployedCommit = String(deployment.payload?.commit || '').toLowerCase();
if (deployedCommit !== EXPECTED_COMMIT) fail(`deployed commit ${deployedCommit || '(missing)'} does not match ${EXPECTED_COMMIT}`);

const initData = buildTelegramInitData();
const authBody = { init_data: initData };
const stateResult = await requestJson('/telegram-pets/app/state', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(authBody),
});
if (stateResult.response.status !== 200 || stateResult.payload?.ok !== true) {
  fail(`/telegram-pets/app/state returned HTTP ${stateResult.response.status}`);
}
assertState(stateResult.payload.state);

const privateBoard = await requestJson('/telegram-pets/app/leaderboard', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...authBody, period: 'seasonal', limit: 10 }),
});
if (privateBoard.response.status !== 200 || !Array.isArray(privateBoard.payload?.entries)) {
  fail(`/telegram-pets/app/leaderboard returned invalid HTTP ${privateBoard.response.status}`);
}

const publicBoard = await requestJson('/telegram-pets/leaderboard?period=seasonal&limit=10');
if (publicBoard.response.status !== 200 || !Array.isArray(publicBoard.payload?.entries)) {
  fail(`/telegram-pets/leaderboard returned invalid HTTP ${publicBoard.response.status}`);
}
if (privateBoard.payload.period !== 'seasonal' || publicBoard.payload.period !== 'seasonal') {
  fail('authenticated and public leaderboards did not report the seasonal period');
}
const leaderboardProjection = (entries) => entries.map((entry) => ({
  rank: Number(entry.rank),
  pet_id: String(entry.pet_id || ''),
  pet_xp: Number(entry.pet_xp),
}));
if (privateBoard.payload.period !== publicBoard.payload.period
  || JSON.stringify(leaderboardProjection(privateBoard.payload.entries)) !== JSON.stringify(leaderboardProjection(publicBoard.payload.entries))) {
  fail('authenticated and public seasonal leaderboard projections disagree');
}

let actionResult = null;
if (ACTION !== 'none') {
  actionResult = await requestJson('/telegram-pets/app/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...authBody, action: ACTION, request_id: `production-canary:${EXPECTED_COMMIT}:${ACTION}` }),
  });
  if (![200, 409].includes(actionResult.response.status) || !actionResult.payload?.result || !actionResult.payload?.state) {
    fail(`/telegram-pets/app/action returned invalid HTTP ${actionResult.response.status}`);
  }
  assertState(actionResult.payload.state);
}

console.log(JSON.stringify({
  ok: true,
  verified_at: new Date().toISOString(),
  expected_commit: EXPECTED_COMMIT,
  checks: {
    deployment_info_ms: deployment.elapsedMs,
    state_ms: stateResult.elapsedMs,
    private_leaderboard_ms: privateBoard.elapsedMs,
    public_leaderboard_ms: publicBoard.elapsedMs,
    action: actionResult ? { name: ACTION, status: actionResult.response.status, elapsed_ms: actionResult.elapsedMs,
      accepted: actionResult.payload.result.accepted === true, duplicate: actionResult.payload.result.duplicate === true,
      reason: actionResult.payload.result.reason || null } : null,
  },
}, null, 2));
