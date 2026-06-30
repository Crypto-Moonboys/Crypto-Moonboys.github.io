#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PayloadValidationError, validatePayloadDirectory } from './validate-website-publish-payloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');
export const AFFECTED_SYNC_SURFACES = [
  'categories',
  'search',
  'timeline',
  'graph',
  'dashboard',
  'SAM page',
  'sitemap',
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function categorySlug(category) {
  return String(category)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lore';
}

export function renderBattleHeatMediaTemplate(payload) {
  if (payload.page_type !== 'nft_template') return '';

  const fallbackSources = Array.isArray(payload.media.fallback_urls)
    ? payload.media.fallback_urls.map((url) => `<source srcset="${escapeHtml(url)}">`).join('\n      ')
    : '';

  return `
        <template data-battle-media="nft">
          <div class="nft-battle-media-template">
            <figure class="battle-page-media">
              <picture>
      ${fallbackSources}
                <img src="${escapeHtml(payload.media.image_url)}" alt="${escapeHtml(payload.media.alt)}" loading="lazy">
              </picture>
            </figure>
          </div>
        </template>`;
}

export function renderArticleMiddle(payload) {
  const battleMediaTemplate = renderBattleHeatMediaTemplate(payload);
  return battleMediaTemplate
    ? `${payload.article_html.trim()}\n${battleMediaTemplate}`
    : payload.article_html.trim();
}

export function renderPageFromTemplate(payload, rootDir = ROOT) {
  const templatePath = path.join(rootDir, '_article-template.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const catSlug = categorySlug(payload.category);
  const articleMiddle = renderArticleMiddle(payload);

  const pageHtml = template
    .replace(
      /<!-- ARTICLE CONTENT [\s\S]*?<\/article>/,
      `<!-- ARTICLE CONTENT - imported from middle_content_only payload -->\n      <article class="wiki-content" data-entity-slug="${escapeHtml(payload.slug)}">\n${articleMiddle}\n\n        <div id="bible-content"></div>\n      </article>`
    );

  return pageHtml
    .replaceAll('ARTICLE TITLE', escapeHtml(payload.title))
    .replaceAll('ARTICLE DESCRIPTION', escapeHtml(payload.description))
    .replaceAll('ARTICLE-SLUG', escapeHtml(payload.slug))
    .replaceAll('{{ARTICLE_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('{{ENTITY_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('CATEGORY.html', `${escapeHtml(catSlug)}.html`)
    .replaceAll('CATEGORY NAME', escapeHtml(payload.category))
    .replaceAll('CATEGORY', escapeHtml(payload.category));
}

export function plannedPagePath(payload) {
  return path.join('wiki', `${payload.slug}.html`).replaceAll('\\', '/');
}

export function runImport({
  payloadDir = DEFAULT_PAYLOAD_DIR,
  rootDir = ROOT,
  write = false,
  logger = console.log,
} = {}) {
  const validation = validatePayloadDirectory(payloadDir);
  if (validation.skipped) {
    logger(validation.message);
    return { ...validation, write, plannedPages: [], affectedSyncSurfaces: AFFECTED_SYNC_SURFACES };
  }

  logger(`Website publish payload importer running in ${write ? 'write' : 'dry-run'} mode.`);
  logger(`Affected sync surfaces: ${AFFECTED_SYNC_SURFACES.join(', ')}`);

  const plannedPages = [];
  for (const { payload } of validation.payloads) {
    const relPagePath = plannedPagePath(payload);
    plannedPages.push(relPagePath);
    logger(`Intended page path: ${relPagePath}`);

    if (write) {
      const html = renderPageFromTemplate(payload, rootDir);
      const outputPath = path.join(rootDir, relPagePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, html);
      logger(`Wrote page: ${relPagePath}`);
    }
  }

  if (!write) {
    logger('Dry run only: no pages were written. Pass --write to render with the website template/shell.');
  }

  return {
    ...validation,
    write,
    plannedPages,
    affectedSyncSurfaces: AFFECTED_SYNC_SURFACES,
  };
}

function parseArgs(argv) {
  let payloadDir = DEFAULT_PAYLOAD_DIR;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      write = true;
    } else if (arg === '--payload-dir') {
      payloadDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--payload-dir=')) {
      payloadDir = path.resolve(arg.slice('--payload-dir='.length));
    } else {
      payloadDir = path.resolve(arg);
    }
  }

  return { payloadDir, write };
}

function cli() {
  const options = parseArgs(process.argv.slice(2));

  try {
    runImport(options);
  } catch (error) {
    if (error instanceof PayloadValidationError) {
      console.error('Website publish payload import failed validation:');
      for (const failure of error.failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli();
}
