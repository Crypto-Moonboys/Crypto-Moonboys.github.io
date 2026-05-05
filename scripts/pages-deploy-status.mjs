#!/usr/bin/env node
/**
 * pages-deploy-status.mjs
 *
 * Checks whether cryptomoonboys.com is serving the latest commit from main.
 *
 * Data sources (all via GitHub REST API v3):
 *   - Latest main commit SHA     → GET /repos/{owner}/{repo}/git/ref/heads/main
 *   - Pages deployment SHA       → GET /repos/{owner}/{repo}/deployments?environment=github-pages&per_page=1
 *   - Pages workflow run status  → GET /repos/{owner}/{repo}/actions/workflows/deploy-pages.yml/runs?branch=main&per_page=1
 *   - Pages site info / URL      → GET /repos/{owner}/{repo}/pages
 *
 * Verdicts (printed and determines exit code):
 *   DEPLOYED_LATEST      → exit 0    — live site is serving the latest commit
 *   DEPLOY_IN_PROGRESS   → exit 2    — deployment is running, check again later
 *   DEPLOYED_OLD_COMMIT  → exit 3    — Pages is up but serving an older commit
 *                          (exit 0 when PAGES_DEPLOY_STATUS_WARN_ONLY=1)
 *   DEPLOY_FAILED        → exit 4    — last deployment workflow failed/cancelled
 *   UNKNOWN              → exit 5    — could not determine status (API error, no token)
 *
 * Environment variables:
 *   GITHUB_TOKEN                    — required for API auth (auto-set in Actions)
 *   GITHUB_REPOSITORY               — owner/repo (auto-set in Actions; falls back to hardcoded)
 *   PAGES_DEPLOY_STATUS_WARN_ONLY   — set to "1" to allow DEPLOYED_OLD_COMMIT as exit 0
 *
 * Run:
 *   npm run deploy:status
 *   # or directly:
 *   node scripts/pages-deploy-status.mjs
 */

import https from 'node:https';
import { execSync } from 'node:child_process';

// ── Config ────────────────────────────────────────────────────────────────────
const REPO          = process.env.GITHUB_REPOSITORY || 'Crypto-Moonboys/Crypto-Moonboys.github.io';
const TOKEN         = process.env.GITHUB_TOKEN;
const WARN_ONLY     = process.env.PAGES_DEPLOY_STATUS_WARN_ONLY === '1';
const PAGES_WORKFLOW = 'deploy-pages.yml';

// ── GitHub API helper ─────────────────────────────────────────────────────────
function ghGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'User-Agent': 'pages-deploy-status/1.0',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: null, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Local git SHA helper ──────────────────────────────────────────────────────
function localGitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ── Output helpers ────────────────────────────────────────────────────────────
function log(msg)  { process.stdout.write(`${msg}\n`); }
function warn(msg) { process.stderr.write(`[WARN]  ${msg}\n`); }

function printField(label, value) {
  const padded = `${label}:`.padEnd(30);
  log(`  ${padded} ${value ?? '(unavailable)'}`);
}

// ── Verdict / exit code table ─────────────────────────────────────────────────
const VERDICTS = {
  DEPLOYED_LATEST:     { code: 0, next: 'run live-site verifier now' },
  DEPLOY_IN_PROGRESS:  { code: 2, next: 'wait and rerun' },
  DEPLOYED_OLD_COMMIT: { code: 3, next: 'wait and rerun' },
  DEPLOY_FAILED:       { code: 4, next: 'rerun Pages deployment' },
  UNKNOWN:             { code: 5, next: 'check GitHub Actions and Pages settings manually' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('\n═══ GitHub Pages Deploy Status ══════════════════════════════════');
  log(`  Repository:                    ${REPO}`);
  log(`  Time:                          ${new Date().toISOString()}`);
  if (WARN_ONLY) {
    log('  Mode:                          WARN_ONLY (DEPLOYED_OLD_COMMIT → exit 0)');
  }
  if (!TOKEN) {
    warn('GITHUB_TOKEN not set — API requests will be unauthenticated (rate-limited to 60/hr)');
  }
  log('');

  // ── 1. Latest main commit SHA ─────────────────────────────────────────
  let mainSha = null;
  let mainShaSource = 'unavailable';

  const refRes = await ghGet(`/repos/${REPO}/git/ref/heads/main`).catch(() => null);
  if (refRes && refRes.status === 200 && refRes.body?.object?.sha) {
    mainSha = refRes.body.object.sha;
    mainShaSource = 'GitHub API (refs/heads/main)';
  } else {
    // Fall back to local git
    mainSha = localGitSha();
    if (mainSha) {
      mainShaSource = 'local git (HEAD)';
    }
  }

  // ── 2. Pages site info ────────────────────────────────────────────────
  let pagesSiteUrl = null;
  let pagesStatus  = null;

  const pagesRes = await ghGet(`/repos/${REPO}/pages`).catch(() => null);
  if (pagesRes && pagesRes.status === 200 && pagesRes.body) {
    pagesSiteUrl = pagesRes.body.html_url ?? pagesRes.body.url ?? null;
    pagesStatus  = pagesRes.body.status ?? null;
  }

  // ── 3. Latest Pages deployment (environment=github-pages) ────────────
  let deployedSha       = null;
  let deployedAt        = null;
  let deployedUpdatedAt = null;
  let deployState       = null;

  const deploymentsRes = await ghGet(
    `/repos/${REPO}/deployments?environment=github-pages&per_page=1`,
  ).catch(() => null);

  if (deploymentsRes && deploymentsRes.status === 200 && Array.isArray(deploymentsRes.body) && deploymentsRes.body.length > 0) {
    const dep = deploymentsRes.body[0];
    deployedSha       = dep.sha ?? null;
    deployedAt        = dep.created_at ?? null;
    deployedUpdatedAt = dep.updated_at ?? null;

    // Fetch the deployment statuses to get the actual state
    const depId = dep.id;
    const depStatusRes = await ghGet(
      `/repos/${REPO}/deployments/${depId}/statuses?per_page=1`,
    ).catch(() => null);
    if (depStatusRes && depStatusRes.status === 200 && Array.isArray(depStatusRes.body) && depStatusRes.body.length > 0) {
      deployState = depStatusRes.body[0].state ?? null;
    }
  }

  // ── 4. Latest Pages workflow run ──────────────────────────────────────
  let runStatus     = null;
  let runConclusion = null;
  let runCreatedAt  = null;
  let runUpdatedAt  = null;
  let runSha        = null;
  let runUrl        = null;

  const runsRes = await ghGet(
    `/repos/${REPO}/actions/workflows/${PAGES_WORKFLOW}/runs?branch=main&per_page=1`,
  ).catch(() => null);

  if (runsRes && runsRes.status === 200 && runsRes.body?.workflow_runs?.length > 0) {
    const run       = runsRes.body.workflow_runs[0];
    runStatus       = run.status ?? null;
    runConclusion   = run.conclusion ?? null;
    runCreatedAt    = run.created_at ?? null;
    runUpdatedAt    = run.updated_at ?? null;
    runSha          = run.head_sha ?? null;
    runUrl          = run.html_url ?? null;
  }

  // ── Print gathered data ───────────────────────────────────────────────
  log('── Data ──────────────────────────────────────────────────────────');
  printField('Latest main commit SHA',   mainSha    ? `${mainSha.slice(0, 12)}…  (${mainShaSource})` : null);
  printField('Pages deployed SHA',       deployedSha ? `${deployedSha.slice(0, 12)}…` : null);
  printField('Pages deploy state',       deployState);
  printField('Pages site status',        pagesStatus);
  printField('Deployment URL',           pagesSiteUrl ?? 'https://cryptomoonboys.com');
  printField('Pages deployed at',        deployedAt);
  printField('Pages updated at',         deployedUpdatedAt);
  printField('Workflow run SHA',         runSha       ? `${runSha.slice(0, 12)}…` : null);
  printField('Workflow run status',      runStatus);
  printField('Workflow run conclusion',  runConclusion);
  printField('Workflow run created at',  runCreatedAt);
  printField('Workflow run updated at',  runUpdatedAt);
  printField('Workflow run URL',         runUrl);
  log('');

  // ── Determine verdict ─────────────────────────────────────────────────
  let verdict;

  // If we cannot determine the main SHA at all, everything is UNKNOWN.
  if (!mainSha) {
    verdict = 'UNKNOWN';
  } else if (runStatus === 'in_progress' || runStatus === 'queued' || runStatus === 'waiting' || deployState === 'pending' || deployState === 'queued') {
    verdict = 'DEPLOY_IN_PROGRESS';
  } else if (runConclusion === 'failure' || runConclusion === 'cancelled' || deployState === 'failure' || deployState === 'error') {
    verdict = 'DEPLOY_FAILED';
  } else if (deployedSha && deployedSha === mainSha && (deployState === 'success' || deployState === 'active')) {
    verdict = 'DEPLOYED_LATEST';
  } else if (runSha && runSha === mainSha && runConclusion === 'success' && !deployedSha) {
    // Workflow succeeded but we couldn't read deployment SHA — trust the run
    verdict = 'DEPLOYED_LATEST';
  } else if (deployedSha && deployedSha !== mainSha) {
    verdict = 'DEPLOYED_OLD_COMMIT';
  } else if (runSha && runSha !== mainSha && runConclusion === 'success') {
    // Latest successful run is for an older commit
    verdict = 'DEPLOYED_OLD_COMMIT';
  } else if (!deployedSha && !runSha) {
    verdict = 'UNKNOWN';
  } else {
    // Workflow succeeded and deployed SHA matches run SHA (which may differ from
    // mainSha only if a newer commit hasn't triggered a deploy yet)
    if (runConclusion === 'success' && runSha === deployedSha) {
      if (runSha === mainSha) {
        verdict = 'DEPLOYED_LATEST';
      } else {
        verdict = 'DEPLOYED_OLD_COMMIT';
      }
    } else {
      verdict = 'UNKNOWN';
    }
  }

  // ── Print verdict ─────────────────────────────────────────────────────
  const { code, next } = VERDICTS[verdict];
  const effectiveCode = (verdict === 'DEPLOYED_OLD_COMMIT' && WARN_ONLY) ? 0 : code;

  log('── Verdict ───────────────────────────────────────────────────────');
  log(`  ${verdict}`);
  log('');
  log('── Next action ───────────────────────────────────────────────────');
  log(`  → ${next}`);
  log('');

  if (effectiveCode === 0) {
    log('[OK] Pages deployment check passed.');
  } else {
    process.stderr.write(`[FAIL] Pages deployment check failed with verdict: ${verdict}\n`);
  }

  process.exit(effectiveCode);
}

main().catch(err => {
  process.stderr.write(`\n[ERROR] Unhandled error: ${err.stack || err}\n`);
  process.exit(1);
});
