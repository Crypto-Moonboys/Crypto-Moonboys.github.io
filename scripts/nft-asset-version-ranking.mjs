export const ASSET_SCORE_WEIGHTS = {
  template_final_score: 60,
  original_mint_number: 20,
  surviving_mint_rank: 20,
};

export const ASSET_RANKING_FORMULA = {
  source_of_truth: 'AtomicAssets',
  asset_ranking_enabled: true,
  burned_assets_excluded: true,
  price_used: false,
  market_data_used: false,
  score_weights: ASSET_SCORE_WEIGHTS,
  note: 'Asset Version Ranking ranks individual live NFTs using template rarity plus original mint number and surviving mint rank. Original mint numbers never change; surviving mint rank is recalculated among live/unburned assets.',
};

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bounded(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function lowerNumberScoresHigher(value, maxValue) {
  const numericValue = toNumber(value);
  const numericMax = toNumber(maxValue);
  if (numericValue === null || numericValue <= 0 || numericMax === null || numericMax <= 0) return 0;
  if (numericMax <= 1) return 1;
  return bounded(1 - ((numericValue - 1) / Math.max(numericMax - 1, 1)));
}

function assetSort(a, b) {
  return b.asset_final_score - a.asset_final_score
    || b.template_final_score - a.template_final_score
    || (a.surviving_mint_rank ?? Number.MAX_SAFE_INTEGER) - (b.surviving_mint_rank ?? Number.MAX_SAFE_INTEGER)
    || (a.original_mint_number ?? Number.MAX_SAFE_INTEGER) - (b.original_mint_number ?? Number.MAX_SAFE_INTEGER)
    || String(a.asset_id).localeCompare(String(b.asset_id));
}

export function buildAssetVersionRanking(assetRows = [], templateRows = []) {
  const templateById = new Map(templateRows
    .filter((row) => Number.isFinite(Number(row.template_id)) && Number.isFinite(Number(row.final_score)))
    .map((row) => [Number(row.template_id), row]));
  const liveRows = assetRows
    .filter((asset) => !asset.burned)
    .map((asset) => ({ ...asset, template_id: toNumber(asset.template_id) }))
    .filter((asset) => Number.isFinite(asset.template_id) && templateById.has(asset.template_id));
  const maxOriginalByTemplate = new Map();
  const maxSurvivingByTemplate = new Map();

  for (const asset of liveRows) {
    const originalMint = toNumber(asset.original_mint_number);
    const survivingRank = toNumber(asset.surviving_mint_rank);
    if (originalMint !== null && originalMint > 0) {
      maxOriginalByTemplate.set(asset.template_id, Math.max(maxOriginalByTemplate.get(asset.template_id) || 0, originalMint));
    }
    if (survivingRank !== null && survivingRank > 0) {
      maxSurvivingByTemplate.set(asset.template_id, Math.max(maxSurvivingByTemplate.get(asset.template_id) || 0, survivingRank));
    }
  }

  const assets = liveRows.map((asset) => {
    const template = templateById.get(asset.template_id);
    const originalMint = toNumber(asset.original_mint_number);
    const survivingRank = toNumber(asset.surviving_mint_rank);
    const normalizedTemplateScore = bounded(toNumber(template.final_score, 0) / 100);
    const originalMintScore = originalMint === null ? 0 : lowerNumberScoresHigher(originalMint, maxOriginalByTemplate.get(asset.template_id));
    const survivingRankScore = survivingRank === null ? 0 : lowerNumberScoresHigher(survivingRank, maxSurvivingByTemplate.get(asset.template_id));
    const templateScoreComponent = Number((normalizedTemplateScore * ASSET_SCORE_WEIGHTS.template_final_score).toFixed(4));
    const originalMintScoreComponent = Number((originalMintScore * ASSET_SCORE_WEIGHTS.original_mint_number).toFixed(4));
    const survivingRankScoreComponent = Number((survivingRankScore * ASSET_SCORE_WEIGHTS.surviving_mint_rank).toFixed(4));

    return {
      asset_id: String(asset.asset_id || ''),
      template_id: asset.template_id,
      owner: asset.owner || null,
      template_rank: template.rank ?? null,
      template_final_score: Number(template.final_score),
      template_score_component: templateScoreComponent,
      original_mint_number: originalMint,
      original_mint_score: Number(originalMintScore.toFixed(6)),
      original_mint_score_component: originalMintScoreComponent,
      original_mint_status: originalMint === null ? 'missing' : 'ok',
      surviving_mint_rank: survivingRank,
      surviving_mint_rank_score: Number(survivingRankScore.toFixed(6)),
      surviving_mint_rank_score_component: survivingRankScoreComponent,
      surviving_mint_rank_status: survivingRank === null ? 'missing' : 'ok',
      live_supply: template.live_supply ?? null,
      issued_supply: template.issued_supply ?? null,
      rarity_band: template.band || template.rarity_band || null,
      burned: false,
      price_used: false,
      market_data_used: false,
      title: template.title || `Template ${asset.template_id}`,
      image_url: template.image_url || null,
      image_sources: template.image_sources || [],
      thumbnail_url: template.thumbnail_url || null,
      immutable_data_image_fields: template.immutable_data_image_fields || {},
      url: template.url || template.atomichub_url || template.atomicassets_url || '#',
      atomichub_url: template.atomichub_url || null,
      atomicassets_url: template.atomicassets_url || null,
      asset_score_formula: 'normalized_template_final_score * 60 + original_mint_score * 20 + surviving_mint_rank_score * 20',
      asset_score_weights: ASSET_SCORE_WEIGHTS,
      asset_final_score: Number((templateScoreComponent + originalMintScoreComponent + survivingRankScoreComponent).toFixed(4)),
    };
  }).sort(assetSort);

  assets.forEach((asset, index) => {
    asset.asset_rank = index + 1;
  });
  return assets;
}
