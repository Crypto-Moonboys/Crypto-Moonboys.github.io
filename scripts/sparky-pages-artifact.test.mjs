import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const artifact = path.resolve(process.argv[2] || 'public-site');
const source = path.resolve('.');
function artifactFile(relative) { return path.join(artifact,relative); }
function requirePublic(relative) {
  const filename = artifactFile(relative);
  assert.ok(existsSync(filename), 'Missing deployed Pages resource: /' + relative);
  assert.ok(statSync(filename).isFile(), 'Expected public file: /' + relative);
  assert.ok(statSync(filename).size > 0, 'Empty public file: /' + relative);
  return readFileSync(filename, 'utf8');
}

test('real Pages artifact publishes every SPARKY guide and canon handoff URL', () => {
  const rootPage = requirePublic('gpt-users.html');
  const app = requirePublic('js/sparky-gpt-app.js');
  const catalogSource = requirePublic('js/sparky-creator-activities.js');
  const mainGuide = requirePublic('sparky-chatgpt-guide.txt');
  const canonGuide = requirePublic('moonboy-ai-canon-guide.txt');
  const canonIndex = JSON.parse(requirePublic('moonboy-canon-index.json'));
  requirePublic('wiki/create-your-moonboy.html');
  requirePublic('js/creator-memory.js');
  requirePublic('js/creator-memory-studio.js');
  requirePublic('docs/portable-creator-memory.md');
  assert.match(rootPage, /creator-memory-studio/);

  assert.match(rootPage, /js\/sparky-gpt-app\.js/);
  assert.match(app, /moonboy-canon-index\.json/);
  assert.match(mainGuide, /SPARKY/i);
  assert.match(canonGuide, /PUBLIC Final Fork outcome remains unresolved/);
  assert.ok(canonIndex.sources.length >= 23);

  const catalog = JSON.parse(catalogSource.match(/Object\.freeze\(([\s\S]+)\);\s*$/)?.[1] || 'null');
  assert.equal(catalog.categories.length,12);
  const activities = catalog.categories.flatMap(group=>group.activities);
  assert.equal(activities.length,107);
  for (const guideName of new Set(activities.map(activity=>activity.guide))) {
    if (guideName === 'core') continue;
    const guidePath = 'guides/sparky/' + guideName + '.txt';
    assert.ok(existsSync(path.join(source,guidePath)), 'Source guide not found: '+guidePath);
    const published = requirePublic(guidePath);
    assert.ok(published.length > 1200, 'Published specialist guide is incomplete: '+guidePath);
  }
  for (const record of canonIndex.sources) {
    const url = new URL(record.url);
    assert.equal(url.origin, 'https://cryptomoonboys.com', 'Unexpected canon source host');
    requirePublic(decodeURIComponent(url.pathname).replace(/^\//,''));
  }
});

test('deployed discovery finds Moonboy creator route and restricted sources stay private', () => {
  const search = JSON.parse(requirePublic('js/wiki-index.json'));
  const found = search.some(entry=>entry.url==='/wiki/create-your-moonboy.html');
  assert.ok(found,'Creator page not in deployed wiki search index');
  const sitemap = requirePublic('sitemap.xml');
  assert.ok(sitemap.includes('https://cryptomoonboys.com/wiki/create-your-moonboy.html'));
  for (const restricted of [
    'brand-canon/story-bibles/gk-master-canon.md',
    'server',
    'workers',
    'scripts',
    '.github',
  ]) {
    assert.equal(existsSync(artifactFile(restricted)), false,'Private/forbidden path published: '+restricted);
  }
});
