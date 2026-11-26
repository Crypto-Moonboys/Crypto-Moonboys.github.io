import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkPublicDisclosure, isEditorialOnlyPath } from './public-canon-disclosure.mjs';
import { publishedLoreText } from '../workers/moonboys-api/shared/published-lore-text.mjs';
import { NFT_TEMPLATE_INDEX, NFT_TEMPLATE_SOURCE, readTemplateDataset, templateBucket } from '../workers/moonboys-api/shared/published-nft-templates.mjs';

const markdown = /^\/(?:about\/|guides\/|brand-canon\/story-bibles\/)[a-z0-9][\w./-]*\.md$/i;
const nftData = /^\/data\/(?:nft-collections\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*|(?:hodlmoonboys|gkniftyheads|noballgamess)\/(?:collection|templates?|template-[a-z-]+|live-template-supply))\.(?:json|csv)$/i;
const publicCanonIndex = '/moonboy-canon-index.json';
const waterfrontBrief = '/games/block-topia/waterfront/CITY-BRIEF.md';
const hidden = /(?:^|\/)(?:[._][^/]*|admin|auth|account|api|og-templates|snapshots|swarmsy-ai|test-builds|tests?)(?:\/|\.|$)|^\/wiki\/components\//i;
const safePath = /^\/(?:[a-z0-9][\w.~-]*\/)*[a-z0-9][\w.~-]*\.(?:html|md|json|csv)$/i;
const maxRecordBytes = 2_000_000;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function plain(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}

export async function publishBrainFeed(root, sourceCommit = process.env.GITHUB_SHA) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const candidates = entries.filter(entry => entry.isFile()).map(entry =>
    '/' + path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
  ).filter(route => safePath.test(route) && !hidden.test(route) && !isEditorialOnlyPath(route) &&
    (route.endsWith('.html') || route === publicCanonIndex || route === waterfrontBrief ||
      markdown.test(route) || nftData.test(route) || NFT_TEMPLATE_SOURCE.test(route))).sort();

  const searchIndex = JSON.parse(await readFile(path.join(root, 'js', 'wiki-index.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  }));
  const byPath = new Map(searchIndex.map(entry => [entry.url, entry]));
  const directory = path.join(root, 'brain-feed', 'records');
  await mkdir(directory, { recursive: true });

  const records = [];
  const nftCollections = new Map();
  async function addRecord(route, title, kind, body, description) {
    const payload = JSON.stringify({ path: route, title, kind, body }) + '\n';
    const bytes = Buffer.byteLength(payload);
    if (bytes > maxRecordBytes) throw new Error(`Brain feed record exceeds ${maxRecordBytes} bytes: ${route}`);
    const failures = checkPublicDisclosure(payload, route);
    if (failures.length) throw new Error(failures.join('\n'));
    const sha256 = digest(payload);
    await writeFile(path.join(directory, sha256 + '.json'), payload);
    records.push({ path: route, title, description, kind, sha256, bytes });
  }
  for (const route of candidates) {
    const raw = await readFile(path.join(root, route.slice(1)), 'utf8');
    const templateSource = route.match(NFT_TEMPLATE_SOURCE);
    const nft = nftData.test(route) || Boolean(templateSource);
    const body = (nft || route === publicCanonIndex ? raw : publishedLoreText(route, raw)).trim();
    if (!body) continue;
    if (!nft && route.endsWith('.html') && /<meta\b(?=[^>]*\bname\s*=\s*["']?(?:robots|googlebot)\b)(?=[^>]*\bcontent\s*=\s*["'][^"']*\b(?:noindex|none)\b)[^>]*>/i.test(raw)) continue;
    const entry = byPath.get(route);
    const title = plain(entry?.title ?? (!nft && (raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      raw.match(/^# (.+)$/m)?.[1]) || route.slice(1).replace(/[/-]/g, ' '))).slice(0, 180);
    const description = plain([
      entry?.desc,
      ...(Array.isArray(entry?.tags) ? entry.tags.slice(0, 30) : []),
      ...(Array.isArray(entry?.aliases) ? entry.aliases.slice(0, 15).map(alias => alias?.title) : []),
      body.slice(0, 400),
    ].filter(Boolean).join(' ')).slice(0, 850);
    const kind = nft || /(?:nft|template-\d+)/i.test(route) ? 'nft' : route.endsWith('.md') || route === publicCanonIndex ? 'canon' : 'page';
    if (templateSource) {
      const [, collection, dataset] = templateSource;
      const rows = readTemplateDataset(body, collection, dataset);
      if (rows.length) {
        if (!nftCollections.has(collection)) nftCollections.set(collection, new Map());
        const datasets = nftCollections.get(collection);
        if (!datasets.has(dataset) || !route.startsWith('/data/nft-collections/')) datasets.set(dataset, { route, rows });
        // Pages still serves the full source. The feed carries indexed facts when
        // wrapping an entire source would exceed the Worker's bounded read.
        if (Buffer.byteLength(JSON.stringify({ path: route, title, kind, body }) + '\n') > maxRecordBytes) continue;
      }
    }
    await addRecord(route, title, kind, body, description);
  }

  for (const [collection, datasets] of nftCollections) {
    const buckets = new Map();
    const sources = Object.fromEntries([...datasets].map(([dataset, { route }]) => [dataset, route]));
    for (const [dataset, { rows }] of datasets) {
      const unique = new Map();
      for (const row of rows) unique.set(row.id, unique.has(row.id) ? null : row);
      for (const row of unique.values()) {
        if (!row) continue;
        const bucket = templateBucket(row.id);
        if (!buckets.has(bucket)) buckets.set(bucket, new Map());
        const entries = buckets.get(bucket);
        if (!entries.has(row.id)) entries.set(row.id, {});
        entries.get(row.id)[dataset] = row;
      }
    }
    const target = path.join(root, NFT_TEMPLATE_INDEX, collection);
    await mkdir(target, { recursive: true });
    for (const [bucket, entries] of buckets) {
      const body = JSON.stringify({ collection, sources, templates: Object.fromEntries(entries) });
      const route = `${NFT_TEMPLATE_INDEX}${collection}/${bucket}.json`;
      await writeFile(path.join(target, `${bucket}.json`), body + '\n');
      await addRecord(route, `${collection} NFT template index ${bucket}`, 'nft', body, '');
    }
  }
  if (!records.length || records.length > 3500) throw new Error('Brain feed record count is outside the Worker read budget.');
  const revision = /^[a-f0-9]{40}$/.test(sourceCommit ?? '') ? sourceCommit : digest(JSON.stringify(records));
  const manifest = { schema_version: 1, revision, records };
  const index = JSON.stringify(manifest) + '\n';
  if (Buffer.byteLength(index) > 2_000_000) throw new Error('Brain feed index exceeds the Worker read budget.');
  await writeFile(path.join(root, 'brain-feed', 'index.json'), index);
  return manifest;
}
