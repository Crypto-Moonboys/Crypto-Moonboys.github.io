#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readHtmlAttribute,
  readHtmlAttributes,
  tokenizeHtmlTagsLexically,
} from './wiki-html-structure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');

export const REQUIRED_FIELDS = [
  'slug',
  'title',
  'description',
  'category',
];

export const PUBLISH_MODES = [
  'middle_content_only',
  'metadata_only',
];

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const OPTIONAL_ARRAY_FIELDS = [
  'source_refs',
  'citations',
  'see_also',
];

export const RELATIONSHIP_HINT_GROUPS = [
  'project_hubs',
  'collections',
  'factions',
  'characters',
  'games',
  'tokens',
  'lore',
  'categories',
  'tags',
];

export const CANONICAL_BOOT_MARKERS = [
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
  '/js/bible-loader.js',
  '/js/engagement.js',
  '/js/comments.js',
  '/js/battle-layer.js',
  'CANONICAL SCRIPT BOOT',
  'SAM:BEGIN:article',
];

const BANNED_ARTICLE_PATTERNS = [
  { label: '<!DOCTYPE', pattern: /<!doctype/i },
  { label: '<![CDATA[ control', pattern: /<!\[cdata\[/i },
  { label: '<html boundary', pattern: /<\/?html(?=[\t\n\f\r \/>])/i },
  { label: '<head boundary', pattern: /<\/?head(?=[\t\n\f\r \/>])/i },
  { label: '<body boundary', pattern: /<\/?body(?=[\t\n\f\r \/>])/i },
  { label: '<main boundary', pattern: /<\/?main(?=[\t\n\f\r \/>])/i },
  { label: '<article boundary', pattern: /<\/?article(?=[\t\n\f\r \/>])/i },
  { label: '<script boundary', pattern: /<\/?script(?=[\t\n\f\r \/>])/i },
  { label: '<style boundary', pattern: /<\/?style(?=[\t\n\f\r \/>])/i },
  { label: '<template parser-state boundary', pattern: /<\/?template(?=[\t\n\f\r \/>])/i },
  { label: '<textarea parser-state boundary', pattern: /<\/?textarea(?=[\t\n\f\r \/>])/i },
  { label: '<title parser-state boundary', pattern: /<\/?title(?=[\t\n\f\r \/>])/i },
  { label: '<xmp parser-state boundary', pattern: /<\/?xmp(?=[\t\n\f\r \/>])/i },
  { label: '<plaintext parser-state boundary', pattern: /<\/?plaintext(?=[\t\n\f\r \/>])/i },
  { label: '<iframe parser-state boundary', pattern: /<\/?iframe(?=[\t\n\f\r \/>])/i },
  { label: '<noembed parser-state boundary', pattern: /<\/?noembed(?=[\t\n\f\r \/>])/i },
  { label: '<noframes parser-state boundary', pattern: /<\/?noframes(?=[\t\n\f\r \/>])/i },
  { label: '<noscript parser-state boundary', pattern: /<\/?noscript(?=[\t\n\f\r \/>])/i },
  { label: '<select parser-state boundary', pattern: /<\/?select(?=[\t\n\f\r \/>])/i },
  { label: '<option parser-state boundary', pattern: /<\/?option(?=[\t\n\f\r \/>])/i },
  { label: '<optgroup parser-state boundary', pattern: /<\/?optgroup(?=[\t\n\f\r \/>])/i },
  { label: '<animate executable control', pattern: /<\/?animate(?=[\t\n\f\r \/>])/i },
  { label: '<set executable control', pattern: /<\/?set(?=[\t\n\f\r \/>])/i },
  { label: '<svg foreign-content boundary', pattern: /<\/?svg(?=[\t\n\f\r \/>])/i },
  { label: '<math foreign-content boundary', pattern: /<\/?math(?=[\t\n\f\r \/>])/i },
  { label: '<meta control', pattern: /<\/?meta(?=[\t\n\f\r \/>])/i },
  { label: '<link control', pattern: /<\/?link(?=[\t\n\f\r \/>])/i },
  { label: '<base control', pattern: /<\/?base(?=[\t\n\f\r \/>])/i },
];

const RESERVED_ARTICLE_PATTERNS = [
  { label: 'MANUAL_CONTENT marker', pattern: /<!--\s*manual_content\s*:\s*(?:begin|end)\s*-->/i },
  { label: 'SAM_CONTENT marker', pattern: /<!--\s*sam_content\s*:\s*(?:begin|end)\s*-->/i },
  { label: 'CANONICAL_CONTENT marker', pattern: /<!--\s*canonical_content\s*:\s*(?:begin|end)\s*-->/i },
  { label: 'RELATED_WIKI_PATHS marker', pattern: /<!--\s*related_wiki_paths\s*:\s*(?:begin|end)\s*-->/i },
  { label: 'data-canonical-content attribute', pattern: /\bdata-canonical-content\b/i },
  { label: 'data-wiki-stub attribute', pattern: /\bdata-wiki-stub\b/i },
];

const URL_CONTROL_ATTRIBUTES = new Set([
  'action',
  'archive',
  'background',
  'cite',
  'classid',
  'codebase',
  'data',
  'formaction',
  'href',
  'imagesrcset',
  'longdesc',
  'manifest',
  'ping',
  'poster',
  'profile',
  'src',
  'srcset',
  'usemap',
  'xlink:href',
]);

const URL_LIST_ATTRIBUTES = new Set(['archive', 'imagesrcset', 'ping', 'srcset']);
const PAYLOAD_REFERENCE_URL_FIELDS = ['url', 'href'];
const RESERVED_RUNTIME_WIDGET_CLASSES = new Set([
  'page-like-widget',
  'wiki-comments',
]);

function compactUrlForScheme(value) {
  return String(value || '')
    .trim()
    .replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
}

function isSafeRasterDataUrl(tagName, attributeName, value) {
  if (attributeName !== 'src' || !['img', 'source'].includes(tagName)) return false;
  return /^data:image\/(?:avif|gif|jpe?g|png|webp)(?:;[^,]*)?,/i.test(value);
}

function unsafeUrlReason(tagName, attributeName, value) {
  const compact = compactUrlForScheme(value);
  if (/^(?:javascript|vbscript):/i.test(compact)) return 'dangerous URL scheme';
  if (/^data:/i.test(compact) && !isSafeRasterDataUrl(tagName, attributeName, compact)) {
    return 'unsafe data URL';
  }

  if (URL_LIST_ATTRIBUTES.has(attributeName)) {
    const candidates = String(value || '').split(/[\t\n\f\r ,]+/);
    for (const candidate of candidates) {
      const compactCandidate = compactUrlForScheme(candidate);
      if (/^(?:javascript|vbscript):/i.test(compactCandidate)) return 'dangerous URL scheme';
      if (/^data:/i.test(compactCandidate)) return 'unsafe data URL';
    }
  }
  return '';
}

function validatePayloadUrl(value, fieldPath, failures, { tagName = 'a', attributeName = 'href' } = {}) {
  if (!isNonEmptyString(value)) {
    failures.push(`${fieldPath} must be a non-empty URL string`);
    return;
  }
  const reason = unsafeUrlReason(tagName, attributeName, value);
  if (reason) failures.push(`${fieldPath} must not include ${reason}`);
}

function validateReferenceUrls(payload, failures) {
  for (const field of OPTIONAL_ARRAY_FIELDS) {
    const items = payload[field];
    if (!Array.isArray(items)) continue;

    for (const [index, item] of items.entries()) {
      const itemPath = `${field}[${index}]`;
      if (typeof item === 'string') {
        // Citation strings are rendered as labels. Source and see-also strings
        // are reference targets and may be consumed as URLs by downstream
        // renderers, so reject executable schemes before they leave the gate.
        if (field !== 'citations') {
          const reason = unsafeUrlReason('a', 'href', item);
          if (reason) failures.push(`${itemPath} must not include ${reason}`);
        }
        continue;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        failures.push(`${itemPath} must be a string or object`);
        continue;
      }

      for (const urlField of PAYLOAD_REFERENCE_URL_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(item, urlField)) continue;
        validatePayloadUrl(item[urlField], `${itemPath}.${urlField}`, failures);
      }
    }
  }
}

function validateActiveArticleControls(articleHtml, failures) {
  const openingTags = tokenizeHtmlTagsLexically(articleHtml)
    .filter((token) => !token.closing);

  for (const token of openingTags) {
    const attributes = readHtmlAttributes(token.raw);
    const reservedWidgetClass = attributes
      .filter(({ name, value }) => name === 'class' && value !== null)
      .flatMap(({ value }) => String(value).split(/[\t\n\f\r ]+/))
      .find((className) => RESERVED_RUNTIME_WIDGET_CLASSES.has(className));
    if (reservedWidgetClass) {
      failures.push(`article_html must not include reserved runtime widget class: ${reservedWidgetClass}`);
    }

    for (const attribute of attributes) {
      if (/^on[a-z0-9_:-]+$/i.test(attribute.name)) {
        failures.push(`article_html must not include event handler attribute: ${attribute.name}`);
        continue;
      }
      if (attribute.name === 'srcdoc') {
        failures.push('article_html must not include srcdoc attribute');
        continue;
      }
      if (!URL_CONTROL_ATTRIBUTES.has(attribute.name) || attribute.value === null) continue;
      const reason = unsafeUrlReason(token.name, attribute.name, attribute.value);
      if (reason) {
        failures.push(`article_html must not include ${reason} in ${attribute.name}`);
      }
    }
  }

  return openingTags;
}

export class PayloadValidationError extends Error {
  constructor(message, failures = []) {
    super(message);
    this.name = 'PayloadValidationError';
    this.failures = failures;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateArticleHtml(payload, failures) {
  const articleHtml = payload.article_html;
  if (!isNonEmptyString(articleHtml)) return;

  for (const { label, pattern } of BANNED_ARTICLE_PATTERNS) {
    if (pattern.test(articleHtml)) {
      failures.push(`article_html must not include ${label}`);
    }
  }

  for (const { label, pattern } of RESERVED_ARTICLE_PATTERNS) {
    if (pattern.test(articleHtml)) {
      failures.push(`article_html must not include ${label}`);
    }
  }

  const openingTags = validateActiveArticleControls(articleHtml, failures);
  const injectsBibleContentControl = openingTags.some((token) => {
    const id = readHtmlAttribute(token.raw, 'id');
    return id.present && String(id.value || '').toLowerCase() === 'bible-content';
  });
  if (injectsBibleContentControl) {
    failures.push('article_html must not include reserved bible-content container');
  }

  const lowerArticleHtml = articleHtml.toLowerCase();
  for (const marker of CANONICAL_BOOT_MARKERS) {
    if (lowerArticleHtml.includes(marker.toLowerCase())) {
      failures.push(`article_html must not include canonical boot marker: ${marker}`);
    }
  }
}

function validateNftPayload(payload, failures) {
  if (payload.page_type !== 'nft_template' || payload.publish_mode === 'metadata_only') return;

  if (!isNonEmptyString(payload.collection)) failures.push('collection is required for nft_template payloads');
  if (!isNonEmptyString(payload.template_id)) failures.push('template_id is required for nft_template payloads');

  if (!payload.media || typeof payload.media !== 'object' || Array.isArray(payload.media)) {
    failures.push('media object is required for nft_template payloads');
    return;
  }

  if (payload.media.type !== 'nft_image') failures.push('media.type must be nft_image for nft_template payloads');
  if (payload.media.placement !== 'battle_heat') failures.push('media.placement must be battle_heat for nft_template payloads');
  if (!isNonEmptyString(payload.media.image_url)) {
    failures.push('media.image_url is required for nft_template payloads');
  } else {
    validatePayloadUrl(payload.media.image_url, 'media.image_url', failures, {
      tagName: 'img',
      attributeName: 'src',
    });
  }
  if (!isNonEmptyString(payload.media.alt)) failures.push('media.alt is required for nft_template payloads');
  if (
    Object.prototype.hasOwnProperty.call(payload.media, 'fallback_urls') &&
    !Array.isArray(payload.media.fallback_urls)
  ) {
    failures.push('media.fallback_urls must be an array when present');
  } else if (Array.isArray(payload.media.fallback_urls)) {
    for (const [index, fallbackUrl] of payload.media.fallback_urls.entries()) {
      validatePayloadUrl(fallbackUrl, `media.fallback_urls[${index}]`, failures, {
        tagName: 'img',
        attributeName: 'src',
      });
    }
  }
}

function validateRelationshipHints(payload, failures) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'relationship_hints')) return;
  const hints = payload.relationship_hints;
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) {
    failures.push('relationship_hints must be an object when present');
    return;
  }

  for (const [group, items] of Object.entries(hints)) {
    if (!RELATIONSHIP_HINT_GROUPS.includes(group)) continue;
    if (!Array.isArray(items)) {
      failures.push(`relationship_hints.${group} must be an array when present`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        failures.push(`relationship_hints.${group}[${index}] must be an object`);
      }
    }
  }
}

export function validatePayload(payload, sourceName = '<payload>') {
  const failures = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PayloadValidationError(`${sourceName}: payload must be a JSON object`, [`${sourceName}: payload must be a JSON object`]);
  }

  if (!PUBLISH_MODES.includes(payload.publish_mode)) {
    failures.push(`publish_mode must be one of: ${PUBLISH_MODES.join(', ')}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!isNonEmptyString(payload[field])) {
      failures.push(`${field} is required`);
    }
  }

  if (payload.publish_mode === 'middle_content_only' && !isNonEmptyString(payload.article_html)) {
    failures.push('article_html is required for middle_content_only payloads');
  }

  if (payload.publish_mode === 'metadata_only' && Object.prototype.hasOwnProperty.call(payload, 'article_html')) {
    const articleHtmlIsBlank =
      payload.article_html === null ||
      payload.article_html === undefined ||
      (typeof payload.article_html === 'string' && payload.article_html.trim() === '');
    if (!articleHtmlIsBlank) failures.push('metadata_only payloads must not include article_html prose');
  }

  for (const field of ['expected_content_hash', 'content_hash']) {
    const nullableAbsentRevision = field === 'expected_content_hash' && payload[field] === null;
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      !nullableAbsentRevision &&
      (!isNonEmptyString(payload[field]) || !SHA256_PATTERN.test(payload[field]))
    ) {
      failures.push(`${field} must use sha256:<64 lowercase hex characters>`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'stub') && typeof payload.stub !== 'boolean') {
    failures.push('stub must be a boolean when present');
  }

  if (isNonEmptyString(payload.slug) && (payload.slug.includes('/') || payload.slug.includes('\\') || payload.slug.includes('..'))) {
    failures.push('slug must be a safe page slug, not a path');
  }

  for (const field of OPTIONAL_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && !Array.isArray(payload[field])) {
      failures.push(`${field} must be an array when present`);
    }
  }

  validateReferenceUrls(payload, failures);
  validateArticleHtml(payload, failures);
  validateNftPayload(payload, failures);
  validateRelationshipHints(payload, failures);

  if (failures.length > 0) {
    throw new PayloadValidationError(
      `${sourceName}: ${failures.length} validation failure(s)`,
      failures.map((failure) => `${sourceName}: ${failure}`)
    );
  }

  return payload;
}

export function readPayloadFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new PayloadValidationError(`${filePath}: invalid JSON`, [`${filePath}: invalid JSON: ${error.message}`]);
  }
}

export function getPayloadFiles(payloadDir = DEFAULT_PAYLOAD_DIR) {
  if (!fs.existsSync(payloadDir)) return null;

  const stat = fs.statSync(payloadDir);
  if (!stat.isDirectory()) {
    throw new PayloadValidationError(`${payloadDir}: expected a directory`, [`${payloadDir}: expected a directory`]);
  }

  return fs.readdirSync(payloadDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => path.join(payloadDir, fileName));
}

export function validatePayloadDirectory(payloadDir = DEFAULT_PAYLOAD_DIR) {
  const files = getPayloadFiles(payloadDir);
  if (files === null) {
    return {
      skipped: true,
      payloadDir,
      payloads: [],
      message: `Skipping website publish payload validation: ${payloadDir} does not exist.`,
    };
  }

  const payloads = [];
  const failures = [];

  for (const filePath of files) {
    try {
      const payload = readPayloadFile(filePath);
      validatePayload(payload, path.relative(ROOT, filePath));
      payloads.push({ filePath, payload });
    } catch (error) {
      if (error instanceof PayloadValidationError) {
        failures.push(...error.failures);
      } else {
        failures.push(`${filePath}: ${error.message}`);
      }
    }
  }


  const sourcesBySlug = new Map();
  for (const { filePath, payload } of payloads) {
    const priorSource = sourcesBySlug.get(payload.slug);
    if (priorSource) {
      failures.push(
        `${path.relative(ROOT, filePath)}: duplicate slug ${payload.slug} also appears in ${path.relative(ROOT, priorSource)}`
      );
    } else {
      sourcesBySlug.set(payload.slug, filePath);
    }
  }

  if (failures.length > 0) {
    throw new PayloadValidationError(
      `${payloadDir}: ${failures.length} validation failure(s)`,
      failures
    );
  }

  return {
    skipped: false,
    payloadDir,
    payloads,
    message: `Validated ${payloads.length} website publish payload(s) in ${payloadDir}.`,
  };
}

function cli() {
  const payloadDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PAYLOAD_DIR;

  try {
    const result = validatePayloadDirectory(payloadDir);
    console.log(result.message);
  } catch (error) {
    if (error instanceof PayloadValidationError) {
      console.error('Website publish payload validation failed:');
      for (const failure of error.failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli();
}
