#!/usr/bin/env node
/**
 * Audit the committed static sitemap against published HTML source.
 * Read-only: never regenerates pages, sitemaps, or search indexes.
 * Run: npm run seo:audit  (human-readable)
 *      npm run seo:audit -- --json
 *      npm run seo:audit -- --strict  (fails on any recorded defect)
 *
 * HTTP status, Google indexing and Core Web Vitals require separate
 * production checks; a repository audit cannot prove them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
if (rootIndex !== -1 && (!process.argv[rootIndex + 1] || process.argv[rootIndex + 1].startsWith('--'))) {
  throw new Error('Pass a published directory after --root, e.g. --root public-site');
}
const ROOT = rootIndex === -1 ? REPO_ROOT : path.resolve(REPO_ROOT, process.argv[rootIndex + 1]);
const SITE = 'https://cryptomoonboys.com';
const strict = process.argv.includes('--strict');
const json = process.argv.includes('--json');
const problems = [];
const stats = { urls: 0, checked: 0, errors: 0, warnings: 0, wiki: 0, other: 0 };
const seen = new Set();
const titles = new Map();

function add(severity, url, reason) {
  problems.push({ severity, url, reason });
  if (severity === 'error') stats.errors++;
  else stats.warnings++;
}
function attributes(tag) {
  const result = Object.create(null);
  for (const match of tag.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return result;
}
function headData(source) {
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || '';
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  const meta = (key, value) => metas.find(entry => entry[key]?.toLowerCase() === value)?.content || '';
  const canonical = links.filter(entry => (entry.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
  const title = (head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  return { head, metas, canonical, title,
    robots: [meta('name', 'robots'), meta('name', 'googlebot')].join(','),
    description: meta('name', 'description'),
    ogUrl: meta('property', 'og:url'),
    ogTitle: meta('property', 'og:title'),
    ogDescription: meta('property', 'og:description') };
}
function localHtmlPath(url) {
  const parsed = new URL(url);
  if (parsed.origin !== SITE || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('URL is not a clean canonical site URL');
  }
  const pathname = decodeURIComponent(parsed.pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
    throw new Error('unsafe URL path');
  }
  const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
  if (!relative.endsWith('.html')) throw new Error('sitemap location does not identify an HTML page');
  const filename = path.resolve(ROOT, relative);
  if (!filename.startsWith(ROOT + path.sep)) throw new Error('URL resolves outside repository');
  return filename;
}

const sitemapPath = path.join(ROOT, 'sitemap.xml');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(match => match[1]);

for (const loc of locs) {
  stats.urls++;
  if (seen.has(loc)) { add('error', loc, 'duplicate sitemap URL'); continue; }
  seen.add(loc);
  let filename;
  try { filename = localHtmlPath(loc); }
  catch (error) { add('error', loc, error.message); continue; }
  if (!fs.existsSync(filename)) { add('error', loc, 'sitemap HTML file is missing'); continue; }
  stats.checked++;
  if (new URL(loc).pathname.startsWith('/wiki/')) stats.wiki++;
  else stats.other++;
  const html = fs.readFileSync(filename, 'utf8');
  const data = headData(html);
  if (!/<head\b/i.test(html) || !/<\/head>/i.test(html)) add('error', loc, 'missing HTML head');
  if (!html.trim()) add('error', loc, 'empty HTML document');
  if (/noindex/i.test(data.robots)) add('error', loc, 'sitemap page is marked noindex');
  if (/http-equiv\s*=\s*["']refresh["']/i.test(data.head)) add('error', loc, 'sitemap points to a meta-refresh redirect');
  if (!data.title) add('warning', loc, 'missing HTML title');
  if (!data.description.trim()) add('warning', loc, 'missing meta description');
  if (data.canonical.length > 1) add('error', loc, 'multiple canonical links');
  const canonical = data.canonical[0]?.href || '';
  if (!canonical) add('warning', loc, 'missing explicit canonical');
  else if (canonical !== loc) add('error', loc, 'canonical differs from sitemap URL: ' + canonical);
  if (data.ogUrl && data.ogUrl !== (canonical || loc)) add('warning', loc, 'og:url differs from canonical URL');
  if (!data.ogTitle || !data.ogDescription) add('warning', loc, 'incomplete Open Graph title/description');
  const existing = titles.get(data.title);
  if (data.title && existing) add('warning', loc, 'HTML title duplicates ' + existing);
  else if (data.title) titles.set(data.title, loc);
}
if (!locs.length) add('error', sitemapPath, 'sitemap has no <loc> elements');
if (!/Sitemap:\s*https:\/\/cryptomoonboys\.com\/sitemap\.xml/i.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'))) {
  add('error', 'robots.txt', 'missing or incorrect sitemap declaration');
}
const report = { scanned_at: new Date().toISOString(), site: SITE, ...stats, problems };
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log('SEO sitemap audit: ' + stats.checked + '/' + stats.urls +
    ' URLs checked; ' + stats.wiki + ' wiki, ' + stats.other + ' other; ' +
    stats.errors + ' errors, ' + stats.warnings + ' warnings.');
  for (const problem of problems.slice(0, 50)) {
    console.log('[' + problem.severity.toUpperCase() + '] ' + problem.url + ' — ' + problem.reason);
  }
  if (problems.length > 50) console.log('... ' + (problems.length - 50) + ' further findings (use --json for all).');
  console.log(rootIndex === -1
    ? 'Repository source metadata (some wiki canonicals are injected into the Pages artifact).'
    : 'Published artifact metadata; verify production HTTP, GSC indexing, Core Web Vitals and rich results separately.');
}
if (strict && problems.length) process.exitCode = 1;
