#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const landing = read('index.html');
const experience = read('join-us-on-the-wax-blockchain.html');
const sitemap = read('sitemap.xml');
const target = '/join-us-on-the-wax-blockchain.html';
const origin = 'https://cryptomoonboys.com';
const landingHead = landing.split(/<\/head>/i)[0];
const experienceHead = experience.split(/<\/head>/i)[0];
const landingMain = landing.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
const experienceMain = experience.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];

assert.ok(landingMain && experienceMain, 'Both routes need accessible main content');
assert.match(landingMain, /<h1\b[^>]*>THE WORLD IS[\s\S]*YOUR CANVAS/);
assert.match(landingMain, /<a\b[^>]*class="wax-entry-button"[^>]*href="\/join-us-on-the-wax-blockchain\.html"/);
assert.equal((landingMain.match(/<a\b/g) || []).length, 1, 'One prominent entry CTA, not another splash gate');
assert.doesNotMatch(landing, /<iframe\b|<video\b|home-art-strip|homepage-avatar-builder|Marilyn%20Monroe|src="\/js\/avatar-builder-test\.js"/i,
  'Entry route must not load the previous large videos, images or embedded builder');
assert.doesNotMatch(landing, /src="\/js\/(?:home-widgets|price-ticker|index_stats_v2|battle-layer)\.js"/i,
  'Entry route must not load the heavy homepage-only scripts');
assert.match(landing, /location\.replace\('\/join-us-on-the-wax-blockchain\.html' \+ window\.location\.hash\)/,
  'Old section anchors must continue to reach their moved content');
assert.match(experienceMain, /id="home-top-message"/);
assert.match(experienceMain, /id="build-moonboy"[^>]*class="homepage-avatar-builder avatar-builder-host"/);
assert.match(experienceMain, /id="how-it-works"/);
assert.match(experienceMain, /id="open-creative-academy"/);
assert.match(experienceMain, /id="your-creator-world"/);
assert.match(experienceMain, /id="graffiti-kings-archive"/);
assert.match(experienceMain, /home-art-strip-track/);
assert.match(experienceMain, /Marilyn%20Monroe%20Graffiti-HD/);
assert.match(experienceMain, /<iframe\b/);
assert.match(experience, /src="\/js\/avatar-builder-test\.js"/);
for (const [html, head, url] of [
  [landing, landingHead, origin + '/'],
  [experience, experienceHead, origin + target],
]) {
  assert.match(html, /class="page-home page-standard-shell/);
  assert.match(html, /src="\/js\/site-shell\.js"/);
  assert.equal((head.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(head.includes('rel="canonical" href="' + url + '"'), url + ' canonical');
  assert.ok(head.includes('property="og:url" content="' + url + '"'), url + ' og:url');
  assert.ok(head.includes('name="robots" content="index, follow"'), url + ' indexability');
}
assert.notEqual(landingHead.match(/<title>([^<]+)<\/title>/)?.[1],
  experienceHead.match(/<title>([^<]+)<\/title>/)?.[1],
  'Landing and experience must have unique search titles');
assert.ok(sitemap.includes('<loc>' + origin + target + '</loc>'), 'New WAX page must be in the sitemap');
assert.ok(sitemap.includes('<loc>' + origin + '/</loc>'), 'Original homepage remains in the sitemap');
const legacy = read('enter.html');
assert.match(legacy, /http-equiv="refresh" content="0;url=\/"/);
assert.match(legacy, /content="noindex, follow"/);
console.log('WAX two-home route split PASSED: lightweight root, preserved experience, shell, SEO and deep links.');
