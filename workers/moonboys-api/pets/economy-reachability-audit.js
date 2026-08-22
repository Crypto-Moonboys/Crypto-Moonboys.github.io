import { PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from './content-phase-4.js';
import bosses from './content/bosses.json' with { type: 'json' };
import evolutions from './content/evolutions.json' with { type: 'json' };
import {
  PET_COSMETIC_SINKS,
  PET_CRAFTING_MATERIALS,
  PET_CRAFTING_RECIPES,
  PET_EQUIPMENT_UPGRADE_COSTS,
  PET_PRESTIGE_REQUIREMENTS,
  PET_RARE_DROP_TABLES,
  normalizePetMaterial,
} from './economy-phase-3.js';
import {
  PET_DAILY_BOUNTIES,
  PET_ECONOMY_ROUTES,
  PET_EXPEDITION_TIERS,
  PET_MARKET_OFFERS,
} from './economy-expansion.js';

export const PET_ECONOMY_REACHABILITY_CLASSIFICATIONS = Object.freeze({
  LIVE_REACHABLE: 'Live and reachable',
  LIVE_UNREACHABLE: 'Live but unreachable',
  VISIBLE_UNREACHABLE: 'Visible but not reachable',
  REACHABLE_NOT_SPENDABLE: 'Reachable but not spendable',
  SPENDABLE_NOT_CLEARLY_OBTAINABLE: 'Spendable but not clearly obtainable',
  FUTURE_LOCKED_HIDDEN: 'Future/locked and correctly hidden',
  FUTURE_LOCKED_VISIBLE: 'Future/locked but misleadingly visible',
  DEAD_PLACEHOLDER: 'Dead/stale/beta placeholder',
});

const ACCOUNT_WALLET_CURRENCIES = Object.freeze(['moon_gold', 'moon_crystals', 'style_tokens']);
const CANONICAL_ITEMS = Object.freeze(['moon_snack', 'energy_drink', 'clean_wipe', 'lucky_charm', 'style_patch', 'adventure_map']);
const VERIFIED_CURRENCY_SOURCES = Object.freeze({
  moon_gold: Object.freeze(['care', 'jobs', 'daily_chest', 'run_rewards', 'districts', 'event_chains', 'bounties', 'expeditions', 'market_exchange', 'seasonal_boss', 'trade']),
  moon_crystals: Object.freeze(['jobs', 'run_rewards', 'bounties', 'expeditions', 'market_exchange', 'seasonal_boss', 'trade']),
  style_tokens: Object.freeze(['care', 'jobs', 'daily_chest', 'run_rewards', 'event_chains', 'bounties', 'expeditions', 'market_exchange', 'item_use']),
});
const SAFE_ACCUMULATION_ONLY_MATERIALS = Object.freeze({
  kaiju_fragment: 'Current beta Kaiju and boss routes can award fragments before their late-beta sink is enabled; keeping the balance is safe account-owned accumulation.',
});

function positiveEntries(value = {}) {
  return Object.entries(value || {}).filter(([, amount]) => Math.max(0, Math.floor(Number(amount) || 0)) > 0);
}

function addSink(sinks, key, sink) {
  if (!key || !sinks.has(key)) return;
  sinks.get(key).push(sink);
}

function addSource(sources, key, source) {
  if (!key || !sources.has(key)) return;
  sources.get(key).push(source);
}

function invalidMaterialReferencesFrom(collection, owner, invalid = []) {
  for (const key of Object.keys(collection || {})) {
    if (!normalizePetMaterial(key)) invalid.push({ owner, key });
  }
  return invalid;
}

function materialClassification(sourceCount, sinkCount, classifications) {
  if (sourceCount > 0 && sinkCount > 0) return classifications.LIVE_REACHABLE;
  if (sourceCount > 0 && sinkCount === 0) return classifications.REACHABLE_NOT_SPENDABLE;
  if (sourceCount === 0 && sinkCount > 0) return classifications.SPENDABLE_NOT_CLEARLY_OBTAINABLE;
  return classifications.LIVE_UNREACHABLE;
}

export function buildPetEconomyReachabilityAudit(definitions = {}) {
  const classifications = PET_ECONOMY_REACHABILITY_CLASSIFICATIONS;
  const materials = definitions.materials || PET_CRAFTING_MATERIALS;
  const recipes = definitions.recipes || PET_CRAFTING_RECIPES;
  const upgradeCosts = definitions.upgrade_costs || PET_EQUIPMENT_UPGRADE_COSTS;
  const cosmeticSinks = definitions.cosmetic_sinks || PET_COSMETIC_SINKS;
  const rareDropTables = definitions.rare_drop_tables || PET_RARE_DROP_TABLES;
  const marketOffers = definitions.market_offers || PET_MARKET_OFFERS;
  const expeditionTiers = definitions.expedition_tiers || PET_EXPEDITION_TIERS;
  const seasonalBosses = definitions.seasonal_bosses || PET_SEASONAL_BOSSES;
  const evolutionDefinitions = definitions.evolutions || evolutions;
  const regionContent = definitions.region_content || PET_REGION_CONTENT;
  const runBosses = definitions.run_bosses || bosses;

  const materialSinks = new Map(Object.keys(materials).map((key) => [key, []]));
  const currencySinks = new Map(ACCOUNT_WALLET_CURRENCIES.map((key) => [key, []]));
  const itemSources = new Map(CANONICAL_ITEMS.map((key) => [key, []]));
  const materialSources = new Map(Object.keys(materials).map((key) => [key, []]));
  const invalidMaterialReferences = [];

  for (const [recipeKey, recipe] of Object.entries(recipes)) {
    invalidMaterialReferencesFrom(recipe.cost, `recipe:${recipeKey}:cost`, invalidMaterialReferences);
    invalidMaterialReferencesFrom(recipe.output?.materials, `recipe:${recipeKey}:output`, invalidMaterialReferences);
    for (const [materialKey] of positiveEntries(recipe.cost)) addSink(materialSinks, materialKey, `recipe:${recipeKey}`);
    for (const [materialKey] of positiveEntries(recipe.output?.materials)) addSource(materialSources, materialKey, `recipe:${recipeKey}`);
    if (itemSources.has(recipe.output.item_key)) itemSources.get(recipe.output.item_key).push(`recipe:${recipeKey}`);
  }

  for (const [level, cost] of Object.entries(upgradeCosts)) {
    invalidMaterialReferencesFrom(Object.fromEntries(Object.entries(cost).filter(([key]) => !ACCOUNT_WALLET_CURRENCIES.includes(key))), `equipment_upgrade:${level}`, invalidMaterialReferences);
    for (const [costKey] of positiveEntries(cost)) {
      addSink(materialSinks, costKey, `equipment_upgrade:${level}`);
      addSink(currencySinks, costKey, `equipment_upgrade:${level}`);
    }
  }

  for (const [cosmeticKey, sink] of Object.entries(cosmeticSinks)) {
    invalidMaterialReferencesFrom(Object.fromEntries(Object.entries(sink.cost).filter(([key]) => !ACCOUNT_WALLET_CURRENCIES.includes(key))), `cosmetic:${cosmeticKey}`, invalidMaterialReferences);
    for (const [costKey] of positiveEntries(sink.cost)) {
      addSink(materialSinks, costKey, `cosmetic:${cosmeticKey}`);
      addSink(currencySinks, costKey, `cosmetic:${cosmeticKey}`);
    }
  }

  for (const [costKey] of positiveEntries(PET_PRESTIGE_REQUIREMENTS.cost)) addSink(currencySinks, costKey, 'prestige:future_locked');

  for (const evolution of evolutionDefinitions) {
    invalidMaterialReferencesFrom(evolution.requirements?.inventory?.material, `evolution:${evolution.evolution_id}`, invalidMaterialReferences);
    for (const [materialKey] of positiveEntries(evolution.requirements?.inventory?.material)) {
      addSink(materialSinks, materialKey, `evolution:${evolution.evolution_id}`);
    }
  }

  for (const [tableKey, table] of Object.entries(rareDropTables)) {
    for (const entry of table) {
      invalidMaterialReferencesFrom({ [entry.item]: 1 }, `rare_drop:${tableKey}`, invalidMaterialReferences);
      addSource(materialSources, entry.item, `rare_drop:${tableKey}`);
    }
  }

  for (const [regionKey, region] of Object.entries(regionContent)) {
    for (const materialKey of region.reward_focus || []) {
      invalidMaterialReferencesFrom({ [materialKey]: 1 }, `district:${regionKey}:reward_focus`, invalidMaterialReferences);
      addSource(materialSources, materialKey, `district:${regionKey}`);
    }
  }

  for (const boss of runBosses) {
    invalidMaterialReferencesFrom(boss.rewards?.materials, `run_boss:${boss.boss_id}`, invalidMaterialReferences);
    for (const [materialKey] of positiveEntries(boss.rewards?.materials)) addSource(materialSources, materialKey, `run_boss:${boss.boss_id}`);
  }

  for (const offer of marketOffers) {
    for (const [costKey] of positiveEntries(offer.cost)) addSink(currencySinks, costKey, `market:${offer.key}`);
    invalidMaterialReferencesFrom(offer.reward?.materials, `market:${offer.key}`, invalidMaterialReferences);
    for (const [materialKey] of positiveEntries(offer.reward?.materials)) {
      addSource(materialSources, materialKey, `market:${offer.key}`);
    }
    for (const [itemKey] of positiveEntries(offer.reward?.items)) {
      if (itemSources.has(itemKey)) itemSources.get(itemKey).push(`market:${offer.key}`);
    }
  }

  for (const tier of expeditionTiers) {
    for (const reward of tier.rewards) {
      invalidMaterialReferencesFrom(reward.materials, `expedition:${tier.key}`, invalidMaterialReferences);
      for (const [materialKey] of positiveEntries(reward.materials)) {
        addSource(materialSources, materialKey, `expedition:${tier.key}`);
      }
    }
  }

  for (const [bossKey, boss] of Object.entries(seasonalBosses)) {
    invalidMaterialReferencesFrom({ [boss.reward]: 1, mastery_token: 1 }, `seasonal_boss:${bossKey}`, invalidMaterialReferences);
    addSource(materialSources, boss.reward, `seasonal_boss:${bossKey}`);
    addSource(materialSources, 'mastery_token', `seasonal_boss:${bossKey}`);
  }

  const materialSurfaces = Object.entries(materials).map(([key, material]) => {
    const sources = [...new Set(materialSources.get(key) || [])];
    const sinks = [...new Set(materialSinks.get(key) || [])];
    const safeAccumulationOnly = Object.prototype.hasOwnProperty.call(SAFE_ACCUMULATION_ONLY_MATERIALS, key);
    return {
      kind: 'material',
      key,
      label: material.label,
      classification: materialClassification(sources.length, sinks.length, classifications),
      sources,
      declared_sources: [...(material.sources || [])],
      sinks,
      safe_accumulation_only: safeAccumulationOnly,
      note: safeAccumulationOnly ? SAFE_ACCUMULATION_ONLY_MATERIALS[key] : '',
      account_owned: true,
    };
  });

  const currencySurfaces = ACCOUNT_WALLET_CURRENCIES.map((key) => ({
    kind: 'currency',
    key,
    classification: classifications.LIVE_REACHABLE,
    sources: [...VERIFIED_CURRENCY_SOURCES[key]],
    sinks: [...new Set(currencySinks.get(key) || [])],
    account_owned: true,
  }));

  const recipeSurfaces = Object.entries(recipes).map(([key, recipe]) => ({
    kind: 'recipe',
    key,
    classification: positiveEntries(recipe.cost).every(([material]) => materialSources.get(material)?.length) ? classifications.LIVE_REACHABLE : classifications.SPENDABLE_NOT_CLEARLY_OBTAINABLE,
    inputs: { ...recipe.cost },
    output: { ...recipe.output },
  }));

  const marketSurfaces = marketOffers.map((offer) => ({
    kind: 'market_offer',
    key: offer.key,
    classification: classifications.LIVE_REACHABLE,
    cost: { ...offer.cost },
    reward: { ...offer.reward },
    purchase_path: 'Mini App economy:market_buy and Telegram petmarket callbacks',
  }));

  const bountySurfaces = PET_DAILY_BOUNTIES.map((bounty) => ({
    kind: 'daily_bounty',
    key: bounty.key,
    classification: classifications.LIVE_REACHABLE,
    event_types: [...bounty.event_types],
    reward: { ...bounty.reward },
    claim_path: 'Mini App economy:bounty_claim and Telegram petbounties callbacks',
  }));

  const expeditionSurfaces = expeditionTiers.map((tier) => ({
    kind: 'crystal_expedition',
    key: tier.key,
    classification: classifications.LIVE_REACHABLE,
    cost: { energy: tier.energy },
    rewards: tier.rewards.map((reward) => ({ ...reward, materials: { ...(reward.materials || {}) } })),
    run_path: 'Mini App economy:expedition and Telegram petexpedition callbacks',
  }));

  const cosmeticSurfaces = Object.entries(cosmeticSinks).map(([key, sink]) => ({
    kind: 'cosmetic',
    key,
    classification: positiveEntries(sink.cost).every(([costKey]) => currencySinks.has(costKey) || materialSources.get(costKey)?.length) ? classifications.LIVE_REACHABLE : classifications.SPENDABLE_NOT_CLEARLY_OBTAINABLE,
    cost: { ...sink.cost },
    repeatable: sink.repeatable === true,
  }));

  return {
    generated_by: 'buildPetEconomyReachabilityAudit',
    surfaces: [
      ...currencySurfaces,
      ...materialSurfaces,
      ...recipeSurfaces,
      ...marketSurfaces,
      ...bountySurfaces,
      ...expeditionSurfaces,
      ...cosmeticSurfaces,
      ...PET_ECONOMY_ROUTES.map((route) => ({ kind: 'economy_route', classification: classifications.LIVE_REACHABLE, ...route })),
    ],
    canonical_items: CANONICAL_ITEMS.map((key) => ({
      kind: 'item',
      key,
      classification: (itemSources.get(key) || []).length ? classifications.LIVE_REACHABLE : classifications.LIVE_UNREACHABLE,
      sources: [...new Set(itemSources.get(key) || [])],
      account_owned: true,
    })),
    invalid_material_references: invalidMaterialReferences,
  };
}
