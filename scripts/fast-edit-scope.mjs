#!/usr/bin/env node
// Conservative PR/main-push fast-edit classifier. Unknown changes run full CI.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = /^(?:art|assets|img)\/[^/]+\.(?:png|jpe?g|webp|gif|avif)$/i;
const CSS = /^css\/[a-z0-9_-]+\.css$/i;
const RISKY_CSS = /^css\/(?:avatar-builder-test|battle-layer|faction-chamber|faction-operations|game-fullscreen|moonpet-mini-app|my-moonboy|wiki-runtime-migration)\.css$/i;
const RISKY_PAGE = /^(?:moonpet-game|my-moonboy|how-to-play-crypto-moonboy-pets|admin-tools|avatar-builder-test|crypto-moonboy-pets-leaderboard|about|hubs|sam|graffiti-kings-creative-guide)\.html$/i;
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

// Tokenize actual HTML syntax, not tag-shaped strings inside attributes.
// Any ambiguous/malformed markup falls back to full CI.
const COPY_ELEMENTS = new Set(['h1','h2','h3','h4','h5','h6','p','span','strong','em','small','li','figcaption','title','label']);
const VOID_ELEMENTS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const RAW_ELEMENTS = new Set(['script','style','template','textarea','svg','iframe','object','noscript']);
function staticStructure(source) {
  let output = '', offset = 0;
  const stack = [];
  while (offset < source.length) {
    if (source.startsWith('<!--', offset)) {
      const end = source.indexOf('-->', offset + 4);
      if (end < 0) return null;
      output += source.slice(offset, end + 3);
      offset = end + 3;
      continue;
    }
    if (source[offset] !== '<') {
      const end = source.indexOf('<', offset);
      const limit = end < 0 ? source.length : end;
      const raw = source.slice(offset, limit);
      output += COPY_ELEMENTS.has(stack.at(-1)) && raw.trim() ? '__STATIC_TEXT__' : raw;
      offset = limit;
      continue;
    }
    // An unquoted > closes the element; an unquoted < inside a tag is ambiguous.
    let end = offset + 1, quote = '';
    while (end < source.length) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '<') return null;
      else if (char === '>') break;
      end++;
    }
    if (end >= source.length || quote) return null;
    const tag = source.slice(offset, end + 1);
    if (/^<!|^<\?/.test(tag)) { output += tag; offset = end + 1; continue; }
    const match = /^<(\/?)([a-z][\w:-]*)\b/i.exec(tag);
    if (!match) return null;
    const name = match[2].toLowerCase(), closing = match[1] === '/';
    if (closing) {
      if (stack.at(-1) !== name || !new RegExp('^<\\/' + name + '\\s*>$', 'i').test(tag)) return null;
      stack.pop();
      output += tag;
    } else {
      if (name === 'img' && inertImage(tag)) output += '';
      else output += tag;
      const selfClosing = /\/>$/.test(tag);
      if (!VOID_ELEMENTS.has(name) && !selfClosing) {
        if (RAW_ELEMENTS.has(name)) {
          const remaining = source.slice(end + 1);
          const close = new RegExp('<\\/' + name + '\\s*>', 'i').exec(remaining);
          if (!close) return null;
          output += source.slice(end + 1, end + 1 + close.index + close[0].length);
          offset = end + 1 + close.index + close[0].length;
          continue;
        }
        stack.push(name);
      }
    }
    offset = end + 1;
  }
  return stack.length ? null : output;
}
function safeCss(previous, source) {
  if (typeof previous !== 'string' || typeof source !== 'string') return false;
  // The fast path never introduces remote imports, URLs, escaped directives,
  // legacy CSS script hooks, or dynamic external fonts.
  if (/@import\b|@font-face\b|expression\s*\(|behavior\s*:|\\|https?:\/\/|url\s*\(\s*['"]?(?:https?:|\/\/|data:)/i.test(source)) return false;
  const urls = [...source.matchAll(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)];
  const without = source.replace(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,'');
  if (/url\s*\(/i.test(without)) return false;
  return urls.every(m => /^\/(?:art|assets|img)\/[a-z0-9%_./-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(m[2].trim()));
}

export function classifyFile(file) {
  const { path: filename, status, before, after, newBytes, changedLines } = file;
  if (/[\0\r\n\\]/.test(filename) || filename.split('/').includes('..') || filename.startsWith('/') || !['A', 'M'].includes(status)) return false;
  if (IMAGE.test(filename)) return newBytes > 0 && newBytes <= MAX_IMAGE_BYTES;
  if (CSS.test(filename)) return status === 'M' && !RISKY_CSS.test(filename) && newBytes <= MAX_TEXT_BYTES && safeCss(before, after);
  if (!PAGE.test(filename) || RISKY_PAGE.test(filename) || status !== 'M' || changedLines > 160 || newBytes > MAX_TEXT_BYTES || typeof before !== 'string' || typeof after !== 'string') return false;
  const original = staticStructure(before), revised = staticStructure(after);
  return original !== null && revised !== null && original === revised;
}
export function classifyChanges(files) {
  return files.length > 0 && files.length <= MAX_FILES && files.every(classifyFile);
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
function detect() {
  const event = process.env.GITHUB_EVENT_NAME;
  if (event !== 'pull_request' && !(event === 'push' && process.env.GITHUB_REF === 'refs/heads/main')) {
    return { fast: false, reason: 'Full CI for dispatch or untrusted event/ref' };
  }
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
