#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// In scripts/, run with no argument. An optional repository root also permits
// running this test before installing the test file into the repository.
const repositoryRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('hub generation preserves reviewed hubs and maintains unowned hubs', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moonboys-hub-preservation-'));
  try {
    for (const directory of ['scripts', 'js', 'wiki']) {
      fs.mkdirSync(path.join(fixtureRoot, directory));
    }

    // Run the production generator byte-for-byte. Only its filesystem root
    // changes through its existing __dirname-based path resolution.
    const generator = path.join(fixtureRoot, 'scripts', 'generate-hub-pages.js');
    fs.copyFileSync(path.join(repositoryRoot, 'scripts', 'generate-hub-pages.js'), generator);
    // Node resolves this symlink to the production module, so its imports and
    // brand-canon reads use the real dependency tree without copying/stubbing it.
    fs.symlinkSync(
      fs.realpathSync(path.join(repositoryRoot, 'scripts', 'generate-wiki-content-state.mjs')),
      path.join(fixtureRoot, 'scripts', 'generate-wiki-content-state.mjs'),
      'file',
    );

    // Two separate qualifying clusters exercise the supported-hub write path.
    // Reviewed/stale below has no cluster and exercises the deletion path.
    const groups = [
      ['reviewed', 'reviewed-peer-1', 'reviewed-peer-2', 'reviewed-peer-3'],
      ['current', 'current-peer-1', 'current-peer-2', 'current-peer-3'],
    ];
    const entityGraph = {};
    const wikiIndex = [];
    for (const group of groups) {
      group.forEach((slug, index) => {
        const url = `/wiki/${slug}.html`;
        entityGraph[url] = {
          related_pages: group.filter((peer) => peer !== slug).map((peer) => ({
            target_url: `/wiki/${peer}.html`,
            score: 80,
          })),
        };
        wikiIndex.push({
          url,
          title: slug,
          description: 'A fixture reference.',
          category: 'tokens',
          rank_score: 100 - index,
        });
      });
    }
    fs.writeFileSync(path.join(fixtureRoot, 'js', 'entity-graph.json'), JSON.stringify(entityGraph));
    fs.writeFileSync(path.join(fixtureRoot, 'js', 'wiki-index.json'), JSON.stringify(wikiIndex));

    const ownedHtml = (text) => Buffer.from(
      '<!DOCTYPE html>\n<article class="wiki-content" data-canon-revision="1" '
      + 'data-canon-source-tier="first-witness+w81">\n'
      + '<!-- CANONICAL_CONTENT:BEGIN -->\n'
      + `<p>${text}</p>\n`
      + '<!-- CANONICAL_CONTENT:END -->\n</article>\n',
    );
    const supportedBytes = ownedHtml('Reviewed supported hub: preserve this exact text and whitespace.');
    const staleBytes = ownedHtml('Reviewed stale hub: no graph cluster may erase this article.');
    const supported = path.join(fixtureRoot, 'wiki', 'reviewed-ecosystem.html');
    const stale = path.join(fixtureRoot, 'wiki', 'stale-reviewed-ecosystem.html');
    const unownedStale = path.join(fixtureRoot, 'wiki', 'old-ecosystem.html');
    const unownedCurrent = path.join(fixtureRoot, 'wiki', 'current-ecosystem.html');
    const oldGeneratedBytes = Buffer.from('<p>Old unowned generated hub; replace me.</p>\n');
    fs.writeFileSync(supported, supportedBytes);
    fs.writeFileSync(stale, staleBytes);
    fs.writeFileSync(unownedStale, '<p>Old unowned hub with no remaining cluster.</p>\n');
    fs.writeFileSync(unownedCurrent, oldGeneratedBytes);

    const result = spawnSync(process.execPath, [generator], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 0, `Generator failed: ${result.error?.message || "nonzero exit"}\n${result.stdout}\n${result.stderr}`);

    assert.deepEqual(fs.readFileSync(supported), supportedBytes,
      'A supported reviewed hub must remain byte-identical instead of being regenerated.');
    assert.ok(fs.existsSync(stale),
      'A reviewed hub without a current graph cluster must not be deleted.');
    assert.deepEqual(fs.readFileSync(stale), staleBytes,
      'A stale reviewed hub must remain byte-identical.');
    assert.equal(fs.existsSync(unownedStale), false,
      'An unowned stale generated hub must still be removed.');
    const regenerated = fs.readFileSync(unownedCurrent);
    assert.notDeepEqual(regenerated, oldGeneratedBytes,
      'An unowned supported generated hub must still be regenerated.');
    assert.match(regenerated.toString('utf8'), /^<!DOCTYPE html>/);
    assert.ok(regenerated.includes(Buffer.from('/wiki/current.html')));
    assert.ok(regenerated.includes(Buffer.from('/wiki/current-peer-1.html')),
      'The regenerated hub must contain the fixture cluster’s actual reading links.');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
