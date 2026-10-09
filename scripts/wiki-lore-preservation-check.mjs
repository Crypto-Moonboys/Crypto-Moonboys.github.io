#!/usr/bin/env node
// A lore edit owns canonical prose, not the article's engagement or site shell.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = html => html.match(/<!-- CANONICAL_CONTENT:BEGIN -->[\s\S]*?<!-- CANONICAL_CONTENT:END -->/g)?.join('') || '';
const normalize = html => html.replace(/\s+/g, ' ').trim();

function relatedLayouts(html) {
  const section = html.match(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/)?.[0] || '';
  const starts = [...section.matchAll(/<(div|details)\b[^>]*\bdata-related-group="([^"]+)"[^>]*>/g)];
  return new Map(starts.map((match, index) => {
    const block = section.slice(match.index, starts[index + 1]?.index);
    const grid = block.match(/<(div|ul)\b[^>]*class="([^"]*\bwiki-rabbit-(?:chip-)?grid\b[^"]*)"[^>]*>/);
    return [match[2], {
      tag: match[1],
      className: match[0].match(/class="([^"]*)"/)?.[1],
      open: /\sopen(?:\s|=|>)/.test(match[0]),
      grid: grid ? [grid[1], grid[2], grid[0].match(/role="([^"]*)"/)?.[1]] : null,
    }];
  }));
}

export function functionalShell(html) {
  const body = html.match(/<body\b[\s\S]*?<\/body>/i)?.[0];
  if (!body) throw new Error('Missing article body');
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] || '';
  const dependencies = [...head.matchAll(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<link\b[^>]*>/gi)]
    .map(match => match[0]).filter(tag => !/type=["']application\/ld\+json["']/i.test(tag));
  return normalize(dependencies.join('\n') + body
    .replace(/<!-- CANONICAL_CONTENT:BEGIN -->[\s\S]*?<!-- CANONICAL_CONTENT:END -->/g, '')
    .replace(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/g, '')
    .replace(/\bdata-canon-revision="\d+"/g, 'data-canon-revision="*"'));
}

export function preservationFailures(before, after, { loreBatch = true } = {}) {
  const failures = [];
  if (loreBatch) {
    const ids = html => new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
    const nextIds = ids(after);
    for (const id of ids(before)) if (!nextIds.has(id)) failures.push(`Existing article/navigation anchor removed: ${id}`);
  }
  if (canonical(before) && functionalShell(before) !== functionalShell(after)) {
    failures.push('Functional article body changed outside canonical prose/related paths');
  }
  if (loreBatch) {
    const next = relatedLayouts(after);
    for (const [title, layout] of relatedLayouts(before)) {
      if (JSON.stringify(next.get(title)) !== JSON.stringify(layout)) {
        failures.push(`Existing related navigation group removed or restructured: ${title}`);
      }
    }
  }
  if (loreBatch && /data-page-type=["']nft_(?:template|collection)["']/i.test(before)) {
    const article = html => normalize(html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || '');
    if (article(before) !== article(after)) failures.push('NFT article/descriptions changed in a lore batch');
  }
  return failures;
}

export function runPreservationCheck(root = ROOT) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const base = process.env.BASE_SHA || process.env.GITHUB_BASE_SHA || git(['merge-base', 'HEAD', 'origin/main']);
  const files = git(['diff', '--name-only', base, '--', 'wiki']).split('\n').filter(file => /^wiki\/[^/]+\.html$/.test(file));
  const pairs = files.flatMap(file => {
    let before;
    try { before = git(['show', `${base}:${file}`]); } catch { return []; } // New routes have no baseline.
    const after = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
    return [{ file, before, after }];
  });
  const loreBatch = pairs.some(({ before, after }) => canonical(before) !== canonical(after));
  if (!loreBatch) return { base, checked: 0, failures: [] }; // Dedicated functional/product changes have their own review.
  const failures = pairs.flatMap(({ file, before, after }) => {
    try { return preservationFailures(before, after, { loreBatch }).map(message => `${file}: ${message}`); }
    catch (error) { return [`${file}: ${error.message}`]; }
  });
  return { base, checked: pairs.length, failures };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const result = runPreservationCheck();
  if (result.failures.length) {
    console.error(result.failures.join('\n'));
    console.error('Lore updates must preserve functional components and NFT descriptions; review any separately authorised functional/product change independently.');
    process.exitCode = 1;
  } else console.log(`Lore functional preservation passed: ${result.checked} changed pages against ${result.base}.`);
}
