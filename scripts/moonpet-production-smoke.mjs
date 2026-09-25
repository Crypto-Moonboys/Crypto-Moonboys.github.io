#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const COMMIT_RE = /^[0-9a-f]{40}$/i;
const TIMEOUT_MS = Number(process.env.MOONPET_PRODUCTION_SMOKE_TIMEOUT_MS || 15000);
const SITE_ROOT = 'https://cryptomoonboys.com';

function fail(message) {
  throw new Error(`Moonpet production smoke failed: ${message}`);
}

function expectedUrl(source, pattern, label, groupIndex = 1) {
  const match = source.match(pattern);
  if (!match) fail(`could not resolve expected ${label} from the repository`);
  return new URL(match[groupIndex], SITE_ROOT).toString();
}

const ENDPOINTS = Object.freeze({
  workerHealth: 'https://moonboys-api.sercullen.workers.dev/health',
  deploymentInfo: 'https://moonboys-api.sercullen.workers.dev/deployment-info',
});

function resolveExpectedCommit() {
  const supplied = process.argv[2] || process.env.MOONPET_EXPECTED_COMMIT || '';
  if (supplied) return supplied.trim().toLowerCase();

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    return '';
  }
}

function readFileAtCommit(commit, filePath) {
  try {
    return execFileSync('git', ['show', `${commit}:${filePath}`], { encoding: 'utf8' });
  } catch {
    return null;
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

async function fetchHtmlEndpoint(label, url) {
  const response = await fetchWithTimeout(url, { headers: { Accept: 'text/html, text/plain;q=0.9,*/*;q=0.8' } });
  const body = await response.text();
  if (response.status !== 200) fail(`${label} returned HTTP ${response.status}`);
  return { label, status: response.status, url, body };
}

function extractAssetUrl(html, pattern, label, groupIndex = 2) {
  const match = html.match(pattern);
  if (!match) fail(`could not resolve ${label} from live Moonpet HTML`);
  return new URL(match[groupIndex], SITE_ROOT).toString();
}

function extractMoonpetLaunchUrl(html) {
  const match = html.match(/<a[^>]+href=(['"])([^'"]*\/moonpet-game\.html[^'"]*)\1[^>]*>\s*Moonpet OS\s*<\/a>/i);
  if (!match) fail('could not resolve Moonpet launch URL from the live Telegram games launcher');
  return new URL(match[2], SITE_ROOT).toString();
}

const expectedCommit = resolveExpectedCommit();
if (!COMMIT_RE.test(expectedCommit)) {
  fail('expected commit is missing or invalid. Pass it as an argument, set MOONPET_EXPECTED_COMMIT, or run from a git checkout.');
}

const workerSourceAtCommit = readFileAtCommit(expectedCommit, 'workers/moonboys-api/worker.js');
const gameHtmlSourceAtCommit = readFileAtCommit(expectedCommit, 'moonpet-game.html');
const EXPECTED = workerSourceAtCommit && gameHtmlSourceAtCommit
  ? Object.freeze({
      telegramGamesLauncher: expectedUrl(workerSourceAtCommit, /const\s+TELEGRAM_GAMES_MENU_URL\s*=\s*`\$\{SITE_URL\}([^`]+)`/, 'Telegram games launcher URL'),
      moonpetLaunchUrl: expectedUrl(workerSourceAtCommit, /const\s+MOONPET_MINI_APP_URL\s*=\s*`\$\{SITE_URL\}([^`]+)`/, 'Moonpet Mini App launch URL'),
      miniAppJs: expectedUrl(gameHtmlSourceAtCommit, /<script[^>]+src=(['"])([^'"]*\/js\/moonpet-mini-app\.js[^'"]*)\1/i, 'Moonpet Mini App JS URL', 2),
      miniAppCss: expectedUrl(gameHtmlSourceAtCommit, /<link[^>]+href=(['"])([^'"]*\/css\/moonpet-mini-app\.css[^'"]*)\1/i, 'Moonpet Mini App CSS URL', 2),
    })
  : null;

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

const launcherHtml = await fetchHtmlEndpoint('Telegram games launcher', EXPECTED ? EXPECTED.telegramGamesLauncher : `${SITE_ROOT}/games/telegram/`);
const liveMoonpetLaunchUrl = extractMoonpetLaunchUrl(launcherHtml.body);
if (EXPECTED && liveMoonpetLaunchUrl !== EXPECTED.moonpetLaunchUrl) {
  fail(`live Moonpet launch URL ${liveMoonpetLaunchUrl} did not match expected ${EXPECTED.moonpetLaunchUrl}`);
}
const gameHtml = await fetchHtmlEndpoint('Moonpet game HTML', liveMoonpetLaunchUrl);
const liveMiniAppJs = extractAssetUrl(gameHtml.body, /<script[^>]+src=(['"])([^'"]*\/js\/moonpet-mini-app\.js[^'"]*)\1/i, 'mini app js');
const liveMiniAppCss = extractAssetUrl(gameHtml.body, /<link[^>]+href=(['"])([^'"]*\/css\/moonpet-mini-app\.css[^'"]*)\1/i, 'mini app css');
if (EXPECTED && liveMiniAppJs !== EXPECTED.miniAppJs) {
  fail(`live Moonpet Mini App JS ${liveMiniAppJs} did not match expected ${EXPECTED.miniAppJs}`);
}
if (EXPECTED && liveMiniAppCss !== EXPECTED.miniAppCss) {
  fail(`live Moonpet Mini App CSS ${liveMiniAppCss} did not match expected ${EXPECTED.miniAppCss}`);
}

const staticChecks = [];
staticChecks.push({ label: launcherHtml.label, status: launcherHtml.status, method: 'GET', url: launcherHtml.url });
staticChecks.push({ label: gameHtml.label, status: gameHtml.status, method: 'GET', url: gameHtml.url });
staticChecks.push(await assertStatus('Moonpet Mini App JS', liveMiniAppJs));
staticChecks.push(await assertStatus('Moonpet Mini App CSS', liveMiniAppCss));

console.log(JSON.stringify({
  ok: true,
  verified_at: new Date().toISOString(),
  expected_commit: expectedCommit,
  expectation_mode: EXPECTED ? 'commit-aware' : 'live-only',
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
