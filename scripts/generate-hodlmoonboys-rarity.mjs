#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'hodlmoonboys';
const COLLECTION_TITLE = 'Hodl Moonboys';
const FEED_ID = 'hodlmoonboys_rarity';
const DATA_DIR = path.join(ROOT, 'data', COLLECTION);
const PAGE_PATH = path.join(ROOT, 'wiki', 'hodlmoonboys-nft-collection.html');
const THUMB_DIR = path.join(ROOT, 'img', COLLECTION, 'thumbs');
const THUMB_URL_PREFIX = `/img/${COLLECTION}/thumbs`;
const THUMB_MANIFEST = path.join(THUMB_DIR, 'manifest.json');
const ATOMIC_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const NOW = () => new Date().toISOString();
const THUMB_WIDTH = 265;
const SNAPSHOT_OUTPUT_FILES = [
  `data/${COLLECTION}/collection.json`,
  `data/${COLLECTION}/template-metadata-cache.json`,
  `data/${COLLECTION}/live-template-supply.json`,
  `data/${COLLECTION}/template-rarity.json`,
  `data/${COLLECTION}/template-stats.json`,
  `data/${COLLECTION}/trait-exposure.json`,
  `data/${COLLECTION}/sync-status.json`,
  `data/${COLLECTION}/template-rarity.csv`,
  `data/${COLLECTION}/trait-exposure.csv`,
  `wiki/${COLLECTION}-nft-collection.html`,
];

const SCORING_CONTRACT = {
  source_of_truth: 'AtomicAssets',
  atomichub_usage: 'reference_links_only',
  price_used: false,
  market_data_used: false,
  adaptive_weighting: true,
  base_score_weights: {
    live_supply_scarcity: 50,
    rarity_trait_or_name_exposure_scarcity: 25,
    variation_trait_or_metadata_exposure_scarcity: 20,
    missing_burned_supply_bonus: 5,
  },
  thin_metadata_rule: 'Trait weights are reassigned to live supply scarcity when rarity or variation metadata is missing, generic, repeated, or not meaningful.',
  burn_missing_rule: 'Burns increase rarity through lower live supply and a small missing/burned supply bonus when supported by tracker data.',
  disallowed_score_inputs: [
    'price',
    'floor_price',
    'sales',
    'last_sale',
    'listing_count',
    'market_cap',
    'volume',
    'AtomicHub listing counts',
  ],
};

const RARITY_TRAIT_KEYS = ['rarity', 'Rarity', 'tier', 'Tier', 'type', 'Type', 'category', 'Category'];
const VARIATION_TRAIT_KEYS = ['variation', 'Variation', 'variant', 'Variant', 'edition', 'Edition', 'background', 'Background', 'artist', 'Artist'];

function writeFileAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(tempPath, value, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function writeJson(filePath, value) {
  writeFileAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  writeFileAtomically(filePath, value);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readCommittedText(root, relativePath) {
  return execFileSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function readCommittedJson(root, relativePath) {
  return JSON.parse(readCommittedText(root, relativePath));
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, rows, columns) {
  const lines = [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))];
  writeText(filePath, `${lines.join('\n')}\n`);
}

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchJson(url, retries = 5) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'CryptoMoonboysStaticGenerator/1.0',
        },
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        error.retryAfterMs = retryAfter > 0 ? retryAfter * 1000 : 0;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const rateLimitDelay = error.status === 429 ? 2500 * (attempt + 1) : 350 * (attempt + 1);
        const delayMs = Math.max(error.retryAfterMs || 0, rateLimitDelay);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

function ipfsSources(value) {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];
  const cid = trimmed.replace(/^ipfs:\/\//i, '').replace(/^\/?ipfs\//i, '').split(/[/?#]/)[0];
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

function imageCandidates(immutable = {}) {
  const fields = ['img', 'image', 'image_url', 'video'];
  return [...new Set(fields.flatMap((field) => ipfsSources(immutable[field])))];
}

function isMeaningfulTrait(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (['not supplied', 'unknown', 'none', 'n/a', 'na', 'null', 'undefined'].includes(normalized)) return false;
  if (/^template\s*#?\d+$/i.test(normalized)) return false;
  return true;
}

function titleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickTrait(template, keys, fallbackValue = null, fallbackSource = null) {
  for (const key of keys) {
    const value = template.immutable_data?.[key];
    if (isMeaningfulTrait(value)) return { value: String(value).trim(), source: `immutable_data.${key}` };
  }
  if (isMeaningfulTrait(fallbackValue)) return { value: String(fallbackValue).trim(), source: fallbackSource };
  return { value: 'Not supplied', source: 'not_supplied' };
}

function traitLayerHasMeaning(rows, key) {
  const values = rows.map((row) => String(row[key] ?? '').trim().toLowerCase()).filter(isMeaningfulTrait);
  return values.length > 0 && new Set(values).size > 1;
}

function adaptiveWeights(rarityEnabled, variationEnabled) {
  if (rarityEnabled && variationEnabled) return { supplyScore: 50, rarityScore: 25, variationScore: 20, burnScore: 5 };
  if (rarityEnabled) return { supplyScore: 70, rarityScore: 25, variationScore: 0, burnScore: 5 };
  if (variationEnabled) return { supplyScore: 75, rarityScore: 0, variationScore: 20, burnScore: 5 };
  return { supplyScore: 95, rarityScore: 0, variationScore: 0, burnScore: 5 };
}

function exposure(rows, traitKey) {
  const map = new Map();
  for (const row of rows.filter((entry) => isMeaningfulTrait(entry[traitKey]))) {
    const trait = row[traitKey];
    const current = map.get(trait) || { trait, template_count: 0, exposure_supply: 0 };
    current.template_count += 1;
    current.exposure_supply += row.live_supply || 0;
    map.set(trait, current);
  }
  return [...map.values()].sort((a, b) => a.exposure_supply - b.exposure_supply || a.template_count - b.template_count || a.trait.localeCompare(b.trait));
}

function isUtilityOrOpenMint(template) {
  const text = `${template.title || ''} ${template.schema_name || ''} ${JSON.stringify(template.immutable_data || {})}`.toLowerCase();
  if (template.max_supply === 0) return true;
  return /\b(coupon|redeem|blend|farm|drop|base card|utility|pack|ticket|pass)\b/.test(text);
}

function bandFor(row, index, nonLegendaryTotal) {
  if (row.live_supply === 1) return 'Legendary';
  const position = index + 1;
  const ultra = Math.max(1, Math.ceil(nonLegendaryTotal * 0.08));
  const rare = ultra + Math.max(1, Math.ceil(nonLegendaryTotal * 0.17));
  const uncommon = rare + Math.max(1, Math.ceil(nonLegendaryTotal * 0.30));
  if (position <= ultra) return 'Ultra Rare';
  if (position <= rare) return 'Rare';
  if (position <= uncommon) return 'Uncommon';
  return 'Common';
}

function atomicTemplateUrl(templateId) {
  return `${ATOMIC_BASE}/templates/${COLLECTION}/${templateId}`;
}

function atomichubUrl(templateId = '') {
  const suffix = templateId ? `&template_id=${encodeURIComponent(templateId)}` : '';
  return `https://wax.atomichub.io/market?collection_name=${COLLECTION}${suffix}`;
}

function normalizeTemplate(raw) {
  const immutable = raw?.immutable_data && typeof raw.immutable_data === 'object' ? raw.immutable_data : {};
  const schemaName = raw?.schema_name || raw?.schema?.schema_name || null;
  const templateId = num(raw?.template_id);
  const images = imageCandidates(immutable);
  return {
    template_id: templateId,
    title: immutable.name || raw?.name || `${COLLECTION_TITLE} Template ${templateId}`,
    issued_supply: num(raw?.issued_supply),
    max_supply: num(raw?.max_supply),
    schema_name: schemaName,
    immutable_data: immutable,
    image_url: images[0] || null,
    image_sources: images,
    atomicassets_url: atomicTemplateUrl(templateId),
    atomichub_url: atomichubUrl(templateId),
    metadata_status: 'ok',
    exists_on_atomicassets: true,
    last_checked_at: NOW(),
  };
}

async function fetchTemplates() {
  const rows = [];
  for (let page = 1; page < 100; page += 1) {
    const payload = await fetchJson(`${ATOMIC_BASE}/templates?collection_name=${COLLECTION}&limit=1000&page=${page}`);
    const pageRows = asArray(payload?.data);
    rows.push(...pageRows);
    if (pageRows.length < 1000) break;
  }
  return rows.map(normalizeTemplate).sort((a, b) => a.template_id - b.template_id);
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadSharp() {
  try {
    return require('sharp');
  } catch (firstError) {
    const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (runtimeModules) {
      try {
        return require(path.join(runtimeModules, 'sharp'));
      } catch {
        // Fall through to the original dependency error.
      }
    }
    throw firstError;
  }
}

async function fetchArrayBuffer(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out fetching ${url}`)), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'CryptoMoonboysStaticGenerator/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function ensureLocalThumb(template, sharp, manifest) {
  const templateId = template.template_id;
  if (!templateId || !template.image_sources?.length) return null;
  const fileName = `${templateId}.webp`;
  const target = path.join(THUMB_DIR, fileName);
  if (fs.existsSync(target)) {
    manifest[templateId] = { file: fileName, url: `${THUMB_URL_PREFIX}/${fileName}`, source: manifest[templateId]?.source || template.image_sources[0] };
    return manifest[templateId];
  }

  for (const source of template.image_sources) {
    try {
      const input = await fetchArrayBuffer(source);
      const output = await sharp(input, { animated: true, limitInputPixels: false })
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      fs.mkdirSync(THUMB_DIR, { recursive: true });
      fs.writeFileSync(target, output);
      manifest[templateId] = { file: fileName, url: `${THUMB_URL_PREFIX}/${fileName}`, source };
      return manifest[templateId];
    } catch {
      // Try the next gateway/source candidate.
    }
  }
  return null;
}

async function ensureLocalThumbs(templates) {
  const manifest = readJson(THUMB_MANIFEST, {});
  if (process.env.HODL_SKIP_THUMB_FETCH !== '1') {
    const sharp = await loadSharp();
    const concurrency = Math.max(1, num(process.env.HODL_THUMB_CONCURRENCY, 6));
    await mapLimit(templates, concurrency, (template) => ensureLocalThumb(template, sharp, manifest));
  }
  for (const template of templates) {
    const fileName = `${template.template_id}.webp`;
    const target = path.join(THUMB_DIR, fileName);
    if (fs.existsSync(target)) {
      manifest[template.template_id] = {
        file: fileName,
        url: `${THUMB_URL_PREFIX}/${fileName}`,
        source: manifest[template.template_id]?.source || template.image_sources?.[0] || null,
      };
    }
  }
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  writeJson(THUMB_MANIFEST, Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => Number(a) - Number(b))));
  for (const template of templates) {
    const thumb = manifest[template.template_id];
    if (thumb?.url) {
      template.thumbnail_url = thumb.url;
      template.image_url = thumb.url;
    } else {
      template.thumbnail_url = null;
      template.image_url = null;
    }
  }
  return manifest;
}

async function fetchLiveSupply(template) {
  const sourceUrl = `${ATOMIC_BASE}/assets/_count?collection_name=${COLLECTION}&template_id=${template.template_id}`;
  try {
    const payload = await fetchJson(sourceUrl);
    const count = num(payload?.data ?? payload?.count ?? payload?.data?.count, template.issued_supply);
    return {
      template_id: template.template_id,
      issued_supply: template.issued_supply,
      live_supply: count,
      pre_baseline_missing_or_burned: Math.max(0, template.issued_supply - count),
      live_supply_status: 'ok',
      source_url: sourceUrl,
      last_checked_at: NOW(),
      error: null,
    };
  } catch (error) {
    return {
      template_id: template.template_id,
      issued_supply: template.issued_supply,
      live_supply: template.issued_supply,
      pre_baseline_missing_or_burned: null,
      live_supply_status: 'issued_supply_fallback',
      source_url: sourceUrl,
      last_checked_at: NOW(),
      error: error.message || String(error),
    };
  }
}

function buildRanking(templates, supplies) {
  const supplyById = new Map(supplies.map((row) => [row.template_id, row]));
  const rows = templates.map((template) => {
    const supply = supplyById.get(template.template_id) || {};
    const liveSupply = supply.live_supply_status === 'ok' ? num(supply.live_supply) : template.issued_supply;
    const rarityTrait = pickTrait(template, RARITY_TRAIT_KEYS);
    const variationTrait = pickTrait(template, VARIATION_TRAIT_KEYS, template.schema_name, 'schema_name');
    return {
      ...template,
      live_supply: liveSupply,
      live_supply_status: supply.live_supply_status || 'issued_supply_fallback',
      pre_baseline_missing_or_burned: supply.pre_baseline_missing_or_burned ?? null,
      missing_or_burned_count: supply.pre_baseline_missing_or_burned ?? null,
      rarity_trait: rarityTrait.value,
      rarity_trait_source: rarityTrait.source,
      variation_trait: variationTrait.value,
      variation_trait_source: variationTrait.source,
      price_used: false,
      market_data_used: false,
    };
  });

  const unissued = rows.filter((row) => row.issued_supply <= 0);
  const utility = rows.filter((row) => row.issued_supply > 0 && isUtilityOrOpenMint(row));
  const ranked = rows.filter((row) => row.issued_supply > 0 && !isUtilityOrOpenMint(row) && row.max_supply > 0);
  const rarityLayerEnabled = traitLayerHasMeaning(ranked, 'rarity_trait');
  const variationLayerEnabled = traitLayerHasMeaning(ranked, 'variation_trait');
  const rarityExposure = exposure(ranked, 'rarity_trait');
  const variationExposure = exposure(ranked, 'variation_trait');
  const rarityByTrait = new Map(rarityExposure.map((row) => [row.trait, row]));
  const variationByTrait = new Map(variationExposure.map((row) => [row.trait, row]));
  const maxSupply = Math.max(...ranked.map((row) => row.live_supply).filter((value) => value > 0), 1);
  const maxRarityExposure = Math.max(...rarityExposure.map((row) => row.exposure_supply), 1);
  const maxVariationExposure = Math.max(...variationExposure.map((row) => row.exposure_supply), 1);

  for (const row of ranked) {
    const rarityEnabled = rarityLayerEnabled && isMeaningfulTrait(row.rarity_trait);
    const variationEnabled = variationLayerEnabled && isMeaningfulTrait(row.variation_trait);
    const weights = adaptiveWeights(rarityEnabled, variationEnabled);
    const rarity = rarityByTrait.get(row.rarity_trait);
    const variation = variationByTrait.get(row.variation_trait);
    row.rarity_trait_scoring_enabled = rarityEnabled;
    row.variation_trait_scoring_enabled = variationEnabled;
    row.score_weights_used = weights;
    row.rarity_live_exposure = rarity?.exposure_supply || row.live_supply;
    row.variation_live_exposure = variation?.exposure_supply || row.live_supply;
    const supplyScore = 1 - ((row.live_supply - 1) / Math.max(maxSupply - 1, 1));
    const rarityScore = rarityEnabled ? 1 - ((row.rarity_live_exposure - 1) / Math.max(maxRarityExposure - 1, 1)) : 0;
    const variationScore = variationEnabled ? 1 - ((row.variation_live_exposure - 1) / Math.max(maxVariationExposure - 1, 1)) : 0;
    const burnScore = row.live_supply_status === 'ok' && row.issued_supply > 0 ? Math.max(0, num(row.missing_or_burned_count)) / row.issued_supply : 0;
    row.missing_burned_percentage = Number(burnScore.toFixed(6));
    row.supply_score_component = Number((supplyScore * weights.supplyScore).toFixed(4));
    row.rarity_score_component = Number((rarityScore * weights.rarityScore).toFixed(4));
    row.variation_score_component = Number((variationScore * weights.variationScore).toFixed(4));
    row.burn_score_component = Number((burnScore * weights.burnScore).toFixed(4));
    row.final_score = Number((row.supply_score_component + row.rarity_score_component + row.variation_score_component + row.burn_score_component).toFixed(4));
    row.rarity_score = row.final_score;
    row.supply_used_for_scoring = row.live_supply;
  }

  ranked.sort((a, b) => {
    const aOneOfOne = a.live_supply === 1 ? 1 : 0;
    const bOneOfOne = b.live_supply === 1 ? 1 : 0;
    return bOneOfOne - aOneOfOne || b.final_score - a.final_score || a.live_supply - b.live_supply || a.template_id - b.template_id;
  });
  const nonLegendary = ranked.filter((row) => row.live_supply !== 1);
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    row.rarity_band = row.live_supply === 1 ? 'Legendary' : bandFor(row, nonLegendary.indexOf(row), nonLegendary.length);
  });
  return { ranked, utility, unissued, allRows: rows, rarityExposure, variationExposure };
}

function renderTemplateCell(row, ranked = false) {
  const title = row.title || `Template ${row.template_id}`;
  const image = row.image_url
    ? `<a class="nft-template-image-link" href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer"><img class="nft-thumb" src="${esc(row.image_url)}" alt="${esc(title)} NFT artwork" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
    : '<div class="nft-thumb-placeholder" aria-label="Image unavailable">Image unavailable</div>';
  const meta = [
    ranked ? `Rank #${row.rank}` : '',
    ranked ? row.rarity_band : '',
    row.template_id ? `NFT Page ID ${row.template_id}` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="nft-template-cell">
      ${image}
      <div class="nft-template-cell-copy">
        <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>
        ${meta ? `<small>${esc(meta)}</small>` : ''}
      </div>
    </div>`;
}

function renderRows(rows, ranked = false) {
  if (!rows.length) return '<tr><td colspan="12">No NFTs in this group.</td></tr>';
  return rows.map((row) => `<tr>
    <td>${renderTemplateCell(row, ranked)}</td>
    <td>${esc(row.template_id)}</td>
    <td>${esc(row.issued_supply)}</td>
    <td>${esc(row.live_supply)}</td>
    <td>${row.pre_baseline_missing_or_burned == null ? 'Not counted' : esc(row.pre_baseline_missing_or_burned)}</td>
    <td>${esc(row.rarity_trait || 'Not supplied')}</td>
    <td>${esc(row.rarity_trait_scoring_enabled === true ? 'yes' : row.rarity_trait_scoring_enabled === false ? 'no' : 'n/a')}</td>
    <td>${esc(row.variation_trait || 'Not supplied')}</td>
    <td>${esc(row.variation_trait_scoring_enabled === true ? 'yes' : row.variation_trait_scoring_enabled === false ? 'no' : 'n/a')}</td>
    <td>${esc(row.score_weights_used ? JSON.stringify(row.score_weights_used) : '')}</td>
    <td>${esc(row.final_score ?? '')}</td>
    <td>${esc(row.live_supply_status || 'pending')}</td>
  </tr>`).join('\n');
}

function bandClass(value = '') {
  return String(value || 'ranked').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ranked';
}

function rarityFilterTokens(row) {
  return [
    'ranked',
    bandClass(row.rarity_band),
    row.live_supply === 1 ? 'one-of-one' : '',
    row.missing_or_burned_count > 0 ? 'missing-burned' : '',
  ].filter(Boolean).join(' ');
}

function rowLinks(row) {
  return `<div class="gk-command-links">
      <a href="${esc(row.atomicassets_url)}" target="_blank" rel="noopener noreferrer">AtomicAssets</a>
      <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>
    </div>`;
}

function deckMetric(label, value) {
  return `<span class="gk-command-metric"><strong>${esc(value)}</strong><small>${esc(label)}</small></span>`;
}

function showcaseKeyTrait(label, value) {
  return `<div class="gk-showcase-key-trait">
          <span>${esc(label)}</span>
          <strong>${esc(value || 'Not supplied')}</strong>
        </div>`;
}

function commandNote(title, copy) {
  return `<div class="gk-command-note">
      <strong>${esc(title)}</strong>
      <span>${esc(copy)}</span>
    </div>`;
}

function statCard(label, value) {
  return `<div class="wiki-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function cardImage(row, { linkClass, imageClass, placeholderClass }) {
  if (row.image_url) {
    return `<a class="${linkClass}" href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer"><img class="${imageClass}" src="${esc(row.image_url)}" alt="${esc(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`;
  }
  return `<div class="${placeholderClass}" aria-label="Image unavailable">Image unavailable</div>`;
}

function featuredCard(row) {
  if (!row) return '';
  return `<article class="gk-command-featured-card gk-showcase-card" data-rarity-filter="${rarityFilterTokens(row)}">
      <div class="gk-command-featured-media">${cardImage(row, { linkClass: 'gk-command-featured-image-link', imageClass: 'gk-command-featured-image', placeholderClass: 'gk-command-featured-image-placeholder' })}</div>
      <div class="gk-command-featured-copy">
        <div class="gk-command-eyebrow">Rank #${esc(row.rank)} NFT</div>
        <h3>${esc(row.title)}</h3>
        <div class="gk-command-badges">
          <span class="gk-command-badge gk-command-badge--rank">Rank #${esc(row.rank)}</span>
          <span class="gk-command-badge gk-command-badge--${bandClass(row.rarity_band)}">${esc(row.rarity_band)}</span>
        </div>
        <div class="gk-command-featured-metrics">
          ${deckMetric('Final score', Number(row.final_score || 0).toFixed(2))}
          ${deckMetric('Supply', `${row.live_supply}/${row.issued_supply}`)}
        </div>
        ${showcaseKeyTrait('Key trait', row.rarity_trait)}
        ${rowLinks(row)}
      </div>
    </article>`;
}

function topRankedCard(row) {
  return `<article class="gk-top-ranked-card" data-rarity-filter="${rarityFilterTokens(row)}">
      <div class="gk-top-ranked-rank">#${esc(row.rank)}</div>
      ${cardImage(row, { linkClass: 'gk-top-ranked-thumb-link', imageClass: 'gk-top-ranked-thumb', placeholderClass: 'gk-top-ranked-thumb-placeholder' })}
      <div class="gk-top-ranked-copy">
        <a class="gk-top-ranked-title" href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">${esc(row.title)}</a>
        <div class="gk-top-ranked-meta">
          <span class="gk-command-badge gk-command-badge--mini gk-command-badge--${bandClass(row.rarity_band)}">${esc(row.rarity_band)}</span>
          <span>${esc(row.live_supply)}/${esc(row.issued_supply)} live/issued</span>
          <span>${Number(row.final_score || 0).toFixed(2)} score</span>
        </div>
        ${rowLinks(row)}
      </div>
    </article>`;
}

function auditTemplateCard(row) {
  return `<article class="gk-audit-card" data-rarity-filter="${rarityFilterTokens(row)}">
      ${cardImage(row, { linkClass: 'gk-audit-card-image-link', imageClass: 'gk-audit-card-image', placeholderClass: 'gk-audit-card-image-placeholder' })}
      <div class="gk-audit-card-copy">
        <div class="gk-audit-card-rank">Rank #${esc(row.rank)}</div>
        <a class="gk-audit-card-title" href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">${esc(row.title)}</a>
        <div class="gk-audit-card-metrics">
          ${deckMetric('Score', Number(row.final_score || 0).toFixed(2))}
          ${deckMetric('Supply', `${row.live_supply}/${row.issued_supply}`)}
        </div>
        ${showcaseKeyTrait('Key trait', row.rarity_trait)}
        ${rowLinks(row)}
      </div>
    </article>`;
}

const AUDIT_BANDS = ['Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];

function groupedAuditCards(rows) {
  if (!rows.length) return '<p class="lore-paragraph">No ranked limited NFTs are available.</p>';
  const groups = AUDIT_BANDS
    .map((band) => [band, rows.filter((row) => row.rarity_band === band)])
    .filter(([, bandRows]) => bandRows.length);
  return `<div class="gk-audit-card-groups" aria-label="Grouped rarity audit cards">
      ${groups.map(([band, bandRows]) => `<section class="gk-audit-card-group gk-audit-card-group--${bandClass(band)}">
        <div class="gk-audit-card-group-heading">
          <h4>${esc(band)}</h4>
          <span>${bandRows.length} shown</span>
        </div>
        <div class="gk-audit-card-grid">
          ${bandRows.map(auditTemplateCard).join('\n          ')}
        </div>
      </section>`).join('\n      ')}
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

function advancedTable(summary, tableMarkup) {
  return `<details class="gk-advanced-table-details">
      <summary>${esc(summary)}</summary>
      ${tableMarkup}
    </details>`;
}

function rankingTable(rows) {
  return `<div class="wiki-table-wrap gk-rarity-table-wrap">
            <table class="wiki-table gk-rarity-table">
              <thead>
                <tr>
                  <th>NFT</th><th>NFT Page ID</th><th>Live Supply</th><th>Issued Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Exposure</th><th>Variation Trait</th><th>Variation Exposure</th><th>Final Score</th><th>Links</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `<tr data-rarity-filter="${rarityFilterTokens(row)}">
    <td class="gk-rarity-nft-cell">${renderTemplateCell(row, true)}</td>
    <td>${esc(row.template_id)}</td>
    <td>${esc(row.live_supply)}</td>
    <td>${esc(row.issued_supply)}</td>
    <td>${row.pre_baseline_missing_or_burned == null ? 'Not counted' : esc(row.pre_baseline_missing_or_burned)}</td>
    <td>${esc(row.rarity_trait || 'Not supplied')}</td>
    <td>${esc(row.rarity_live_exposure ?? '')}</td>
    <td>${esc(row.variation_trait || 'Not supplied')}</td>
    <td>${esc(row.variation_live_exposure ?? '')}</td>
    <td>${esc(row.final_score ?? '')}</td>
    <td>${rowLinks(row)}</td>
  </tr>`).join('\n                ')}
              </tbody>
            </table>
          </div>`;
}

function utilityBucket(row) {
  const text = `${row.title || ''} ${row.rarity_trait || ''} ${row.variation_trait || ''}`.toLowerCase();
  if (/coupon|redeem|blend|burn/.test(text)) return 'Utility / Coupons';
  if (/open|infinite|uncapped|max supply is zero/.test(text) || row.max_supply === 0) return 'Open Mint / Infinite Supply';
  return 'Collection Utility';
}

function sideReason(row) {
  if (row.issued_supply <= 0) return 'Zero issued supply; not circulating.';
  if (row.max_supply === 0) return 'Max supply is zero/open mint; not comparable to fixed supply NFTs.';
  return 'Utility, pack, coupon, blend, pass, or non-standard collection object.';
}

function sideAuditCard(row, status) {
  return `<article class="gk-audit-card gk-audit-card--side" data-rarity-filter="${status === 'Unissued' ? 'unissued' : 'utility-open-mint'}">
      ${cardImage(row, { linkClass: 'gk-audit-card-image-link', imageClass: 'gk-audit-card-image', placeholderClass: 'gk-audit-card-image-placeholder' })}
      <div class="gk-audit-card-copy">
        <div class="gk-audit-card-rank">${esc(status)}</div>
        <a class="gk-audit-card-title" href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">${esc(row.title)}</a>
        <div class="gk-audit-card-metrics">
          ${deckMetric('Issued', row.issued_supply)}
          ${deckMetric('Max', row.max_supply)}
        </div>
        ${showcaseKeyTrait('Why listed here', sideReason(row))}
        ${rowLinks(row)}
      </div>
    </article>`;
}

function groupedSideCards(rows, { status, getGroup }) {
  if (!rows.length) return '<p class="lore-paragraph">No NFTs currently match this section.</p>';
  const groups = [...new Set(rows.map(getGroup))];
  return `<div class="gk-audit-card-groups gk-side-card-groups">
      ${groups.map((group) => {
        const groupRows = rows.filter((row) => getGroup(row) === group);
        return `<section class="gk-audit-card-group">
        <div class="gk-audit-card-group-heading">
          <h4>${esc(group)}</h4>
          <span>${groupRows.length} NFTs</span>
        </div>
        <div class="gk-audit-card-grid">
          ${groupRows.map((row) => sideAuditCard(row, status)).join('\n          ')}
        </div>
      </section>`;
      }).join('\n      ')}
    </div>`;
}

function sideTable(rows) {
  return `<div class="wiki-table-wrap">
                <table class="wiki-table gk-rarity-side-table">
                  <thead><tr><th>NFT</th><th>NFT Page ID</th><th>Issued</th><th>Max</th><th>Rarity Trait</th><th>Variation Trait</th><th>Reason</th><th>Links</th></tr></thead>
                  <tbody>${rows.map((row) => `<tr data-rarity-filter="${row.issued_supply <= 0 ? 'unissued' : 'utility-open-mint'}">
    <td class="gk-rarity-nft-cell">${renderTemplateCell(row)}</td>
    <td>${esc(row.template_id)}</td>
    <td>${esc(row.issued_supply)}</td>
    <td>${esc(row.max_supply)}</td>
    <td>${esc(row.rarity_trait || 'Not supplied')}</td>
    <td>${esc(row.variation_trait || 'Not supplied')}</td>
    <td>${esc(sideReason(row))}</td>
    <td>${rowLinks(row)}</td>
  </tr>`).join('\n                ')}</tbody>
                </table>
              </div>`;
}

function collectionImageTemplate(collection) {
  const src = ipfsSources(collection?.img || '')[0];
  const fallbacks = ipfsSources(collection?.img || '').slice(1);
  if (!src) return '';
  return `<template class="nft-battle-media-template" data-battle-media="nft" data-page-id="hodlmoonboys-nft-collection">
          <figure class="battle-page-media nft-collection-media-card">
            <img class="wiki-hero-image nft-collection-image" src="${esc(src)}" alt="hodlmoonboys collection image" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback-srcs='${esc(JSON.stringify(fallbacks))}'>
          </figure>
        </template>`;
}

function bottomScripts() {
  return `<!-- so placeholder nodes are never injected into the boot sequence.    -->
<!-- 1. Core config -->
<script data-cfasync="false" src="/js/api-config.js"></script>
<script data-cfasync="false" src="/js/wax-image-normalizer.js"></script>
<script data-cfasync="false" src="/js/wax-api-client.js"></script>
<script data-cfasync="false" src="/js/wax-collection-renderer.js"></script>
<!-- 2. Event bus -->
<script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
<!-- 3. Identity -->
<script data-cfasync="false" src="/js/identity-gate.js"></script>
<!-- 4. State -->
<script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
<!-- 5. Daily loop singleton -->
<script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
<!-- 6. Shell + shared components -->
<script data-cfasync="false" src="/js/site-shell.js"></script>
<script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
<script data-cfasync="false" src="/js/components/global-player-header.js"></script>
<script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
<!-- 7. Page-specific scripts -->

<script type="application/json" class="nft-search-terms" data-search-boost="nft">["hodlmoonboys", "NFTs", "WAX NFTs", "593", "48675"]</script>
<script data-cfasync="false" src="/js/faction-alignment.js"></script>
<script data-cfasync="false" src="/js/wiki.js"></script>
<script data-cfasync="false" src="/js/bible-loader.js"></script>
<script data-cfasync="false" src="/js/engagement.js"></script>
<script data-cfasync="false" src="/js/comments.js"></script>
<script data-cfasync="false" src="/js/battle-layer.js"></script>
<script data-cfasync="false" src="/js/gkniftyheads-rarity.js"></script>
<script data-cfasync="false" src="/js/site-feed-status.js"></script>
<script data-cfasync="false">
(function () {
  function parseFallbacks(img) {
    try { return JSON.parse(img.getAttribute('data-fallback-srcs') || '[]'); } catch (err) { return []; }
  }
  function armImageFallback(img) {
    if (!img || img.dataset.nftFallbackArmed === '1') return;
    img.dataset.nftFallbackArmed = '1';
    img.addEventListener('error', function () {
      var fallbacks = parseFallbacks(img);
      var next = fallbacks.shift();
      if (!next) return;
      img.setAttribute('data-fallback-srcs', JSON.stringify(fallbacks));
      img.src = next;
    });
  }
  function armAllFallbacks(root) {
    (root || document).querySelectorAll('img[data-fallback-srcs]').forEach(armImageFallback);
  }
  function battleMediaTemplate() {
    return document.querySelector('template[data-battle-media="nft"]');
  }
  function injectBattleMedia() {
    var tpl = battleMediaTemplate();
    if (!tpl) return;
    var deck = document.querySelector('.battle-deck');
    if (!deck || deck.querySelector('.battle-page-media')) return;
    var cards = deck.querySelectorAll('.battle-shell-inner');
    if (!cards.length) return;
    var battleCard = cards[0];
    var clone = tpl.content ? tpl.content.cloneNode(true) : null;
    if (!clone) return;
    battleCard.appendChild(clone);
    armAllFallbacks(battleCard);
  }
  document.addEventListener('DOMContentLoaded', function () {
    armAllFallbacks(document);
    injectBattleMedia();
    var observer = new MutationObserver(function () {
      armAllFallbacks(document);
      injectBattleMedia();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(injectBattleMedia, 500);
    window.setTimeout(injectBattleMedia, 1500);
  });
}());
</script>`;
}

function renderPage(collection, data, stats, syncStatus) {
  const templateHeroCards = data.ranked.slice(0, 3);
  const secondaryTopRanked = data.ranked.slice(3, 9);
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${COLLECTION_TITLE} NFT collection hub with rarity ranking, WAX NFT links, collection actions, schema summary, and source references.">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${COLLECTION_TITLE} NFT Collection - Crypto Moonboys Wiki">
  <meta property="og:description" content="${COLLECTION_TITLE} NFT collection hub with rarity ranking, WAX NFT links, collection actions, schema summary, and source references.">
  <meta property="og:type" content="article">
  <link rel="canonical" href="https://cryptomoonboys.com/wiki/hodlmoonboys-nft-collection.html">
  <meta property="og:url" content="https://cryptomoonboys.com/wiki/hodlmoonboys-nft-collection.html">
  <meta property="og:image" content="https://cryptomoonboys.com/img/logo.svg">
  <title>${COLLECTION_TITLE} NFT Collection - Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="stylesheet" href="/css/battle-layer.css">
<link rel="icon" href="/favicon.png" type="image/png">
  <style>
    .wiki-content img { max-width: 100%; height: auto; }
    .nft-search-terms { display: none !important; }
    template.nft-battle-media-template { display: none !important; }
    .battle-page-media img { display: block; width: 100%; max-height: min(70vh, 760px); object-fit: contain; border-radius: 14px; }
  </style>
</head>
<body class="page-wiki page-standard-shell page-gkniftyheads-collection page-hodlmoonboys-collection" data-entity-hash="nft-hodlmoonboys-nft-collection">
<main id="content" role="main">
<!-- SAM:BEGIN:article -->
      <article class="wiki-content nft-collection-article" data-entity-slug="hodlmoonboys-nft-collection" data-page-type="nft_collection" data-homepage-feature="true" data-timeline-feature="true">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/index.html">Home</a>
          <span class="sep" aria-hidden="true">&rarr;</span>
          <a href="/categories/nfts.html">NFTs</a>
          <span class="sep" aria-hidden="true">&rarr;</span>
          <span aria-current="page">${COLLECTION_TITLE} NFT Collection</span>
        </nav>
        <header class="page-hero wiki-living-hero gk-collection-hero">
          <div class="howto-hero-copy gk-collection-hero-copy">
            <span class="howto-kicker gk-collection-kicker">WAX NFT Collection / Crypto Moonboys Universe / Hodl Moonboys Canon</span>
            <p class="howto-lead">
              ${esc(collection.name || COLLECTION_TITLE)} is the WAX AtomicAssets collection layer for Hodl Moonboys, bringing NFT rarity context, live supply checks, collection actions, and source-backed wiki navigation into one collector-facing command page.
            </p>
            <div class="howto-route gk-collection-route">
              COLLECTION HUB / COLLECTOR FLOW &rarr; ATOMICHUB COLLECTION VIEW &rarr; NFT RARITY &rarr; EXACT NFT GLOBAL RARITY &rarr; CRYPTO MOONBOYS CANON
            </div>
            <div class="howto-hero-actions gk-collection-actions" role="group" aria-label="${COLLECTION_TITLE} collection actions">
              <a class="howto-btn" href="${atomichubUrl()}" target="_blank" rel="noopener noreferrer">View AtomicHub</a>
              <a class="howto-btn howto-btn-secondary" href="${ATOMIC_BASE}/templates?collection_name=${COLLECTION}" target="_blank" rel="noopener noreferrer">AtomicAssets NFT API</a>
              <a class="howto-btn howto-btn-secondary" href="/wiki/gkniftyheads-nft-collection.html">GKniftyHEADS Tracker</a>
            </div>
          </div>
          <div class="howto-hero-title-wrap gk-collection-title-wrap">
            <h1 class="howto-glitch-title howto-pulse swarmsy-title">Hodl Moonboys<br><span>NFT Collection</span></h1>
          </div>
<div class="category-tags nft-category-tags" aria-label="NFT categories"><a href="/categories/nfts.html">NFTs</a> <a href="/categories/wax-nfts.html">WAX NFTs</a> <a href="/categories/nfts-digital-art.html">NFTs &amp; Digital Art</a>
      </div>
<script type="application/json" class="nft-search-terms" data-search-boost="nft">["hodlmoonboys", "NFTs", "WAX NFTs", "${stats.total_templates}", "${stats.live_assets_counted}"]</script>
        </header>
        <div class="article-meta gk-collection-meta-anchor" hidden></div>

        ${collectionImageTemplate(collection)}

<!-- HODLMOONBOYS_RARITY_RANKING:BEGIN -->
        <section class="wiki-section gk-rarity-ranking" data-gkniftyheads-rarity="true" data-hodlmoonboys-rarity="true">
          <div class="gk-command-header">
            <div>
              <p class="gk-command-kicker">${COLLECTION_TITLE} Rarity Tracker / NFT Rarity Ranking</p>
              <h2 id="hodlmoonboys-rarity-ranking">${COLLECTION_TITLE} Rarity Command Deck</h2>
            </div>
            <span class="feed-status-badge" data-feed-status-id="${FEED_ID}" hidden aria-hidden="true"></span>
          </div>
          <div class="gk-section-card-grid gk-rarity-overview-cards" aria-label="Rarity overview">
            <div class="gk-info-card">
              <span>NFT rarity</span>
              <p>Collector-facing ranking for ${COLLECTION_TITLE} AtomicAssets NFTs. Separate NFT page IDs may share the same artwork or name.</p>
            </div>
            <div class="gk-info-card">
              <span>Live supply first</span>
              <p>Ranked by current AtomicAssets live supply when counted, with issued-supply fallback only when live asset counting fails.</p>
            </div>
            <div class="gk-info-card">
              <span>Market neutral</span>
              <p>Price, listings, trading volume, and marketplace floor data are not used. Utility/open-mint NFTs stay outside the main leaderboard.</p>
            </div>
          </div>
          <div class="wiki-stat-grid gk-rarity-stats gk-command-stat-strip" data-rarity-stat-grid="true">
            ${statCard('NFT pages scanned', stats.total_templates)}
            ${statCard('Ranked limited NFT pages', stats.ranked_templates)}
            ${statCard('Utility / open mint NFT pages', stats.utility_open_mint_templates)}
            ${statCard('Unissued NFT pages', stats.unissued_templates)}
            ${statCard('Live assets counted', stats.live_assets_counted)}
            ${statCard('Last updated', stats.generated_at)}
          </div>

          <section class="gk-command-deck gk-showcase-section gk-template-rarity-showcase" aria-label="NFT Rarity top three cards">
            ${showcaseHeader('NFT Rarity', 'NFT Rarity: Top 3', `The highest ranked ${COLLECTION_TITLE} NFTs are surfaced first as collector cards, with audit tables kept below for source verification.`)}
            <div class="gk-showcase-grid">
              ${templateHeroCards.map(featuredCard).join('\n              ')}
            </div>
            <div class="gk-command-support" aria-label="Collection rarity guide">
              ${commandNote('NFT rarity', 'The top cards highlight scarce AtomicAssets NFTs first. Full scoring components remain in the audit table below.')}
              ${commandNote('Market neutral', 'Price, listings, sales volume, and floor data are excluded from rarity scoring.')}
            </div>
            <div class="gk-rarity-filters" aria-label="Rarity filters">
              ${filters.map(([filter, label]) => `<button type="button" data-gk-rarity-filter="${filter}">${esc(label)}</button>`).join('\n              ')}
            </div>
          </section>

          ${secondaryRankedPanel({
            title: 'Top Ranked NFTs',
            countLabel: `${secondaryTopRanked.length} more shown`,
            ariaLabel: 'Secondary Top Ranked NFTs',
            cards: secondaryTopRanked.map(topRankedCard).join('\n              '),
          })}

          <details class="wiki-section gk-rarity-audit" data-rarity-audit>
            <summary>Full Rarity Audit</summary>
            <p class="lore-paragraph">Collector-card audit grouped by rarity band first. The raw score table remains below for verification and source tracing.</p>
            ${groupedAuditCards(data.ranked)}
            ${advancedTable('Advanced raw rarity table', rankingTable(data.ranked))}
          </details>

          <section class="wiki-section gk-rarity-method">
            <h3>How rarity works</h3>
            <div class="gk-section-card-grid gk-rarity-method-cards" aria-label="Rarity methodology notes">
              <div class="gk-info-card">
                <span>NFT formula</span>
                <p>NFT scores use 50% live supply scarcity, 25% rarity trait exposure, 20% variation exposure, and 5% pre-baseline missing/burned delta when available.</p>
              </div>
              <div class="gk-info-card">
                <span>Thin metadata</span>
                <p>If meaningful rarity or variation metadata is missing, generic, repeated, or not supplied, that trait weight moves to live supply scarcity instead of inventing fake trait value.</p>
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
              ${showcaseHeader('Exact NFT / Global Rarity', 'Exact NFT Global Rarity: Top 3', 'Exact live-asset ranking is pending for this collection; template rarity is live above.')}
              <div class="gk-showcase-grid">
                <p class="lore-paragraph">Pending asset-state sync.</p>
              </div>
              <div class="gk-command-support" aria-label="Global rarity guide">
                ${commandNote('Exact NFT rarity', 'Ranks exact live NFTs as individual assets after asset-state sync is available.')}
                ${commandNote('Source rule', 'AtomicAssets remains the source of truth; marketplace data is not used for ranking.')}
              </div>
            </section>
          </section>

          <section class="wiki-section gk-rarity-utility">
            <details>
              <summary>Utility / Open Mint / Infinite Supply</summary>
              <p class="lore-paragraph">These NFTs are useful collection objects, but they are excluded from the limited-NFT rarity leaderboard because their supply behavior or purpose is not comparable to scarce art/card NFTs.</p>
              ${groupedSideCards(data.utility, { status: 'Utility / Open Mint', getGroup: utilityBucket })}
              ${advancedTable('Advanced raw utility table', sideTable(data.utility))}
            </details>
          </section>

          <section class="wiki-section gk-rarity-unissued">
            <details>
              <summary>Unissued / Not Circulating</summary>
              <p class="lore-paragraph">These NFTs have zero issued supply and are not ranked as rare circulating NFTs.</p>
              ${groupedSideCards(data.unissued, { status: 'Unissued', getGroup: () => 'Not Circulating' })}
              ${advancedTable('Advanced raw unissued table', sideTable(data.unissued))}
            </details>
          </section>

          <details class="developer-details gk-rarity-developer-details">
            <summary>Developer tracker details</summary>
            <section class="wiki-section gk-rarity-status">
              <h3>Last Scan Status</h3>
              <p class="lore-paragraph"><strong>Live data status:</strong> ${esc(syncStatus.live_data_status)}. <strong>Burn tracking:</strong> pre-baseline missing/burned is a current live supply delta, not confirmed historic burn tracking.</p>
            </section>
            <section class="wiki-section gk-rarity-source-note">
              <h3>Source Links / Methodology Note</h3>
              <p class="lore-paragraph">Source data comes from AtomicAssets live templates and asset counts. AtomicAssets and AtomicHub links remain on every row. Price is never used in this rarity score.</p>
            </section>
          </details>

          <section class="wiki-section gk-rarity-raw-fallback" data-rarity-fallback hidden>
            <p class="notice notice-warning">Live rarity data unavailable. Showing raw NFT list only. This is not the final rarity ranking.</p>
          </section>
        </section>
<!-- HODLMOONBOYS_RARITY_RANKING:END -->
      </article>
<!-- RELATED_WIKI_PATHS:BEGIN -->
      <section class="wiki-section related-wiki-paths" data-related-wiki-paths="true">
        <h2>Related Wiki Paths</h2>
        <div class="wiki-rabbit-grid">
          <a class="wiki-rabbit-card" href="/wiki/gkniftyheads-nft-collection.html"><span class="wiki-rabbit-card-title">GKniftyHEADS Tracker</span><span class="wiki-rabbit-card-desc">Existing weighted rarity tracker.</span></a>
          <a class="wiki-rabbit-card" href="/wiki/noballgamess-nft-collection.html"><span class="wiki-rabbit-card-title">NoBallGames Tracker</span><span class="wiki-rabbit-card-desc">Second collection tracker pattern.</span></a>
          <a class="wiki-rabbit-card" href="/categories/wax-nfts.html"><span class="wiki-rabbit-card-title">WAX NFTs</span><span class="wiki-rabbit-card-desc">WAX NFT category.</span></a>
        </div>
      </section>
<!-- RELATED_WIKI_PATHS:END -->
      <section class="wiki-section gk-community-intelligence-panel" aria-label="Collector notes">
        <div class="wiki-comments" data-page-id="hodlmoonboys-nft-collection"></div>
      </section>
<!-- SAM:END:article -->
</main>
${bottomScripts()}
</body>
</html>
`;
}

function compactTemplate(row) {
  return cleanObject({
    template_id: row.template_id,
    title: row.title,
    issued_supply: row.issued_supply,
    max_supply: row.max_supply,
    schema_name: row.schema_name,
    image_url: row.image_url,
  });
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== false));
}

function compactRankedRow(row) {
  return cleanObject({
    ...compactTemplate(row),
    rank: row.rank ?? null,
    rarity_band: row.rarity_band ?? null,
    live_supply: row.live_supply,
    live_supply_status: row.live_supply_status,
    pre_baseline_missing_or_burned: row.pre_baseline_missing_or_burned,
    missing_or_burned_count: row.missing_or_burned_count,
    rarity_trait: row.rarity_trait,
    rarity_trait_source: row.rarity_trait_source,
    rarity_trait_scoring_enabled: row.rarity_trait_scoring_enabled ?? null,
    variation_trait: row.variation_trait,
    variation_trait_source: row.variation_trait_source,
    variation_trait_scoring_enabled: row.variation_trait_scoring_enabled ?? null,
    rarity_live_exposure: row.rarity_live_exposure ?? null,
    variation_live_exposure: row.variation_live_exposure ?? null,
    missing_burned_percentage: row.missing_burned_percentage ?? null,
    supply_score_component: row.supply_score_component ?? null,
    rarity_score_component: row.rarity_score_component ?? null,
    variation_score_component: row.variation_score_component ?? null,
    burn_score_component: row.burn_score_component ?? null,
    final_score: row.final_score ?? null,
    rarity_score: row.rarity_score ?? null,
    supply_used_for_scoring: row.supply_used_for_scoring ?? null,
  });
}

function hydrateSnapshotRow(row) {
  const rawTemplateId = row?.template_id;
  const templateId = num(rawTemplateId, null);
  return {
    ...row,
    template_id: templateId ?? rawTemplateId ?? null,
    title: row?.title || `${COLLECTION_TITLE} Template ${templateId ?? rawTemplateId ?? 'unknown'}`,
    issued_supply: num(row?.issued_supply),
    max_supply: num(row?.max_supply),
    live_supply: num(row?.live_supply),
    pre_baseline_missing_or_burned: row?.pre_baseline_missing_or_burned ?? row?.missing_or_burned_count ?? null,
    missing_or_burned_count: row?.missing_or_burned_count ?? row?.pre_baseline_missing_or_burned ?? null,
    atomicassets_url: templateId == null ? null : atomicTemplateUrl(templateId),
    atomichub_url: templateId == null ? atomichubUrl() : atomichubUrl(templateId),
  };
}

function loadExistingSnapshot(root = ROOT) {
  const committedOutputs = Object.fromEntries(
    SNAPSHOT_OUTPUT_FILES.map((relativePath) => [relativePath, readCommittedText(root, relativePath)]),
  );
  const collection = readCommittedJson(root, `data/${COLLECTION}/collection.json`);
  const templateRarity = readCommittedJson(root, `data/${COLLECTION}/template-rarity.json`);
  const templateStats = readCommittedJson(root, `data/${COLLECTION}/template-stats.json`);
  const rawSyncStatus = readCommittedJson(root, `data/${COLLECTION}/sync-status.json`);
  if (!templateRarity || !templateStats || !rawSyncStatus) {
    throw new Error('Committed Hodl Moonboys rarity snapshot is unavailable.');
  }
  const ranked = (templateRarity.ranked_templates || []).map(hydrateSnapshotRow);
  const utility = (templateRarity.utility_open_mint_templates || []).map(hydrateSnapshotRow);
  const unissued = (templateRarity.unissued_templates || []).map(hydrateSnapshotRow);
  return {
    committedOutputs,
    collection,
    templateRarity,
    templateStats,
    rawSyncStatus,
    data: {
      ranked,
      utility,
      unissued,
      allRows: [...ranked, ...utility, ...unissued],
      rarityExposure: templateRarity.rarity_traits || [],
      variationExposure: templateRarity.variation_traits || [],
    },
    stats: {
      collection: COLLECTION,
      generated_at: templateStats.generated_at || templateRarity.generated_at || NOW(),
      total_templates: num(templateStats.total_templates),
      ranked_templates: num(templateStats.ranked_templates),
      utility_open_mint_templates: num(templateStats.utility_open_mint_templates),
      unissued_templates: num(templateStats.unissued_templates),
      live_assets_counted: num(templateStats.live_assets_counted),
      live_supply_counts_ok: num(templateStats.live_supply_counts_ok),
    },
    syncStatus: {
      ...rawSyncStatus,
      collection: rawSyncStatus.collection || COLLECTION,
      feed_id: rawSyncStatus.feed_id || FEED_ID,
      generated_at: rawSyncStatus.generated_at || templateRarity.generated_at || NOW(),
      status: rawSyncStatus.status || 'degraded',
      live_data_status: rawSyncStatus.live_data_status || templateRarity.live_data_status || 'issued-supply fallback',
      notes: Array.isArray(rawSyncStatus.notes) ? rawSyncStatus.notes : [],
    },
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const generatedAt = NOW();
  let collection;
  let templates;
  let supplies;
  try {
    collection = (await fetchJson(`${ATOMIC_BASE}/collections/${COLLECTION}`)).data || {};
    templates = await fetchTemplates();
    supplies = await mapLimit(templates, 3, fetchLiveSupply);
  } catch (error) {
    try {
      const snapshot = loadExistingSnapshot();
      for (const relativePath of SNAPSHOT_OUTPUT_FILES) {
        writeText(path.join(ROOT, relativePath), snapshot.committedOutputs[relativePath]);
      }
      console.warn(`${COLLECTION}: network refresh failed, rebuilt page from committed snapshot (${errorMessage(error)})`);
      return;
    } catch (snapshotError) {
      throw new Error(`${COLLECTION}: live refresh failed (${errorMessage(error)}) and committed snapshot rebuild failed (${errorMessage(snapshotError)})`);
    }
  }
  await ensureLocalThumbs(templates);
  const data = buildRanking(templates, supplies);
  const stats = {
    collection: COLLECTION,
    generated_at: generatedAt,
    total_templates: data.allRows.length,
    ranked_templates: data.ranked.length,
    utility_open_mint_templates: data.utility.length,
    unissued_templates: data.unissued.length,
    live_assets_counted: supplies.reduce((sum, row) => sum + num(row.live_supply), 0),
    live_supply_counts_ok: supplies.filter((row) => row.live_supply_status === 'ok').length,
  };
  const syncStatus = {
    collection: COLLECTION,
    feed_id: FEED_ID,
    generated_at: generatedAt,
    status: data.allRows.length && stats.live_supply_counts_ok ? 'ok' : 'degraded',
    live_data_status: stats.live_supply_counts_ok ? 'atomicassets live asset count' : 'issued-supply fallback',
    notes: [
      'AtomicAssets is the source of truth.',
      'No price, floor, sales, listing, or AtomicHub listing counts are used for rarity math.',
      'Pre-baseline missing/burned is a current live supply delta, not confirmed historic burn tracking.',
    ],
  };
  const templateRarity = {
    collection: COLLECTION,
    collection_name: collection.name || COLLECTION_TITLE,
    generated_at: generatedAt,
    live_data_status: syncStatus.live_data_status,
    ranking_formula: SCORING_CONTRACT,
    price_used: false,
    market_data_used: false,
    ranked_templates: data.ranked.map(compactRankedRow),
    utility_open_mint_templates: data.utility.map(compactRankedRow),
    unissued_templates: data.unissued.map(compactRankedRow),
  };
  const traitExposure = {
    collection: COLLECTION,
    generated_at: generatedAt,
    ranking_formula: SCORING_CONTRACT,
    rarity_traits: data.rarityExposure,
    variation_traits: data.variationExposure,
    schemas: Object.values(data.allRows.reduce((memo, row) => {
      const key = row.schema_name || 'unknown';
      memo[key] ||= { schema_name: key, templates: 0, live_supply: 0 };
      memo[key].templates += 1;
      memo[key].live_supply += row.live_supply || 0;
      return memo;
    }, {})),
  };

  writeJson(path.join(DATA_DIR, 'collection.json'), collection);
  writeJson(path.join(DATA_DIR, 'template-metadata-cache.json'), { collection: COLLECTION, generated_at: generatedAt, templates: templates.map(compactTemplate) });
  writeJson(path.join(DATA_DIR, 'live-template-supply.json'), { collection: COLLECTION, generated_at: generatedAt, supplies });
  writeJson(path.join(DATA_DIR, 'template-rarity.json'), templateRarity);
  writeJson(path.join(DATA_DIR, 'template-stats.json'), { ...stats, ranking_formula: SCORING_CONTRACT });
  writeJson(path.join(DATA_DIR, 'trait-exposure.json'), traitExposure);
  writeJson(path.join(DATA_DIR, 'sync-status.json'), syncStatus);
  writeCsv(path.join(DATA_DIR, 'template-rarity.csv'), data.ranked, ['rank', 'template_id', 'title', 'rarity_band', 'issued_supply', 'live_supply', 'max_supply', 'final_score']);
  writeCsv(path.join(DATA_DIR, 'trait-exposure.csv'), traitExposure.schemas, ['schema_name', 'templates', 'live_supply']);
  writeText(PAGE_PATH, renderPage(collection, data, stats, syncStatus));
  console.log(`${COLLECTION}: ${stats.total_templates} templates, ${stats.ranked_templates} ranked, ${stats.utility_open_mint_templates} utility/open mint, ${stats.unissued_templates} unissued`);
}

export { buildRanking, fetchTemplates, main };

if (process.argv[1] && process.argv[1].endsWith('generate-hodlmoonboys-rarity.mjs')) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
