// Apply an editorial payload in a disposable website checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePayload } from './validate-website-publish-payloads.mjs';
import { assertOwnershipMarkerStructure, renderPageFromTemplate, sha256Content } from './import-website-publish-payloads.mjs';
import { selectCanonicalContentRoot, readHtmlAttribute, tokenizeActiveHtml } from './wiki-html-structure.mjs';
import { checkPublicDisclosure } from './public-canon-disclosure.mjs';

const payload = validatePayload(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
assert.equal(payload.publish_mode, 'middle_content_only');
assert.match(payload.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const target = `wiki/${payload.slug}.html`;
assert.deepEqual(checkPublicDisclosure(JSON.stringify(payload), target), []);
let html;
if (fs.existsSync(target)) {
  const original = fs.readFileSync(target, 'utf8');
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
  html = original.slice(0, root.contentEnd) + insertion + original.slice(root.contentEnd);
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
