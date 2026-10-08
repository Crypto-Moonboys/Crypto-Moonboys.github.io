import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ledgerPath = 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md';
const registerPath = 'brand-canon/wiki-rewrites/raw-canon-20261008-source-register.csv';

// Run the actual public npm command, with access to the original Git objects.
// Broken provenance must stop it before any JavaScript-only checks can run.
function runFixture(mutate) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-canon-command-'));
  try {
    execFileSync('git', ['init', '--quiet', fixture]);
    const objects = execFileSync('git', ['rev-parse', '--git-path', 'objects'], { cwd: ROOT, encoding: 'utf8' }).trim();
    fs.mkdirSync(path.join(fixture, '.git/objects/info'), { recursive: true });
    fs.writeFileSync(path.join(fixture, '.git/objects/info/alternates'), `${path.resolve(ROOT, objects)}\n`);
    for (const filename of [ledgerPath, registerPath, 'scripts/verify-w81-archive.py', 'scripts/verify-w81-archive.test.py']) {
      const destination = path.join(fixture, filename);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(ROOT, filename), destination);
    }
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true, scripts: { 'test:canon': packageJson.scripts['test:canon'] } }));
    mutate(fixture);
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:canon'], {
      cwd: fixture, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, 'invalid provenance or failing corruption tests must fail test:canon');
    return `${result.stdout}\n${result.stderr}`;
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test('test:canon rejects a changed archive checksum using the original Python verifier', () => {
  const output = runFixture(fixture => {
    const ledger = path.join(fixture, ledgerPath);
    fs.writeFileSync(ledger, fs.readFileSync(ledger, 'utf8').replace(/Archive SHA-256: `[a-f0-9]{64}`/u, `Archive SHA-256: \`${'0'.repeat(64)}\``));
  });
  assert.match(output, /Archive SHA-256 differs from immutable ledger/u);
});

test('test:canon recovers the archive from the recorded historical commit', () => {
  const output = runFixture(fixture => {
    const ledger = path.join(fixture, ledgerPath);
    fs.writeFileSync(ledger, fs.readFileSync(ledger, 'utf8').replace(/exact pre-retirement commit `[a-f0-9]{40}`/u, `exact pre-retirement commit \`${'0'.repeat(40)}\``));
  });
  assert.match(output, /verify-w81-archive\.py/u);
  assert.match(output, /git.*show.*0000000000000000000000000000000000000000:about\/w81\.zip/u);
});

test('test:canon propagates a failing Python corruption-test suite after valid recovery', () => {
  const output = runFixture(fixture => {
    fs.writeFileSync(path.join(fixture, 'scripts/verify-w81-archive.test.py'), 'raise SystemExit("fixture corruption regression failed")\n');
  });
  assert.match(output, /"files_verified": 94/u);
  assert.match(output, /fixture corruption regression failed/u);
});
