#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'hodlmoonboys';
const COLLECTION_TITLE = 'Hodl Moonboys';
const FEED_ID = 'hodlmoonboys_rarity';
const DATA_DIR = path.join(ROOT, 'data', COLLECTION);
const PAGE_PATH = path.join(ROOT, 'wiki', 'hodlmoonboys-nft-collection.html');
const ATOMIC_BASE = 'https://wax.api.atomicassets.io/atomicassets/v1';
const NOW = () => new Date().toISOString();

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
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

function renderStats(stats) {
  return `<div class="wiki-rabbit-grid">
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${esc(stats.total_templates)}</span><span class="wiki-rabbit-card-desc">AtomicAssets-confirmed NFT templates</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${esc(stats.ranked_templates)}</span><span class="wiki-rabbit-card-desc">ranked fixed-supply NFTs</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${esc(stats.utility_open_mint_templates)}</span><span class="wiki-rabbit-card-desc">utility/open mint NFTs</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${esc(stats.unissued_templates)}</span><span class="wiki-rabbit-card-desc">unissued NFTs</span></div>
            <div class="wiki-rabbit-card"><span class="wiki-rabbit-card-title">${esc(stats.live_assets_counted)}</span><span class="wiki-rabbit-card-desc">live assets counted</span></div>
          </div>`;
}

function renderTopCards(rows) {
  return rows.slice(0, 12).map((row) => `<article class="wiki-rabbit-card wax-template-card">
      ${row.image_url ? `<img class="nft-thumb" src="${esc(row.image_url)}" alt="${esc(row.title)} NFT artwork" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
      <span class="wiki-rabbit-card-title">#${esc(row.rank)} ${esc(row.title)}</span>
      <span class="wiki-rabbit-card-desc">${esc(row.rarity_band)} · ${esc(row.live_supply)}/${esc(row.issued_supply)} live/issued · ${esc(row.final_score)} score</span>
      <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>
    </article>`).join('\n');
}

function renderPage(collection, data, stats, syncStatus) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${COLLECTION_TITLE} NFT Collection Tracker | Crypto Moonboys Wiki</title>
  <meta name="description" content="${COLLECTION_TITLE} AtomicAssets NFT rarity, live supply, and weighted rank tracker.">
  <link rel="canonical" href="https://cryptomoonboys.com/wiki/hodlmoonboys-nft-collection.html">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="stylesheet" href="/css/wiki.css">
</head>
<body class="page-wiki page-standard-shell" data-entity-hash="nft-hodlmoonboys-nft-collection">
  <div id="layout">
    <main id="content" class="wiki-page" role="main">
      <article class="wiki-article" data-entity-slug="hodlmoonboys-nft-collection" data-page-type="nft_collection">
        <header class="wiki-hero">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep" aria-hidden="true">&rarr;</span>
            <a href="/categories/nfts.html">NFTs</a>
            <span class="sep" aria-hidden="true">&rarr;</span>
            <span aria-current="page">${COLLECTION_TITLE} NFT Collection</span>
          </nav>
          <p class="wiki-kicker">AtomicAssets Collection Tracker / WAX NFT Rarity</p>
          <h1>${COLLECTION_TITLE} NFT Collection</h1>
          <p class="wiki-lede">${esc(collection.name || COLLECTION_TITLE)} rarity, current live supply checks, and weighted NFT template ranking for the WAX collection <strong>${COLLECTION}</strong>.</p>
          <p class="wiki-feed-status" data-feed-status-id="${FEED_ID}">${COLLECTION_TITLE} rarity snapshot active - AtomicAssets source of truth - ${esc(syncStatus.status)}</p>
          <p><a class="wiki-button" href="${atomichubUrl()}" target="_blank" rel="noopener noreferrer">View Collection on AtomicHub</a> <a class="wiki-button" href="${ATOMIC_BASE}/templates?collection_name=${COLLECTION}" target="_blank" rel="noopener noreferrer">AtomicAssets NFT API</a></p>
        </header>
        <section class="wiki-section" data-hodlmoonboys-rarity="true">
          <h2>Collection Summary</h2>
          ${renderStats(stats)}
        </section>
        <section class="wiki-section">
          <h2>Rarity Method</h2>
          <p>This tracker uses the same broad adaptive weighted rarity framework as the existing collection trackers. AtomicAssets is the source of truth; AtomicHub links are reference links only.</p>
          <p>The base formula is live surviving supply scarcity 50%, rarity trait/name exposure scarcity 25%, variation trait/name/metadata exposure scarcity 20%, and missing/burned supply bonus 5%. If meaningful rarity or variation metadata is missing, generic, repeated, or not supplied, that trait weight moves to live supply scarcity instead of inventing fake trait value.</p>
          <p>Price, floor, sales, volume, market cap, and marketplace listing counts are not scoring inputs.</p>
        </section>
        <section class="wiki-section">
          <h2>Top Ranked NFTs</h2>
          <div class="wiki-rabbit-grid">${renderTopCards(data.ranked)}</div>
        </section>
        <section class="wiki-section">
          <h2>NFT Rarity Ranking</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT</th><th>NFT Page ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Live Count Status</th></tr></thead>
            <tbody>${renderRows(data.ranked, true)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Utility / Open Mint</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT</th><th>NFT Page ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Live Count Status</th></tr></thead>
            <tbody>${renderRows(data.utility)}</tbody>
          </table>
        </section>
        <section class="wiki-section">
          <h2>Unissued</h2>
          <table class="wiki-table">
            <thead><tr><th>NFT</th><th>NFT Page ID</th><th>Issued Supply</th><th>Live Supply</th><th>Pre-baseline Missing/Burned</th><th>Rarity Trait</th><th>Rarity Scored</th><th>Variation Trait</th><th>Variation Scored</th><th>Weights Used</th><th>Final Score</th><th>Live Count Status</th></tr></thead>
            <tbody>${renderRows(data.unissued)}</tbody>
          </table>
        </section>
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
      </article>
    </main>
  </div>
  <script data-cfasync="false" src="/js/api-config.js"></script>
  <script data-cfasync="false" src="/js/wax-image-normalizer.js"></script>
  <script data-cfasync="false" src="/js/wax-api-client.js"></script>
  <script data-cfasync="false" src="/js/wax-collection-renderer.js"></script>
  <script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
  <script data-cfasync="false" src="/js/identity-gate.js"></script>
  <script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
  <script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
  <script data-cfasync="false" src="/js/site-shell.js"></script>
  <script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
  <script data-cfasync="false" src="/js/components/global-player-header.js"></script>
  <script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
  <script data-cfasync="false" src="/js/wiki.js"></script>
  <script data-cfasync="false" src="/js/bible-loader.js"></script>
  <script data-cfasync="false" src="/js/site-feed-status.js"></script>
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

async function main() {
  const generatedAt = NOW();
  const collection = (await fetchJson(`${ATOMIC_BASE}/collections/${COLLECTION}`)).data || {};
  const templates = await fetchTemplates();
  const supplies = await mapLimit(templates, 3, fetchLiveSupply);
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
