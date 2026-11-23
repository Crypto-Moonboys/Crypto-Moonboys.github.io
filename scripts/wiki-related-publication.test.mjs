import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publishWikiRelatedData } from './publish-direct-wiki-links.mjs';

test('publishes ordered, compact article-specific links from the current graph', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-related-publication-'));
  const entries = Array.from({ length: 10 }, (_, index) => ({
    url: `/wiki/target-${index}.html`,
    title: `Article ${index}`,
    desc: `Excerpt ${index} `.repeat(20),
  }));
  const graph = {
    '/wiki/source.html': {
      related_pages: [
        { target_url: '/wiki/source.html' },
        { target_url: '/wiki/missing.html' },
        { target_url: '//other.example/wiki/target-1.html' },
        ...entries.map(entry => ({ target_url: entry.url, reasons: ['not needed by the browser'] })),
      ],
    },
  };
  try {
    await mkdir(path.join(root, 'js'));
    await mkdir(path.join(root, 'wiki'));
    for (const url of ['/wiki/source.html', ...entries.map(entry => entry.url)]) {
      await writeFile(path.join(root, url), '<article>Keep this article intact.</article>');
    }
    await writeFile(path.join(root, 'js/entity-graph.json'), JSON.stringify(graph));
    await writeFile(path.join(root, 'js/wiki-index.json'), JSON.stringify(entries));
    await publishWikiRelatedData(root);

    const payload = JSON.parse(await readFile(path.join(root, 'js/wiki-related/source.json'), 'utf8'));
    assert.deepEqual(payload, entries.slice(0, 8).map(({ url, title, desc }) => ({
      target_url: url,
      title,
      desc: desc.slice(0, 120) + '…',
    })));
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'js/wiki-related/target-0.json'), 'utf8')), []);
    assert.equal(await readFile(path.join(root, 'wiki/source.html'), 'utf8'), '<article>Keep this article intact.</article>');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
