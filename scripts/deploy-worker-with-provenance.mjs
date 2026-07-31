#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA_RE = /^[0-9a-f]{40}$/i;

export const SUPPORTED_WORKERS = Object.freeze({
  'moonboys-api': 'workers/moonboys-api',
  leaderboard: 'workers/leaderboard',
  'anti-cheat': 'workers/anti-cheat',
});

export function buildWranglerDeployArgs(service, commitSha) {
  if (!SUPPORTED_WORKERS[service]) throw new Error(`Unsupported Worker: ${service}`);
  if (!SHA_RE.test(String(commitSha || ''))) throw new Error('Deployment commit must be a 40-character Git SHA');
  return [
    'wrangler',
    'deploy',
    '--tag',
    String(commitSha).toLowerCase(),
    '--message',
    `Deploy ${service} from ${String(commitSha).slice(0, 12)}`,
  ];
}

function quoteWindowsCommandArg(value) {
  const text = String(value);
  if (/["&|<>^]/.test(text)) {
    throw new Error(`Unsafe Windows command argument: ${text}`);
  }
  return /\s/.test(text) ? `"${text}"` : text;
}

export function buildWranglerProcessInvocation(service, commitSha, options = {}) {
  const platform = options.platform || process.platform;
  const deployArgs = buildWranglerDeployArgs(service, commitSha);

  if (platform === 'win32') {
    const command = options.comspec || process.env.ComSpec || 'cmd.exe';
    const commandLine = ['npx', ...deployArgs]
      .map(quoteWindowsCommandArg)
      .join(' ');
    return {
      command,
      args: ['/d', '/s', '/c', commandLine],
    };
  }

  return {
    command: 'npx',
    args: deployArgs,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(detail || `${command} exited with ${result.status}`);
  }
  return String(result.stdout || '').trim();
}

function git(args) {
  return run('git', args);
}

function assertDeployableCheckout() {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`Production Worker deploys must run from branch main; current branch is ${branch || 'detached HEAD'}`);
  }

  const dirty = git(['status', '--porcelain']);
  if (dirty) throw new Error('Production Worker deploys require a clean working tree');

  // Refresh the remote-tracking ref immediately before approval. Comparing
  // against a cached origin/main can otherwise certify and deploy stale code.
  git(['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main']);

  const head = git(['rev-parse', 'HEAD']).toLowerCase();
  const originMain = git(['rev-parse', 'origin/main']).toLowerCase();
  if (head !== originMain) {
    throw new Error('HEAD must exactly match the freshly fetched origin/main. Update the local main checkout before deploying.');
  }
  if (!SHA_RE.test(head)) throw new Error('Could not resolve a full deployment commit SHA');
  return head;
}

export function deployWorker(service) {
  const workerPath = SUPPORTED_WORKERS[service];
  if (!workerPath) {
    throw new Error(`Usage: node scripts/deploy-worker-with-provenance.mjs <${Object.keys(SUPPORTED_WORKERS).join('|')}>`);
  }

  const commitSha = assertDeployableCheckout();
  const invocation = buildWranglerProcessInvocation(service, commitSha);

  console.log(`[worker-deploy] service=${service}`);
  console.log(`[worker-deploy] commit=${commitSha}`);
  console.log('[worker-deploy] Cloudflare version tag will equal the repository commit.');

  run(invocation.command, invocation.args, {
    cwd: path.join(ROOT, workerPath),
    stdio: 'inherit',
  });
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  try {
    deployWorker(String(process.argv[2] || '').trim());
  } catch (error) {
    console.error(`[worker-deploy] ${error.message}`);
    process.exit(1);
  }
}
