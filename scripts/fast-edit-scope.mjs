#!/usr/bin/env node
// Conservative PR-only fast-edit classifier. Unknown changes run full CI.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = /^(?:art|assets|img)\/.+\.(?:png|jpe?g|webp|gif|avif)$/i;
const CSS = /^css\/[a-z0-9_./-]+\.css$/i;
const PAGE = /^[a-z0-9][a-z0-9-]*\.html$/i;
const IMAGE_SRC = /^\/(?:art|assets|img)\/[a-z0-9%_./-]+\.(?:png|jpe?g|webp|gif|avif)(?:\?[a-z0-9%=&_-]+)?$/i;
const IMAGE_ATTRS = new Set(['src', 'alt', 'class', 'width', 'height', 'loading', 'decoding', 'fetchpriority']);
const MAX_FILES = 15, MAX_TEXT_BYTES = 2 * 1024 * 1024, MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function inertImage(tag) {
  const body = tag.replace(/^<img\b/i, '').replace(/\/?>$/, '');
  const attrs = [...body.matchAll(/\s+([a-z][\w:-]*)\s*=\s*("[^"]*"|'[^']*')/gi)];
  if (attrs.map(x => x[0]).join('').trim() !== body.trim()) return false;
  const seen = new Map();
  for (const a of attrs) {
    const name = a[1].toLowerCase();
    if (!IMAGE_ATTRS.has(name) || seen.has(name)) return false;
    seen.set(name, a[2].slice(1, -1));
  }
  if (!IMAGE_SRC.test(seen.get('src') || '')) return false;
  return ['width', 'height'].every(n => !seen.has(n) || /^[1-9]\d{0,4}$/.test(seen.get(n)));
}

function staticStructure(source) {
  const protectedRe = /<(script|style|template|textarea|svg|iframe|object|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;
  const protectedBytes = [...source.matchAll(protectedRe)].map(m => m[0]);
  let structure = source.replace(protectedRe, '<!--KEEP-->');
  structure = structure.replace(/<img\b[^<>]*\/?>/gi, tag => inertImage(tag) ? '' : tag);
  // Match literal text only within simple leaf elements; scripts and attributes stay byte-for-byte.
  structure = structure.replace(
    /(<(h[1-6]|p|span|strong|em|small|li|figcaption|title|label)\b[^<>]*>)([^<>]*)(<\/\2\s*>)/gi,
    '$1__STATIC_TEXT__$4',
  );
  return { structure, protectedBytes };
}

export function classifyFile(file) {
  const { path: filename, status, before, after, newBytes, changedLines } = file;
  if (/[\0\r\n\\]/.test(filename) || filename.split('/').includes('..') || filename.startsWith('/') || !['A', 'M'].includes(status)) return false;
  if (IMAGE.test(filename)) return newBytes > 0 && newBytes <= MAX_IMAGE_BYTES;
  if (CSS.test(filename)) return typeof after === 'string' && newBytes <= MAX_TEXT_BYTES;
  if (!PAGE.test(filename) || status !== 'M' || changedLines > 160 || newBytes > MAX_TEXT_BYTES || typeof before !== 'string' || typeof after !== 'string') return false;
  const original = staticStructure(before), revised = staticStructure(after);
  return original.structure === revised.structure && JSON.stringify(original.protectedBytes) === JSON.stringify(revised.protectedBytes);
}
export function classifyChanges(files) {
  return files.length > 0 && files.length <= MAX_FILES && files.every(classifyFile);
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
function detect() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') return { fast: false, reason: 'Push/dispatch must run normal CI' };
  const base = process.env.BASE_SHA || '', head = process.env.HEAD_SHA || '';
  if (!/^[0-9a-f]{40}$/i.test(base) || !/^[0-9a-f]{40}$/i.test(head)) return { fast: false, reason: 'Unknown base/head' };
  const entries = git(['diff', '--name-status', '-z', '--no-renames', base, head]).split('\0').filter(Boolean);
  if (entries.length % 2) return { fast: false, reason: 'Unknown git diff shape' };
  const changed = [];
  for (let i = 0; i < entries.length; i += 2) {
    const status = entries[i], filename = entries[i + 1];
    if (!['A', 'M'].includes(status)) return { fast: false, reason: 'Deleted/renamed/type-changed file' };
    const newBytes = Number(git(['cat-file', '-s', head + ':' + filename]).trim());
    const before = status === 'A' || IMAGE.test(filename) ? null : git(['show', base + ':' + filename]);
    const after = IMAGE.test(filename) ? null : git(['show', head + ':' + filename]);
    const numstat = git(['diff', '--numstat', '--no-renames', base, head, '--', filename]).trim().split('\t');
    changed.push({ path: filename, status, before, after, newBytes, changedLines: (Number(numstat[0]) || 0) + (Number(numstat[1]) || 0) });
  }
  return { fast: classifyChanges(changed), reason: changed.map(f => f.path).join(', ') };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { result = detect(); }
  catch (error) { result = { fast: false, reason: 'Fail closed: ' + error.message }; }
  console.log('fast_edit=' + result.fast + ' ' + result.reason);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'fast_edit=' + result.fast + '\n');
}
