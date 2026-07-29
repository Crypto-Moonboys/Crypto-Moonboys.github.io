#!/usr/bin/env node

import { runGenerateGkniftyheadsRarity } from './generate-gkniftyheads-rarity.mjs';
import { updateGkniftyheadsLiveSupplyCache } from './update-gkniftyheads-live-supply-cache.mjs';
import { updateGkniftyheadsTemplateMetadataCache } from './update-gkniftyheads-template-metadata-cache.mjs';
import { updateGkniftyheadsAssetStateCache } from './update-gkniftyheads-asset-state-cache.mjs';
import { fetchAtomicCollectionStatsSanity, updateNftMarketAnalytics } from './nft-market-analytics.mjs';
import {
  createFeedStatus,
  fetchJson,
  findFeed,
  preserveOrWrite,
  readPrevious,
  resolveRoot,
  writeFeedStatus,
  writeJson,
} from './site-feed-utils.mjs';

const FEED_ID = 'gkniftyheads_rarity';

async function tryUpdateCheckpoint(feed) {
  const endpoint = feed.source_urls?.wax_get_info;
  if (!endpoint) return { checkpoint: null, error: null };
  try {
    const payload = await fetchJson(endpoint);
    return {
      checkpoint: {
        head_block_num: payload.head_block_num || null,
        head_block_time: payload.head_block_time || null,
        chain_id: payload.chain_id || null,
        checked_at: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    return { checkpoint: null, error: error.message || String(error) };
  }
}

function reconciliationSummary() {
  const rarity = readPrevious('data/gkniftyheads/template-rarity.json', {});
  const assetState = readPrevious('data/gkniftyheads/asset-state-cache.json', {});
  const stats = rarity.stats || {};
  const templateState = Array.isArray(assetState.template_state) ? assetState.template_state : [];
  const mismatchRows = templateState.filter((row) => (
    row?.asset_state_status === 'mismatch'
    || row?.status === 'mismatch'
    || row?.asset_state_mismatch
    || row?.mismatch
  ));
  const issued = Number(stats.total_issued_supply);
  const live = Number(stats.live_assets_counted);
  const totalsComparable = Number.isFinite(issued) && Number.isFinite(live);
  const totalDifference = totalsComparable ? live - issued : null;
  return {
    mismatchTemplateIds: mismatchRows.map((row) => row.template_id).filter((value) => value != null),
    mismatchCount: Number(stats.asset_state_mismatch_templates || mismatchRows.length || 0),
    issued: Number.isFinite(issued) ? issued : null,
    live: Number.isFinite(live) ? live : null,
    totalDifference,
    reconciled: Number(stats.asset_state_mismatch_templates || mismatchRows.length || 0) === 0
      && (!totalsComparable || totalDifference <= 0),
  };
}

export async function updateGkniftyheadsRarityFeed() {
  const feed = findFeed(FEED_ID);
  const useExistingCaches = process.env.GK_USE_EXISTING_STAGED_CACHES === '1';
  const metadataResult = useExistingCaches
    ? {
        templates: (readPrevious('data/gkniftyheads/template-metadata-cache.json', { templates: [] }).templates || []).length,
        ok: (readPrevious('data/gkniftyheads/template-metadata-cache.json', { templates: [] }).templates || []).filter((row) => row.metadata_status === 'ok' || row.metadata_status === 'seeded_from_existing_site_data').length,
      }
    : await updateGkniftyheadsTemplateMetadataCache();
  const supplyResult = useExistingCaches
    ? {
        templates: (readPrevious('data/gkniftyheads/live-template-supply.json', { supplies: [] }).supplies || []).length,
        ok: (readPrevious('data/gkniftyheads/live-template-supply.json', { supplies: [] }).supplies || []).filter((row) => row.live_supply_status === 'ok').length,
      }
    : await updateGkniftyheadsLiveSupplyCache();
  const assetStateResult = useExistingCaches
    ? {
        assets: (readPrevious('data/gkniftyheads/asset-state-cache.json', { assets: [] }).assets || []).length,
        templates: (readPrevious('data/gkniftyheads/asset-state-cache.json', { template_state: [] }).template_state || []).length,
        errors: (readPrevious('data/gkniftyheads/asset-state-cache.json', { errors: [] }).errors || []).length,
      }
    : await updateGkniftyheadsAssetStateCache();
  const marketAnalytics = await updateNftMarketAnalytics({ collection: 'gkniftyheads', root: resolveRoot('.') });
  const collectionStats = await fetchAtomicCollectionStatsSanity({ collection: 'gkniftyheads' });
  const result = await runGenerateGkniftyheadsRarity();
  const reconciliation = reconciliationSummary();
  const { checkpoint, error } = await tryUpdateCheckpoint(feed);
  const syncPath = 'data/gkniftyheads/sync-status.json';
  const existingSync = readPrevious(syncPath, {});
  if (checkpoint) {
    existingSync.wax_get_info = {
      ...(existingSync.wax_get_info || {}),
      used_for: 'future scan checkpoint metadata only',
      endpoint: feed.source_urls.wax_get_info,
      head_block_num: checkpoint.head_block_num,
      head_block_time: checkpoint.head_block_time,
      chain_id: checkpoint.chain_id,
      checked_at: checkpoint.checked_at,
    };
  }
  existingSync.reconciliation = {
    status: reconciliation.reconciled ? 'reconciled' : 'degraded',
    issued_supply: reconciliation.issued,
    live_assets_counted: reconciliation.live,
    live_minus_issued: reconciliation.totalDifference,
    mismatch_template_count: reconciliation.mismatchCount,
    mismatch_template_ids: reconciliation.mismatchTemplateIds,
    checked_at: new Date().toISOString(),
  };
  writeJson(resolveRoot(syncPath), existingSync);

  preserveOrWrite('data/gkniftyheads/live-asset-rarity.json', readPrevious('data/gkniftyheads/live-asset-rarity.json'));

  const analyticsDegraded = marketAnalytics.analytics_status !== 'ok';
  const feedDegraded = analyticsDegraded || !reconciliation.reconciled || Boolean(error) || assetStateResult.errors > 0;
  const endpointStatus = marketAnalytics.endpoint_status || {};
  const failedAnalytics = Object.entries(endpointStatus)
    .filter(([, row]) => !row?.ok)
    .map(([key]) => key);
  const errors = [];
  if (error) errors.push(`WAX get_info checkpoint unavailable: ${error}`);
  if (!reconciliation.reconciled) {
    errors.push(`Rarity reconciliation incomplete: ${reconciliation.mismatchCount} mismatched template(s); live minus issued = ${reconciliation.totalDifference ?? 'unknown'}`);
  }
  if (failedAnalytics.length) errors.push(`Display analytics unavailable: ${failedAnalytics.join(', ')}`);

  const status = createFeedStatus(feed, {
    status: feedDegraded ? 'degraded' : 'ok',
    last_successful_check: new Date().toISOString(),
    source_updated_at: existingSync.generated_at || new Date().toISOString(),
    last_error: errors.length ? errors.join(' | ') : null,
    analytics_status: marketAnalytics.analytics_status,
    endpoint_status: endpointStatus,
    notes: [
      `Generated local rarity render: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued.`,
      `Staged cache refresh: ${metadataResult.ok}/${metadataResult.templates} metadata ok; ${supplyResult.ok}/${supplyResult.templates} live supply counts ok; ${assetStateResult.assets} asset-state records across ${assetStateResult.templates} templates.`,
      reconciliation.reconciled
        ? `Rarity reconciliation passed: ${reconciliation.live ?? 'unknown'} live assets against ${reconciliation.issued ?? 'unknown'} issued supply; no mismatched templates.`
        : `Rarity reconciliation degraded: ${reconciliation.mismatchCount} mismatched template(s)${reconciliation.mismatchTemplateIds.length ? ` (${reconciliation.mismatchTemplateIds.join(', ')})` : ''}; live minus issued = ${reconciliation.totalDifference ?? 'unknown'}.`,
      `HiveBP display analytics: ${marketAnalytics.analytics_status}; not used for rarity scoring.`,
      collectionStats.ok
        ? 'AtomicAssets collection stats sanity check available; asset-state cache remains the source for surviving mint ranks and holder/asset leaderboards.'
        : `AtomicAssets collection stats sanity check unavailable: ${collectionStats.error || 'unknown error'}.`,
      'Live asset supply comes from AtomicAssets current asset counts when cached; issued-supply fallback remains explicit where counts are unavailable.',
      'Historic burn baseline is pending until confirmed burn events are captured. No burn-baseline-active claim is permitted before then.',
      'AtomicAssets latest-created, updated-live, and updated-burned asset endpoints update asset-state cache sidecar data; current rarity maths still uses per-template live count verification.',
      checkpoint ? 'WAX get_info checkpoint updated for scan metadata only.' : 'WAX get_info checkpoint not updated; rarity data preserved.',
    ],
  });
  writeFeedStatus(feed, status);
  return status;
}

if (process.argv[1] && process.argv[1].endsWith('update-gkniftyheads-rarity-feed.mjs')) {
  updateGkniftyheadsRarityFeed()
    .then((status) => console.log(`${FEED_ID}: ${status.status}`))
    .catch((error) => {
      console.error(`${FEED_ID}: ${error.message || error}`);
      process.exitCode = 1;
    });
}
