import assert from 'node:assert/strict';
import { preservationFailures } from './wiki-lore-preservation-check.mjs';

const before = `<html><head><link rel="stylesheet" href="/css/wiki.css"><script src="/js/api-config.js"></script></head><body><article data-canon-revision="1">
<!-- CANONICAL_CONTENT:BEGIN --><p>Original lore.</p><!-- CANONICAL_CONTENT:END -->
</article><!-- RELATED_WIKI_PATHS:BEGIN --><section>Old related paths.</section><!-- RELATED_WIKI_PATHS:END -->
<!-- CITATION_VOTE_PANEL:BEGIN --><section data-citation-vote-panel="true"><h2>Citation Credibility</h2>
<div><span class="cite-vote" data-page-id="fixture" data-cite-id="citation-panel"></span></div></section><!-- CITATION_VOTE_PANEL:END -->
<div class="wiki-comments" data-page-id="fixture"></div><button data-action="like">Like</button>
<script src="/js/engagement.js"></script></body></html>`;
const after = before.replace('Original lore.', 'Expanded source-supported lore.').replace('revision="1"', 'revision="2"').replace('Old related paths.', 'Updated related paths.');
assert.deepEqual(preservationFailures(before, after), [], 'prose, revision and related links may change');
for (const [name, altered] of [
  ['marked citation panel removal', after.replace(/<!-- CITATION_VOTE_PANEL:BEGIN -->[\s\S]*?<!-- CITATION_VOTE_PANEL:END -->/, '')],
  ['citation identity change', after.replace('data-cite-id="citation-panel"', 'data-cite-id="wrong"')],
  ['comments removal', after.replace(/<div class="wiki-comments"[^>]*><\/div>/, '')],
  ['runtime script removal', after.replace(/<script[\s\S]*?<\/script>/, '')],
  ['stylesheet removal', after.replace(/<link\b[^>]*>/, '')],
  ['functional button removal', after.replace(/<button[\s\S]*?<\/button>/, '')],
  ['unmarked citation removal', after.replace(/<section data-citation-vote-panel[\s\S]*?<\/section>/, '')],
  ['article deletion', ''],
]) {
  if (altered) assert.ok(preservationFailures(before, altered).length, name);
  else assert.throws(() => preservationFailures(before, altered), /Missing article body/);
}
const nft = '<body><article data-page-type="nft_template"><section><h2>Description</h2><p>Curated NFT description.</p></section></article></body>';
assert.deepEqual(preservationFailures(nft, nft), []);
assert.ok(preservationFailures(nft, nft.replace('Curated NFT description.', 'Generated replacement.')).length, 'lore batches cannot rewrite NFT descriptions');
assert.deepEqual(preservationFailures(nft, nft.replace('Curated NFT description.', 'Approved product edit.'), { loreBatch: false }), [], 'dedicated product edits remain separately reviewable');
console.log('wiki-lore-preservation-check.test.mjs passed');
