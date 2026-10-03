#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  assertOwnershipMarkerStructure,
  hasRootWikiStubMarker,
} from './import-website-publish-payloads.mjs';
import {
  readHtmlAttribute,
  readHtmlAttributes,
  tokenizeActiveHtml,
} from './wiki-html-structure.mjs';
import {
  PayloadValidationError,
  validatePayload,
} from './validate-website-publish-payloads.mjs';

function payload(articleHtml) {
  return {
    publish_mode: 'middle_content_only',
    slug: 'security-regression',
    title: 'Security regression',
    description: 'Parser and active-content regression fixture.',
    category: 'Lore',
    article_html: articleHtml,
  };
}

function assertRejected(articleHtml, expectedMessage) {
  assert.throws(
    () => validatePayload(payload(articleHtml), '<security-regression>'),
    (error) => error instanceof PayloadValidationError &&
      error.failures.some((failure) => failure.includes(expectedMessage)),
    `${articleHtml} should fail with ${expectedMessage}`
  );
}

assert.deepEqual(
  readHtmlAttribute('<div title=" id=decoy" id=bible-content>', 'id'),
  { present: true, value: 'bible-content' },
  'attribute-looking text inside a quoted value must not shadow the real attribute'
);
assert.deepEqual(
  readHtmlAttribute('<meta title=" http-equiv=no" http-equiv=refresh>', 'http-equiv'),
  { present: true, value: 'refresh' },
  'meta refresh detection must ignore quoted-value decoys'
);
assert.deepEqual(
  readHtmlAttribute('<link title=" rel=alternate" rel=canonical href=/wiki/real.html>', 'rel'),
  { present: true, value: 'canonical' },
  'canonical-link detection must ignore quoted-value decoys'
);
assert.deepEqual(
  readHtmlAttribute('<link href=/wiki/real.html rel=canonical />', 'href'),
  { present: true, value: '/wiki/real.html' },
  'slashes are valid in unquoted HTML attribute values'
);
assert.equal(
  readHtmlAttribute('<div id=value/>', 'id').value,
  'value/',
  'a slash adjoining an unquoted value is data, not a self-closing delimiter'
);
assert.equal(
  tokenizeActiveHtml('<div id=value/></div>')[0].selfClosing,
  false,
  'a slash in an unquoted value must not make a non-void element self-closing'
);
assert.deepEqual(
  readHtmlAttributes('<div title=" onerror=decoy" onerror="alert(1)">')
    .map(({ name, value }) => ({ name, value })),
  [
    { name: 'title', value: ' onerror=decoy' },
    { name: 'onerror', value: 'alert(1)' },
  ]
);

const whitespaceTemplateTokens = tokenizeActiveHtml(
  '< template><div id=bible-content></div></template>'
);
assert.ok(
  whitespaceTemplateTokens.some((token) => token.type === 'tag' && token.name === 'div'),
  '`< template>` is text and must not make the following div inert'
);

for (const abruptComment of ['<!-->', '<!--->', '<!-- benign --!>']) {
  const followingMarkup = `${abruptComment}<img src=x onerror="alert(1)">`;
  assert.ok(
    tokenizeActiveHtml(followingMarkup)
      .some((token) => token.type === 'tag' && token.name === 'img'),
    `${abruptComment} must terminate the active-tokenizer comment before following markup`
  );
  assertRejected(followingMarkup, 'event handler attribute');
  assertRejected(`${abruptComment}<a href="javascript:alert(1)">Link</a>`, 'dangerous URL scheme');
}

assert.ok(
  tokenizeActiveHtml(
    '<script>0</script/><meta http-equiv="refresh" content="0;url=/wiki/real.html">',
    { includeNoscriptContent: true }
  ).some((token) => token.type === 'tag' && token.name === 'meta'),
  'a slash may delimit a browser-valid raw-text end tag and must expose following controls'
);
assert.ok(
  tokenizeActiveHtml(
    '<body><select><textarea></textarea><meta http-equiv="refresh"></select></body>',
    { includeNoscriptContent: true, includeRawTextOpeningTags: true }
  ).some((token) => token.type === 'tag' && token.name === 'meta'),
  'textarea in select mode must pop the select so following active controls remain visible'
);

const selectRootSpoof = '<select><body data-wiki-stub="true"><article data-wiki-stub="true">' +
  '<p>Fake root.</p></article></body></select><article><p>Real page.</p></article>';
assert.equal(
  tokenizeActiveHtml(selectRootSpoof).some((token) => token.type === 'tag' && token.name === 'body'),
  false,
  'body tags ignored by the browser in select mode must not become active roots'
);
assert.equal(
  hasRootWikiStubMarker(selectRootSpoof),
  false,
  'select-mode fake body/article markup must not grant stub ownership'
);

const foreignTemplateControl = '<svg><template><foreignObject>' +
  '<img src=x onerror="location.href=\'/wiki/protected.html\'">' +
  '</foreignObject></template></svg>';
const foreignTemplateTokens = tokenizeActiveHtml(foreignTemplateControl, {
  includeRawTextOpeningTags: true,
});
assert.ok(
  foreignTemplateTokens.some((token) =>
    token.type === 'tag' && token.name === 'img' && token.foreignContent === true
  ),
  'SVG template contents are live foreign content and must remain visible to control checks'
);
assert.ok(
  tokenizeActiveHtml(
    '<svg><title><foreignObject><img src=x onerror="alert(1)"></foreignObject></title></svg>',
    { includeRawTextOpeningTags: true }
  ).some((token) => token.type === 'tag' && token.name === 'img' && token.foreignContent === true),
  'SVG elements with HTML raw-text names must not hide live foreign descendants'
);

const declarativeShadowTokens = tokenizeActiveHtml(
  '<div><template shadowrootmode="open"><img src=x onerror="alert(1)"></template></div>',
  { includeRawTextOpeningTags: true }
);
assert.ok(
  declarativeShadowTokens.some((token) => token.name === 'template' && token.declarativeShadow === true),
  'declarative shadow roots must be identified as live parser controls'
);
assert.ok(
  declarativeShadowTokens.some((token) => token.name === 'img' && token.shadowContent === true),
  'declarative shadow-root contents must remain visible to executable-control checks'
);

for (const declarationSpoof of [
  '<!bogus <body data-wiki-stub="true">>',
  '<?bogus <body data-wiki-stub="true">>',
  '</!bogus <body data-wiki-stub="true">>',
  '</?bogus <body data-wiki-stub="true">>',
  '<![CDATA[ <body data-wiki-stub="true"> ]]>',
  '<!DOCTYPE html PUBLIC "<body data-wiki-stub=\'true\'>">',
]) {
  const page = `${declarationSpoof}<body><article><p>Real human page.</p></article></body>`;
  assert.equal(
    hasRootWikiStubMarker(page),
    false,
    'markup declarations and bogus comments must not invent an active stub body root'
  );
  const bodies = tokenizeActiveHtml(page)
    .filter((token) => token.type === 'tag' && !token.closing && token.name === 'body');
  assert.equal(bodies.length, 1, 'only the real body after a declaration is active');
  assert.equal(readHtmlAttribute(bodies[0].raw, 'data-wiki-stub').present, false);
}

for (const malformedDoctypeControl of [
  '<!doctype "><meta http-equiv="refresh" content="0;url=/wiki/real.html">',
  '<!doctype html "><link rel="canonical" href="/wiki/real.html">',
  '<!doctype "><script>alert(1)</script>',
]) {
  const tokens = tokenizeActiveHtml(malformedDoctypeControl, {
    includeNoscriptContent: true,
    includeRawTextOpeningTags: true,
  });
  assert.ok(
    tokens.some((token) => ['meta', 'link', 'script'].includes(token.name)),
    'a quote in a malformed doctype must not hide following live document controls'
  );
}
assert.equal(
  tokenizeActiveHtml(
    '<!DOCTYPE html PUBLIC "identifier > text"><body data-wiki-stub="true">'
  ).some((token) => token.name === 'body'),
  true,
  'a closed PUBLIC identifier must still allow following markup'
);
assert.equal(
  tokenizeActiveHtml(
    '<!DOCTYPE html PUBLIC "identifier > <body data-wiki-stub=\'true\'>">'
  ).some((token) => token.name === 'body'),
  false,
  'greater-than signs and tag-looking text inside a PUBLIC identifier stay inert'
);
assertRejected(
  '<![CDATA[ <x> <img src=x onerror="alert(1)"> ]]>',
  '<![CDATA[ control'
);

for (const nonLightDomOwnershipRoot of [
  '<html><body><template shadowrootmode="open"><article class="wiki-content">' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>shadow only</span><!-- MANUAL_CONTENT:END -->' +
    '</article></template></body></html>',
  '<html><body><svg><article>' +
    '<!-- MANUAL_CONTENT:BEGIN --><text>foreign only</text><!-- MANUAL_CONTENT:END -->' +
    '</article></svg></body></html>',
  '<html><frameset><article>' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>ignored by frameset mode</span><!-- MANUAL_CONTENT:END -->' +
    '</article></frameset></html>',
  '<html><body><table><article class="wiki-content">' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>foster-parented</span><!-- MANUAL_CONTENT:END -->' +
    '</article></table></body></html>',
  '<html><body><table><tbody><tr><div class="wiki-content">' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>row-mode foster parent</span><!-- MANUAL_CONTENT:END -->' +
    '</div></tr></tbody></table></body></html>',
  '<html><body><table><tbody><tr><td><article class="wiki-content">' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>cell boundary can pop this root</span><!-- MANUAL_CONTENT:END -->' +
    '</article></td></tr></tbody></table></body></html>',
  '<html><body><table><caption><article class="wiki-content">' +
    '<!-- MANUAL_CONTENT:BEGIN --><span>caption boundary can pop this root</span><!-- MANUAL_CONTENT:END -->' +
    '</article></caption></table></body></html>',
]) {
  assert.throws(
    () => assertOwnershipMarkerStructure(nonLightDomOwnershipRoot),
    (error) => error?.code === 'INVALID_CONTENT_TOPOLOGY',
    'non-light or parser-relocated content must not grant canonical ownership'
  );
}

assert.doesNotThrow(
  () => assertOwnershipMarkerStructure(
    '<html><body><article class="wiki-content">' +
      '<!-- MANUAL_CONTENT:BEGIN --><table><tbody><tr><td>table in a real root</td></tr></tbody></table>' +
      '<!-- MANUAL_CONTENT:END --></article></body></html>'
  ),
  'ordinary table content inside a canonical page root remains valid'
);

assert.throws(
  () => assertOwnershipMarkerStructure(
    '<html><body><p class="wiki-content"><!-- MANUAL_CONTENT:BEGIN -->' +
      '<div>outside the browser p root</div><!-- MANUAL_CONTENT:END --></p></body></html>'
  ),
  (error) => error?.code === 'INVALID_CONTENT_TOPOLOGY',
  'an implied-end-tag element must not serve as a canonical ownership root'
);

assert.equal(
  hasRootWikiStubMarker(
    '<script><!--<script></script><body data-wiki-stub="true"></script>' +
      '<body><article><p>Real human page.</p></article></body>'
  ),
  false,
  'script double-escaped state ambiguity before body must fail closed for stub authority'
);
assert.throws(
  () => assertOwnershipMarkerStructure(
    '<html><body><article class="wiki-content"><script><!--<script></script>' +
      '<!-- SAM_CONTENT:BEGIN --><p>still script data</p><!-- SAM_CONTENT:END -->' +
      '</article></script></body></html>'
  ),
  (error) => error?.code === 'INVALID_CONTENT_TOPOLOGY',
  'double-escaped script text must not expose fake ownership comments or closing tags'
);
assert.doesNotThrow(
  () => assertOwnershipMarkerStructure(
    '<html><body><script><!--<script></script></script>' +
      '<article class="wiki-content"><!-- MANUAL_CONTENT:BEGIN -->' +
      '<p>markup after the real script close</p><!-- MANUAL_CONTENT:END --></article></body></html>'
  ),
  'the second appropriate end tag after double-escaped script text must expose later markup'
);
assert.equal(
  hasRootWikiStubMarker(
    '<svg><![CDATA[foo><body data-wiki-stub="true">]]></svg>' +
      '<body><article><p>Real human page.</p></article></body>'
  ),
  false,
  'foreign-content CDATA before body must fail closed for stub authority'
);
assert.equal(
  hasRootWikiStubMarker(
    '<select><textarea></select><body data-wiki-stub="true"></textarea></select>' +
      '<body><article><p>Real human page.</p></article></body>'
  ),
  false,
  'ambiguous textarea/select insertion state before body must fail closed for stub authority'
);
assert.equal(
  hasRootWikiStubMarker(
    '<select><script></select><body data-wiki-stub="true"></script></select>' +
      '<body><article><p>Real human page.</p></article></body>'
  ),
  false,
  'script data processed in select mode must not expose a fake stub body root'
);

assert.equal(
  hasRootWikiStubMarker(
    '<body title=" data-wiki-stub=true" data-wiki-stub=false>' +
      '<article class="wiki-content"><p>Real human content.</p></article></body>'
  ),
  false,
  'quoted text must never grant stub ownership'
);
assert.equal(
  hasRootWikiStubMarker(
    '<body data-wiki-stub="true"><article class="wiki-content"></article></body>'
  ),
  true,
  'a real root stub attribute remains recognized'
);
assert.equal(
  hasRootWikiStubMarker(
    '<svg><body data-wiki-stub="true"></body></svg>' +
      '<body><article><p>Real archive.</p></article></body>'
  ),
  false,
  'a body-looking token in foreign content must not grant root stub authority'
);
assert.equal(
  hasRootWikiStubMarker(
    '<frameset><frame src="/wiki/protected.html"><body data-wiki-stub="true"></body></frameset>'
  ),
  false,
  'a body token ignored in frameset insertion mode must not grant root stub authority'
);
assert.equal(
  hasRootWikiStubMarker(
    '<div><template shadowrootmode="open"><body data-wiki-stub="true"></body></template></div>' +
      '<body><article><p>Real archive.</p></article></body>'
  ),
  false,
  'shadow-root contents must not grant document-root stub authority'
);
for (const spoofedRootMarker of [
  '<body data-wiki-stub><article class="wiki-content"></article></body>',
  '<body data-wiki-stub=true><article class="wiki-content"></article></body>',
  '<body data-wiki-stub="tr&#117;e"><article class="wiki-content"></article></body>',
  '<body data-wiki-stub="true" data-wiki-stub="false"><article class="wiki-content"></article></body>',
  '<body data-wiki-stub="false" data-wiki-stub="true"><article class="wiki-content"></article></body>',
]) {
  assert.equal(
    hasRootWikiStubMarker(spoofedRootMarker),
    false,
    'stub ownership requires an exact, explicitly quoted true value'
  );
}

for (const articleHtml of [
  '<div title=" id=decoy" id=bible-content></div>',
  '< template><div id=bible-content></div></template>',
  '<svg><template><foreignObject><div id=bible-content></div></foreignObject></template></svg>',
]) {
  assertRejected(articleHtml, 'reserved bible-content container');
}

for (const articleHtml of [
  '<div class="page-like-widget" data-page-id=\'"><img src=x onerror="window.__xss=1"><span x="\'></div>',
  '<div class="wiki-comments" data-page-id=\'"><img src=x onerror="window.__xss=1"><div x="\'></div>',
  '<div class="safe page&#45;like&#45;widget"></div>',
]) {
  assertRejected(articleHtml, 'reserved runtime widget class');
}

for (const articleHtml of [
  '<img src=x onerror="alert(1)">',
  '<div data-x=foo"><img src=x onerror="alert(1)">',
  '<svg onload="alert(1)"></svg>',
  '<a title=" onclick=decoy" onclick="alert(1)" href="/wiki/safe.html">Link</a>',
]) {
  assertRejected(articleHtml, 'event handler attribute');
}

assertRejected('<iframe srcdoc="<p>controlled document</p>"></iframe>', 'srcdoc attribute');
assertRejected('<a href="java&#x73;cript&colon;alert(1)">Link</a>', 'dangerous URL scheme');
assertRejected('<form action="vbscript:msgbox(1)"><button>Go</button></form>', 'dangerous URL scheme');
assertRejected('<object data="data:text/html,<script>alert(1)</script>"></object>', 'unsafe data URL');
assertRejected('<img src="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\'></svg>">', 'unsafe data URL');
assertRejected('<p>Escaped.</p></main><section>Outside the article.</section>', '<main boundary');

for (const parserStateElement of ['textarea', 'select', 'option', 'xmp', 'plaintext']) {
  assertRejected(
    `<${parserStateElement}>unclosed parser-state control`,
    `<${parserStateElement} parser-state boundary`
  );
}

validatePayload(payload(`
  <section class="lore-section" aria-labelledby="safe-heading">
    <h2 id="safe-heading">Safe article markup</h2>
    <p><a href="/wiki/safe.html?view=full#details">Internal link</a></p>
    <img src="https://cdn.example.test/image.webp" alt="Example" loading="lazy">
    <img src="data:image/png;base64,iVBORw0KGgo=" alt="Inline raster fixture">
    <div class="page-like-widget-preview wiki-comments-copy">Uninitialized prose classes are safe.</div>
  </section>
`), '<safe-article>');

console.log('Wiki HTML structure security regressions passed.');
