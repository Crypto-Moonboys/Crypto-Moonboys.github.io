import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const runner = await fs.readFile(path.join(ROOT, 'scripts/ci-domain-runner.mjs'), 'utf8');

const expectedJobs = ['ci-wiki', 'ci-worker-api', 'ci-arcade', 'ci-waxonedge', 'ci-visual'];
const expectedScripts = ['ci:wiki', 'ci:worker-api', 'ci:arcade', 'ci:waxonedge', 'ci:visual'];

for (const job of expectedJobs) {
  assert.ok(workflow.includes(`  ${job}:`), `workflow must define ${job}`);
}

for (const scriptName of expectedScripts) {
  assert.equal(
    pkg.scripts[scriptName],
    `node scripts/ci-domain-runner.mjs ${scriptName.slice(3)}`,
    `package.json must define grouped script ${scriptName}`,
  );
  assert.ok(workflow.includes(`run: npm run ${scriptName}`), `workflow must call ${scriptName}`);
}

const ciRunLines = workflow
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('run:'));
const domainRunLines = ciRunLines.filter((line) => line.startsWith('run: npm run ci:'));
assert.equal(domainRunLines.length, expectedScripts.length, 'workflow must run one grouped command per CI domain job');
assert.equal(
  ciRunLines.some((line) => /^run:\s+(node scripts\/|npm run test:)/.test(line)),
  false,
  'workflow must not inline individual test scripts in domain jobs',
);

for (const group of ['wiki', 'worker-api', 'arcade', 'waxonedge', 'visual']) {
  const keyPattern = new RegExp(`['"]?${group}['"]?:\\s*\\[`);
  assert.ok(keyPattern.test(runner), `ci-domain-runner must define ${group} group`);
}

assert.ok(
  pkg.scripts.test.includes('npm run ci:arcade') &&
  pkg.scripts.test.includes('npm run ci:worker-api') &&
  pkg.scripts.test.includes('npm run ci:wiki') &&
  pkg.scripts.test.includes('npm run ci:waxonedge') &&
  pkg.scripts.test.includes('npm run ci:visual'),
  'npm test must compose the grouped CI domains',
);

assert.ok(
  runner.includes("['node', 'scripts/no-dead-placeholder-copy.mjs']"),
  'visual CI must run no-dead-placeholder-copy.mjs to guard public placeholder copy drift',
);

console.log('CI domain grouping tests PASSED.');
