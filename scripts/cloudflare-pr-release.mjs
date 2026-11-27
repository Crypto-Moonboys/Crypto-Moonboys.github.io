import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deployWorker } from './deploy-worker-with-provenance.mjs';
import { normalizeD1StatementResult } from './verify-d1-production-migrations.mjs';

const workerDir = 'workers/moonboys-api';
const migrationDir = workerDir + '/migrations/';
const migrationName = /^\d{3,}_[a-z0-9_]+\.sql$/;
const sha = /^[a-f0-9]{40}$/;
const numericId = /^[1-9]\d*$/;
const workflow = '.github/workflows/cloudflare-pr-release.yml';

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function git(...args) {
  return run('git', args);
}

function wrangler(...args) {
  return run('node_modules/.bin/wrangler', [...args, '--config', workerDir + '/wrangler.toml']);
}

function requireCheck(value, message) {
  if (!value) throw new Error(message);
}

export function plannedMigrations(files) {
  return files.flatMap(file => {
    if (!file.filename.startsWith(migrationDir) && !file.previous_filename?.startsWith(migrationDir)) return [];
    const name = file.filename.slice(migrationDir.length);
    requireCheck(file.status === 'added' && !file.previous_filename && migrationName.test(name),
      'D1 releases require new migration files. Add a forward migration to change existing schema.');
    return [name];
  }).sort();
}

export function pendingReleaseMigrations(inventory, applied, approved) {
  const pending = inventory.filter(name => !applied.includes(name)).sort();
  requireCheck(approved.every(name => inventory.includes(name)), 'A reviewed migration is missing from main.');
  requireCheck(pending.every(name => approved.includes(name)),
    'Production has pending migrations outside this PR. Reconcile the ledger before applying migrations.');
  return pending;
}

function checkedCommit() {
  const target = process.env.TARGET_COMMIT;
  requireCheck(sha.test(target ?? ''), 'Supply a full lowercase Git commit SHA.');
  return target;
}

function gh(endpoint, ...args) {
  return JSON.parse(run('gh', ['api', endpoint, ...args]));
}

function plan() {
  const { PR_NUMBER: number, STAGE: stage, VALIDATION_RUN: validationRun, GITHUB_OUTPUT: output } = process.env;
  const target = checkedCommit();
  requireCheck(process.env.GITHUB_REF === 'refs/heads/main', 'Dispatch the workflow from main.');
  requireCheck(numericId.test(number ?? ''), 'Supply a pull request number.');
  requireCheck(stage === 'validate' || stage === 'release', 'Choose validate or release.');
  const pull = gh('repos/{owner}/{repo}/pulls/' + number);
  requireCheck(pull.base.ref === 'main' && (pull.state === 'open' || pull.merged),
    'The PR must target main and be open or merged.');
  requireCheck(Number.isInteger(pull.changed_files) && pull.changed_files <= 3000, 'The PR file list exceeds the GitHub limit.');
  const files = [];
  for (let page = 1; page <= Math.ceil(pull.changed_files / 100); page += 1) {
    files.push(...gh(`repos/{owner}/{repo}/pulls/${number}/files?per_page=100&page=${page}`));
  }
  requireCheck(files.length === pull.changed_files, 'Could not read the complete PR file list.');
  const migrations = plannedMigrations(files);
  if (stage === 'validate') {
    requireCheck(pull.head.sha === target, 'The PR head changed. Request validation for the latest SHA.');
  } else {
    requireCheck(pull.merged && pull.merge_commit_sha === target && git('rev-parse', 'HEAD') === target,
      'Release requires the PR merge commit to be current main.');
    requireCheck(numericId.test(validationRun ?? ''), 'Supply a successful validation run ID.');
    const validation = gh('repos/{owner}/{repo}/actions/runs/' + validationRun);
    requireCheck(validation.path.split('@')[0] === workflow && validation.head_branch === 'main'
      && validation.event === 'workflow_dispatch' && validation.conclusion === 'success'
      && validation.display_title === `Cloudflare validate PR #${number} ${pull.head.sha}`,
    'The run must be a successful validation for this PR and its reviewed head.');
    for (const name of migrations) {
      const file = files.find(entry => entry.filename === migrationDir + name);
      requireCheck(git('hash-object', migrationDir + name) === file.sha,
        'The merged migration differs from the reviewed PR file.');
    }
  }
  appendFileSync(output, `migrations=${migrations.join(',')}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `## Cloudflare ${stage}\n\nPR #${number} · \`${target}\`\n\nD1 migrations in this PR: ${migrations.join(', ') || 'none'}\n`);
}

function ledger() {
  const payload = JSON.parse(wrangler('d1', 'execute', 'wikicoms', '--remote',
    '--command', 'SELECT name FROM d1_migrations ORDER BY id', '--json'));
  return normalizeD1StatementResult(payload).results.map(row => row.name);
}

function exportSchema(directory) {
  requireCheck(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
    'Set the D1 read token and Cloudflare account ID for migration validation.');
  mkdirSync(directory, { recursive: true });
  wrangler('d1', 'export', 'wikicoms', '--remote', '--no-data', '--output', path.join(directory, 'schema.sql'));
  writeFileSync(path.join(directory, 'ledger.json'), JSON.stringify(ledger()));
}

function migrationInputs() {
  const names = (process.env.RELEASE_MIGRATIONS || '').split(',').filter(Boolean);
  requireCheck(names.every(name => migrationName.test(name)) && new Set(names).size === names.length,
    'Invalid migration plan.');
  return names.sort();
}

function validateLocal(directory) {
  const state = path.join(process.env.RUNNER_TEMP ?? directory, 'cloudflare-pr-d1');
  const applied = JSON.parse(readFileSync(path.join(directory, 'ledger.json'), 'utf8'));
  const execute = file => wrangler('d1', 'execute', 'wikicoms', '--local', '--persist-to', state, '--file', file);
  execute(path.join(directory, 'schema.sql'));
  for (const name of migrationInputs().filter(name => !applied.includes(name))) {
    console.log('Validating migration ' + name);
    execute(migrationDir + name);
  }
}

function requireCurrentMain(expected) {
  requireCheck(git('branch', '--show-current') === 'main' && git('rev-parse', 'HEAD') === expected,
    'The checkout must be main at the approved merge commit.');
  requireCheck(git('status', '--porcelain') === '', 'Production release requires a clean checkout.');
  git('fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main');
  requireCheck(git('rev-parse', 'origin/main') === expected, 'Main advanced. Validate and approve the current release.');
}

async function release() {
  const commit = checkedCommit();
  requireCheck(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
    'Configure the Cloudflare production environment token and account ID.');
  requireCurrentMain(commit);
  const approved = migrationInputs();
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (approved.length) {
    const inventory = readdirSync(migrationDir).filter(name => name.endsWith('.sql'));
    const pending = pendingReleaseMigrations(inventory, ledger(), approved);
    if (pending.length) {
      requireCheck(process.env.APPLY_D1 === 'true', 'Approve the D1 migrations explicitly before releasing.');
      requireCurrentMain(commit);
      console.log(wrangler('d1', 'migrations', 'apply', 'wikicoms', '--remote'));
      const applied = ledger();
      requireCheck(approved.every(name => applied.includes(name)), 'D1 did not record all reviewed migrations.');
    }
    if (summary) appendFileSync(summary, `D1 ledger verified: ${approved.join(', ')}\n\n`);
  }
  requireCurrentMain(commit);
  deployWorker('moonboys-api', { keepVars: true });
  const origin = 'https://api.cryptomoonboys.com';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const [version, health] = await Promise.all(['/deployment-info', '/health'].map(route =>
        fetch(origin + route, { cache: 'no-store', signal: AbortSignal.timeout(5000) })));
      if (version.ok && health.ok && (await version.json()).commit === commit && (await health.json()).ok === true) {
        if (summary) appendFileSync(summary, `Live Worker health and provenance verified at \`${commit}\`.\n`);
        console.log('Live Worker verified at ' + commit);
        return;
      }
    } catch {
      // Version metadata can lag briefly while the deployment propagates.
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Deploy returned successfully, but live health and provenance could not be verified.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, directory] = process.argv.slice(2);
  if (mode === 'plan') plan();
  else if (mode === 'schema') exportSchema(directory);
  else if (mode === 'local') validateLocal(directory);
  else if (mode === 'release') await release();
  else throw new Error('Choose plan, schema, local or release.');
}
