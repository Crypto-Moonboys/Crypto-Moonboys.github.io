import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFile(path.join(ROOT, relativePath), 'utf8');

const [
  index,
  css,
  bridge,
  widgets,
  deployWorkflow,
  liveWorkflow,
  pkgSource,
  runner,
] = await Promise.all([
  read('index.html'),
  read('css/homepage-audit-fixes.css'),
  read('js/home-ai-bridge.js'),
  read('js/home-widgets.js'),
  read('.github/workflows/deploy-pages.yml'),
  read('.github/workflows/live-site-verify.yml'),
  read('package.json'),
  read('scripts/ci-domain-runner.mjs'),
]);

const pkg = JSON.parse(pkgSource);

assert.ok(index.includes('name="moonboys-build-sha" content="__MOONBOYS_BUILD_SHA__"'), 'homepage must carry the build-SHA marker');
assert.ok(index.includes('href="/css/homepage-audit-fixes.css"'), 'homepage must load the focused audit stylesheet');
assert.ok(index.includes('class="home-hero-actions"'), 'homepage must expose primary text CTAs above the artwork sequence');
assert.ok(index.includes('ENTER ELIGIBLE REWARD DROPS AS THEY GO LIVE'), 'reward copy must be conditional on rollout');
assert.ok(index.includes('USE EVOLUTION FEATURES WHEN RELEASED'), 'evolution copy must be conditional on release');
assert.ok(!index.includes('RECEIVE NFT REWARDS'), 'homepage must not present the future NFT reward pipeline as already live');
assert.match(index, /<div class="home-ai-bridge-static">/, 'static bridge fallback must not be aria-hidden');
assert.ok(!/<div class="home-ai-bridge-static"[^>]*aria-hidden/i.test(index), 'static bridge fallback must remain available to assistive technology');
assert.match(index, /section-two-left\.jpg[\s\S]{0,220}loading="lazy"/, 'below-fold section-two artwork must be lazy-loaded');
assert.match(index, /home-ip-card-identity\.jpg[^>]+loading="lazy"/, 'below-fold action artwork must be lazy-loaded');

assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.launch-cta-row\s*\{[\s\S]*?grid-template-columns:\s*1fr;/, 'mobile launch CTAs must resolve to one column');
assert.match(css, /\.home-ai-bridge-static\s*\{[\s\S]*?display:\s*flex;/, 'no-JavaScript fallback must be visible by default');
assert.ok(bridge.includes("toggle.textContent = 'Pause animation'"), 'animation must expose a pause control');
assert.ok(bridge.includes("toggle.textContent = userPaused ? 'Resume animation' : 'Pause animation'"), 'animation control must expose its state');
assert.ok(!bridge.includes("staticEl.style.display = 'none'"), 'animation must not remove the accessible fallback');

assert.ok(widgets.includes('/^\\/(?!\\/)/'), 'safeHref must reject protocol-relative URLs');
assert.ok(widgets.includes('/^https:\\/\\//i'), 'safeHref must allow absolute HTTPS URLs');
assert.ok(!widgets.includes('/^https?:\\/\\//i'), 'safeHref must reject plain HTTP URLs');

assert.ok(deployWorkflow.includes('node scripts/stamp-build-meta.mjs'), 'deployment must stamp the exact commit SHA');
assert.ok(liveWorkflow.includes('node scripts/live-homepage-parity.mjs'), 'post-deploy verification must test commit and copy parity');
assert.equal(pkg.scripts['test:homepage-audit'], 'node scripts/homepage-audit-regression.test.mjs', 'package.json must expose the homepage regression test');
assert.ok(runner.includes("['node', 'scripts/homepage-audit-regression.test.mjs']"), 'visual CI must run the homepage regression test');

console.log('Homepage audit regression tests passed.');
