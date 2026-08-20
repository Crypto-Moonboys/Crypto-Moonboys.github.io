import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const deployWorkflow = await fs.readFile(path.join(ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
const graphWorkflow = await fs.readFile(path.join(ROOT, '.github/workflows/graph-publishing-integrity.yml'), 'utf8');
const preparePagesArtifact = await fs.readFile(path.join(ROOT, 'scripts/prepare-pages-artifact.mjs'), 'utf8');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const runner = await fs.readFile(path.join(ROOT, 'scripts/ci-domain-runner.mjs'), 'utf8');

const expectedJobs = ['ci-wiki', 'ci-worker-api', 'ci-arcade', 'ci-wax', 'ci-visual'];
const expectedScripts = ['ci:wiki', 'ci:worker-api', 'ci:arcade', 'ci:wax', 'ci:visual'];

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
  ciRunLines.some((line) => /^run:\s+npm run test:/.test(line) || /^run:\s+node scripts\/(?!ci-change-scope\.mjs\b)/.test(line)),
  false,
  'workflow must not inline individual test scripts in domain jobs, except shared path-scope classification',
);

for (const group of ['wiki', 'worker-api', 'arcade', 'wax', 'visual']) {
  const keyPattern = new RegExp(`['"]?${group}['"]?:\\s*\\[`);
  assert.ok(keyPattern.test(runner), `ci-domain-runner must define ${group} group`);
}

assert.ok(
  pkg.scripts.test.includes('npm run ci:arcade') &&
  pkg.scripts.test.includes('npm run ci:worker-api') &&
  pkg.scripts.test.includes('npm run ci:wiki') &&
  pkg.scripts.test.includes('npm run ci:wax') &&
  pkg.scripts.test.includes('npm run ci:visual'),
  'npm test must compose the grouped CI domains',
);

assert.ok(
  runner.includes("['node', 'scripts/no-dead-placeholder-copy.mjs']"),
  'visual CI must run no-dead-placeholder-copy.mjs to guard public placeholder copy drift',
);

assert.ok(
  runner.includes("['node', 'scripts/moonpet-runtime-audit-completion.test.mjs']"),
  'worker-api CI must run moonpet-runtime-audit-completion.test.mjs',
);

assert.ok(
  runner.includes("['npm', 'run', 'test:avatar-builder']"),
  'visual CI must run the avatar builder asset and browser regression suite',
);

assert.ok(
  workflow.includes('npx playwright install --with-deps chromium'),
  'visual CI must install Chromium before running avatar builder browser tests',
);

assert.ok(
  workflow.includes('node scripts/ci-change-scope.mjs visual'),
  'visual CI must clearly report when docs/test-only changes skip visual checks',
);

assert.ok(
  workflow.includes('id: visual_changes'),
  'visual CI must classify changed files before installing Playwright Chromium',
);

assert.ok(
  workflow.includes("if: steps.visual_changes.outputs.should_run == 'true'"),
  'visual CI install and test steps must be gated by relevant visual/runtime changes',
);

assert.ok(
  !workflow.includes('"$file" == scripts/ci-domain-runner.mjs'),
  'visual CI changed-file gate must not treat the shared domain runner as a visual/runtime trigger',
);

assert.ok(
  !deployWorkflow.includes('npx playwright install --with-deps chromium'),
  'Pages deploy must not install Chromium; browser checks belong in CI only',
);

assert.ok(
  deployWorkflow.includes('path: public-site'),
  'Pages deploy must upload the curated public-site artifact instead of the repository root',
);

assert.ok(
  !deployWorkflow.includes('deployments/**'),
  'Pages deploy must not trigger on deployments/** unless that directory is copied into the artifact',
);

for (const rootPublicPattern of ['"*.png"', '"*.jpg"', '"*.jpeg"', '"*.webp"', '"*.gif"', '"*.svg"', '"*.xml"', '"*.txt"']) {
  assert.ok(
    deployWorkflow.includes(rootPublicPattern),
    `Pages deploy must trigger on root public asset pattern ${rootPublicPattern}`,
  );
}

assert.ok(
  preparePagesArtifact.includes("'sam-memory.json'"),
  'Pages artifact preparation must include sam-memory.json as a committed public root asset',
);

assert.ok(
  preparePagesArtifact.includes('Refusing to use unsafe Pages artifact path'),
  'Pages artifact preparation must reject destructive artifact output paths',
);

for (const graphPath of ['"categories/**"', '"about.html"', '"hubs.html"', '"sam.html"', '"scripts/**"']) {
  assert.ok(
    graphWorkflow.includes(graphPath),
    `graph publishing integrity workflow must run for ${graphPath}`,
  );
}

assert.ok(
  graphWorkflow.includes('git diff --exit-code --') && graphWorkflow.includes('sam-memory.json'),
  'graph publishing integrity workflow must fail when regenerated publishing surfaces drift from committed files',
);

console.log('CI domain grouping tests PASSED.');
