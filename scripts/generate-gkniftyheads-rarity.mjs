#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'gkniftyheads';
const COLLECTION_PAGE = path.join(ROOT, 'wiki', 'gkniftyheads-nft-collection.html');
const DATA_DIR = path.join(ROOT, 'data', 'gkniftyheads');
const THUMB_WIDTH = 265;
const THUMB_DIR = path.join(ROOT, 'img', 'gkniftyheads', 'thumbs');
const THUMB_URL_PREFIX = '/img/gkniftyheads/thumbs';
const THUMB_MANIFEST = path.join(THUMB_DIR, 'manifest.json');
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

function getTemplateImageUrl(html) {
  return getImgSrc(html, 'class="[^"]*\\bwiki-hero-image\\b')
    || getImgSrc(html, 'class="[^"]*\\bnft-template-image\\b')
    || getImgSrc(html, 'src="[^"]*ipfs')
    || getImgSrc(html, 'class="[^"]*\\bnft-image\\b');
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
  return [
    url,
    `https://ipfs.io/ipfs/${cid}`,
  ];
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
      timeout: 10000,
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
        resolve({
          bytes: Buffer.concat(chunks),
          mime: String(response.headers['content-type'] || 'image/jpeg').split(';')[0],
        });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('image fetch timeout'));
    });
    request.on('error', reject);
  });
}

async function fetchImageBytes(url) {
  let lastError = null;
  for (const candidate of ipfsGatewayCandidates(url)) {
    try {
      return await downloadImage(candidate);
    } catch (error) {
      lastError = error;
      if (/SELF_SIGNED_CERT|CERT_|NO_REVOCATION/i.test(String(error?.code || error?.message || ''))) {
        try {
          return await downloadImage(candidate, { rejectUnauthorized: false });
        } catch (insecureError) {
          lastError = insecureError;
        }
      }
    }
  }
  throw lastError || new Error('image fetch failed');
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
    const sharp = (await import('sharp')).default;
    return await sharp(bytes)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
  } catch (error) {
    return null;
  }
}

async function prepareThumbnails(rows, root = ROOT) {
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
  async function processRow(row) {
    row.thumbnail_url = row.image_url || '';
    row.thumbnail_status = row.image_url ? 'original_fallback' : 'missing_source';
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
          thumbnail_url: publicUrl,
          width: THUMB_WIDTH,
          generated_at: new Date().toISOString(),
        };
      }
      row.thumbnail_url = publicUrl;
      row.thumbnail_status = 'cached';
      return;
    }
    if (playwrightUnavailable) return;

    try {
      const image = await fetchImageBytes(row.image_url);
      const thumb = await resizeWithSharp(image.bytes)
        || await renderWebpThumbnail(await getPage(), image.bytes, image.mime);
      fs.writeFileSync(filePath, thumb);
      manifest[String(row.template_id)] = {
        source_url: row.image_url,
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

  const concurrency = 8;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(processRow));
  }

  if (browser) await browser.close();
  writeThumbManifest(root, manifest);
}

function readTemplatePage(row, root = ROOT) {
  const filePath = path.join(root, row.url.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return {};
  const html = fs.readFileSync(filePath, 'utf8');
  return {
    rarity_trait: getAttr(html, 'rarity') || 'Not supplied',
    variation_trait: getAttr(html, 'variation') || 'Not supplied',
    description: getAttr(html, 'DESCRIPTION'),
    image_url: getTemplateImageUrl(html),
    schema: getStat(html, 'Schema') || row.schema || '',
  };
}

function extractRows(collectionHtml, root = ROOT) {
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

function buildRanking(rows) {
  const classified = rows.map((row) => {
    const cls = classify(row);
    return {
      ...row,
      bucket: cls.bucket,
      band: cls.band,
      classification_reason: cls.reason,
      live_supply: row.issued_supply,
      live_data_status: 'issued-supply fallback',
      missing_burned_count: 0,
      missing_burned_status: 'not scanned; no burn data claimed',
    };
  });

  const ranked = classified.filter((row) => row.bucket === 'ranked');
  const rarityExposure = exposure(ranked, 'rarity_trait', 'live_supply');
  const variationExposure = exposure(ranked, 'variation_trait', 'live_supply');
  const rarityByTrait = new Map(rarityExposure.map((item) => [item.trait, item]));
  const variationByTrait = new Map(variationExposure.map((item) => [item.trait, item]));
  const supplies = ranked.map((row) => row.live_supply).filter((value) => value > 0);
  const maxSupply = Math.max(...supplies, 1);
  const maxRarityExposure = Math.max(...rarityExposure.map((item) => item.exposure_supply), 1);
  const maxVariationExposure = Math.max(...variationExposure.map((item) => item.exposure_supply), 1);

  for (const row of ranked) {
    const rarity = rarityByTrait.get(row.rarity_trait);
    const variation = variationByTrait.get(row.variation_trait);
    row.rarity_live_exposure = rarity?.exposure_supply || row.live_supply;
    row.rarity_template_exposure = rarity?.template_count || 1;
    row.variation_live_exposure = variation?.exposure_supply || row.live_supply;
    row.variation_template_exposure = variation?.template_count || 1;
    const supplyScore = 1 - ((row.live_supply - 1) / Math.max(maxSupply - 1, 1));
    const rarityScore = 1 - ((row.rarity_live_exposure - 1) / Math.max(maxRarityExposure - 1, 1));
    const variationScore = 1 - ((row.variation_live_exposure - 1) / Math.max(maxVariationExposure - 1, 1));
    const burnScore = row.issued_supply > 0 ? row.missing_burned_count / row.issued_supply : 0;
    row.final_score = Number(((supplyScore * 50) + (rarityScore * 25) + (variationScore * 20) + (burnScore * 5)).toFixed(4));
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
  return {
    templates_scanned: model.all.length,
    ranked_limited_templates: model.ranked.length,
    utility_open_mint_templates: model.utility.length,
    unissued_templates: model.unissued.length,
    total_issued_supply: model.all.reduce((sum, row) => sum + row.issued_supply, 0),
    live_assets_counted: null,
    fallback_issued_supply_counted: model.ranked.reduce((sum, row) => sum + row.live_supply, 0) + model.utility.reduce((sum, row) => sum + row.live_supply, 0),
    missing_burned_count: 0,
    last_scan_time: new Date().toISOString(),
    scan_block: null,
    live_data_status: 'issued-supply fallback',
  };
}

function rowLinks(row) {
  return `<a href="${esc(row.url)}">Wiki</a> <a href="${esc(row.atomicassets_url)}" target="_blank" rel="noopener noreferrer">AtomicAssets</a> <a href="${esc(row.atomichub_url)}" target="_blank" rel="noopener noreferrer">AtomicHub</a>`;
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

function rankedRow(row) {
  const filters = [
    'ranked',
    row.band.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    row.live_supply === 1 ? 'one-of-one' : '',
    row.missing_burned_count > 0 ? 'missing-burned' : '',
  ].filter(Boolean).join(' ');
  return `<tr data-rarity-filter="${filters}">
    <td class="gk-rarity-nft-cell">${nftCard(row, { rank: true, band: true })}</td>
    <td>${row.template_id}</td>
    <td>${row.live_supply}</td>
    <td>${row.issued_supply}</td>
    <td>${row.missing_burned_count}</td>
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

function statCard(label, value) {
  return `<div class="wiki-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function buildRankingSection(model, stats, rawSection) {
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

  return `${RARITY_BEGIN}
        <section class="wiki-section gk-rarity-ranking" data-gkniftyheads-rarity="true">
          <h2 id="gkniftyheads-rarity-ranking">GKniftyHEADS Collection Rarity Ranking</h2>
          <p class="lore-paragraph">Ranked by live surviving supply, rarity trait exposure, variation trait exposure, missing/burned supply, and mint survival data. Price is not used. Utility/open-mint templates are separated from the main rarity leaderboard.</p>
          <div class="wiki-stat-grid gk-rarity-stats" data-rarity-stat-grid="true">
            ${statCard('Templates scanned', stats.templates_scanned)}
            ${statCard('Ranked limited templates', stats.ranked_limited_templates)}
            ${statCard('Utility / open mint templates', stats.utility_open_mint_templates)}
            ${statCard('Unissued templates', stats.unissued_templates)}
            ${statCard('Total issued supply', stats.total_issued_supply)}
            ${statCard('Fallback issued supply counted', stats.fallback_issued_supply_counted)}
            ${statCard('Live assets counted', 'Not scanned')}
            ${statCard('Missing/burned count', stats.missing_burned_count)}
            ${statCard('Last scan time', stats.last_scan_time)}
            ${statCard('Scan block', stats.scan_block || 'Not scanned')}
          </div>

          <section class="wiki-section gk-rarity-method">
            <h3>Rarity Method</h3>
            <p class="lore-paragraph">The main leaderboard excludes unissued templates, utility/open-mint templates, obvious coupon/drop/blend/farming supplies, and uncapped max_supply=0 templates. Current live asset scans are not bundled in this PR, so supply and trait exposure use issued-supply fallback data and do not claim confirmed historic burns.</p>
          </section>

          <section class="wiki-section gk-rarity-status">
            <h3>Last Scan Status</h3>
            <p class="lore-paragraph"><strong>Live data status:</strong> issued-supply fallback. <strong>Burn tracking:</strong> snapshot baseline pending. WAX chain get_info is only used for future scan checkpoint metadata, not NFT rarity data.</p>
          </section>

          <div class="gk-rarity-filters" aria-label="Rarity filters">
            ${filters.map(([filter, label]) => `<button type="button" data-gk-rarity-filter="${filter}">${esc(label)}</button>`).join('\n            ')}
          </div>

          <div class="wiki-table-wrap gk-rarity-table-wrap">
            <table class="wiki-table gk-rarity-table">
              <thead>
                <tr>
                  <th>NFT</th>
                  <th>Template ID</th>
                  <th>Issued Supply Fallback</th>
                  <th>Issued Supply</th>
                  <th>Missing/Burned</th>
                  <th>Rarity Trait</th>
                  <th>Rarity Exposure (Fallback)</th>
                  <th>Variation Trait</th>
                  <th>Variation Exposure (Fallback)</th>
                  <th>Final Score</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                ${model.ranked.map(rankedRow).join('\n                ')}
              </tbody>
            </table>
          </div>

          <section class="wiki-section gk-rarity-utility">
            <h3>Utility / Open Mint / Infinite Supply</h3>
            <p class="lore-paragraph">These templates are useful collection objects, but they are excluded from the limited-template rarity leaderboard because their supply behavior or purpose is not comparable to scarce art/card templates.</p>
            <div class="wiki-table-wrap">
              <table class="wiki-table gk-rarity-side-table">
                <thead><tr><th>NFT</th><th>Template ID</th><th>Issued</th><th>Max</th><th>Rarity Trait</th><th>Variation Trait</th><th>Reason</th><th>Links</th></tr></thead>
                <tbody>${model.utility.map(utilityRow).join('\n                ')}</tbody>
              </table>
            </div>
          </section>

          <section class="wiki-section gk-rarity-unissued">
            <h3>Unissued / Not Circulating</h3>
            <p class="lore-paragraph">These templates have zero issued supply and are not ranked as rare circulating NFTs.</p>
            <div class="wiki-table-wrap">
              <table class="wiki-table gk-rarity-side-table">
                <thead><tr><th>NFT</th><th>Template ID</th><th>Issued</th><th>Max</th><th>Rarity Trait</th><th>Variation Trait</th><th>Reason</th><th>Links</th></tr></thead>
                <tbody>${model.unissued.map(utilityRow).join('\n                ')}</tbody>
              </table>
            </div>
          </section>

          <section class="wiki-section gk-rarity-source-note">
            <h3>Source Links / Methodology Note</h3>
            <p class="lore-paragraph">Source data comes from the existing website collection table and local GKniftyHEADS template wiki pages. AtomicAssets and AtomicHub links remain on every row. Price is never used in this rarity score.</p>
          </section>

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

function replaceSection(html, rankingSection) {
  if (html.includes(RARITY_BEGIN) && html.includes(RARITY_END)) {
    return html.replace(new RegExp(`${RARITY_BEGIN}[\\s\\S]*?${RARITY_END}`), rankingSection);
  }
  const oldSection = html.match(/        <section class="wiki-section">\s*<h2 id="all-nfts">All NFTs \/ Templates<\/h2>[\s\S]*?        <\/section>/i)?.[0];
  if (!oldSection) throw new Error('Could not find old All NFTs / Templates section to replace.');
  return html.replace(oldSection, rankingSection);
}

export async function runGenerateGkniftyheadsRarity(root = ROOT) {
  const collectionPage = path.join(root, 'wiki', 'gkniftyheads-nft-collection.html');
  const html = fs.readFileSync(collectionPage, 'utf8');
  const oldSection = html.match(new RegExp(`${RAW_BEGIN}[\\s\\S]*?${RAW_END}`))?.[0]
    || html.match(/        <section class="wiki-section">\s*<h2 id="all-nfts">All NFTs \/ Templates<\/h2>[\s\S]*?        <\/section>/i)?.[0];
  if (!oldSection) throw new Error('Could not locate raw template table section.');

  const rows = extractRows(html, root);
  await prepareThumbnails(rows, root);
  const model = buildRanking(rows);
  const stats = buildStats(model);
  const rarityPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    ranking_formula: {
      live_surviving_supply_scarcity: 0.5,
      rarity_trait_live_exposure_scarcity: 0.25,
      variation_trait_live_exposure_scarcity: 0.2,
      missing_burned_scarcity_bonus: 0.05,
      price_used: false,
    },
    live_data_status: stats.live_data_status,
    stats,
    ranked_templates: model.ranked.map(publicTemplate),
    utility_open_mint_templates: model.utility.map(publicTemplate),
    unissued_templates: model.unissued.map(publicTemplate),
  };
  const livePayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    status: 'issued-supply fallback',
    note: 'Live asset scan is not bundled. original_mint and surviving_mint_rank remain pending until asset snapshots are available.',
    assets: [],
  };
  const traitPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    live_data_status: stats.live_data_status,
    rarity_traits: model.rarityExposure,
    variation_traits: model.variationExposure,
  };
  const syncPayload = {
    collection: COLLECTION,
    generated_at: stats.last_scan_time,
    source: 'local website pages',
    live_data_status: stats.live_data_status,
    wax_get_info: {
      used_for: 'future scan checkpoint metadata only',
      endpoint: 'https://wax.eosusa.io/v1/chain/get_info',
      head_block_num: null,
      head_block_time: null,
    },
    burn_tracking_status: 'baseline pending; no confirmed historic burn events claimed',
  };

  writeJson(path.join(root, 'data', 'gkniftyheads', 'template-rarity.json'), rarityPayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'live-asset-rarity.json'), livePayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'trait-exposure.json'), traitPayload);
  writeJson(path.join(root, 'data', 'gkniftyheads', 'sync-status.json'), syncPayload);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'template-rarity.csv'), [...model.ranked, ...model.utility, ...model.unissued], [
    'rank', 'band', 'bucket', 'title', 'template_id', 'live_supply', 'issued_supply', 'max_supply', 'missing_burned_count', 'rarity_trait', 'rarity_live_exposure', 'variation_trait', 'variation_live_exposure', 'final_score', 'url', 'atomicassets_url', 'atomichub_url'
  ]);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'live-asset-rarity.csv'), [], [
    'asset_id', 'template_id', 'original_template_mint', 'surviving_mint_rank', 'status'
  ]);
  writeCsv(path.join(root, 'data', 'gkniftyheads', 'trait-exposure.csv'), [
    ...model.rarityExposure.map((row) => ({ trait_type: 'rarity', ...row })),
    ...model.variationExposure.map((row) => ({ trait_type: 'variation', ...row })),
  ], ['trait_type', 'trait', 'template_count', 'exposure_supply', 'template_ids']);

  const rawFallback = oldSection.includes(RAW_BEGIN) ? oldSection : `${RAW_BEGIN}\n${oldSection}\n${RAW_END}`;
  const nextHtml = ensureRarityClientScript(replaceSection(html, buildRankingSection(model, stats, rawFallback)));
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
