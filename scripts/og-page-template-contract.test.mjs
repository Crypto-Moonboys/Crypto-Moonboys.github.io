#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function check(condition, message) {
  if (!condition) failures.push(message);
  else console.log(`[PASS] ${message}`);
}

function requireFile(relPath) {
  check(exists(relPath), `${relPath} exists`);
  return exists(relPath) ? read(relPath) : '';
}

const contract = requireFile('docs/og-page-template-contract.md');
const instructions = requireFile('.github/instructions/og-page-templates.instructions.md');
const battleLayer = requireFile('js/battle-layer.js');
const battleCss = requireFile('css/battle-layer.css');
const wikiCss = requireFile('css/wiki.css');
const ciRunner = requireFile('scripts/ci-domain-runner.mjs');
const generatedNftPage = requireFile('wiki/gkniftyheads-token-temptress-783401.html');

const templates = [
  ['templates/og/wiki-page.html', 'wiki_article'],
  ['templates/og/nft-collection-page.html', 'nft_collection'],
  ['templates/og/nft-template-page.html', 'nft_template'],
  ['templates/og/crypto-token-page.html', 'crypto_token'],
];
const canonicalScripts = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/faction-alignment.js',
  '/js/wiki.js',
  '/js/bible-loader.js',
  '/js/engagement.js',
  '/js/comments.js',
  '/js/battle-layer.js',
];
const standardSeoPatterns = [
  ['meta description', /<meta\s+name=["']description["']\s+content=["']\{\{[^}]+\}\}["']\s*>/i],
  ['robots index/follow', /<meta\s+name=["']robots["']\s+content=["']index,\s*follow["']\s*>/i],
  ['canonical URL', /<link\s+rel=["']canonical["']\s+href=["']\{\{CANONICAL_URL\}\}["']\s*>/i],
  ['Open Graph title', /<meta\s+property=["']og:title["']\s+content=["']\{\{OG_TITLE\}\}["']\s*>/i],
  ['Open Graph description', /<meta\s+property=["']og:description["']\s+content=["']\{\{OG_DESCRIPTION\}\}["']\s*>/i],
  ['Open Graph type', /<meta\s+property=["']og:type["']\s+content=["']article["']\s*>/i],
  ['Open Graph URL', /<meta\s+property=["']og:url["']\s+content=["']\{\{CANONICAL_URL\}\}["']\s*>/i],
  ['Open Graph image', /<meta\s+property=["']og:image["']\s+content=["']\{\{OG_IMAGE\}\}["']\s*>/i],
  ['proper page title', /<title>[^<]*Crypto Moonboys Wiki<\/title>/i],
  ['favicon', /<link\s+rel=["']icon["'][^>]*href=["']\/favicon\.png["'][^>]*>/i],
];
const generatedSeoPatterns = [
  ['generated meta description', /<meta\s+name=["']description["']/i],
  ['generated robots index/follow', /<meta\s+name=["']robots["']\s+content=["']index,\s*follow["']/i],
  ['generated canonical URL', /<link\s+rel=["']canonical["']/i],
  ['generated Open Graph title', /<meta\s+property=["']og:title["']/i],
  ['generated Open Graph description', /<meta\s+property=["']og:description["']/i],
  ['generated Open Graph type', /<meta\s+property=["']og:type["']/i],
  ['generated Open Graph URL', /<meta\s+property=["']og:url["']/i],
  ['generated Open Graph image', /<meta\s+property=["']og:image["']/i],
  ['generated proper page title', /<title>[^<]*Crypto Moonboys Wiki<\/title>/i],
  ['generated favicon', /<link\s+rel=["']icon["'][^>]*href=["']\/favicon\.png["'][^>]*>/i],
];

check(
  contract.includes('HODLKONG64/THEY-CALL-ME-THE-DADDY') &&
    instructions.includes('HODLKONG64/THEY-CALL-ME-THE-DADDY'),
  'external page agents are explicitly pointed at the OG template contract',
);
check(
  contract.includes('WAX AtomicAssets pages only') &&
    contract.includes('Keep current collection weighting/ranking semantics'),
  'NFT template contract preserves WAX-only collection ranking authority',
);
check(
  contract.includes('citation voting and comments at the bottom') &&
    instructions.includes('Keep live vote/comment sections at the bottom'),
  'vote/comment bottom placement is documented for future page agents',
);

for (const [relPath, pageType] of templates) {
  const html = requireFile(relPath);
  check(html.includes(`data-page-type="${pageType}"`), `${relPath} declares data-page-type="${pageType}"`);
  check(html.includes('page-wiki page-standard-shell'), `${relPath} uses the shared wiki shell`);
  check(html.includes('<main id="content" role="main">'), `${relPath} preserves the generated wiki main landmark`);
  check(html.includes('<header class="wiki-hero">'), `${relPath} uses the shared top hero card`);
  check(html.includes('/js/battle-layer.js'), `${relPath} loads the engagement layer`);
  check(html.includes('/js/engagement.js') && html.includes('/js/comments.js'), `${relPath} loads live vote/comment scripts`);
  for (const src of canonicalScripts) {
    check(
      html.includes(`<script data-cfasync="false" src="${src}"></script>`),
      `${relPath} loads canonical boot script ${src} with Rocket Loader bypass`,
    );
  }
  check(html.includes('class="wiki-comments"'), `${relPath} keeps comments at the bottom`);
  check(html.includes('citation-vote-panel'), `${relPath} keeps citation voting near the bottom`);
  check(html.includes('data-cite-id="citation-panel"') && !html.includes('data-cite-id="page"'), `${relPath} uses the standard citation panel vote id`);
  for (const [label, pattern] of standardSeoPatterns) {
    check(pattern.test(html), `${relPath} preserves standard SEO/social metadata: ${label}`);
  }
}

for (const [label, pattern] of generatedSeoPatterns) {
  check(pattern.test(generatedNftPage), `current generated NFT page exposes ${label}`);
}

check(
  read('templates/og/wiki-page.html').includes('        {{BODY}}') &&
    !read('templates/og/wiki-page.html').includes('<p>{{BODY}}</p>') &&
    !read('templates/og/wiki-page.html').includes('<p>{{RELATED_PATHS}}</p>') &&
    !read('templates/og/crypto-token-page.html').includes('<p>{{RELATED_PATHS}}</p>'),
  'structured placeholders are not forced into invalid paragraph wrappers',
);

check(
  read('templates/og/nft-collection-page.html').includes('WAX AtomicAssets only') &&
    read('templates/og/nft-template-page.html').includes('WAX AtomicAssets') &&
    read('templates/og/nft-collection-page.html').includes('Ranking uses approved WAX AtomicAssets rarity and supply data; non-WAX markets are not included.'),
  'NFT templates keep WAX-only source language in the page skeletons',
);
check(
  !read('templates/og/nft-collection-page.html').includes('Keep the existing WAX collection ranking weights') &&
    !read('templates/og/crypto-token-page.html').includes('Render only approved feed values') &&
    read('templates/og/crypto-token-page.html').includes('Values are loaded from the approved live feed source shown above; prices are not hardcoded.'),
  'template enforcement copy is reader-facing, not internal agent guidance',
);
check(
  read('templates/og/nft-collection-page.html').includes('og-collapsible-data') &&
    read('templates/og/nft-template-page.html').includes('og-collapsible-data'),
  'NFT templates mark large data blocks for collapsible display',
);

check(
  battleLayer.includes('buildTemplateMediaShell() + buildMissionHTML(pageId, engagement)') &&
    battleLayer.includes('battle-engagement-deck--nft-template'),
  'NFT template pages render art beside one Daily Missions card with embedded Battle Heat',
);
check(
  battleLayer.includes('function injectTemplateMedia(deck)') &&
    battleLayer.includes("document.querySelector('template[data-battle-media=\"nft\"]')") &&
    battleLayer.includes("deck.querySelector('.battle-shell--media .battle-shell-inner')") &&
    battleLayer.includes('mediaTarget.appendChild(clone)'),
  'battle layer owns NFT media template cloning for new OG pages',
);
check(
  battleLayer.includes('function enhanceNftDataDisclosures()') &&
    battleLayer.includes('og-collapsible-data') &&
    battleLayer.includes("id.replace(/-title$/i, '')") &&
    battleLayer.includes("button.textContent = 'Show data'"),
  'current NFT pages get collapsible heavy data controls from the shared layer',
);
check(
  battleCss.includes('battle-engagement-deck--nft-template') &&
    battleCss.includes('.battle-shell--media') &&
    battleCss.includes('.battle-heat-summary'),
  'NFT template engagement deck has scoped media and heat summary styles',
);
check(
  wikiCss.includes('@keyframes ogHeroGlow') &&
    wikiCss.includes('body.page-wiki .wiki-hero h1') &&
    wikiCss.includes('animation: ogHeroGlow') &&
    wikiCss.includes('@media (prefers-reduced-motion: reduce)'),
  'wiki hero titles inherit the requested pulsing/glowing top-card treatment',
);
check(
  wikiCss.includes('body.page-wiki .wiki-comments') &&
    wikiCss.includes('body.page-wiki .comment-form-identity') &&
    wikiCss.includes('body.page-wiki .citation-vote-panel-actions') &&
    wikiCss.includes('margin: clamp(24px, 3vw, 42px) auto 0;'),
  'bottom comments and citation vote panels have shared spacing/padding styles',
);
check(
  ciRunner.includes("['node', 'scripts/og-page-template-contract.test.mjs']"),
  'OG page template contract regression runs in the wiki CI domain',
);

class FakeClassList {
  constructor(node) {
    this.node = node;
  }

  values() {
    return String(this.node.className || '').split(/\s+/).filter(Boolean);
  }

  add(...tokens) {
    const next = new Set(this.values());
    tokens.filter(Boolean).forEach((token) => next.add(token));
    this.node.className = Array.from(next).join(' ');
  }

  remove(...tokens) {
    const remove = new Set(tokens);
    this.node.className = this.values().filter((token) => !remove.has(token)).join(' ');
  }

  contains(token) {
    return this.values().includes(token);
  }

  toggle(token, force) {
    const exists = this.contains(token);
    const shouldAdd = force === undefined ? !exists : !!force;
    if (shouldAdd) this.add(token);
    else this.remove(token);
    return shouldAdd;
  }
}

class FakeFragment {
  constructor(children = []) {
    this.children = children;
    this.parentNode = null;
  }

  cloneNode(deep = false) {
    return new FakeFragment(deep ? this.children.map((child) => child.cloneNode(true)) : [...this.children]);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this._innerHTML = '';
    this._listeners = {};
    this.classList = new FakeClassList(this);
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name === 'class') this.className = stringValue;
    if (name === 'id') this.id = stringValue;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = stringValue;
    }
  }

  getAttribute(name) {
    if (name === 'class') return this.className;
    if (name === 'id') return this.id;
    return this.attributes[name] ?? null;
  }

  appendChild(child) {
    if (child instanceof FakeFragment) {
      child.children.slice().forEach((fragmentChild) => this.appendChild(fragmentChild));
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentElement(position, element) {
    if (position !== 'afterend' || !this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index < 0) return null;
    element.parentNode = this.parentNode;
    siblings.splice(index + 1, 0, element);
    return element;
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  hasChildNodes() {
    return this.children.length > 0;
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName);
    clone.className = this.className;
    clone.id = this.id;
    clone.textContent = this.textContent;
    clone._innerHTML = this._innerHTML;
    clone.attributes = { ...this.attributes };
    clone.dataset = { ...this.dataset };
    clone.classList = new FakeClassList(clone);
    if (deep) this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
    return clone;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSimple(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = String(selector).split(',').map((part) => part.trim()).filter(Boolean);
    const results = [];
    const visit = (node) => {
      if (!(node instanceof FakeElement)) return;
      for (const part of selectors) {
        if (matchesSelector(node, part) && !results.includes(node)) {
          results.push(node);
          break;
        }
      }
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }

  set innerHTML(html) {
    this._innerHTML = String(html || '');
    this.children = [];
    if (this._innerHTML.includes('battle-shell--media')) {
      const shell = el('div', 'battle-shell battle-shell--media');
      const inner = el('div', 'battle-shell-inner');
      inner.appendChild(el('h3'));
      shell.appendChild(inner);
      this.appendChild(shell);
    }
    if (this._innerHTML.includes('battle-shell--missions')) {
      const shell = el('div', 'battle-shell battle-shell--missions');
      const inner = el('div', 'battle-shell-inner');
      inner.appendChild(el('h3'));
      if (this._innerHTML.includes('battle-heat-summary')) inner.appendChild(el('div', 'battle-heat-summary'));
      inner.appendChild(el('div', 'mission-stack'));
      shell.appendChild(inner);
      this.appendChild(shell);
    }
    if (this._innerHTML.includes('battle-shell--heat')) {
      const shell = el('div', 'battle-shell battle-shell--heat');
      const inner = el('div', 'battle-shell-inner');
      inner.appendChild(el('h3'));
      shell.appendChild(inner);
      this.appendChild(shell);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

class FakeTemplate extends FakeElement {
  constructor(content) {
    super('template');
    this.content = content;
  }

  cloneNode(deep = false) {
    const clone = new FakeTemplate(this.content.cloneNode(deep));
    clone.className = this.className;
    clone.id = this.id;
    clone.attributes = { ...this.attributes };
    clone.dataset = { ...this.dataset };
    clone.classList = new FakeClassList(clone);
    return clone;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.readyState = 'complete';
    this.location = { pathname: '/wiki/gkniftyheads-token-temptress-783401.html' };
    this.documentElement = el('html');
    this.body = el('body');
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }

  createElement(tagName) {
    return el(tagName);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  dispatchEvent() {}
}

function el(tagName, className = '') {
  const node = new FakeElement(tagName);
  if (className) node.setAttribute('class', className);
  return node;
}

function attrSelectorMatch(node, selector) {
  const match = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (!match) return false;
  const [, attr, expected] = match;
  const actual = node.getAttribute(attr);
  if (expected == null) return actual != null;
  return actual === expected;
}

function matchesSimple(node, rawSelector) {
  const selector = String(rawSelector || '').trim();
  if (!selector || !(node instanceof FakeElement)) return false;
  if (selector === '*') return true;
  if (selector.startsWith('[')) return attrSelectorMatch(node, selector);

  const attrMatch = selector.match(/^(.*?)(\[[^\]]+\])$/);
  if (attrMatch) {
    return matchesSimple(node, attrMatch[1] || '*') && attrSelectorMatch(node, attrMatch[2]);
  }

  const idMatch = selector.match(/^([a-z0-9-]+)?#([a-z0-9_-]+)$/i);
  if (idMatch) {
    return (!idMatch[1] || node.tagName.toLowerCase() === idMatch[1].toLowerCase()) && node.id === idMatch[2];
  }

  const classMatch = selector.match(/^([a-z0-9-]+)?((?:\.[a-z0-9_-]+)+)$/i);
  if (classMatch) {
    const tagOk = !classMatch[1] || node.tagName.toLowerCase() === classMatch[1].toLowerCase();
    const classes = classMatch[2].split('.').filter(Boolean);
    return tagOk && classes.every((className) => node.classList.contains(className));
  }

  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

function matchesSelector(node, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  let current = node;
  for (let index = parts.length - 1; index >= 0; index--) {
    if (!current || !matchesSimple(current, parts[index])) return false;
    if (index === 0) return true;
    current = current.parentNode;
    while (current && !matchesSimple(current, parts[index - 1])) current = current.parentNode;
  }
  return false;
}

function mediaTemplateFromGeneratedPage() {
  const templateHtml = generatedNftPage.match(/<template class="nft-battle-media-template"[\s\S]*?<\/template>/i)?.[0] || '';
  const src = templateHtml.match(/\bsrc="([^"]+)"/i)?.[1] || '/img/logo.svg';
  const alt = templateHtml.match(/\balt="([^"]*)"/i)?.[1] || 'NFT artwork';
  const fallbacks = templateHtml.match(/\bdata-fallback-srcs='([^']*)'/i)?.[1] || '[]';
  const figure = el('figure', 'battle-page-media nft-template-media-card');
  const image = el('img', 'wiki-hero-image nft-image');
  image.setAttribute('src', src);
  image.setAttribute('alt', alt);
  image.setAttribute('data-fallback-srcs', fallbacks);
  figure.appendChild(image);
  const template = new FakeTemplate(new FakeFragment([figure]));
  template.setAttribute('class', 'nft-battle-media-template');
  template.setAttribute('data-battle-media', 'nft');
  return template;
}

function buildNftPageDom(headingIds) {
  const document = new FakeDocument();
  const main = el('main');
  const article = el('article', 'wiki-content nft-template-article');
  article.dataset.pageType = 'nft_template';
  article.setAttribute('data-page-type', 'nft_template');

  article.appendChild(el('header', 'wiki-hero'));
  const meta = el('div', 'article-meta');
  article.appendChild(meta);
  article.appendChild(mediaTemplateFromGeneratedPage());

  const details = el('section', 'wiki-section');
  const detailsHeading = el('h2');
  detailsHeading.setAttribute('id', headingIds[0]);
  details.appendChild(detailsHeading);
  details.appendChild(el('div', 'wiki-stat-grid'));
  article.appendChild(details);

  const attributes = el('section', 'wiki-section');
  const attributesHeading = el('h2');
  attributesHeading.setAttribute('id', headingIds[1]);
  attributes.appendChild(attributesHeading);
  attributes.appendChild(el('div', 'wiki-table-wrap'));
  article.appendChild(attributes);

  const citation = el('section', 'wiki-section citation-vote-panel');
  citation.setAttribute('data-citation-vote-panel', 'true');
  const vote = el('span', 'cite-vote');
  vote.setAttribute('data-cite-id', 'citation-panel');
  citation.appendChild(vote);
  article.appendChild(citation);

  const comments = el('div', 'wiki-comments');
  main.appendChild(article);
  main.appendChild(comments);
  document.body.appendChild(main);
  return { document, main, article, citation, comments };
}

async function runBattleLayerShape(headingIds) {
  const dom = buildNftPageDom(headingIds);
  const context = {
    console,
    document: dom.document,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    window: {
      MOONBOYS_API: { BASE_URL: null, FEATURES: {} },
      location: dom.document.location,
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    },
  };
  context.window.document = dom.document;
  context.window.setTimeout = context.setTimeout;
  context.window.fetch = context.fetch;
  vm.runInNewContext(battleLayer, context, { filename: 'js/battle-layer.js' });
  await Promise.resolve();
  await Promise.resolve();
  return dom;
}

function runLegacyInlineInjection(document) {
  const tpl = document.querySelector('template[data-battle-media="nft"]');
  const deck = document.querySelector('.battle-deck');
  if (!tpl || !deck || deck.querySelector('.battle-page-media')) return;
  const cards = deck.querySelectorAll('.battle-shell-inner');
  if (!cards.length) return;
  cards[0].appendChild(tpl.content.cloneNode(true));
}

for (const headingIds of [
  ['nft-details', 'template-attributes'],
  ['nft-details-title', 'template-attributes-title'],
]) {
  const { document, main, citation, comments } = await runBattleLayerShape(headingIds);
  check(document.querySelectorAll('.battle-engagement-deck--nft-template').length === 1, `NFT template page renders one engagement deck for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.battle-shell--media .battle-page-media').length === 1, `left NFT media card contains exactly one figure for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.battle-shell--media img.nft-image').length === 1, `left NFT media card contains exactly one image for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.battle-shell--missions').length === 1, `right side contains one Daily Missions card for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.battle-shell--missions .battle-heat-summary').length === 1, `Battle Heat is embedded inside Daily Missions for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.og-data-toggle').length === 2, `NFT data Show/Hide controls attach for headings ${headingIds.join(', ')}`);
  runLegacyInlineInjection(document);
  check(document.querySelectorAll('.battle-shell--media .battle-page-media').length === 1, `legacy inline media injector cannot duplicate shared runtime media for headings ${headingIds.join(', ')}`);
  check(main.children.at(-1) === comments && citation.parentNode.children.indexOf(citation) > citation.parentNode.children.indexOf(document.querySelector('.article-meta')), `citation voting and comments remain at the bottom for headings ${headingIds.join(', ')}`);
  check(document.querySelectorAll('.cite-vote[data-cite-id="citation-panel"]').length === 1, `citation panel uses data-cite-id="citation-panel" for headings ${headingIds.join(', ')}`);
}

check(!read('scripts/import-website-publish-payloads.mjs').includes('function injectBattleMedia'), 'website payload importer does not emit duplicate inline NFT media injection');

if (failures.length) {
  console.error(`\nOG page template contract failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nOG page template contract passed.\n');
