import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isRuntimeImagePolicyRelevant, parseGitNameStatus, runtimeImagePolicyViolations } from './check-runtime-image-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const manifest = {
  version: 1,
  assets: [{
    source: 'games/example/hero-master.png',
    output: 'games/example/hero-runtime.webp',
  }],
};

test('accepts only registered master and runtime raster changes', () => {
  assert.deepEqual(runtimeImagePolicyViolations([
    'games/example/hero-master.png',
    'games/example/hero-runtime.webp',
    'games/example/game.js',
  ], manifest), []);
});

test('rejects legacy raster names and unregistered convention files', () => {
  const violations = runtimeImagePolicyViolations([
    'games/example/new-art.png',
    'games/example/other-master.jpg',
    'games/example/other-runtime.webp',
  ], manifest);
  assert.equal(violations.length, 3);
  assert.match(violations[0], /changed raster files must be named/u);
  assert.match(violations[1], /master is not registered/u);
  assert.match(violations[2], /runtime WebP is not a declared manifest output/u);
});

test('runs for raster and pipeline changes but exits quickly for unrelated work', () => {
  assert.equal(isRuntimeImagePolicyRelevant(['games/example/game.js', 'wiki/page.html']), false);
  assert.equal(isRuntimeImagePolicyRelevant(['games/example/hero.png']), true);
  assert.equal(isRuntimeImagePolicyRelevant(['scripts/build-runtime-images.mjs']), true);
  assert.equal(isRuntimeImagePolicyRelevant(['.github/workflows/runtime-image-policy.yml']), true);
});

test('parses Unicode names, deletions and renames without Git quoting bypasses', () => {
  const changes = parseGitNameStatus(Buffer.from('A\0café.png\0D\0gone-master.png\0R100\0old.webp\0new-runtime.webp\0'));
  assert.deepEqual(changes, [
    { status: 'A', path: 'café.png' },
    { status: 'D', path: 'gone-master.png' },
    { status: 'D', path: 'old.webp' },
    { status: 'A', path: 'new-runtime.webp' },
  ]);
  assert.equal(isRuntimeImagePolicyRelevant(changes.map(change => change.path)), true);
});

test('keeps one stable read-only required check on every pull request', async () => {
  const policyWorkflow = await readFile(path.join(repositoryRoot, '.github/workflows/runtime-image-policy.yml'), 'utf8');
  const generatorWorkflow = await readFile(path.join(repositoryRoot, '.github/workflows/runtime-image-derivatives.yml'), 'utf8');
  assert.match(policyWorkflow, /^name: Runtime Image Policy$/mu);
  assert.match(policyWorkflow, /^  pull_request:\s*$/mu);
  assert.match(policyWorkflow, /^  push:\s*\n\s+branches:\s*\n\s+- main\s*\n\s+- master$/mu);
  assert.match(policyWorkflow, /^  workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(policyWorkflow, /^\s+paths(?:-ignore)?:/mu);
  assert.match(policyWorkflow, /^  contents: read$/mu);
  assert.match(policyWorkflow, /^    name: Runtime Image Policy$/mu);
  assert.doesNotMatch(policyWorkflow, /contents: write|pull_request_target|\$\{\{\s*secrets\./u);
  assert.doesNotMatch(generatorWorkflow, /\[skip ci\]/iu);
  assert.match(generatorWorkflow, /^  actions: write$/mu);
  assert.match(generatorWorkflow, /gh workflow run runtime-image-policy\.yml --ref "\$GITHUB_REF_NAME"/u);
});
