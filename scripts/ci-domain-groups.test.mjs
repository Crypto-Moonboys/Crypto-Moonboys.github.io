import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const deployWorkflow = await fs.readFile(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
const graphWorkflow = await fs.readFile(path.join(ROOT, '.github/workflows/graph-publishing-integrity.yml'), 'utf8');
const preparePagesArtifact = await fs.readFile(path.join(ROOT, 'scripts/prepare-pages-artifact.mjs'), 'utf8');
const changeScope = await fs.readFile(path.join(ROOT, 'scripts/ci-change-scope.mjs'), 'utf8');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
const runner = await fs.readFile(path.join(ROOT, 'scripts/ci-domain-runner.mjs'), 'utf8');
const canonApprovalExpression = "github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'canon-prose-change-approved') && '1' || '0'";
const ownershipBaselineExpression = "github.event_name == 'push' && github.event.before || github.event.pull_request.base.sha";

const expectedJobs = ['ci-wiki', 'ci-worker-api', 'ci-arcade', 'ci-wax', 'ci-visual'];
const expectedScripts = ['ci:wiki', 'ci:worker-api', 'ci:arcade', 'ci:wax', 'ci:visual'];

function getScopeBlock(scope) {
  const match = changeScope.match(new RegExp(`\\b${scope}: \\[([\\s\\S]*?)\\n  \\]`, 'u'));
  assert.ok(match, `ci-change-scope must define ${scope} scope`);
  return match[1];
}

function getStepBlock(workflowSource, stepName) {
  const match = workflowSource.match(new RegExp(`\\n      - name: ${stepName}\\n([\\s\\S]*?)(?=\\n      - name:|\\n  [a-zA-Z0-9_-]+:|$)`, 'u'));
  assert.ok(match, `workflow must define the ${stepName} step`);
  return match[1];
}

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
  'visual CI must call the shared change-scope classifier before gated visual checks',
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

assert.ok(
  preparePagesArtifact.includes("'sam-memory.json'"),
  'Pages artifact preparation must include sam-memory.json as a committed public root asset',
);

assert.ok(
  preparePagesArtifact.includes('Refusing to use unsafe Pages artifact path'),
  'Pages artifact preparation must reject destructive artifact output paths',
);

assert.ok(
  preparePagesArtifact.includes("'.git'") && preparePagesArtifact.includes("'.github'") && preparePagesArtifact.includes('isPathInside'),
  'Pages artifact preparation must reject protected repository paths before deleting the artifact target',
);

for (const graphPath of [
  '"categories/**"',
  '"about.html"',
  '"hubs.html"',
  '"sam.html"',
  '"sitemap.xml"',
  '"index_stats.json"',
  '"sam-memory.json"',
  '"website-publish-payloads/**"',
  '"sam-wiki-publisher.py"',
  '"scripts/**"',
]) {
  assert.ok(
    graphWorkflow.includes(graphPath),
    `graph publishing integrity workflow must run for ${graphPath}`,
  );
}

assert.ok(
  graphWorkflow.includes('git diff --exit-code --') && graphWorkflow.includes('sam-memory.json'),
  'graph publishing integrity workflow must fail when regenerated publishing surfaces drift from committed files',
);

assert.ok(
  graphWorkflow.includes('fetch-depth: 0'),
  'graph publishing integrity workflow must fetch history for baseline content-state comparisons',
);

assert.ok(
  graphWorkflow.includes('js/site-stats.json') && !graphWorkflow.includes('data/site-stats.json'),
  'graph publishing integrity workflow must check the generated js/site-stats.json output, not data/site-stats.json',
);

for (const arcadeWorkerInput of [
  "'workers/leaderboard-worker.js'",
  "'workers/moonboys-api/worker.js'",
  "'workers/moonboys-api/migrations/017_faction_season_lock.sql'",
  "'workers/moonboys-api/blocktopia/routes.js'",
  "'workers/moonboys-api/shared/faction-canon.js'",
]) {
  assert.ok(
    changeScope.includes(arcadeWorkerInput),
    `arcade CI scope must include Worker input ${arcadeWorkerInput}`,
  );
}

for (const visualWorkerInput of [
  "'workers/moonboys-api/worker.js'",
  "'workers/moonboys-api/routes/daily-digest.js'",
]) {
  assert.ok(
    changeScope.includes(visualWorkerInput),
    `visual CI scope must include Worker input ${visualWorkerInput}`,
  );
}

for (const graphGeneratedSurface of [
  "'sitemap.xml'",
  "'index_stats.json'",
  "'sam-memory.json'",
]) {
  assert.ok(
    changeScope.includes(graphGeneratedSurface),
    `graph CI scope must include generated root surface ${graphGeneratedSurface}`,
  );
}

for (const ownershipInput of [
  "'website-publish-payloads/**'",
  "'sam-wiki-publisher.py'",
  "'scripts/wiki-publish-staged-fs.cjs'",
]) {
  assert.ok(
    getScopeBlock('wiki').includes(ownershipInput),
    `wiki CI scope must include ownership input ${ownershipInput}`,
  );
  assert.ok(
    getScopeBlock('graph').includes(ownershipInput),
    `graph CI scope must include ownership input ${ownershipInput}`,
  );
}

for (const [name, workflowSource] of [
  ['main CI', workflow],
  ['graph publishing integrity', graphWorkflow],
]) {
  assert.ok(
    workflowSource.includes('types: [opened, synchronize, reopened, labeled, unlabeled]'),
    `${name} workflow must rerun ownership checks when canon approval labels are added or removed`,
  );
  assert.ok(
    workflowSource.includes('CANON_PROSE_CHANGE_APPROVED:') && workflowSource.includes(canonApprovalExpression),
    `${name} workflow must require the maintainer PR label and must not approve ordinary push events`,
  );
  assert.ok(
    !workflowSource.includes("github.event_name == 'push' ||"),
    `${name} workflow must not treat every push as approved canon prose`,
  );
}

for (const [name, stepBlock] of [
  ['main CI', getStepBlock(workflow, 'Run wiki tests')],
  ['graph publishing integrity', getStepBlock(graphWorkflow, 'Validate regenerated wiki surfaces')],
]) {
  assert.ok(
    stepBlock.includes(`BASE_SHA: \${{ ${ownershipBaselineExpression} }}`),
    `${name} ownership audit must compare a push against github.event.before and a PR against its base SHA`,
  );
  assert.ok(
    stepBlock.includes(`CANON_PROSE_CHANGE_APPROVED: \${{ ${canonApprovalExpression} }}`),
    `${name} ownership audit must only receive canon prose approval from the explicit PR label`,
  );
}

assert.ok(
  changeScope.includes('if (outputPath)') && !changeScope.includes('existsSync(outputPath)'),
  'CI change-scope must write GITHUB_OUTPUT whenever GitHub provides an output path',
);

for (const scope of ['wiki', 'arcade', 'wax', 'visual', 'graph']) {
  assert.ok(
    getScopeBlock(scope).includes("'scripts/ci-domain-runner.mjs'"),
    `${scope} CI scope must run when the shared CI domain runner changes`,
  );
}

console.log('CI domain grouping tests PASSED.');
