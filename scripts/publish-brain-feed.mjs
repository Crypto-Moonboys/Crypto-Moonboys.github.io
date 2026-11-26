import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkPublicDisclosure, isEditorialOnlyPath } from './public-canon-disclosure.mjs';
import { publishedLoreText } from '../workers/moonboys-api/shared/published-lore-text.mjs';

const markdown = /^\/(?:about\/|guides\/|brand-canon\/story-bibles\/)[a-z0-9][\w./-]*\.md$/i;
const nftData = /^\/data\/(?:nft-collections\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*|(?:hodlmoonboys|gkniftyheads|noballgamess)\/(?:collection|templates?|template-[a-z-]+|live-template-supply))\.(?:json|csv)$/i;
const publicCanonIndex = '/moonboy-canon-index.json';
const hidden = /(?:^|\/)(?:[._][^/]*|admin|auth|account|api|og-templates|snapshots|swarmsy-ai|tests?)(?:\/|\.|$)|^\/wiki\/components\//i;
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
    (route.endsWith('.html') || route === publicCanonIndex || markdown.test(route) || nftData.test(route))).sort();

  const searchIndex = JSON.parse(await readFile(path.join(root, 'js', 'wiki-index.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  }));
  const byPath = new Map(searchIndex.map(entry => [entry.url, entry]));
  const directory = path.join(root, 'brain-feed', 'records');
  await mkdir(directory, { recursive: true });

  const records = [];
  for (const route of candidates) {
    const raw = await readFile(path.join(root, route.slice(1)), 'utf8');
    const nft = nftData.test(route);
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
    const payload = JSON.stringify({ path: route, title, kind, body }) + '\n';
    const bytes = Buffer.byteLength(payload);
    if (bytes > maxRecordBytes) throw new Error(`Brain feed record exceeds ${maxRecordBytes} bytes: ${route}`);
    const failures = checkPublicDisclosure(payload, route);
    if (failures.length) throw new Error(failures.join('\n'));
    const sha256 = digest(payload);
    await writeFile(path.join(directory, sha256 + '.json'), payload);
    records.push({ path: route, title, description, kind, sha256, bytes });
  }
  if (!records.length) throw new Error('Refusing to publish an empty Brain feed.');
  const revision = /^[a-f0-9]{40}$/.test(sourceCommit ?? '') ? sourceCommit : digest(JSON.stringify(records));
  const manifest = { schema_version: 1, revision, records };
  const index = JSON.stringify(manifest) + '\n';
  if (Buffer.byteLength(index) > 2_000_000) throw new Error('Brain feed index exceeds the Worker read budget.');
  await writeFile(path.join(root, 'brain-feed', 'index.json'), index);
  return manifest;
}
