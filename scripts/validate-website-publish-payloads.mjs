#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');

export const REQUIRED_FIELDS = [
  'slug',
  'title',
  'description',
  'category',
  'article_html',
];

export const OPTIONAL_ARRAY_FIELDS = [
  'source_refs',
  'citations',
  'see_also',
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
  { label: '<html', pattern: /<html\b/i },
  { label: '<head', pattern: /<head\b/i },
  { label: '<body', pattern: /<body\b/i },
  { label: '<script', pattern: /<script\b/i },
];

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

  const lowerArticleHtml = articleHtml.toLowerCase();
  for (const marker of CANONICAL_BOOT_MARKERS) {
    if (lowerArticleHtml.includes(marker.toLowerCase())) {
      failures.push(`article_html must not include canonical boot marker: ${marker}`);
    }
  }
}

function validateNftPayload(payload, failures) {
  if (payload.page_type !== 'nft_template') return;

  if (!isNonEmptyString(payload.collection)) failures.push('collection is required for nft_template payloads');
  if (!isNonEmptyString(payload.template_id)) failures.push('template_id is required for nft_template payloads');

  if (!payload.media || typeof payload.media !== 'object' || Array.isArray(payload.media)) {
    failures.push('media object is required for nft_template payloads');
    return;
  }

  if (payload.media.type !== 'nft_image') failures.push('media.type must be nft_image for nft_template payloads');
  if (payload.media.placement !== 'battle_heat') failures.push('media.placement must be battle_heat for nft_template payloads');
  if (!isNonEmptyString(payload.media.image_url)) failures.push('media.image_url is required for nft_template payloads');
  if (!isNonEmptyString(payload.media.alt)) failures.push('media.alt is required for nft_template payloads');
  if (
    Object.prototype.hasOwnProperty.call(payload.media, 'fallback_urls') &&
    !Array.isArray(payload.media.fallback_urls)
  ) {
    failures.push('media.fallback_urls must be an array when present');
  }
}

export function validatePayload(payload, sourceName = '<payload>') {
  const failures = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PayloadValidationError(`${sourceName}: payload must be a JSON object`, [`${sourceName}: payload must be a JSON object`]);
  }

  if (payload.publish_mode !== 'middle_content_only') {
    failures.push('publish_mode must be middle_content_only');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!isNonEmptyString(payload[field])) {
      failures.push(`${field} is required`);
    }
  }

  if (isNonEmptyString(payload.slug) && (payload.slug.includes('/') || payload.slug.includes('\\') || payload.slug.includes('..'))) {
    failures.push('slug must be a safe page slug, not a path');
  }

  for (const field of OPTIONAL_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && !Array.isArray(payload[field])) {
      failures.push(`${field} must be an array when present`);
    }
  }

  validateArticleHtml(payload, failures);
  validateNftPayload(payload, failures);

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
