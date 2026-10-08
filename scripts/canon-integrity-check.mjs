#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tokenizeActiveHtml, readHtmlAttribute } from './wiki-html-structure.mjs';
import { htmlToVisibleText, extractArticleHtml, sha256 } from './generate-wiki-content-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_PATH = 'brand-canon/canon-locks.json';
const DECISIONS_PATH = 'brand-canon/reconciliation-decisions.json';
const CLAIM_ELEMENTS = new Set(['p', 'td', 'th', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function hasRegisteredAttribution(sentence, registeredSources) {
  const references = sentence.matchAll(/\b((?:W\d+|M\d+)(?:\.txt)?|decision:[A-Za-z0-9-]+)\b(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/giu);
  for (const reference of references) {
    const source = /^(?:W|M)\d+$/iu.test(reference[1]) ? `${reference[1]}.txt` : reference[1];
    if (!registeredSources.has(source.toLowerCase())) continue;
    const following = sentence.slice(reference.index + reference[0].length);
    if (/^[^.!?;]{0,110}\b(?:claims?|places?|dates?|gives?|says?|describes?|predicts?|promises?|asserts?|portrays?|offers?|reports?)\b/iu.test(following)) return true;
  }
  return false;
}

export function narrativeParagraphs(html) {
  const article = extractArticleHtml(html);
  const paragraphs = new Map();
  let start = null;
  for (const token of tokenizeActiveHtml(article)) {
    if (token.type !== 'tag' || token.name !== 'p') continue;
    if (!token.closing) start = token.end;
    else if (start !== null) {
      const text = htmlToVisibleText(article.slice(start, token.start)).replace(/\s+/gu, ' ').trim();
      if (text.length >= 40) paragraphs.set(sha256(text), text);
      start = null;
    }
  }
  return paragraphs;
}

// A prose-approval label alone cannot authorise silently losing a scene or its
// consequence. Revisions must identify the exact old and replacement evidence.
export function checkNarrativePreservation(beforeHtml, afterHtml, decisions, filename) {
  const before = narrativeParagraphs(beforeHtml), after = narrativeParagraphs(afterHtml);
  const errors = [];
  for (const [hash, text] of before) {
    if (after.has(hash)) continue;
    const receipt = decisions.decisions.find(d => d.affected_paths?.includes(filename)
      && ['implemented', 'approved'].includes(d.status) && d.sources?.length && d.reason
      && d.paragraph_changes?.some(change => change.old_sha256 === hash
        && change.new_sha256 && after.has(change.new_sha256) && change.reason));
    if (!receipt) errors.push(`${filename}: missing preserved narrative ${hash}: ${text.slice(0, 110)}; record the exact sourced replacement decision`);
  }
  return errors;
}

// Targeted explicit-claim guard. This deliberately does not pretend to solve
// arbitrary narrative contradictions. The source/decision audit remains human.
export function checkPage(html, locks, decisions, filename = '<fixture>') {
  const failures = [], stack = [];
  const allowed = new Set(locks.attributed_statuses);
  const sources = new Set([...locks.source_files, ...decisions.decisions.map(d => `decision:${d.id}`)]);
  const inlineSources = new Set([...sources].map(source => source.toLowerCase()));
  for (const token of tokenizeActiveHtml(html)) {
    if (token.type !== 'tag') continue;
    if (!token.closing) {
      const status = readHtmlAttribute(token.raw, 'data-canon-status').value;
      const source = readHtmlAttribute(token.raw, 'data-canon-source').value;
      if (status && (!allowed.has(status) || !sources.has(source))) {
        failures.push(`${filename}: invalid or unsourced canon attribution ${status}/${source}`);
      }
      if (!token.selfClosing && !['br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track', 'col'].includes(token.name)) {
        stack.push({ name: token.name, start: token.end, attributed: Boolean(status && allowed.has(status) && sources.has(source)) });
      }
    } else {
      const i = stack.findLastIndex(item => item.name === token.name);
      if (i < 0) continue;
      const node = stack[i];
      if (CLAIM_ELEMENTS.has(token.name)) {
        const text = htmlToVisibleText(html.slice(node.start, token.start));
        // Attribution cannot excuse unrelated assertions elsewhere in a paragraph.
        for (const sentence of text.split(/(?<=[.!?])\s+/u)) {
          for (const rule of locks.claim_rules) {
            const match = new RegExp(rule.pattern, 'iu').exec(sentence);
            if (!match) continue;
            if (rule.locked_anchor && Number(match.groups?.year) === locks.anchors[rule.locked_anchor]) continue;
            const attributed = stack.some(item => item.attributed)
              || hasRegisteredAttribution(sentence, inlineSources);
            const denied = new RegExp(rule.denial || '(?!)', 'iu').test(sentence);
            if (!attributed && !denied) failures.push(`${filename}: ${rule.id}: ${sentence}`);
          }
        }
      }
      stack.splice(i);
    }
  }
  return failures;
}

export function checkRegister(locks, decisions) {
  const errors = [];
  if (locks.schema_version !== 1 || decisions.schema_version !== 1) errors.push('Unsupported canon register schema');
  if (locks.source_files.length !== 94 || new Set(locks.source_files).size !== 94) errors.push('Expected 94 distinct source identities');
  if (locks.forty.named_readings.length + locks.forty.unassigned !== 40
    || new Set(locks.forty.named_readings).size !== locks.forty.named_readings.length) errors.push('Forty register count or duplicate names invalid');
  if (locks.forty.runtime_roster_size !== 9) errors.push('Battle Chamber roster requires independent runtime evidence');
  if (new Set(decisions.decisions.map(d => d.id)).size !== decisions.decisions.length) errors.push('Duplicate decision ID');
  for (const d of decisions.decisions) {
    if (!d.id || !d.sources?.length || !d.reason || !d.old || !d.new || !d.affected_paths?.length
      || !['implemented', 'proposed', 'approved'].includes(d.status)) errors.push(`Incomplete decision ${d.id}`);
    if (d.status === 'approved' && (!d.approval?.quote || !d.approval?.url || !d.approval?.date)) errors.push(`Missing GK approval evidence: ${d.id}`);
  }
  for (const rule of locks.claim_rules) {
    try { new RegExp(rule.pattern, 'iu'); new RegExp(rule.denial || '(?!)', 'iu'); }
    catch { errors.push(`Invalid claim rule ${rule.id}`); }
  }
  for (const receipt of locks.reviewed_story_baselines || []) {
    if (!/^[a-f0-9]{40}$/u.test(receipt.commit || '') || !receipt.source || !receipt.quote) errors.push('Invalid reviewed-story preservation baseline');
  }
  return errors;
}

export function checkLockChanges(before, after, decisions) {
  const errors = [];
  for (const field of ['anchors', 'forty', 'identity_boundaries', 'reviewed_story_baselines']) {
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
    const d = decisions.decisions.find(d => d.status === 'approved' && d.lock_field === field
      && JSON.stringify(d.old) === JSON.stringify(before[field]) && JSON.stringify(d.new) === JSON.stringify(after[field])
      && d.approval?.quote && d.approval?.url && d.approval?.date);
    if (!d) errors.push(`${field}: deliberate lock change needs a matching GK-approved old/new decision`);
  }
  return errors;
}

export function run(root = ROOT) {
  const locks = JSON.parse(fs.readFileSync(path.join(root, LOCK_PATH), 'utf8'));
  const decisions = JSON.parse(fs.readFileSync(path.join(root, DECISIONS_PATH), 'utf8'));
  const failures = checkRegister(locks, decisions);
  const ledger = fs.readFileSync(path.join(root, 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md'), 'utf8');
  const csv = fs.readFileSync(path.join(root, 'brand-canon/wiki-rewrites/raw-canon-20261008-source-register.csv'), 'utf8');
  const expected = [...ledger.matchAll(/\| ([A-Za-z0-9]+\.txt) \| (\d+) \| `([a-f0-9]{64})` \|/gu)]
    .map(m => `${m[1]},${m[2]},${m[3]}`).sort();
  const actual = csv.trim().split(/\r?\n/u).slice(1).map(row => row.split(',').slice(0, 3).join(',')).sort();
  if (expected.length !== 94 || JSON.stringify(expected) !== JSON.stringify(actual)
    || JSON.stringify(expected.map(row => row.split(',')[0])) !== JSON.stringify([...locks.source_files].sort())) {
    failures.push('Source identities, bytes and SHA-256 must match the independent immutable ledger');
  }
  const base = process.env.BASE_SHA || process.env.GITHUB_BASE_SHA;
  if (base) {
    if (!/^[a-f0-9]{40}$/iu.test(base)) failures.push('Invalid canon comparison baseline');
    else {
      let oldText;
      try { oldText = execFileSync('git', ['show', `${base}:${LOCK_PATH}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch {
        try {
          execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: root, stdio: 'ignore' });
          const names = execFileSync('git', ['ls-tree', '--name-only', base, LOCK_PATH], { cwd: root, encoding: 'utf8' });
          if (names.trim()) failures.push('Unable to read previous canon register');
        } catch { failures.push('Canon baseline commit unavailable'); }
      }
      if (oldText) failures.push(...checkLockChanges(JSON.parse(oldText), locks, decisions));
    }
  }
  let pages = 0;
  for (const name of fs.readdirSync(path.join(root, 'wiki')).sort()) {
    if (!name.endsWith('.html')) continue;
    pages++;
    failures.push(...checkPage(fs.readFileSync(path.join(root, 'wiki', name), 'utf8'), locks, decisions, `wiki/${name}`));
  }
  const baselines = new Set([base, ...(locks.reviewed_story_baselines || []).map(b => b.commit)].filter(Boolean));
  for (const baseline of baselines) {
    try {
      const manifest = JSON.parse(execFileSync('git', ['show', `${baseline}:brand-canon/wiki-content-state.json`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
      for (const page of manifest.pages) {
        if (!page.page_exists || page.nft_template_generated_page || page.page_type === 'nft_specialist'
          || !(page.first_witness_page || page.likely_lore_page || page.canonical_content_block_count)) continue;
        const filename = page.path;
        if (!/^wiki\/[a-z0-9][a-z0-9-]*\.html$/u.test(filename)) { failures.push('Invalid preservation page path'); continue; }
        const currentPath = path.join(root, filename);
        if (!fs.existsSync(currentPath)) { failures.push(`${filename}: reviewed narrative page removed`); continue; }
        const before = execFileSync('git', ['show', `${baseline}:${filename}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        failures.push(...checkNarrativePreservation(before, fs.readFileSync(currentPath, 'utf8'), decisions, filename));
      }
    } catch (error) { failures.push(`Reviewed-story baseline unavailable or invalid: ${baseline}: ${error.message}`); }
  }
  for (const d of decisions.decisions) for (const filename of d.affected_paths) {
    if (!fs.existsSync(path.join(root, filename))) failures.push(`Decision ${d.id}: missing dependency ${filename}`);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    return 1;
  }
  console.log(`Canon guard passed: ${pages} top-level wiki pages; ${locks.source_files.length} source identities; ${decisions.decisions.length} traceable decisions. Semantic review still required.`);
  return 0;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) process.exitCode = run();
