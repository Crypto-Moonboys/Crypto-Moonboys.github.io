#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_RANKING_FORMULA, buildAssetVersionRanking } from './nft-asset-version-ranking.mjs';
import { readMarketAnalytics, renderMarketAnalyticsSection } from './nft-market-analytics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'gkniftyheads';
const COLLECTION_PAGE = path.join(ROOT, 'wiki', 'gkniftyheads-nft-collection.html');
const DATA_DIR = path.join(ROOT, 'data', 'gkniftyheads');
const THUMB_WIDTH = 265;
const THUMB_DIR = path.join(ROOT, 'img', 'gkniftyheads', 'thumbs');
const THUMB_URL_PREFIX = '/img/gkniftyheads/thumbs';
const THUMB_MANIFEST = path.join(THUMB_DIR, 'manifest.json');
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://ipfs.filebase.io/ipfs/',
  'https://atomichub-ipfs.com/ipfs/',
  'https://ipfs.hivebp.io/ipfs/',
];
const RAW_BEGIN = '<!-- GKNIFTYHEADS_RAW_TEMPLATE_TABLE:BEGIN -->';
const RAW_END = '<!-- GKNIFTYHEADS_RAW_TEMPLATE_TABLE:END -->';
const RARITY_BEGIN = '<!-- GKNIFTYHEADS_RARITY_RANKING:BEGIN -->';
const RARITY_END = '<!-- GKNIFTYHEADS_RARITY_RANKING:END -->';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function num(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAttr(html, name) {
  const match = html.match(new RegExp(`<tr><th>${name}</th><td>([\\s\\S]*?)<\\/td><\\/tr>`, 'i'));
  return decodeHtml(match?.[1] || '');
}

function getStat(html, label) {
  const stats = [...html.matchAll(/<div class="wiki-stat"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><\/div>/gi)];
  const found = stats.find(([, , statLabel]) => decodeHtml(statLabel).toLowerCase() === label.toLowerCase());
  return decodeHtml(found?.[1] || '');
}

function getImgSrc(html, selectorPattern) {
  const img = html.match(new RegExp(`<img\\b(?=[^>]*${selectorPattern})[^>]*\\bsrc="([^"]+)"[^>]*>`, 'i'));
  return decodeHtml(img?.[1] || '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function attrValue(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}=(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : '';
}

function parseFallbackSrcs(tag) {
  const raw = attrValue(tag, 'data-fallback-srcs');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch (error) {
    return [];
  }
}

function getTemplateImageSources(html) {
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const patterns = [
    /\bwiki-hero-image\b/i,
    /\bnft-template-image\b/i,
    /src=["'][^"']*ipfs/i,
    /\bnft-image\b/i,
  ];
  for (const pattern of patterns) {
    const tag = imgTags.find((candidate) => pattern.test(candidate));
    const primary = attrValue(tag, 'src');
    if (primary) return unique([primary, ...parseFallbackSrcs(tag)]);
  }
  return [];
}

function readThumbManifest(root = ROOT) {
  const manifestPath = path.join(root, 'img', 'gkniftyheads', 'thumbs', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return {};
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function writeThumbManifest(root, manifest) {
  const manifestPath = path.join(root, 'img', 'gkniftyheads', 'thumbs', 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function ipfsGatewayCandidates(url) {
  const match = String(url).match(/\/ipfs\/([^/?#]+)/i);
  if (!match) return [url];
  const cid = match[1];
  return unique([
    url,
    ...IPFS_GATEWAYS.map((gateway) => `${gateway}${cid}`),
  ]);
}

function ipfsCidFromValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const ipfsUri = text.match(/^ipfs:\/\/(?:ipfs\/)?([^/?#]+(?:\/[^?#]+)?)/i);
  if (ipfsUri) return ipfsUri[1];
  const gateway = text.match(/\/ipfs\/([^?#]+)/i);
  if (gateway) return gateway[1];
  const bare = text.match(/^(bafy[a-z0-9]+|bafk[a-z0-9]+|Qm[1-9A-HJ-NP-Za-km-z]+)(?:\/[^?#]+)?$/);
  return bare ? bare[0] : '';
}

function normalizeIpfsValue(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (/^https?:\/\//i.test(text)) return [text];
  const cid = ipfsCidFromValue(text);
  if (!cid) return [];
  return [
    `https://ipfs.hivebp.io/ipfs/${cid}`,
    `https://atomichub-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://nftstorage.link/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];
}

function isUsableImageValue(value) {
  const text = String(value || '').toLowerCase();
  return text && !/\.(mp4|mov|webm|avi|mkv)(?:$|[?#])/i.test(text);
}

export function collectAtomicMediaValues(immutableData = {}) {
  const primary = [];
  const secondary = [];
  const videos = [];

  function addByKey(key, value) {
    if (typeof value !== 'string') return;
    const normalized = normalizeIpfsValue(value);
    if (!normalized.length) return;
    const lowerKey = String(key || '').toLowerCase();
    if (lowerKey === 'img' || lowerKey === 'image') primary.push(...normalized);
    else if (/img|image|thumbnail|thumb|picture|photo|artwork|media/.test(lowerKey)) secondary.push(...normalized);
    else if (lowerKey === 'video' && isUsableImageValue(value)) videos.push(...normalized);
  }

  function walk(value, key = '') {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) walk(childValue, childKey);
      return;
    }
    addByKey(key, value);
  }

  walk(immutableData);
  const imageValues = unique([...primary, ...secondary]);
  return imageValues.length ? imageValues : unique(videos);
}

export function collectAtomicMediaFields(immutableData = {}) {
  const fields = {};
  function walk(value, key = '') {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) walk(childValue, childKey);
      return;
    }
    const lowerKey = String(key || '').toLowerCase();
    if (/^(img|image|video)$/.test(lowerKey) || /img|image|thumbnail|thumb|picture|photo|artwork|media/.test(lowerKey)) {
      fields[key || 'media'] = value;
    }
  }
  walk(immutableData);
  return fields;
}

export async function fetchJson(url, options = {}) {
  async function requestJson(requestOptions = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'http:' ? http : https;
      const request = client.get({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        rejectUnauthorized: options.rejectUnauthorized === false ? false : requestOptions.rejectUnauthorized !== false,
        timeout: options.timeoutMs || 20000,
        headers: {
          accept: 'application/json',
          'user-agent': 'CryptoMoonboysStaticGenerator/1.0',
        },
      }, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`template api ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            reject(error);
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('template api timeout')));
      request.on('error', reject);
    });
  }

  try {
    return await requestJson();
  } catch (error) {
    if (/SELF_SIGNED_CERT|CERT_|NO_REVOCATION|UNABLE_TO_VERIFY/i.test(String(error?.code || error?.message || ''))) {
      return requestJson({ rejectUnauthorized: false });
    }
    throw error;
  }
}

export async function hydrateAtomicAssetsImageSources(rows, options = {}) {
  async function hydrateRow(row) {
    const localSources = row.image_sources || (row.image_url ? [row.image_url] : []);
    const apiUrl = `https://wax.api.atomicassets.io/atomicassets/v1/templates/gkniftyheads/${row.template_id}`;
    try {
      const payload = await fetchJson(apiUrl, { timeoutMs: options.timeoutMs || 20000 });
      const immutableData = payload?.data?.immutable_data || {};
      const atomicSources = collectAtomicMediaValues(immutableData);
      row.immutable_data_image_fields = collectAtomicMediaFields(immutableData);
      row.atomicassets_image_url = apiUrl;
      row.image_sources = unique([...atomicSources, ...localSources]);
      row.image_url = row.image_sources[0] || row.image_url || '';
      row.metadata_status = 'ok';
      row.last_checked_at = options.checkedAt || new Date().toISOString();
    } catch (error) {
      row.atomicassets_image_error = String(error?.message || error);
      row.image_sources = unique(localSources);
      row.image_url = row.image_sources[0] || row.image_url || '';
      row.metadata_status = 'error';
      row.last_checked_at = options.checkedAt || new Date().toISOString();
    }
    if (options.onRow) await options.onRow(row);
  }

  const concurrency = options.concurrency || 8;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(hydrateRow));
  }
}

export function parseAtomicAssetsCount(payload) {
  const data = payload?.data;
  const candidates = [
    data,
    data?.count,
    payload?.count,
    payload?.total,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || typeof candidate === 'object') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function countTemplateLiveAssets(row, options = {}) {
  const endpoint = `https://wax.api.atomicassets.io/atomicassets/v1/assets/_count?collection_name=${COLLECTION}&template_id=${row.template_id}`;
  const payload = await fetchJson(endpoint, { timeoutMs: options.timeoutMs || 20000 });
  const count = parseAtomicAssetsCount(payload);
  if (!Number.isFinite(count)) throw new Error('AtomicAssets count payload did not include a numeric count');
  return count;
}

export async function hydrateLiveAssetCounts(rows, options = {}) {
  async function hydrateRow(row) {
    try {
      const count = await (options.countTemplate || countTemplateLiveAssets)(row, options);
      row.live_supply = count;
      row.live_supply_status = 'ok';
      row.live_supply_source = 'atomicassets_assets_count';
      row.live_supply_source_url = `https://wax.api.atomicassets.io/atomicassets/v1/assets/_count?collection_name=${COLLECTION}&template_id=${row.template_id}`;
      row.live_supply_checked_at = options.checkedAt || new Date().toISOString();
      row.missing_or_burned_count = Math.max(0, row.issued_supply - count);
      row.pre_baseline_missing_or_burned = row.missing_or_burned_count;
    } catch (error) {
      row.live_supply = row.issued_supply;
      row.live_supply_status = 'issued_supply_fallback';
      row.live_supply_source = 'issued_supply';
      row.live_supply_error = String(error?.message || error);
      row.missing_or_burned_count = null;
      row.pre_baseline_missing_or_burned = null;
    }
    if (options.onRow) await options.onRow(row);
  }

  const concurrency = options.concurrency || 6;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(hydrateRow));
  }
}

function downloadImage(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const request = client.get({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      timeout: options.timeoutMs || 20000,
      headers: {
        'user-agent': 'CryptoMoonboysStaticGenerator/1.0',
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && redirectCount < 4) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadImage(nextUrl, options, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`image fetch ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const mime = String(response.headers['content-type'] || '').split(';')[0];
        const bytes = Buffer.concat(chunks);
        if (!mime.startsWith('image/')) {
          reject(new Error(`bad content-type ${mime || 'missing'}`));
          return;
        }
        if (bytes.length <= 1024) {
          reject(new Error(`image too small ${bytes.length}`));
          return;
        }
        resolve({
          bytes,
          mime,
        });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('image fetch timeout'));
    });
    request.on('error', reject);
  });
}

async function fetchImageBytes(urls, options = {}) {
  const attempts = Math.max(1, options.retries ?? 2);
  const explicitSources = unique([].concat(urls || []));
  const candidates = unique([
    ...explicitSources,
    ...explicitSources.flatMap((source) => ipfsGatewayCandidates(source)),
  ]);
  let lastError = null;
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await downloadImage(candidate, { timeoutMs: options.timeoutMs });
      } catch (error) {
        lastError = error;
        if (/SELF_SIGNED_CERT|CERT_|NO_REVOCATION|UNABLE_TO_VERIFY/i.test(String(error?.code || error?.message || ''))) {
          try {
            return await downloadImage(candidate, { rejectUnauthorized: false, timeoutMs: options.timeoutMs });
          } catch (insecureError) {
            lastError = insecureError;
          }
        }
      }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  throw lastError || new Error('image fetch failed');
}

async function tryResizeWithSharp(bytes) {
  const sharp = (await import('sharp')).default;
  return sharp(bytes)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
}

async function renderWebpThumbnail(page, bytes, mime) {
  const base64 = bytes.toString('base64');
  const result = await page.evaluate(async ({ base64Image, mimeType, targetWidth }) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = `data:${mimeType};base64,${base64Image}`;
    await image.decode();
    const width = targetWidth;
    const height = Math.max(1, Math.round((image.naturalHeight || targetWidth) * (width / Math.max(image.naturalWidth || targetWidth, 1))));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    const arrayBuffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
  }, {
    base64Image: base64,
    mimeType: mime,
    targetWidth: THUMB_WIDTH,
  });
  return Buffer.from(result);
}

async function resizeWithSharp(bytes) {
  try {
    return await tryResizeWithSharp(bytes);
  } catch (error) {
    return null;
  }
}

export async function prepareGkniftyheadsThumbnails(rows, root = ROOT, options = {}) {
  const thumbDir = path.join(root, 'img', 'gkniftyheads', 'thumbs');
  const manifest = readThumbManifest(root);
  let browser = null;
  let page = null;
  let playwrightUnavailable = false;

  async function getPage() {
    if (page) return page;
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch();
      page = await browser.newPage();
      return page;
    } catch (error) {
      playwrightUnavailable = true;
      throw error;
    }
  }

  fs.mkdirSync(thumbDir, { recursive: true });
  async function processRow(row, passOptions) {
    row.thumbnail_url = row.image_url || '';
    row.thumbnail_status = row.image_url ? 'original_fallback' : 'missing_source';
    delete row.thumbnail_error;
    if (!row.image_url) return;
    if (/^\//.test(row.image_url)) {
      row.thumbnail_status = 'local_source';
      return;
    }

    const fileName = `${row.template_id}.webp`;
    const filePath = path.join(thumbDir, fileName);
    const publicUrl = `${THUMB_URL_PREFIX}/${fileName}`;
    const manifestEntry = manifest[String(row.template_id)];
    if (fs.existsSync(filePath) && (!manifestEntry || manifestEntry.source_url === row.image_url)) {
      if (!manifestEntry) {
        manifest[String(row.template_id)] = {
          source_url: row.image_url,
          image_sources: row.image_sources || [row.image_url],
          thumbnail_url: publicUrl,
          width: THUMB_WIDTH,
          generated_at: new Date().toISOString(),
        };
      }
      row.thumbnail_url = publicUrl;
      row.thumbnail_status = 'cached';
      return;
    }
    const reusableEntry = Object.entries(manifest).find(([templateId, entry]) => {
      if (Number(templateId) === row.template_id) return false;
      const entrySources = entry?.image_sources || [entry?.source_url];
      const rowSources = row.image_sources || [row.image_url];
      const sourceOverlap = entrySources.some((source) => rowSources.includes(source));
      const existingPath = entry?.thumbnail_url ? path.join(root, entry.thumbnail_url.replace(/^\//, '')) : '';
      return sourceOverlap && existingPath && fs.existsSync(existingPath);
    });
    if (reusableEntry) {
      const sourcePath = path.join(root, reusableEntry[1].thumbnail_url.replace(/^\//, ''));
      fs.copyFileSync(sourcePath, filePath);
      manifest[String(row.template_id)] = {
        source_url: row.image_url,
        image_sources: row.image_sources || [row.image_url],
        thumbnail_url: publicUrl,
        width: THUMB_WIDTH,
        generated_at: new Date().toISOString(),
        reused_from_template_id: Number(reusableEntry[0]),
      };
      row.thumbnail_url = publicUrl;
      row.thumbnail_status = 'reused';
      writeThumbManifest(root, manifest);
      return;
    }
    if (passOptions.fetchMissing === false) return;
    if (playwrightUnavailable) return;

    try {
      const image = await fetchImageBytes(row.image_sources || [row.image_url], passOptions);
      const thumb = await resizeWithSharp(image.bytes)
        || await renderWebpThumbnail(await getPage(), image.bytes, image.mime);
      if (!thumb || thumb.length <= 1024) throw new Error(`thumbnail too small ${thumb?.length || 0}`);
      fs.writeFileSync(filePath, thumb);
      manifest[String(row.template_id)] = {
        source_url: row.image_url,
        image_sources: row.image_sources || [row.image_url],
        thumbnail_url: publicUrl,
        width: THUMB_WIDTH,
        generated_at: new Date().toISOString(),
      };
      row.thumbnail_url = publicUrl;
      row.thumbnail_status = 'generated';
      writeThumbManifest(root, manifest);
    } catch (error) {
      row.thumbnail_error = String(error?.message || error);
      row.thumbnail_status = 'original_fallback';
    }
  }

  async function runPass(passRows, passOptions) {
    const concurrency = passOptions.concurrency || 8;
    for (let index = 0; index < passRows.length; index += concurrency) {
      await Promise.all(passRows.slice(index, index + concurrency).map((row) => processRow(row, passOptions)));
    }
  }

  await runPass(rows, {
    timeoutMs: options.timeoutMs || 20000,
    retries: options.retries ?? 2,
    concurrency: options.concurrency || 8,
    fetchMissing: options.fetchMissing,
  });

  const retryRows = rows.filter((row) => row.thumbnail_status === 'original_fallback' && row.image_url);
  if (retryRows.length && options.secondPass !== false) {
    await runPass(retryRows, {
      timeoutMs: options.secondPassTimeoutMs || 45000,
      retries: options.secondPassRetries ?? 2,
      concurrency: options.secondPassConcurrency || 2,
      fetchMissing: options.fetchMissing,
    });
  }

  if (browser) await browser.close();
  writeThumbManifest(root, manifest);
}

async function prepareThumbnails(rows, root = ROOT, options = {}) {
  return prepareGkniftyheadsThumbnails(rows, root, options);
}

function readTemplatePage(row, root = ROOT) {
  const filePath = path.join(root, row.url.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return {};
  const html = fs.readFileSync(filePath, 'utf8');
  const imageSources = getTemplateImageSources(html);
  return {
    rarity_trait: getAttr(html, 'rarity') || 'Not supplied',
    variation_trait: getAttr(html, 'variation') || 'Not supplied',
    description: getAttr(html, 'DESCRIPTION'),
    image_url: imageSources[0] || '',
    image_sources: imageSources,
    schema: getStat(html, 'Schema') || row.schema || '',
  };
}

export function extractRows(collectionHtml, root = ROOT) {
  const table = collectionHtml.match(/<table class="wiki-table nft-template-table">[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error('Could not find existing nft-template-table in collection page.');
  const rows = [...table.matchAll(/<tr><td><a href="([^"]+)">([\s\S]*?)<\/a><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td><a href="([^"]+)"[^>]*>AtomicAssets<\/a><\/td><td><a href="([^"]+)"[^>]*>AtomicHub<\/a><\/td><\/tr>/gi)];
  return rows.map((match) => {
    const row = {
      url: match[1],
      title: decodeHtml(match[2]),
      template_id: num(match[3]),
      schema: decodeHtml(match[4]),
      issued_supply: num(match[5]),
      max_supply: num(match[6]),
      atomicassets_url: decodeHtml(match[7]),
      atomichub_url: decodeHtml(match[8]),
    };
    return { ...row, ...readTemplatePage(row, root) };
  }).filter((row) => row.template_id);
}

function readCache(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const rows = payload.templates || payload.supplies || [];
  return new Map(rows.map((row) => [Number(row.template_id), row]));
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizedImageCid(urls = []) {
  for (const url of urls) {
    const cid = ipfsCidFromValue(url);
    if (cid) return cid.toLowerCase();
  }
  return '';
}

function buildTemplateIntegrityAudit(localRows, root = ROOT) {
  const cache = readCache(path.join(root, 'data', 'gkniftyheads', 'template-metadata-cache.json'));
  const supplyCache = readCache(path.join(root, 'data', 'gkniftyheads', 'live-template-supply.json'));
  const confirmed = [];
  const missing = [];
  const conflicts = [];
  const included = [];
  const excluded = [];
  const duplicateMap = new Map();

  for (const row of localRows) {
    const cached = cache.get(row.template_id);
    const supply = supplyCache.get(row.template_id) || {};
    const localImageCid = normalizedImageCid(row.image_sources || (row.image_url ? [row.image_url] : []));
    const atomicImageCid = normalizedImageCid(cached?.image_sources || (cached?.image_url ? [cached.image_url] : []));
    const atomicName = String(cached?.immutable_data_name || cached?.title || '').trim();
    const titleConflict = !!(cached?.exists_on_atomicassets && atomicName && row.title && normalizeText(row.title) !== normalizeText(atomicName));
    const imageConflict = !!(cached?.exists_on_atomicassets && localImageCid && atomicImageCid && localImageCid !== atomicImageCid);
    const record = {
      template_id: row.template_id,
      exists_on_atomicassets: !!(cached?.exists_on_atomicassets && cached?.metadata_status === 'ok'),
      issued_supply: cached?.issued_supply ?? row.issued_supply,
      max_supply: cached?.max_supply ?? row.max_supply,
      schema_name: cached?.schema_name || cached?.schema || row.schema || '',
      immutable_data_name: atomicName,
      immutable_data_image_fields: cached?.immutable_data_image_fields || {},
      image_url: cached?.image_url || row.image_url || '',
      image_cid: atomicImageCid,
      live_supply: supply.live_supply ?? null,
      live_supply_status: supply.live_supply_status || 'missing',
      atomichub_url: row.atomichub_url,
      atomicassets_url: row.atomicassets_url,
      local_wiki_page: row.url || cached?.local_wiki_page || '',
      local_title: row.title,
      title_conflict: titleConflict,
      image_conflict: imageConflict,
      error: cached?.error || null,
    };

    if (!record.exists_on_atomicassets) {
      missing.push(record);
      excluded.push({ template_id: row.template_id, reason: 'missing_from_atomicassets' });
      continue;
    }
    confirmed.push(record);
    if (titleConflict || imageConflict) conflicts.push(record);
    if (imageConflict) {
      excluded.push({ template_id: row.template_id, reason: 'local_page_image_conflict' });
      continue;
    }
    included.push(row.template_id);
    const groupKey = `${record.image_cid || 'no-image'}::${normalizeText(record.immutable_data_name || record.local_title)}`;
    const group = duplicateMap.get(groupKey) || {
      key: groupKey,
      normalized_image_cid: record.image_cid,
      normalized_name: normalizeText(record.immutable_data_name || record.local_title),
      templates: [],
      should_remain_separate_template_rows: true,
      note: 'AtomicAssets confirms these as separate template IDs; group visually if desired, but do not merge scoring rows.',
    };
    group.templates.push({
      template_id: record.template_id,
      issued_supply: record.issued_supply,
      live_supply: record.live_supply,
      exists_on_atomicassets: record.exists_on_atomicassets,
      local_wiki_page: record.local_wiki_page,
      atomichub_url: record.atomichub_url,
    });
    duplicateMap.set(groupKey, group);
  }

  const duplicateGroups = [...duplicateMap.values()].filter((group) => group.templates.length > 1);
  return {
    collection: COLLECTION,
    generated_at: new Date().toISOString(),
    total_local_templates: localRows.length,
    total_atomicassets_confirmed_templates: confirmed.length,
    missing_from_atomicassets: missing,
    duplicate_title_image_groups: duplicateGroups,
    local_page_conflicts: conflicts,
    included_in_rarity: included,
    excluded_from_rarity: excluded,
  };
}

function applyTemplateIntegrity(rows, audit) {
  const included = new Set(audit.included_in_rarity);
  return rows.filter((row) => included.has(row.template_id));
}

function applyMetadataCache(rows, root = ROOT) {
  const cache = readCache(path.join(root, 'data', 'gkniftyheads', 'template-metadata-cache.json'));
  return rows.map((row) => {
    const cached = cache.get(row.template_id);
    if (!cached || !cached.exists_on_atomicassets) return row;
    return {
      ...row,
      title: String(cached.immutable_data_name || cached.title || row.title || '').trim(),
      issued_supply: Number.isFinite(Number(cached.issued_supply)) ? Number(cached.issued_supply) : row.issued_supply,
      max_supply: Number.isFinite(Number(cached.max_supply)) ? Number(cached.max_supply) : row.max_supply,
      schema: cached.schema_name || cached.schema || row.schema,
      immutable_data_name: String(cached.immutable_data_name || '').trim(),
      immutable_data_image_fields: cached.immutable_data_image_fields || row.immutable_data_image_fields || {},
      image_url: cached.image_url || row.image_url || '',
      image_sources: unique([...(cached.image_sources || []), ...(row.image_sources || [])]),
      metadata_status: cached.metadata_status || row.metadata_status,
      exists_on_atomicassets: true,
      metadata_last_checked_at: cached.last_checked_at,
      atomicassets_image_url: cached.atomicassets_url || row.atomicassets_url,
    };
  });
}

function applyLiveSupplyCache(rows, root = ROOT) {
  const cache = readCache(path.join(root, 'data', 'gkniftyheads', 'live-template-supply.json'));
  return rows.map((row) => {
    const cached = cache.get(row.template_id);
    if (!cached || !['ok', 'counted'].includes(cached.live_supply_status) || !Number.isFinite(Number(cached.live_supply))) {
      return row;
    }
    return {
      ...row,
      issued_supply: Number.isFinite(Number(cached.issued_supply)) ? Number(cached.issued_supply) : row.issued_supply,
      live_supply: Number(cached.live_supply),
      live_supply_status: 'counted',
      live_supply_source: 'atomicassets_assets_count',
      live_supply_source_url: cached.source_url,
      live_supply_checked_at: cached.last_checked_at,
      missing_or_burned_count: Number(cached.pre_baseline_missing_or_burned || 0),
      pre_baseline_missing_or_burned: Number(cached.pre_baseline_missing_or_burned || 0),
    };
  });
}

function readAssetStateCache(root = ROOT) {
  const file = path.join(root, 'data', 'gkniftyheads', 'asset-state-cache.json');
  if (!fs.existsSync(file)) {
    return {
      collection: COLLECTION,
      generated_at: null,
      last_delta_scan_at: null,
      last_successful_asset_update: null,
      assets: [],
      template_state: [],
      errors: [],
    };
  }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ...payload,
    assets: Array.isArray(payload.assets) ? payload.assets : [],
    template_state: Array.isArray(payload.template_state) ? payload.template_state : [],
    errors: Array.isArray(payload.errors) ? payload.errors : [],
  };
}

function applyAssetStateCache(rows, root = ROOT) {
  const cache = readAssetStateCache(root);
  const stateByTemplate = new Map(cache.template_state.map((row) => [Number(row.template_id), row]));
  return rows.map((row) => {
    const state = stateByTemplate.get(row.template_id);
    if (!state) {
      return {
        ...row,
        live_supply_from_asset_state: null,
        burned_assets_count: null,
        asset_state_status: cache.assets.length ? 'missing_template_state' : 'not_available',
        asset_state_last_checked_at: cache.last_successful_asset_update || cache.last_delta_scan_at || null,
      };
    }
    const liveFromAssets = Number(state.live_supply_from_assets);
    const countedLive = Number(row.live_supply);
    const hasCountedLive = ['counted', 'ok'].includes(row.live_supply_status) && Number.isFinite(countedLive);
    const matchesCount = hasCountedLive && Number.isFinite(liveFromAssets) && liveFromAssets === countedLive;
    return {
      ...row,
      live_supply_from_asset_state: Number.isFinite(liveFromAssets) ? liveFromAssets : null,
      burned_assets_count: Number(state.burned_assets_count || 0),
      asset_state_status: matchesCount
        ? 'ok'
        : hasCountedLive && Number.isFinite(liveFromAssets)
          ? 'asset_state_mismatch'
          : 'asset_state_available',
      asset_state_last_checked_at: state.last_asset_state_update || cache.last_successful_asset_update || cache.last_delta_scan_at || null,
      asset_state_mismatch: hasCountedLive && Number.isFinite(liveFromAssets) && liveFromAssets !== countedLive
        ? `asset-state live supply ${liveFromAssets} differs from _count live supply ${countedLive}`
        : null,
    };
  });
}

function applyThumbnailCache(rows, root = ROOT) {
  const manifest = readThumbManifest(root);
  return rows.map((row) => {
    const expected = `${THUMB_URL_PREFIX}/${row.template_id}.webp`;
    const expectedPath = path.join(root, expected.replace(/^\//, ''));
    const manifestEntry = manifest[String(row.template_id)];
    if (fs.existsSync(expectedPath)) {
      return {
        ...row,
        thumbnail_url: expected,
        thumbnail_status: manifestEntry?.generated_at ? 'cached' : 'cached_file',
      };
    }
    return {
      ...row,
      thumbnail_url: row.image_url || '',
      thumbnail_status: row.image_url ? 'original_fallback' : 'missing_source',
    };
  });
}

function utilityReason(row) {
  const titleAndTraits = [
    row.title,
    row.rarity_trait,
    row.variation_trait,
  ].join(' ').toLowerCase();
  const description = String(row.description || '').toLowerCase();
  const explicitUtilityPattern = /\b(coupon|fun coupon|redeem|redeemable|blend|burn here|farming|farm|drop|utility|base card)\b/i;
  if (explicitUtilityPattern.test(titleAndTraits) || explicitUtilityPattern.test(description)) {
    return 'Utility/open-mint wording in title, traits, or description.';
  }
  if (row.max_supply === 0) {
    return 'Uncapped max_supply=0 template; excluded from limited scarcity ranking unless explicitly allowlisted.';
  }
  return '';
}

function classify(row) {
  if (row.issued_supply <= 0) return { bucket: 'unissued', band: 'Unissued', reason: 'Issued supply is zero.' };
  const utility = utilityReason(row);
  if (utility) return { bucket: 'utility_open_mint', band: 'Utility / Open Mint', reason: utility };
  return { bucket: 'ranked', band: 'Unranked', reason: 'Fixed/limited circulating template.' };
}

function exposure(rows, traitKey, supplyKey) {
  const map = new Map();
  for (const row of rows) {
    const trait = row[traitKey] || 'Not supplied';
    const current = map.get(trait) || {
      trait,
      template_count: 0,
      exposure_supply: 0,
      template_ids: [],
    };
    current.template_count += 1;
    current.exposure_supply += row[supplyKey];
    current.template_ids.push(row.template_id);
    map.set(trait, current);
  }
  return [...map.values()].sort((a, b) => a.exposure_supply - b.exposure_supply || a.template_count - b.template_count || a.trait.localeCompare(b.trait));
}

const BASE_SCORE_WEIGHTS = Object.freeze({
  live_supply_scarcity: 50,
  rarity_trait_or_name_exposure_scarcity: 25,
  variation_trait_or_metadata_exposure_scarcity: 20,
  missing_burned_supply_bonus: 5,
});

function isMeaningfulTrait(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (['not supplied', 'unknown', 'none', 'n/a', 'na', 'null', 'undefined'].includes(normalized)) return false;
  if (/^template\s*#?\d+$/i.test(normalized)) return false;
  return true;
}

function traitLayerHasMeaning(rows, traitKey) {
  const values = rows
    .map((row) => String(row[traitKey] ?? '').trim())
    .filter(isMeaningfulTrait)
    .map((value) => value.toLowerCase());
  return values.length > 0 && new Set(values).size > 1;
}

function adaptiveWeights(rarityEnabled, variationEnabled) {
  if (rarityEnabled && variationEnabled) {
    return { supplyScore: 50, rarityScore: 25, variationScore: 20, burnScore: 5 };
  }
  if (rarityEnabled) {
    return { supplyScore: 70, rarityScore: 25, variationScore: 0, burnScore: 5 };
  }
  if (variationEnabled) {
    return { supplyScore: 75, rarityScore: 0, variationScore: 20, burnScore: 5 };
  }
  return { supplyScore: 95, rarityScore: 0, variationScore: 0, burnScore: 5 };
}

function sharedRankingFormula() {
  return {
    source_of_truth: 'AtomicAssets',
    atomichub_usage: 'reference_links_only',
    price_used: false,
    market_data_used: false,
    adaptive_weighting: true,
    base_score_weights: BASE_SCORE_WEIGHTS,
    thin_metadata_rule: 'Trait weights are reassigned to live supply scarcity when rarity or variation metadata is missing, generic, repeated, or not meaningful.',
    burn_missing_rule: 'Burns increase rarity through lower live supply and a small missing/burned supply bonus when supported by tracker data.',
    disallowed_score_inputs: [
      'price',
      'floor_price',
      'sales',
      'last_sale',
      'listing_count',
      'marketplace_listing_count',
      'market_cap',
      'volume',
      'AtomicHub listing counts',
    ],
  };
}

function normalizeSupply(row) {
  const hasLiveCount = ['counted', 'ok'].includes(row.live_supply_status) && Number.isFinite(Number(row.live_supply));
  const liveSupply = hasLiveCount ? Number(row.live_supply) : row.issued_supply;
  const preBaselineMissing = hasLiveCount ? Math.max(0, row.issued_supply - liveSupply) : null;
  return {
    liveSupply,
    liveSupplyStatus: hasLiveCount ? 'counted' : 'issued_supply_fallback',
    liveDataStatus: hasLiveCount ? 'atomicassets live asset count' : 'issued-supply fallback',
    liveSupplySource: hasLiveCount ? (row.live_supply_source || 'atomicassets_assets_count') : 'issued_supply',
    preBaselineMissing,
  };
}

export function buildRanking(rows) {
  const classified = rows.map((row) => {
    const cls = classify(row);
    const supply = normalizeSupply(row);
    return {
      ...row,
      bucket: cls.bucket,
      band: cls.band,
      classification_reason: cls.reason,
      live_supply: supply.liveSupply,
      live_supply_status: supply.liveSupplyStatus,
      live_supply_source: supply.liveSupplySource,
      live_data_status: supply.liveDataStatus,
      missing_or_burned_count: supply.preBaselineMissing,
      pre_baseline_missing_or_burned: supply.preBaselineMissing,
      missing_burned_count: supply.preBaselineMissing || 0,
      missing_burned_status: supply.liveSupplyStatus === 'counted'
        ? 'pre-baseline missing/current-supply delta; not confirmed burn history'
        : 'not counted; issued-supply fallback only',
    };
  });

  const ranked = classified.filter((row) => row.bucket === 'ranked');
  const rarityExposure = exposure(ranked, 'rarity_trait', 'live_supply');
  const variationExposure = exposure(ranked, 'variation_trait', 'live_supply');
  const rarityByTrait = new Map(rarityExposure.map((item) => [item.trait, item]));
  const variationByTrait = new Map(variationExposure.map((item) => [item.trait, item]));
  const rarityLayerEnabled = traitLayerHasMeaning(ranked, 'rarity_trait');
  const variationLayerEnabled = traitLayerHasMeaning(ranked, 'variation_trait');
  const supplies = ranked.map((row) => row.live_supply).filter((value) => value > 0);
  const maxSupply = Math.max(...supplies, 1);
  const maxRarityExposure = Math.max(...rarityExposure.map((item) => item.exposure_supply), 1);
  const maxVariationExposure = Math.max(...variationExposure.map((item) => item.exposure_supply), 1);

  for (const row of ranked) {
    const rarity = rarityByTrait.get(row.rarity_trait);
    const variation = variationByTrait.get(row.variation_trait);
    const rarityEnabled = rarityLayerEnabled && isMeaningfulTrait(row.rarity_trait);
    const variationEnabled = variationLayerEnabled && isMeaningfulTrait(row.variation_trait);
    const weights = adaptiveWeights(rarityEnabled, variationEnabled);
    row.rarity_live_exposure = rarity?.exposure_supply || row.live_supply;
    row.rarity_template_exposure = rarity?.template_count || 1;
    row.variation_live_exposure = variation?.exposure_supply || row.live_supply;
    row.variation_template_exposure = variation?.template_count || 1;
    const supplyScore = 1 - ((row.live_supply - 1) / Math.max(maxSupply - 1, 1));
    const rarityScore = rarityEnabled ? 1 - ((row.rarity_live_exposure - 1) / Math.max(maxRarityExposure - 1, 1)) : 0;
    const variationScore = variationEnabled ? 1 - ((row.variation_live_exposure - 1) / Math.max(maxVariationExposure - 1, 1)) : 0;
    const burnScore = row.issued_supply > 0 && row.missing_or_burned_count !== null ? row.missing_or_burned_count / row.issued_supply : 0;
    row.rarity_trait_source = row.rarity_trait_source || 'page_or_metadata';
    row.variation_trait_source = row.variation_trait_source || 'page_or_metadata';
    row.rarity_trait_scoring_enabled = rarityEnabled;
    row.variation_trait_scoring_enabled = variationEnabled;
    row.score_weights_used = weights;
    row.supply_score_component = Number((supplyScore * weights.supplyScore).toFixed(4));
    row.rarity_score_component = Number((rarityScore * weights.rarityScore).toFixed(4));
    row.variation_score_component = Number((variationScore * weights.variationScore).toFixed(4));
    row.missing_burned_percentage = Number(burnScore.toFixed(6));
    row.burn_score_component = Number((burnScore * weights.burnScore).toFixed(4));
    row.price_used = false;
    row.market_data_used = false;
    row.final_score = Number((row.supply_score_component + row.rarity_score_component + row.variation_score_component + row.burn_score_component).toFixed(4));
  }

  ranked.sort((a, b) => {
    const aOneOfOne = a.live_supply === 1 ? 1 : 0;
    const bOneOfOne = b.live_supply === 1 ? 1 : 0;
    return bOneOfOne - aOneOfOne || b.final_score - a.final_score || a.live_supply - b.live_supply || a.template_id - b.template_id;
  });
  const nonLegendaryRanked = ranked.filter((row) => row.live_supply !== 1);
  const ultraRareCutoff = Math.max(1, Math.ceil(nonLegendaryRanked.length * 0.08));
  const rareCutoff = Math.max(ultraRareCutoff + 1, Math.ceil(nonLegendaryRanked.length * 0.25));
  const uncommonCutoff = Math.max(rareCutoff + 1, Math.ceil(nonLegendaryRanked.length * 0.55));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    if (row.live_supply === 1) row.band = 'Legendary';
  });
  nonLegendaryRanked.forEach((row, index) => {
    if (index < ultraRareCutoff) row.band = 'Ultra Rare';
    else if (index < rareCutoff) row.band = 'Rare';
    else if (index < uncommonCutoff) row.band = 'Uncommon';
    else row.band = 'Common';
  });

  return {
    all: classified,
    ranked,
    utility: classified.filter((row) => row.bucket === 'utility_open_mint')
      .sort((a, b) => b.issued_supply - a.issued_supply || a.template_id - b.template_id),
    unissued: classified.filter((row) => row.bucket === 'unissued')
      .sort((a, b) => a.template_id - b.template_id),
    rarityExposure,
    variationExposure,
  };
}

function buildStats(model) {
  const counted = model.all.filter((row) => ['counted', 'ok'].includes(row.live_supply_status));
  const fallback = model.all.filter((row) => !['counted', 'ok'].includes(row.live_supply_status));
  const assetStateRows = model.all.filter((row) => row.live_supply_from_asset_state !== null && row.live_supply_from_asset_state !== undefined);
  const assetStateOk = model.all.filter((row) => row.asset_state_status === 'ok');
  const assetStateMismatches = model.all.filter((row) => row.asset_state_status === 'asset_state_mismatch');
  const liveStatus = counted.length === model.all.length && model.all.length > 0
    ? 'atomicassets live asset count'
    : counted.length > 0
      ? 'partial live asset count with issued-supply fallback'
      : 'issued-supply fallback';
  return {
    templates_scanned: model.all.length,
    ranked_limited_templates: model.ranked.length,
    utility_open_mint_templates: model.utility.length,
    unissued_templates: model.unissued.length,
    total_issued_supply: model.all.reduce((sum, row) => sum + row.issued_supply, 0),
    live_assets_counted: counted.length ? counted.reduce((sum, row) => sum + row.live_supply, 0) : null,
    live_templates_counted: counted.length,
    fallback_issued_supply_counted: fallback.reduce((sum, row) => sum + row.issued_supply, 0),
    pre_baseline_missing_or_burned: counted.reduce((sum, row) => sum + (row.pre_baseline_missing_or_burned || 0), 0),
    missing_or_burned_count: counted.reduce((sum, row) => sum + (row.missing_or_burned_count || 0), 0),
    missing_burned_count: counted.reduce((sum, row) => sum + (row.missing_or_burned_count || 0), 0),
    asset_state_templates_tracked: assetStateRows.length,
    asset_state_ok_templates: assetStateOk.length,
    asset_state_mismatch_templates: assetStateMismatches.length,
    burned_assets_tracked: assetStateRows.reduce((sum, row) => sum + (row.burned_assets_count || 0), 0),
    surviving_mint_ranks_tracked: assetStateRows.reduce((sum, row) => sum + (row.live_supply_from_asset_state || 0), 0),
    asset_state_last_checked_at: assetStateRows
      .map((row) => row.asset_state_last_checked_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
    last_scan_time: new Date().toISOString(),
    scan_block: null,
    live_data_status: liveStatus,
  };
}

function rowLinks(row) {
  return `<a href="${esc(row.url)}">Wiki</a> <a href="${esc(row.atomicassets_url)}" target="_blank" rel="noopener noreferrer">AtomicAssets</a> <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>`;
}

function actionLinks(row) {
  return `<div class="gk-command-links">
      <a href="${esc(row.url)}">Wiki</a>
      <a href="${esc(row.atomicassets_url)}" target="_blank" rel="noopener noreferrer">AtomicAssets</a>
      <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>
    </div>`;
}

function bandClass(value) {
  return esc(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
}

function nftCard(row, options = {}) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-rarity-nft-image-link" href="${esc(row.url)}"><img class="gk-rarity-nft-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-rarity-nft-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  const meta = [
    options.rank ? `<span class="gk-rarity-rank">Rank #${row.rank}</span>` : '',
    options.band ? `<span class="rarity-band rarity-band--${bandClass(row.band)}">${esc(row.band)}</span>` : '',
    options.status ? `<span class="gk-rarity-status-badge">${esc(options.status)}</span>` : '',
  ].filter(Boolean).join('\n        ');
  return `<div class="gk-rarity-nft-card">
      ${image}
      <a class="gk-rarity-nft-title" href="${esc(row.url)}">${esc(row.title)}</a>
      ${meta ? `<div class="gk-rarity-nft-meta">\n        ${meta}\n      </div>` : ''}
    </div>`;
}

function supplyCell(value) {
  return value === null || value === undefined ? 'Not counted' : value;
}

function rarityFilterTokens(row) {
  return [
    'ranked',
    row.band.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    row.live_supply === 1 ? 'one-of-one' : '',
    row.missing_or_burned_count > 0 ? 'missing-burned' : '',
  ].filter(Boolean).join(' ');
}

function deckMetric(label, value) {
  return `<span class="gk-command-metric"><strong>${esc(value)}</strong><small>${esc(label)}</small></span>`;
}

function showcaseKeyTrait(label, value) {
  return `<div class="gk-showcase-key-trait">
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
        </div>`;
}

function commandNote(title, copy) {
  return `<div class="gk-command-note">
      <strong>${esc(title)}</strong>
      <span>${esc(copy)}</span>
    </div>`;
}

function featuredCard(row) {
  if (!row) return '';
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-command-featured-image-link" href="${esc(row.url)}"><img class="gk-command-featured-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-command-featured-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  return `<article class="gk-command-featured-card gk-showcase-card" data-rarity-filter="${rarityFilterTokens(row)}">
      <div class="gk-command-featured-media">${image}</div>
      <div class="gk-command-featured-copy">
        <div class="gk-command-eyebrow">Rank #${row.rank} template</div>
        <h3>${esc(row.title)}</h3>
        <div class="gk-command-badges">
          <span class="gk-command-badge gk-command-badge--rank">Rank #${row.rank}</span>
          <span class="gk-command-badge gk-command-badge--${bandClass(row.band)}">${esc(row.band)}</span>
        </div>
        <div class="gk-command-featured-metrics">
          ${deckMetric('Final score', row.final_score.toFixed(2))}
          ${deckMetric('Supply', `${row.live_supply}/${row.issued_supply}`)}
        </div>
        ${showcaseKeyTrait('Key trait', row.rarity_trait)}
        ${actionLinks(row)}
      </div>
    </article>`;
}

function topRankedCard(row) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-top-ranked-thumb-link" href="${esc(row.url)}"><img class="gk-top-ranked-thumb" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-top-ranked-thumb-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  return `<article class="gk-top-ranked-card" data-rarity-filter="${rarityFilterTokens(row)}">
      <div class="gk-top-ranked-rank">#${row.rank}</div>
      ${image}
      <div class="gk-top-ranked-copy">
        <a class="gk-top-ranked-title" href="${esc(row.url)}">${esc(row.title)}</a>
        <div class="gk-top-ranked-meta">
          <span class="gk-command-badge gk-command-badge--mini gk-command-badge--${bandClass(row.band)}">${esc(row.band)}</span>
          <span>${row.live_supply}/${row.issued_supply} live/issued</span>
          <span>${row.final_score.toFixed(2)} score</span>
        </div>
        ${actionLinks(row)}
      </div>
    </article>`;
}

function collectionDeckNotes() {
  return `<div class="gk-command-support" aria-label="Collection rarity guide">
      ${commandNote('Template rarity', 'The top cards highlight scarce AtomicAssets templates first. Full scoring components remain in the audit table below.')}
      ${commandNote('Market neutral', 'Price, listings, sales volume, and floor data are excluded from rarity scoring.')}
    </div>`;
}

function rarityOverviewCards() {
  return `<div class="gk-section-card-grid gk-rarity-overview-cards" aria-label="Rarity overview">
            <div class="gk-info-card">
              <span>Template rarity</span>
              <p>Collector-facing ranking for GKniftyHEADS AtomicAssets templates. Separate template IDs may share the same artwork or name.</p>
            </div>
            <div class="gk-info-card">
              <span>Live supply first</span>
              <p>Ranked by current AtomicAssets live supply when counted, with issued-supply fallback only when live asset counting fails.</p>
            </div>
            <div class="gk-info-card">
              <span>Market neutral</span>
              <p>Price, listings, trading volume, and marketplace floor data are not used. Utility/open-mint templates stay outside the main leaderboard.</p>
            </div>
          </div>`;
}

function showcaseHeader(kicker, title, copy) {
  return `<div class="gk-showcase-header">
      <div>
        <p class="gk-command-kicker">${esc(kicker)}</p>
        <h3>${esc(title)}</h3>
      </div>
      <p>${esc(copy)}</p>
    </div>`;
}

function secondaryRankedPanel({ title, countLabel, cards, ariaLabel }) {
  return `<section class="gk-secondary-ranked-section" aria-label="${esc(ariaLabel)}">
            <div class="gk-top-ranked-heading">
              <h3>${esc(title)}</h3>
              <span>${esc(countLabel)}</span>
            </div>
            <div class="gk-top-ranked-list gk-top-ranked-list--cards">
              ${cards}
            </div>
          </section>`;
}

function assetActionLinks(row) {
  const assetApi = row.asset_id ? `https://wax.api.atomicassets.io/atomicassets/v1/assets/${row.asset_id}` : row.atomicassets_url;
  const assetHub = row.asset_id ? `https://wax.atomichub.io/explorer/asset/${row.asset_id}` : row.atomichub_url;
  return `<div class="gk-command-links">
      <a href="${esc(row.url)}">Wiki</a>
      <a href="${esc(assetApi)}" target="_blank" rel="noopener noreferrer">AtomicAssets</a>
      <a href="${esc(assetHub)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>
    </div>`;
}

function globalRarityHeroCard(row) {
  if (!row) return '';
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-command-featured-image-link" href="${esc(row.url)}"><img class="gk-command-featured-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-command-featured-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  return `<article class="gk-command-featured-card gk-global-featured-card gk-showcase-card">
      <div class="gk-command-featured-media">${image}</div>
      <div class="gk-command-featured-copy">
        <div class="gk-command-eyebrow">Global Rank #${row.asset_rank} exact NFT</div>
        <h3>${esc(row.title)}</h3>
        <div class="gk-command-badges">
          <span class="gk-command-badge gk-command-badge--rank">Global #${row.asset_rank}</span>
          <span class="gk-command-badge gk-command-badge--${bandClass(row.rarity_band)}">${esc(row.rarity_band || 'Ranked')}</span>
        </div>
        <div class="gk-command-featured-metrics">
          ${deckMetric('Global score', row.asset_final_score?.toFixed ? row.asset_final_score.toFixed(2) : row.asset_final_score)}
          ${deckMetric('Supply', row.live_supply)}
        </div>
        ${showcaseKeyTrait('Key trait', `Mint #${row.original_mint_number ?? 'Missing'}`)}
        ${assetActionLinks(row)}
      </div>
    </article>`;
}

function globalDeckNotes(assetPreview) {
  return `<div class="gk-command-support" aria-label="Global rarity guide">
      ${commandNote('Exact NFT rarity', 'Ranks exact live NFTs, not just templates. These cards spotlight individual assets while full IDs, mint fields, and verification data stay in the audit table below.')}
      ${commandNote('Source rule', 'AtomicAssets remains the source of truth; marketplace data is not used for ranking.')}
    </div>`;
}

function globalRankedCard(row) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-top-ranked-thumb-link" href="${esc(row.url)}"><img class="gk-top-ranked-thumb" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-top-ranked-thumb-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  const score = row.asset_final_score?.toFixed ? row.asset_final_score.toFixed(2) : row.asset_final_score;
  return `<article class="gk-top-ranked-card">
      <div class="gk-top-ranked-rank">#${row.asset_rank}</div>
      ${image}
      <div class="gk-top-ranked-copy">
        <a class="gk-top-ranked-title" href="${esc(row.url)}">${esc(row.title)}</a>
        <div class="gk-top-ranked-meta">
          <span class="gk-command-badge gk-command-badge--mini gk-command-badge--${bandClass(row.rarity_band)}">${esc(row.rarity_band || 'Ranked')}</span>
          <span>${score} score</span>
          <span>mint ${row.original_mint_number ?? 'missing'}</span>
        </div>
        ${assetActionLinks(row)}
      </div>
    </article>`;
}

const AUDIT_BANDS = ['Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];

function auditTemplateCard(row) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-audit-card-image-link" href="${esc(row.url)}"><img class="gk-audit-card-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-audit-card-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  return `<article class="gk-audit-card" data-rarity-filter="${rarityFilterTokens(row)}">
      ${image}
      <div class="gk-audit-card-copy">
        <div class="gk-audit-card-rank">Rank #${row.rank}</div>
        <a class="gk-audit-card-title" href="${esc(row.url)}">${esc(row.title)}</a>
        <div class="gk-audit-card-metrics">
          ${deckMetric('Score', row.final_score.toFixed(2))}
          ${deckMetric('Supply', `${row.live_supply}/${row.issued_supply}`)}
        </div>
        ${showcaseKeyTrait('Key trait', row.rarity_trait)}
        ${actionLinks(row)}
      </div>
    </article>`;
}

function auditGlobalCard(row) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-audit-card-image-link" href="${esc(row.url)}"><img class="gk-audit-card-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-audit-card-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  const score = row.asset_final_score?.toFixed ? row.asset_final_score.toFixed(2) : row.asset_final_score;
  return `<article class="gk-audit-card gk-audit-card--global">
      ${image}
      <div class="gk-audit-card-copy">
        <div class="gk-audit-card-rank">Global #${row.asset_rank}</div>
        <a class="gk-audit-card-title" href="${esc(row.url)}">${esc(row.title)}</a>
        <div class="gk-audit-card-metrics">
          ${deckMetric('Score', score)}
          ${deckMetric('Mint', row.original_mint_number ?? 'Missing')}
        </div>
        ${showcaseKeyTrait('Live supply', row.live_supply)}
        ${assetActionLinks(row)}
      </div>
    </article>`;
}

function groupedAuditCards(rows, { getBand, renderCard, emptyCopy }) {
  if (!rows.length) return `<p class="lore-paragraph">${esc(emptyCopy || 'No audit rows available.')}</p>`;
  const groups = AUDIT_BANDS
    .map((band) => [band, rows.filter((row) => getBand(row) === band)])
    .filter(([, bandRows]) => bandRows.length);
  return `<div class="gk-audit-card-groups" aria-label="Grouped rarity audit cards">
      ${groups.map(([band, bandRows]) => `<section class="gk-audit-card-group gk-audit-card-group--${bandClass(band)}">
        <div class="gk-audit-card-group-heading">
          <h4>${esc(band)}</h4>
          <span>${bandRows.length} shown</span>
        </div>
        <div class="gk-audit-card-grid">
          ${bandRows.map(renderCard).join('\n          ')}
        </div>
      </section>`).join('\n      ')}
    </div>`;
}

function advancedTable(summary, tableMarkup) {
  return `<details class="gk-advanced-table-details">
      <summary>${esc(summary)}</summary>
      ${tableMarkup}
    </details>`;
}

function utilityBucket(row) {
  const text = `${row.title || ''} ${row.rarity_trait || ''} ${row.variation_trait || ''} ${row.classification_reason || ''}`.toLowerCase();
  if (/coupon|redeem|blend|burn/.test(text)) return 'Utility / Coupons';
  if (/open|infinite|uncapped|max supply is zero/.test(text)) return 'Open Mint / Infinite Supply';
  return 'Collection Utility';
}

function sideAuditCard(row, status) {
  const imageSrc = row.thumbnail_url || row.image_url;
  const image = imageSrc
    ? `<a class="gk-audit-card-image-link" href="${esc(row.url)}"><img class="gk-audit-card-image" src="${esc(imageSrc)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : `<div class="gk-audit-card-image-placeholder" aria-label="Image unavailable">Image unavailable</div>`;
  return `<article class="gk-audit-card gk-audit-card--side" data-rarity-filter="${row.bucket === 'unissued' ? 'unissued' : 'utility-open-mint'}">
      ${image}
      <div class="gk-audit-card-copy">
        <div class="gk-audit-card-rank">${esc(status)}</div>
        <a class="gk-audit-card-title" href="${esc(row.url)}">${esc(row.title)}</a>
        <div class="gk-audit-card-metrics">
          ${deckMetric('Issued', row.issued_supply)}
          ${deckMetric('Max', row.max_supply)}
        </div>
        ${showcaseKeyTrait('Why listed here', row.classification_reason)}
        ${actionLinks(row)}
      </div>
    </article>`;
}

function groupedSideCards(rows, { status, getGroup }) {
  if (!rows.length) return '<p class="lore-paragraph">No templates currently match this section.</p>';
  const groups = [...new Set(rows.map(getGroup))];
  return `<div class="gk-audit-card-groups gk-side-card-groups">
      ${groups.map((group) => {
        const groupRows = rows.filter((row) => getGroup(row) === group);
        return `<section class="gk-audit-card-group">
        <div class="gk-audit-card-group-heading">
          <h4>${esc(group)}</h4>
          <span>${groupRows.length} templates</span>
        </div>
        <div class="gk-audit-card-grid">
          ${groupRows.map((row) => sideAuditCard(row, status)).join('\n          ')}
        </div>
      </section>`;
      }).join('\n      ')}
    </div>`;
}

function rankedRow(row) {
  return `<tr data-rarity-filter="${rarityFilterTokens(row)}">
    <td class="gk-rarity-nft-cell">${nftCard(row, { rank: true, band: true })}</td>
    <td>${row.template_id}</td>
    <td>${row.live_supply}</td>
    <td>${row.issued_supply}</td>
    <td>${supplyCell(row.pre_baseline_missing_or_burned)}</td>
    <td>${esc(row.rarity_trait)}</td>
    <td>${row.rarity_live_exposure}</td>
    <td>${esc(row.variation_trait)}</td>
    <td>${row.variation_live_exposure}</td>
    <td>${row.final_score.toFixed(2)}</td>
    <td>${rowLinks(row)}</td>
  </tr>`;
}

function utilityRow(row) {
  const status = row.bucket === 'unissued' ? 'Unissued' : 'Utility / Open Mint';
  return `<tr data-rarity-filter="${row.bucket === 'unissued' ? 'unissued' : 'utility-open-mint'}">
    <td class="gk-rarity-nft-cell">${nftCard(row, { status })}</td>
    <td>${row.template_id}</td>
    <td>${row.issued_supply}</td>
    <td>${row.max_supply}</td>
    <td>${esc(row.rarity_trait)}</td>
    <td>${esc(row.variation_trait)}</td>
    <td>${esc(row.classification_reason)}</td>
    <td>${rowLinks(row)}</td>
  </tr>`;
}

function assetVersionRow(row) {
  return `<tr>
    <td>${row.asset_rank}</td>
    <td class="gk-rarity-nft-cell">${nftCard(row, { status: row.rarity_band || 'Asset Version' })}</td>
    <td>${row.asset_final_score.toFixed(2)}</td>
    <td>${row.asset_id}</td>
    <td>${row.template_id}</td>
    <td>${row.original_mint_number ?? 'Missing'}</td>
    <td>${row.surviving_mint_rank ?? 'Missing'}</td>
    <td>${row.live_supply}</td>
  </tr>`;
}

function statCard(label, value) {
  return `<div class="wiki-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function readExistingJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

function rankingTable(rows, {
  supplyLabel,
  rarityExposureLabel,
  variationExposureLabel,
  extraClass = '',
} = {}) {
  const tableClass = `wiki-table gk-rarity-table${extraClass ? ` ${extraClass}` : ''}`;
  return `<div class="wiki-table-wrap gk-rarity-table-wrap">
            <table class="${tableClass}">
              <thead>
                <tr>
                  <th>NFT</th>
                  <th>Template ID</th>
                  <th>${supplyLabel}</th>
                  <th>Issued Supply</th>
                  <th>Pre-baseline Missing/Burned</th>
                  <th>Rarity Trait</th>
                  <th>${rarityExposureLabel}</th>
                  <th>Variation Trait</th>
                  <th>${variationExposureLabel}</th>
                  <th>Final Score</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(rankedRow).join('\n                ')}
              </tbody>
            </table>
          </div>`;
}

function buildRankingSection(model, stats, rawSection, marketAnalytics = null, assetVersionRanking = []) {
  const filters = [
    ['all-ranked', 'All Ranked'],
    ['legendary', 'Legendary'],
    ['ultra-rare', 'Ultra Rare'],
    ['rare', 'Rare'],
    ['uncommon', 'Uncommon'],
    ['common', 'Common'],
    ['one-of-one', '1/1'],
    ['missing-burned', 'Missing/Burned'],
    ['utility-open-mint', 'Utility / Open Mint'],
    ['unissued', 'Unissued'],
  ];
  const hasLiveCounts = stats.live_assets_counted !== null;
  const supplyLabel = hasLiveCounts ? 'Live Supply' : 'Issued Supply Fallback';
  const rarityExposureLabel = hasLiveCounts ? 'Rarity Exposure' : 'Rarity Exposure (Fallback)';
  const variationExposureLabel = hasLiveCounts ? 'Variation Exposure' : 'Variation Exposure (Fallback)';
  const liveAssetsValue = hasLiveCounts ? stats.live_assets_counted : 'Not scanned';
  const fallbackSupplyValue = stats.fallback_issued_supply_counted || 'None';
  const rankedPreview = model.ranked.slice(0, 50);
  const assetPreview = assetVersionRanking.slice(0, 50);
  const statusCopy = hasLiveCounts
    ? `<strong>Live data status:</strong> ${esc(stats.live_data_status)}. <strong>Burn tracking:</strong> first AtomicAssets count baseline captured; missing supply is pre-baseline missing/burned, a current supply delta and not confirmed burn history. WAX chain get_info is only used for future scan checkpoint metadata, not NFT rarity data.`
    : '<strong>Live data status:</strong> issued-supply fallback. <strong>Burn tracking:</strong> snapshot baseline pending. WAX chain get_info is only used for future scan checkpoint metadata, not NFT rarity data.';
  const assetStateCopy = stats.asset_state_templates_tracked
    ? `<strong>Asset state cache:</strong> ${stats.asset_state_ok_templates}/${stats.asset_state_templates_tracked} template states match current _count supply; ${stats.asset_state_mismatch_templates} mismatch records are flagged for audit. <strong>Last asset delta scan:</strong> ${esc(stats.asset_state_last_checked_at || 'Not scanned')}.`
    : '<strong>Asset state cache:</strong> pending first successful asset delta scan.';
  const templateHeroCards = model.ranked.slice(0, 3);
  const secondaryTopRanked = model.ranked.slice(3, 9);
  const globalHeroCards = assetPreview.slice(0, 3);
  const globalTopRanked = assetPreview.slice(3, 9);

  return `${RARITY_BEGIN}
        <section class="wiki-section gk-rarity-ranking" data-gkniftyheads-rarity="true">
          <div class="gk-command-header">
            <div>
              <p class="gk-command-kicker">GKniftyHEADS Rarity Tracker / Template Rarity Ranking</p>
              <h2 id="gkniftyheads-rarity-ranking">GKniftyHEADS Rarity Command Deck</h2>
            </div>
            <span class="feed-status-badge" data-feed-status-id="gkniftyheads_rarity">Rarity snapshot active</span>
          </div>
          ${rarityOverviewCards()}
          <div class="wiki-stat-grid gk-rarity-stats gk-command-stat-strip" data-rarity-stat-grid="true">
            ${statCard('Templates scanned', stats.templates_scanned)}
            ${statCard('Ranked limited templates', stats.ranked_limited_templates)}
            ${statCard('Utility / open mint templates', stats.utility_open_mint_templates)}
            ${statCard('Unissued templates', stats.unissued_templates)}
            ${statCard('Live assets counted', liveAssetsValue)}
            ${statCard('Last updated', stats.last_scan_time)}
          </div>

          <section class="gk-command-deck gk-showcase-section gk-template-rarity-showcase" aria-label="Template Rarity top three cards">
            ${showcaseHeader('Template Rarity', 'Template Rarity: Top 3', 'The highest ranked GKniftyHEADS templates are surfaced first as collector cards, with audit tables kept below for source verification.')}
            <div class="gk-showcase-grid">
              ${templateHeroCards.map(featuredCard).join('\n              ')}
            </div>
            ${collectionDeckNotes()}
            <div class="gk-rarity-filters" aria-label="Rarity filters">
              ${filters.map(([filter, label]) => `<button type="button" data-gk-rarity-filter="${filter}">${esc(label)}</button>`).join('\n              ')}
            </div>
          </section>

          ${secondaryRankedPanel({
            title: 'Top Ranked Templates',
            countLabel: `${secondaryTopRanked.length} more shown`,
            ariaLabel: 'Secondary Top Ranked Templates',
            cards: secondaryTopRanked.map(topRankedCard).join('\n              '),
          })}

          <details class="wiki-section gk-rarity-audit" data-rarity-audit>
            <summary>Full Rarity Audit</summary>
            <p class="lore-paragraph">Collector-card audit grouped by rarity band first. The raw score table remains below for verification and source tracing.</p>
            ${groupedAuditCards(model.ranked, {
              getBand: (row) => row.band,
              renderCard: auditTemplateCard,
              emptyCopy: 'No ranked limited templates are available.',
            })}
            ${advancedTable('Advanced raw rarity table', rankingTable(model.ranked, { supplyLabel, rarityExposureLabel, variationExposureLabel }))}
          </details>

          <section class="wiki-section gk-rarity-method">
            <h3>How rarity works</h3>
            <div class="gk-section-card-grid gk-rarity-method-cards" aria-label="Rarity methodology notes">
              <div class="gk-info-card">
                <span>Template formula</span>
                <p>Template scores use 50% live supply scarcity, 25% rarity trait exposure, 20% variation exposure, and 5% pre-baseline missing/burned delta when available.</p>
              </div>
              <div class="gk-info-card">
                <span>Mint rules</span>
                <p>Original mint numbers never change. Burns do not renumber NFTs; surviving mint rank is tracked separately among currently live/unburned NFTs.</p>
              </div>
              <div class="gk-info-card">
                <span>Market excluded</span>
                <p>Price, floor, listings, volume, sales, and market cap are excluded from the rarity score.</p>
              </div>
              <div class="gk-info-card">
                <span>Methodology</span>
                <p><a href="/docs/nft-rarity-methodology.md">Read the full methodology</a> for the score model and audit assumptions.</p>
              </div>
            </div>
          </section>
          <section class="wiki-section gk-asset-version-ranking">
            <p class="gk-command-kicker">Global Rarity / Exact NFT Ranking</p>
            <h3>Best Exact NFT Versions</h3>
            <section class="gk-command-deck gk-global-rarity-deck gk-showcase-section gk-global-rarity-showcase" aria-label="Exact NFT Global Rarity top three cards">
              ${showcaseHeader('Exact NFT / Global Rarity', 'Exact NFT Global Rarity: Top 3', 'The strongest exact live NFTs are shown as individual asset cards before the deeper global rarity audit.')}
              <div class="gk-showcase-grid">
                ${globalHeroCards.length ? globalHeroCards.map(globalRarityHeroCard).join('\n                ') : '<p class="lore-paragraph">Pending asset-state sync.</p>'}
              </div>
              ${globalDeckNotes(assetPreview)}
            </section>
            ${secondaryRankedPanel({
              title: 'Top Global Ranked NFTs',
              countLabel: `${globalTopRanked.length} more shown`,
              ariaLabel: 'Secondary Top Global Ranked NFTs',
              cards: globalTopRanked.length ? globalTopRanked.map(globalRankedCard).join('\n              ') : '<p class="lore-paragraph">Pending asset-state sync.</p>',
            })}
            <details class="wiki-section gk-rarity-audit gk-global-rarity-audit">
              <summary>Full Global Rarity Audit</summary>
              <p class="lore-paragraph">Exact NFT ranking cards grouped by rarity band first. The raw asset table remains below for asset IDs, mint fields, and verification.</p>
              ${groupedAuditCards(assetPreview, {
                getBand: (row) => row.rarity_band || 'Common',
                renderCard: auditGlobalCard,
                emptyCopy: 'Pending asset-state sync.',
              })}
              ${advancedTable('Advanced raw global rarity table', `<div class="wiki-table-wrap">
                <table class="wiki-table gk-asset-version-table">
                  <thead>
                    <tr><th>Asset Rank</th><th>NFT</th><th>Asset Score</th><th>Asset ID</th><th>Template ID</th><th>Original Mint Number</th><th>Surviving Mint Rank</th><th>Live Supply</th></tr>
                  </thead>
                  <tbody>${assetPreview.length ? assetPreview.map(assetVersionRow).join('\n                ') : '<tr><td colspan="8">Pending asset-state sync.</td></tr>'}</tbody>
                </table>
              </div>`)}
            </details>
          </section>

          <section class="wiki-section gk-rarity-utility">
            <details>
              <summary>Utility / Open Mint / Infinite Supply</summary>
              <p class="lore-paragraph">These templates are useful collection objects, but they are excluded from the limited-template rarity leaderboard because their supply behavior or purpose is not comparable to scarce art/card templates.</p>
              ${groupedSideCards(model.utility, { status: 'Utility / Open Mint', getGroup: utilityBucket })}
              ${advancedTable('Advanced raw utility table', `<div class="wiki-table-wrap">
                <table class="wiki-table gk-rarity-side-table">
                  <thead><tr><th>NFT</th><th>Template ID</th><th>Issued</th><th>Max</th><th>Rarity Trait</th><th>Variation Trait</th><th>Reason</th><th>Links</th></tr></thead>
                  <tbody>${model.utility.map(utilityRow).join('\n                ')}</tbody>
                </table>
              </div>`)}
            </details>
          </section>

          <section class="wiki-section gk-rarity-unissued">
            <details>
              <summary>Unissued / Not Circulating</summary>
              <p class="lore-paragraph">These templates have zero issued supply and are not ranked as rare circulating NFTs.</p>
              ${groupedSideCards(model.unissued, { status: 'Unissued', getGroup: () => 'Not Circulating' })}
              ${advancedTable('Advanced raw unissued table', `<div class="wiki-table-wrap">
                <table class="wiki-table gk-rarity-side-table">
                  <thead><tr><th>NFT</th><th>Template ID</th><th>Issued</th><th>Max</th><th>Rarity Trait</th><th>Variation Trait</th><th>Reason</th><th>Links</th></tr></thead>
                  <tbody>${model.unissued.map(utilityRow).join('\n                ')}</tbody>
                </table>
              </div>`)}
            </details>
          </section>

          ${renderMarketAnalyticsSection(marketAnalytics, esc)}

          <details class="developer-details gk-rarity-developer-details">
            <summary>Developer tracker details</summary>
            <section class="wiki-section gk-rarity-status">
              <h3>Last Scan Status</h3>
              <p class="lore-paragraph">${statusCopy}</p>
              <p class="lore-paragraph">${assetStateCopy}</p>
            </section>
            <section class="wiki-section gk-rarity-source-note">
              <h3>Source Links / Methodology Note</h3>
              <p class="lore-paragraph">Source data comes from AtomicAssets, existing website collection data, and local GKniftyHEADS template wiki pages. AtomicAssets and AtomicHub links remain on every row. Price is never used in this rarity score.</p>
            </section>
          </details>

          <section class="wiki-section gk-rarity-raw-fallback" data-rarity-fallback hidden>
            <p class="notice notice-warning">Live rarity data unavailable. Showing raw template list only. This is not the final rarity ranking.</p>
${rawSection}
          </section>
        </section>
${RARITY_END}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeCsv(file, rows, headers) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csv(row[header])).join(',')).join('\n')}\n`, 'utf8');
}

function publicTemplate(row) {
  const {
    description,
    ...safeRow
  } = row;
  return safeRow;
}

function ensureRarityClientScript(html) {
  const script = '<script data-cfasync="false" src="/js/gkniftyheads-rarity.js"></script>';
  if (html.includes(script)) return html;
  const anchor = '<script data-cfasync="false" src="/js/battle-layer.js"></script>';
  if (html.includes(anchor)) return html.replace(anchor, `${anchor}\n${script}`);
  return html.replace('</body>', `${script}\n</body>`);
}

function buildSurvivingMintRanksPayload(root = ROOT) {
  const cache = readAssetStateCache(root);
  const byTemplate = new Map();
  for (const asset of cache.assets || []) {
    const templateId = Number(asset.template_id);
    if (!Number.isFinite(templateId)) continue;
    const group = byTemplate.get(templateId) || [];
    group.push(asset);
    byTemplate.set(templateId, group);
  }
  const templates = [...byTemplate.entries()].sort((a, b) => a[0] - b[0]).map(([templateId, assets]) => {
    const live = assets
      .filter((asset) => !asset.burned)
      .sort((a, b) => Number(a.original_mint_number || 0) - Number(b.original_mint_number || 0) || String(a.asset_id).localeCompare(String(b.asset_id)));
    const rankByAsset = new Map(live.map((asset, index) => [asset.asset_id, index + 1]));
    return {
      template_id: templateId,
      live_supply: live.length,
      burned_assets_count: assets.filter((asset) => asset.burned).length,
      assets: assets
        .slice()
        .sort((a, b) => Number(a.original_mint_number || 0) - Number(b.original_mint_number || 0) || String(a.asset_id).localeCompare(String(b.asset_id)))
        .map((asset) => ({
          asset_id: asset.asset_id,
          original_mint_number: asset.original_mint_number,
          ...(asset.burned ? {} : { surviving_mint_rank: rankByAsset.get(asset.asset_id) }),
          burned: Boolean(asset.burned),
        })),
    };
  });
  return {
    collection: COLLECTION,
    generated_at: new Date().toISOString(),
    templates,
  };
}

function replaceSection(html, rankingSection) {
  if (html.includes(RARITY_BEGIN) && html.includes(RARITY_END)) {
    return html.replace(new RegExp(`${RARITY_BEGIN}[\\s\\S]*?${RARITY_END}`), rankingSection);
  }
  const oldSection = html.match(/        <section class="wiki-section">\s*<h2 id="all-nfts">All NFTs \/ Templates<\/h2>[\s\S]*?        <\/section>/i)?.[0];
  if (!oldSection) throw new Error('Could not find old All NFTs / Templates section to replace.');
  return html.replace(oldSection, rankingSection);
}

export async function runGenerateGkniftyheadsRarity(root = ROOT, options = {}) {
  const collectionPage = path.join(root, 'wiki', 'gkniftyheads-nft-collection.html');
  const html = fs.readFileSync(collectionPage, 'utf8');
  const oldSection = html.match(new RegExp(`${RAW_BEGIN}[\\s\\S]*?${RAW_END}`))?.[0]
    || html.match(/        <section class="wiki-section">\s*<h2 id="all-nfts">All NFTs \/ Templates<\/h2>[\s\S]*?        <\/section>/i)?.[0];
  if (!oldSection) throw new Error('Could not locate raw template table section.');

  const localRows = extractRows(html, root);
  const integrityAudit = buildTemplateIntegrityAudit(localRows, root);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'template-integrity-audit.json'), integrityAudit);
  let rows = applyTemplateIntegrity(localRows, integrityAudit);
  rows = applyMetadataCache(rows, root);
  rows = applyLiveSupplyCache(rows, root);
  rows = applyAssetStateCache(rows, root);
  rows = applyThumbnailCache(rows, root);
  if (options.prepareThumbnails) {
    await prepareThumbnails(rows, root, options.thumbnailOptions || {});
  }
  const model = buildRanking(rows);
  const stats = buildStats(model);
  const rarityPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    ranking_formula: sharedRankingFormula(),
    live_data_status: stats.live_data_status,
    stats,
    ranked_templates: model.ranked.map(publicTemplate),
    utility_open_mint_templates: model.utility.map(publicTemplate),
    unissued_templates: model.unissued.map(publicTemplate),
  };
  const survivingMintRanksPayload = buildSurvivingMintRanksPayload(root);
  const survivingRankByAsset = new Map(survivingMintRanksPayload.templates.flatMap((template) => template.assets.map((asset) => [
    String(asset.asset_id),
    asset.surviving_mint_rank ?? null,
  ])));
  const assetStateCache = readAssetStateCache(root);
  const sourceAssetRows = assetStateCache.assets.map((asset) => ({
    asset_id: asset.asset_id,
    template_id: Number(asset.template_id),
    owner: asset.owner || null,
    original_mint_number: asset.original_mint_number,
    surviving_mint_rank: survivingRankByAsset.get(String(asset.asset_id)) ?? null,
    burned: Boolean(asset.burned),
  }));
  const assetVersionRanking = buildAssetVersionRanking(sourceAssetRows, model.ranked);
  const livePayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    status: stats.live_data_status,
    asset_ranking_formula: ASSET_RANKING_FORMULA,
    note: stats.live_assets_counted === null
      ? 'Live asset count failed; using issued-supply fallback. original_mint_number and surviving_mint_rank remain pending until asset snapshots are available.'
      : 'Current AtomicAssets asset counts are captured by template. pre_baseline_missing_or_burned is a current supply delta and first-scan baseline, not confirmed burn history. original_mint_number is permanent; surviving_mint_rank may be tracked separately among currently live/unburned NFTs.',
    template_counts: stats.live_assets_counted === null ? [] : model.all.map((row) => ({
      template_id: row.template_id,
      issued_supply: row.issued_supply,
      live_supply: row.live_supply,
      live_supply_status: row.live_supply_status,
      pre_baseline_missing_or_burned: row.pre_baseline_missing_or_burned,
    })),
    assets: assetVersionRanking,
  };
  const traitPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    live_data_status: stats.live_data_status,
    rarity_traits: model.rarityExposure,
    variation_traits: model.variationExposure,
  };
  const existingSync = readExistingJson(path.join(root, 'data', 'gkniftyheads', 'sync-status.json'));
  const existingWaxInfo = existingSync?.wax_get_info && typeof existingSync.wax_get_info === 'object'
    ? existingSync.wax_get_info
    : {};
  const syncPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    source: 'local website pages',
    live_data_status: stats.live_data_status,
    wax_get_info: {
      ...existingWaxInfo,
      used_for: 'future scan checkpoint metadata only',
      endpoint: 'https://wax.eosusa.io/v1/chain/get_info',
      head_block_num: existingWaxInfo.head_block_num ?? null,
      head_block_time: existingWaxInfo.head_block_time ?? null,
    },
    burn_tracking_status: 'baseline pending; no confirmed historic burn events claimed',
    supply_counting: stats.live_assets_counted === null
      ? 'issued_supply_fallback'
      : 'atomicassets_current_assets_by_template',
    asset_state_cache: {
      status: stats.asset_state_templates_tracked ? 'available' : 'pending',
      templates_tracked: stats.asset_state_templates_tracked,
      ok_templates: stats.asset_state_ok_templates,
      mismatch_templates: stats.asset_state_mismatch_templates,
      burned_assets_tracked: stats.burned_assets_tracked,
      surviving_mint_ranks_tracked: stats.surviving_mint_ranks_tracked,
      last_asset_delta_scan: stats.asset_state_last_checked_at,
    },
  };

  writeJson(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), rarityPayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'live-asset-rarity.json'), livePayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'surviving-mint-ranks.json'), survivingMintRanksPayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'trait-exposure.json'), traitPayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'sync-status.json'), syncPayload);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'template-rarity.csv'), [...model.ranked, ...model.utility, ...model.unissued], [
    'rank', 'band', 'bucket', 'title', 'template_id', 'live_supply', 'live_supply_status', 'issued_supply', 'max_supply', 'pre_baseline_missing_or_burned', 'missing_or_burned_count', 'rarity_trait', 'rarity_trait_scoring_enabled', 'rarity_live_exposure', 'variation_trait', 'variation_trait_scoring_enabled', 'variation_live_exposure', 'supply_score_component', 'rarity_score_component', 'variation_score_component', 'burn_score_component', 'missing_burned_percentage', 'final_score', 'url', 'atomicassets_url', 'atomichub_url'
  ]);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'live-asset-rarity.csv'), assetVersionRanking, [
    'asset_rank', 'asset_final_score', 'asset_id', 'template_id', 'owner', 'template_rank', 'template_final_score', 'template_score_component', 'original_mint_number', 'original_mint_score', 'original_mint_score_component', 'original_mint_status', 'surviving_mint_rank', 'surviving_mint_rank_score', 'surviving_mint_rank_score_component', 'surviving_mint_rank_status', 'live_supply', 'issued_supply', 'rarity_band', 'burned', 'price_used', 'market_data_used'
  ]);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'trait-exposure.csv'), [
    ...model.rarityExposure.map((row) => ({ trait_type: 'rarity', ...row })),
    ...model.variationExposure.map((row) => ({ trait_type: 'variation', ...row })),
  ], ['trait_type', 'trait', 'template_count', 'exposure_supply', 'template_ids']);

  const rawFallback = oldSection.includes(RAW_BEGIN) ? oldSection : `${RAW_BEGIN}\n${oldSection}\n${RAW_END}`;
  const marketAnalytics = readMarketAnalytics(root, COLLECTION);
  const nextHtml = ensureRarityClientScript(replaceSection(html, buildRankingSection(model, stats, rawFallback, marketAnalytics, assetVersionRanking)));
  fs.writeFileSync(collectionPage, nextHtml, 'utf8');
  return {
    templates: rows.length,
    ranked: model.ranked.length,
    utility: model.utility.length,
    unissued: model.unissued.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runGenerateGkniftyheadsRarity(ROOT);
  console.log(`Generated GKniftyHEADS rarity data: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued.`);
}
