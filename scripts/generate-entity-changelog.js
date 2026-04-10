#!/usr/bin/env node
/**
 * scripts/generate-entity-changelog.js
 *
 * Tracks metadata evolution by comparing ranking snapshots over time.
 *
 * Inputs:
 *   snapshots/ranking-*.json – historical rank snapshots [{title, url, rank_score}]
 *   js/wiki-index.json       – current state (rank_score, category, internal_link_count)
 *   js/entity-map.json       – current canonical entity metadata
 *
 * Output: js/entity-changelog.json
 * {
 *   "generated_at": "...",
 *   "snapshot_dates": ["2026-04-07", ...],
 *   "summary": { "total_entities", "changed_rank", "new_entities", "removed_entities" },
 *   "entries": [
 *     {
 *       "url", "title", "current_rank_score", "category",
 *       "rank_history": [{ "date", "rank_score" }, ...],
 *       "rank_delta":   <current - oldest>,
 *       "rank_trend":   "up" | "down" | "stable",
 *       "is_new"
 *     },
 *     ...
 *   ]
 * }
 *
 * Usage: node scripts/generate-entity-changelog.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT              = path.resolve(__dirname, '..');
const WIKI_INDEX_PATH   = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_MAP_PATH   = path.join(ROOT, 'js', 'entity-map.json');
const SNAPSHOTS_DIR     = path.join(ROOT, 'snapshots');
const OUTPUT_PATH       = path.join(ROOT, 'js', 'entity-changelog.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadSnapshots() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    return {};
  }

  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.startsWith('ranking-') && f.endsWith('.json'))
    .sort(); // chronological by filename (ranking-YYYY-MM-DD.json)

  const snapshots = {};
  for (const file of files) {
    const dateMatch = file.match(/ranking-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    try {
      const data = readJson(path.join(SNAPSHOTS_DIR, file));
      if (!Array.isArray(data)) continue;
      snapshots[date] = data;
    } catch (err) {
      console.warn(`Warning: could not parse snapshots/${file}: ${err.message}`);
    }
  }
  return snapshots;
}

function main() {
  const wikiIndex = readJson(WIKI_INDEX_PATH);
  const entityMap = readJson(ENTITY_MAP_PATH);
  const snapshots = loadSnapshots();

  const snapshotDates = Object.keys(snapshots).sort();

  // Build current state map: url -> entry
  const currentByUrl = new Map();
  for (const entry of wikiIndex) {
    currentByUrl.set(entry.url, entry);
  }

  // Build entity map lookup: url -> category
  const categoryByUrl = new Map();
  for (const e of entityMap) {
    categoryByUrl.set(e.canonical_url, e.category || '');
  }

  // Build historical rank maps: date -> Map(url -> rank_score)
  const snapshotMaps = {};
  for (const [date, rows] of Object.entries(snapshots)) {
    const m = new Map();
    for (const row of rows) {
      if (row.url && typeof row.rank_score === 'number') {
        m.set(row.url, row.rank_score);
      }
    }
    snapshotMaps[date] = m;
  }

  // Collect all URLs that appeared in any snapshot or current index
  const allUrls = new Set([
    ...currentByUrl.keys(),
    ...Object.values(snapshotMaps).flatMap(m => [...m.keys()]),
  ]);

  const entries = [];

  for (const url of [...allUrls].sort()) {
    const current = currentByUrl.get(url);
    const currentRankScore = current ? current.rank_score : null;
    const title = current ? current.title : '';
    const category = categoryByUrl.get(url) || (current && current.rank_signals ? current.rank_signals.category : '') || '';
    const isNew = !snapshotDates.some(date => snapshotMaps[date].has(url));

    // Build rank history from snapshots + current
    const rankHistory = [];

    for (const date of snapshotDates) {
      const scoreAtDate = snapshotMaps[date].get(url);
      if (scoreAtDate !== undefined) {
        rankHistory.push({ date, rank_score: scoreAtDate });
      }
    }

    // Determine trend by comparing oldest and newest snapshot values
    let rankDelta = 0;
    let rankTrend = 'stable';

    if (rankHistory.length >= 2) {
      const oldest = rankHistory[0].rank_score;
      const newest = rankHistory[rankHistory.length - 1].rank_score;
      rankDelta = newest - oldest;
      rankTrend = rankDelta > 0 ? 'up' : rankDelta < 0 ? 'down' : 'stable';
    } else if (rankHistory.length === 1 && currentRankScore !== null) {
      rankDelta = currentRankScore - rankHistory[0].rank_score;
      rankTrend = rankDelta > 0 ? 'up' : rankDelta < 0 ? 'down' : 'stable';
    }

    // Only include entries that have at least some history or are in current index
    if (!current && rankHistory.length === 0) continue;

    entries.push({
      url,
      title,
      category,
      current_rank_score: currentRankScore,
      rank_history:       rankHistory,
      rank_delta:         rankDelta,
      rank_trend:         rankTrend,
      is_new:             isNew,
    });
  }

  // Sort by abs(rank_delta) desc, then url for determinism
  entries.sort((a, b) =>
    Math.abs(b.rank_delta) - Math.abs(a.rank_delta) || a.url.localeCompare(b.url)
  );

  const changedRank = entries.filter(e => e.rank_delta !== 0).length;
  const newEntities = entries.filter(e => e.is_new).length;

  const output = {
    generated_at:   new Date().toISOString(),
    snapshot_dates: snapshotDates,
    summary: {
      total_entities:   entries.length,
      changed_rank:     changedRank,
      new_entities:     newEntities,
      trending_up:      entries.filter(e => e.rank_trend === 'up').length,
      trending_down:    entries.filter(e => e.rank_trend === 'down').length,
      stable:           entries.filter(e => e.rank_trend === 'stable').length,
    },
    entries,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    `js/entity-changelog.json written — ${entries.length} entities tracked across ${snapshotDates.length} snapshots`
  );
}

main();
