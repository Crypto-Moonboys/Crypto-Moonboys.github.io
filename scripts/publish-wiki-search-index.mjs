import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// These fields are consumed by wiki.js for matching, ranking, and rendering.
// Keep the editorial index intact for the publishing tools and SAM dashboard.
const ENTRY_FIELDS = [
  'url', 'title', 'category', 'tags', 'rank_score', 'desc', 'description',
  'excerpt', 'summary', 'meta_description', 'og_description',
];
const SEARCH_FIELDS = ['normalized_title', 'tokens', 'keyword_bag'];
const SOURCE_ATTRIBUTE = 'data-wiki-search-index="wiki-index.json"';
const COMPACT_FILENAME = 'wiki-search-index.json';

function selectFields(record, fields) {
  return Object.fromEntries(fields
    .filter(field => Object.hasOwn(record, field))
    .map(field => [field, record[field]]));
}

export function compactWikiSearchIndex(index) {
  return index.map(entry => {
    const compact = selectFields(entry, ENTRY_FIELDS);
    if (entry.search_index) compact.search_index = selectFields(entry.search_index, SEARCH_FIELDS);
    if (entry.brand?.concept_type) compact.brand = { concept_type: entry.brand.concept_type };
    return compact;
  });
}

export async function publishWikiSearchIndex(root) {
  const pagePath = path.join(root, 'search.html');
  const html = await readFile(pagePath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!html?.includes(SOURCE_ATTRIBUTE)) return;

  const index = JSON.parse(await readFile(path.join(root, 'js', 'wiki-index.json'), 'utf8'));
  const compact = compactWikiSearchIndex(index);
  await writeFile(path.join(root, 'js', COMPACT_FILENAME), JSON.stringify(compact));
  await writeFile(pagePath, html.replace(SOURCE_ATTRIBUTE, `data-wiki-search-index="${COMPACT_FILENAME}"`));
}
