import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyFile, classifyChanges } from './fast-edit-scope.mjs';

const f = (path, before, after, extras = {}) => ({
  path, before, after, status: 'M', changedLines: 2,
  newBytes: typeof after === 'string' ? Buffer.byteLength(after) : 1024,
  ...extras,
});

test('artwork, small CSS and harmless leaf copy changes are fast', () => {
  assert.equal(classifyFile(f('art/Swarmsy’s Neon London Creator Arcade.jpg', null, null)), true);
  assert.equal(classifyFile(f('art/New Banner.jpg', null, null, {status:'A'})), true);
  assert.equal(classifyFile(f('css/wiki.css', 'a{color:red}', 'a{color:blue}')), true);
  assert.equal(classifyFile(f('community.html', '<main><h1>Old</h1></main>', '<main><h1>New</h1></main>')), true);
  assert.equal(classifyFile(f('gpt-users.html', '<main><h1>Title</h1></main>', '<main><img src="/art/New%20Banner.jpg" alt="Banner" width="1672" height="941"><h1>Title</h1></main>')), true);
});

test('any executable/structural/unsafe change forces normal CI', () => {
  assert.equal(classifyFile(f('community.html', '<a href="/safe">Hi</a>', '<a href="https://unsafe.example">Hi</a>')), false);
  assert.equal(classifyFile(f('community.html', '<script>const x=1</script>', '<script>const x=2</script>')), false);
  assert.equal(classifyFile(f('community.html', '<h1>Title</h1>', '<h1 onclick="bad()">Title</h1>')), false);
  assert.equal(classifyFile(f('community.html', '<h1>Title</h1>', '<img src="/art/a.jpg" onerror="bad()"><h1>Title</h1>')), false);
  assert.equal(classifyFile(f('community.html', '<h1>Title</h1>', '<img src="https://evil.example/a.jpg"><h1>Title</h1>')), false);
  assert.equal(classifyFile(f('community.html', '<h1>Title</h1>', '<script src="/js/new.js"></script><h1>Title</h1>')), false);
});

test('protected wiki and game HTML, API, workflow and build files force full checks', () => {
  for (const file of ['wiki/crypto-moonboys.html', 'games/index.html', 'workers/moonboys-api/worker.js', 'js/site-shell.js', '.github/workflows/ci.yml', 'package.json', 'brand-canon/wiki-content-state.json']) {
    assert.equal(classifyFile(f(file, '<h1>a</h1>', '<h1>b</h1>')), false, file);
  }
  assert.equal(classifyFile(f('art/a.svg', null, null)), false);
  assert.equal(classifyFile(f('css/wiki.css', 'a{}', 'a{}', { status: 'D' })), false);
  assert.equal(classifyFile(f('art/a.png', null, null, {newBytes:9*1024*1024})), false);
  assert.equal(classifyFile(f('community.html', '<p>a</p>', '<p>b</p>', {changedLines:200})), false);
});

test('mixed PRs fail closed; empty and oversized change lists are not fast', () => {
  const safe = f('css/wiki.css','a{}','b{}');
  const risky = f('js/site-shell.js','foo','bar');
  assert.equal(classifyChanges([safe]), true);
  assert.equal(classifyChanges([safe,risky]), false);
  assert.equal(classifyChanges([]), false);
  assert.equal(classifyChanges(Array(16).fill(safe)), false);
});
