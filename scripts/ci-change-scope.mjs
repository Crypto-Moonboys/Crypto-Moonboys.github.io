#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SCOPES = {
  wiki: [
    '**/*.html',
    'about/**',
    'api/**',
    'art/**',
    'assets/**',
    'brand-canon/**',
    'categories/**',
    'css/**',
    'data/**',
    'games/**',
    'img/**',
    'js/**',
    'lib/**',
    'og-templates/**',
    'shared/**',
    'snapshots/**',
    'wiki/**',
    '.github/workflows/ci.yml',
    '.github/workflows/wiki-ci.yml',
    'package.json',
    'package-lock.json',
  ],
  arcade: [
    'art/btqm/**',
    'art/invaders/**',
    'css/game-fullscreen.css',
    'games/**',
    'js/arcade/**',
    'js/game-fullscreen.js',
    'js/arcade-*.js',
    'battle-chamber/**',
    'avatar-builder-test.html',
    'moonpet-game.html',
    'crypto-moonboy-pets-leaderboard.html',
    'how-to-play*.html',
    'workers/leaderboard-worker.js',
    'workers/moonboys-api/worker.js',
    'workers/moonboys-api/shared/faction-canon.js',
    'scripts/*arcade*',
    'scripts/*btqm*',
    'scripts/*blocktopia*',
    'scripts/*invaders*',
    'scripts/*leaderboard*',
    'scripts/*faction*',
    'scripts/*avatar-builder*',
    'scripts/competitive-arcade-bootstrap-gate.test.mjs',
    'scripts/identity-gate-auth-guard.test.mjs',
    'scripts/public-arcade-branding-regression.test.mjs',
    'scripts/telegram-hard-gate-runtime-contract.test.mjs',
    'scripts/ui-timer-ownership.test.mjs',
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
  ],
  wax: [
    'data/**',
    'wiki/**',
    'js/**',
    'assets/**',
    'img/**',
    'gkniftyheads-incubator.html',
    'hubs.html',
    'articles.html',
    'scripts/*wax*',
    'scripts/*nft*',
    'scripts/*gkniftyheads*',
    'scripts/*noballgamess*',
    'scripts/*feed*',
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
  ],
  visual: [
    '**/*.html',
    'about/**',
    'api/**',
    'art/**',
    'assets/**',
    'battle-chamber/**',
    'categories/**',
    'css/**',
    'data/**',
    'games/**',
    'img/**',
    'js/**',
    'og-templates/**',
    'snapshots/**',
    'wiki/**',
    'scripts/*visual*',
    'scripts/avatar-builder-*',
    'scripts/portal-artwork.test.mjs',
    'scripts/right-rail-live-panels.test.mjs',
    'scripts/favicon-consistency.test.mjs',
    'scripts/anti-drift-check.mjs',
    'scripts/no-dead-placeholder-copy.mjs',
    'scripts/public-copy-trust-guard.test.mjs',
    'scripts/live-site-verify-static.test.mjs',
    'scripts/site-shell-parity-audit.mjs',
    'scripts/homepage-build-moonboy-hero.test.mjs',
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
    'playwright.config.*',
  ],
  graph: [
    'wiki/**',
    'brand-canon/**',
    'data/**',
    'js/**',
    'assets/**',
    'og-templates/**',
    'scripts/generate-publishing-surfaces.mjs',
    'scripts/graph-publishing-integrity.test.mjs',
    'scripts/ci-domain-runner.mjs',
    '.github/workflows/graph-publishing-integrity.yml',
    'package.json',
    'package-lock.json',
  ],
};

const scope = process.argv[2];
if (!SCOPES[scope]) {
  console.error(`Unknown CI change scope "${scope || ''}". Expected one of: ${Object.keys(SCOPES).join(', ')}`);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function commitExists(sha) {
  if (!sha) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function changedFiles() {
  if (process.env.CHANGED_FILES) {
    return process.env.CHANGED_FILES
      .split(/[\n,]/u)
      .map((file) => file.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  }

  const base = process.env.BASE_SHA || '';
  const head = process.env.HEAD_SHA || 'HEAD';
  if (!commitExists(head)) return null;
  if (!commitExists(base)) return null;

  return git(['diff', '--name-only', base, head])
    .split('\n')
    .map((file) => file.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function globToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      const after = pattern[index + 2];
      if (after === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index++;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += '$';
  return new RegExp(source, 'u');
}

const patterns = SCOPES[scope].map(globToRegExp);
const files = changedFiles();
const shouldRun = files === null || files.some((file) => patterns.some((pattern) => pattern.test(file)));

if (files === null) {
  console.log(`No reliable base/head SHA was available; running ${scope} checks.`);
} else if (shouldRun) {
  console.log(`${scope} change detected.`);
} else {
  console.log(`No ${scope} files changed; skipping ${scope} checks.`);
}

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath && existsSync(outputPath)) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(outputPath, `should_run=${shouldRun ? 'true' : 'false'}\n`);
}

console.log(`should_run=${shouldRun ? 'true' : 'false'}`);
