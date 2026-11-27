// Apply an editorial payload in a disposable website checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePayload } from './validate-website-publish-payloads.mjs';
import { assertOwnershipMarkerStructure, CANONICAL_CONTENT_END, countCanonicalContentBlocks, renderPageFromTemplate, sha256Content } from './import-website-publish-payloads.mjs';
import { selectCanonicalContentRoot, readHtmlAttribute, tokenizeActiveHtml } from './wiki-html-structure.mjs';
import { checkPublicDisclosure } from './public-canon-disclosure.mjs';
import { readCanonRevision } from './generate-wiki-content-state.mjs';
import { preservationFailures } from './wiki-lore-preservation-check.mjs';

const payload = validatePayload(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
assert.equal(payload.publish_mode, 'middle_content_only');
assert.match(payload.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const target = `wiki/${payload.slug}.html`;
assert.deepEqual(checkPublicDisclosure(JSON.stringify(payload), target), []);
let html;
if (fs.existsSync(target)) {
  const original = fs.readFileSync(target, 'utf8');
  const state = JSON.parse(fs.readFileSync('brand-canon/wiki-content-state.json', 'utf8'));
  const page = state.pages.find(item => item.path === target);
  assert(!page?.first_witness_page && !page?.nft_template_generated_page && page?.page_type !== 'nft_specialist',
    'First Witness and NFT pages require their dedicated editorial review');
  assert.equal(sha256Content(original), payload.expected_content_hash, 'The website article changed');
  assertOwnershipMarkerStructure(original, target);
  const { root, siblingRoots } = selectCanonicalContentRoot(original);
  assert(root && !siblingRoots.length && readHtmlAttribute(root.opening.raw, 'class').value?.split(/\s+/u).includes('wiki-content'),
    'A unique Wiki article boundary is required');
  assert(!/<meta\b[^>]*http-equiv=["']refresh["']/i.test(original), 'A redirect cannot be expanded');
  const ids = new Set(tokenizeActiveHtml(original).filter(token => token.type === 'tag' && !token.closing)
    .map(token => readHtmlAttribute(token.raw, 'id').value));
  for (const token of tokenizeActiveHtml(payload.article_html).filter(token => token.type === 'tag' && !token.closing)) {
    const id = readHtmlAttribute(token.raw, 'id').value;
    assert(!id || !ids.has(id), 'The new section duplicates an existing anchor');
    if (id) ids.add(id);
  }
  const insertion = '\n' + payload.article_html + '\n';
  const revision = readCanonRevision(original, target);
  let end = root.contentEnd;
  if (countCanonicalContentBlocks(original)) {
    end = original.indexOf(CANONICAL_CONTENT_END, root.contentStart);
    assert(end >= root.contentStart && end < root.contentEnd, 'The canonical ownership boundary is unsupported');
  }
  html = original.slice(0, end) + insertion + original.slice(end);
  if (revision) {
    const opening = root.opening.raw.replace(/(\bdata-canon-revision\s*=\s*)(["']?)(\d+)\2(?=\s|>)/i,
      (_, attribute, quote) => attribute + quote + String(revision.revision + 1) + quote);
    assert.notEqual(opening, root.opening.raw, 'The canon revision could not be advanced');
    html = html.slice(0, root.opening.start) + opening + html.slice(root.opening.end);
    assert.equal(readCanonRevision(html, target)?.revision, revision.revision + 1);
  }
  if (countCanonicalContentBlocks(original)) assert.deepEqual(preservationFailures(original, html), []);
  assertOwnershipMarkerStructure(html, target);
} else {
  assert(!payload.expected_content_hash, 'The existing article is missing');
  // A candidate new route must already have owner approval in the site register.
  const register = JSON.parse(fs.readFileSync('brand-canon/approved-pages.json', 'utf8'));
  assert(register.approved_slugs.includes(payload.slug), 'Approve this new canon route in the website register first');
  html = renderPageFromTemplate(payload)
    .replace(/<aside class="infobox"[^>]*>[\s\S]*?<\/aside>/i, '')
    .replace(/<span class="meta-item">[^\n]*Last updated: DATE<\/span>/i, '')
    .replace('</head>', `  <link rel="canonical" href="https://cryptomoonboys.com/${target}">\n</head>`);
}
assert.deepEqual(checkPublicDisclosure(html, target), []);
fs.writeFileSync(target, html);
