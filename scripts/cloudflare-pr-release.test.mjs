import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { matchesValidationRun, pendingReleaseMigrations, plannedMigrations, requireRecoveryTree } from './cloudflare-pr-release.mjs';
import { buildWranglerDeployArgs } from './deploy-worker-with-provenance.mjs';

const folder = 'workers/moonboys-api/migrations/';
const applied = '134_support_merge_approval.sql';
const approved = '135_reviewed_change.sql';
const unrelated = '136_other_change.sql';

test('the PR plan accepts forward migrations and rejects history edits or renames', () => {
  assert.deepEqual(plannedMigrations([
    { filename: 'games/chain-maze/index.html', status: 'modified' },
    { filename: folder + approved, status: 'added' }
  ]), [approved]);
  for (const file of [
    { filename: folder + applied, status: 'modified' },
    { filename: folder + applied, status: 'removed' },
    { filename: 'docs/old.sql', previous_filename: folder + applied, status: 'renamed' },
    { filename: folder + 'nested/135_file.sql', status: 'added' }
  ]) assert.throws(() => plannedMigrations([file]), /forward migration/);
});

test('release can retry applied migrations and stops on unapproved pending migrations', () => {
  assert.deepEqual(pendingReleaseMigrations([applied, approved], [applied], [approved]), [approved]);
  assert.deepEqual(pendingReleaseMigrations([applied, approved], [applied, approved], [approved]), []);
  assert.throws(() => pendingReleaseMigrations([applied, approved, unrelated], [applied], [approved]), /outside this PR/);
  assert.throws(() => pendingReleaseMigrations([applied], [applied], [approved]), /missing from main/);
  assert.throws(() => pendingReleaseMigrations([applied, unrelated], [applied], []), /outside this PR/);
});

test('the PR release preserves dashboard variables and the provenance tag', () => {
  const commit = 'a'.repeat(40);
  const args = buildWranglerDeployArgs('moonboys-api', commit, { keepVars: true });
  assert.ok(args.includes('--keep-vars'));
  assert.equal(args[args.indexOf('--tag') + 1], commit);
  assert.ok(!buildWranglerDeployArgs('moonboys-api', commit).includes('--keep-vars'));
});

test('only the trusted workflow and exact reviewed PR head qualify as pre-merge validation', () => {
  const head = 'a'.repeat(40);
  const run = {
    path: '.github/workflows/cloudflare-pr-release.yml@main',
    event: 'pull_request_target',
    display_title: `Cloudflare validate PR #42 ${head}`
  };
  assert.ok(matchesValidationRun(run, '42', head));
  assert.ok(matchesValidationRun({ ...run, event: 'workflow_dispatch', head_branch: 'main' }, '42', head));
  assert.ok(!matchesValidationRun({ ...run, event: 'workflow_dispatch', head_branch: 'other' }, '42', head));
  assert.ok(!matchesValidationRun({ ...run, path: '.github/workflows/other.yml' }, '42', head));
  assert.ok(!matchesValidationRun({ ...run, event: 'pull_request' }, '42', head));
  assert.ok(!matchesValidationRun({ ...run, display_title: run.display_title.replace('validate', 'release') }, '42', head));
  assert.ok(!matchesValidationRun(run, '43', head));
  assert.ok(!matchesValidationRun(run, '42', 'b'.repeat(40)));
});

test('manual recovery permits the release fix and Waterfront queue edits only', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cloudflare-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', ...args],
    { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, body) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  };
  const commit = message => {
    git('add', '-A');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };

  git('init', '-q');
  write('workers/moonboys-api/deployment-entry.js', 'reviewed worker\n');
  write('scripts/block-topia-build-queue.cjs', 'old queue\n');
  const merge = commit('approved release');
  write('scripts/block-topia-build-queue.cjs', 'updated queue\n');
  write('scripts/cloudflare-pr-release.mjs', 'release recovery\n');
  const current = commit('later main');
  assert.doesNotThrow(() => requireRecoveryTree(merge, current, directory));

  for (const changed of ['workers/moonboys-api/deployment-entry.js', 'workers/shared/deployment-provenance.js',
    'package-lock.json', 'scripts/deploy-worker-with-provenance.mjs', 'unknown-build-input.js']) {
    git('reset', '--hard', current);
    write(changed, 'different input\n');
    const altered = commit(changed);
    assert.throws(() => requireRecoveryTree(merge, altered, directory), /outside the recovery allowlist/);
  }
});
