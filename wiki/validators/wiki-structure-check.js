#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const COMPONENT_HEADER = path.join(WIKI_DIR, 'components', 'header.html');
const COMPONENT_HEADER_CSS = path.join(WIKI_DIR, 'components', 'header.css');
const COMPONENT_HEADER_JS = path.join(WIKI_DIR, 'components', 'header.js');
const SHELL_TEMPLATE = path.join(WIKI_DIR, 'layouts', 'wiki-shell.html');

const REQUIRED_FILES = [
  COMPONENT_HEADER,
  COMPONENT_HEADER_CSS,
  COMPONENT_HEADER_JS,
  SHELL_TEMPLATE,
];

const DIRECT_HEADER_DUPLICATION_PATTERNS = [
  /<header[^>]+id=["']site-header["']/i,
  /<nav[^>]+id=["']global-nav["']/i,
  /id=["']header-search["']/i,
  /id=["']search-input["']/i,
  /id=["']search-results["']/i,
  /class=["'][^"']*site-logo[^"']*["']/i,
  /class=["'][^"']*header-nav[^"']*["']/i,
  /data-wiki-shared-header=/i,
];

const FORBIDDEN_LOCAL_UI_PATTERNS = [
  /#site-header\b/,
  /#global-nav\b/,
  /#header-search\b/,
  /#search-input\b/,
  /#search-results\b/,
  /\.site-logo\b/,
  /\.header-nav\b/,
  /\.logo-text\b/,
  /\.logo-sub\b/,
  /\.swarmsy-hero\b/,
];

const REQUIRED_BODY_CLASSES = ['page-wiki', 'page-standard-shell'];
const REQUIRED_HEADER_MARKER = '/wiki/components/header.html';
const REQUIRED_SHELL_MARKER = '/wiki/layouts/wiki-shell.html';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRedirectPage(html) {
  return html.includes('http-equiv="refresh"') || html.includes("http-equiv='refresh'");
}

function extractRequiredShellScripts(shellHtml) {
  const matches = shellHtml.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script\s*>/gi);
  return Array.from(matches, (match) => match[1]);
}

function hasCfBypass(html, src) {
  const escaped = escapeRegExp(src);
  return new RegExp(
    `<script[^>]*data-cfasync=["']false["'][^>]*src=["']${escaped}["']|` +
    `<script[^>]*src=["']${escaped}["'][^>]*data-cfasync=["']false["']`,
    'i'
  ).test(html);
}

function scriptCount(html, src) {
  const escaped = escapeRegExp(src);
  return (html.match(new RegExp(`src=["']${escaped}["']`, 'gi')) || []).length;
}

function extractBodyClassList(html) {
  const match = html.match(/<body\b[^>]*class=["']([^"']+)["']/i);
  return new Set((match?.[1] || '').split(/\s+/).filter(Boolean));
}

function validateSharedAssets() {
  for (const filePath of REQUIRED_FILES) {
    assert(fs.existsSync(filePath), `Required wiki lock file is missing: ${path.relative(ROOT, filePath)}`);
  }

  const headerHtml = loadFile(COMPONENT_HEADER);
  const headerJs = loadFile(COMPONENT_HEADER_JS);
  const shellHtml = loadFile(SHELL_TEMPLATE);

  assert(/id="site-header"/.test(headerHtml), 'wiki/components/header.html must define #site-header');
  assert(/id="global-nav"/.test(headerHtml), 'wiki/components/header.html must define #global-nav');
  assert(/id="header-search"/.test(headerHtml), 'wiki/components/header.html must define #header-search');
  assert(/id="search-input"/.test(headerHtml), 'wiki/components/header.html must define #search-input');
  assert(/__WIKI_SWARMSY_HEADER__/.test(headerJs), 'wiki/components/header.js must publish shared header metadata');
  assert(shellHtml.includes(REQUIRED_HEADER_MARKER), 'wiki/layouts/wiki-shell.html must reference the shared header component');
  assert(shellHtml.includes(REQUIRED_SHELL_MARKER), 'wiki/layouts/wiki-shell.html must self-identify as the canonical shell');
  return shellHtml;
}

function validateWikiPage(filePath, requiredScripts) {
  const rel = path.relative(ROOT, filePath);
  const html = loadFile(filePath);

  if (isRedirectPage(html)) {
    return { rel, skipped: true };
  }

  const bodyClasses = extractBodyClassList(html);
  for (const className of REQUIRED_BODY_CLASSES) {
    assert(bodyClasses.has(className), `${rel} must include body class ${className}`);
  }

  assert(/<main\b[^>]*id=["']content["'][^>]*role=["']main["'][^>]*>/i.test(html), `${rel} must render through the shared main shell`);
  assert(!html.includes('page-has-right-panel'), `${rel} must not opt into a page-level right panel`);

  for (const pattern of DIRECT_HEADER_DUPLICATION_PATTERNS) {
    assert(!pattern.test(html), `${rel} duplicates locked Swarmsy header markup`);
  }

  const inlineStyleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
  for (const block of inlineStyleBlocks) {
    for (const pattern of FORBIDDEN_LOCAL_UI_PATTERNS) {
      assert(!pattern.test(block), `${rel} contains forbidden local Swarmsy/header UI overrides`);
    }
  }

  for (const src of requiredScripts) {
    assert(html.includes(src), `${rel} is missing required shell script ${src}`);
    assert(hasCfBypass(html, src), `${rel} must load ${src} with data-cfasync="false"`);
    assert(scriptCount(html, src) === 1, `${rel} must include ${src} exactly once`);
  }

  return { rel, skipped: false };
}

function main() {
  const shellHtml = validateSharedAssets();
  const requiredScripts = extractRequiredShellScripts(shellHtml);
  const files = fs.readdirSync(WIKI_DIR)
    .filter((entry) => entry.endsWith('.html'))
    .sort()
    .map((entry) => path.join(WIKI_DIR, entry));

  let validated = 0;
  let skipped = 0;
  const failures = [];

  for (const filePath of files) {
    try {
      const result = validateWikiPage(filePath, requiredScripts);
      if (result.skipped) {
        skipped += 1;
      } else {
        validated += 1;
      }
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length > 0) {
    console.error('❌ Wiki structure validation failed.');
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`✅ Wiki structure validation passed for ${validated} wiki page(s); ${skipped} redirect page(s) skipped.`);
}

main();
