import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('authority alerts compare only scanned wiki pages with actual inbound links', () => {
  const report = read('js/authority-drift.json');
  const links = read('js/link-graph.json');
  assert.equal(report.summary.total_pages, report.entries.length);
  assert.equal(report.summary.high_drift_count, report.entries.filter(x => x.alert_level === 'high').length);
  for (const entry of report.entries) {
    assert.ok(entry.url.startsWith('/wiki/'), `unscanned route: ${entry.url}`);
    assert.equal(entry.inbound_links, links[entry.url]?.inbound_count, entry.url);
    assert.equal(entry.alert_level === 'high', entry.drift >= 0.6, entry.url);
  }
});

test('dashboard link counts exclude unscanned routes and planning-only gaps', () => {
  const gaps = read('js/content-gaps.json');
  const underlinked = gaps.underlinked_pages.filter(page =>
    page.url.startsWith('/wiki/') &&
    page.reasons.some(reason => reason.startsWith('low_inbound_links:'))
  );
  assert.equal(gaps.summary.underlinked_targets, underlinked.length);
  assert.equal(gaps.summary.content_gap_signals, gaps.underlinked_pages.length);
  assert.equal(gaps.summary.isolated_pages, gaps.isolated_pages.length);
  assert.ok(gaps.isolated_pages.every(page => page.url.startsWith('/wiki/')));
  assert.ok(underlinked.every(page => page.inbound_links < 3));
});
