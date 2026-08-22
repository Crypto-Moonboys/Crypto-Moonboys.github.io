import { PET_SEASONAL_BOSSES } from './content-phase-4.js';
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

export function buildPetEconomyReachabilityAudit() {
  const classifications = PET_ECONOMY_REACHABILITY_CLASSIFICATIONS;
  const materialSinks = new Map(Object.keys(PET_CRAFTING_MATERIALS).map((key) => [key, []]));
  const currencySinks = new Map(ACCOUNT_WALLET_CURRENCIES.map((key) => [key, []]));
  const itemSources = new Map(CANONICAL_ITEMS.map((key) => [key, []]));
  const materialSources = new Map(Object.entries(PET_CRAFTING_MATERIALS).map(([key, material]) => [key, [...material.sources]]));

  for (const [recipeKey, recipe] of Object.entries(PET_CRAFTING_RECIPES)) {
    for (const [materialKey] of positiveEntries(recipe.cost)) addSink(materialSinks, materialKey, `recipe:${recipeKey}`);
    if (itemSources.has(recipe.output.item_key)) itemSources.get(recipe.output.item_key).push(`recipe:${recipeKey}`);
  }

  for (const [level, cost] of Object.entries(PET_EQUIPMENT_UPGRADE_COSTS)) {
    for (const [costKey] of positiveEntries(cost)) {
      addSink(materialSinks, costKey, `equipment_upgrade:${level}`);
      addSink(currencySinks, costKey, `equipment_upgrade:${level}`);
    }
  }

  for (const [cosmeticKey, sink] of Object.entries(PET_COSMETIC_SINKS)) {
    for (const [costKey] of positiveEntries(sink.cost)) {
      addSink(materialSinks, costKey, `cosmetic:${cosmeticKey}`);
      addSink(currencySinks, costKey, `cosmetic:${cosmeticKey}`);
    }
  }

  for (const [costKey] of positiveEntries(PET_PRESTIGE_REQUIREMENTS.cost)) addSink(currencySinks, costKey, 'prestige:future_locked');

  for (const evolution of evolutions) {
    for (const [materialKey] of positiveEntries(evolution.requirements?.inventory?.material)) {
      addSink(materialSinks, materialKey, `evolution:${evolution.evolution_id}`);
    }
  }

  for (const offer of PET_MARKET_OFFERS) {
    for (const [costKey] of positiveEntries(offer.cost)) addSink(currencySinks, costKey, `market:${offer.key}`);
    for (const [materialKey] of positiveEntries(offer.reward?.materials)) {
      if (materialSources.has(materialKey)) materialSources.get(materialKey).push(`market:${offer.key}`);
    }
    for (const [itemKey] of positiveEntries(offer.reward?.items)) {
      if (itemSources.has(itemKey)) itemSources.get(itemKey).push(`market:${offer.key}`);
    }
  }

  for (const tier of PET_EXPEDITION_TIERS) {
    for (const reward of tier.rewards) {
      for (const [materialKey] of positiveEntries(reward.materials)) {
        if (materialSources.has(materialKey)) materialSources.get(materialKey).push(`expedition:${tier.key}`);
      }
    }
  }

  for (const [bossKey, boss] of Object.entries(PET_SEASONAL_BOSSES)) {
    if (materialSources.has(boss.reward)) materialSources.get(boss.reward).push(`seasonal_boss:${bossKey}`);
    if (materialSources.has('mastery_token')) materialSources.get('mastery_token').push(`seasonal_boss:${bossKey}`);
  }

  const materialSurfaces = Object.entries(PET_CRAFTING_MATERIALS).map(([key, material]) => {
    const sources = [...new Set(materialSources.get(key) || [])];
    const sinks = [...new Set(materialSinks.get(key) || [])];
    const safeAccumulationOnly = Object.prototype.hasOwnProperty.call(SAFE_ACCUMULATION_ONLY_MATERIALS, key);
    return {
      kind: 'material',
      key,
      label: material.label,
      classification: sinks.length ? classifications.LIVE_REACHABLE : classifications.REACHABLE_NOT_SPENDABLE,
      sources,
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
    sources: ['care', 'jobs', 'daily_chest', 'run_rewards', 'bounties', 'expeditions', 'market_exchange'],
    sinks: [...new Set(currencySinks.get(key) || [])],
    account_owned: true,
  }));

  const recipeSurfaces = Object.entries(PET_CRAFTING_RECIPES).map(([key, recipe]) => ({
    kind: 'recipe',
    key,
    classification: positiveEntries(recipe.cost).every(([material]) => materialSources.get(material)?.length) ? classifications.LIVE_REACHABLE : classifications.SPENDABLE_NOT_CLEARLY_OBTAINABLE,
    inputs: { ...recipe.cost },
    output: { ...recipe.output },
  }));

  const marketSurfaces = PET_MARKET_OFFERS.map((offer) => ({
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

  const expeditionSurfaces = PET_EXPEDITION_TIERS.map((tier) => ({
    kind: 'crystal_expedition',
    key: tier.key,
    classification: classifications.LIVE_REACHABLE,
    cost: { energy: tier.energy },
    rewards: tier.rewards.map((reward) => ({ ...reward, materials: { ...(reward.materials || {}) } })),
    run_path: 'Mini App economy:expedition and Telegram petexpedition callbacks',
  }));

  const cosmeticSurfaces = Object.entries(PET_COSMETIC_SINKS).map(([key, sink]) => ({
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
    invalid_material_references: [
      ...Object.values(PET_CRAFTING_RECIPES).flatMap((recipe) => Object.keys(recipe.cost)),
      ...Object.values(PET_EQUIPMENT_UPGRADE_COSTS).flatMap((cost) => Object.keys(cost).filter((key) => !ACCOUNT_WALLET_CURRENCIES.includes(key))),
      ...Object.values(PET_COSMETIC_SINKS).flatMap((sink) => Object.keys(sink.cost).filter((key) => !ACCOUNT_WALLET_CURRENCIES.includes(key))),
      ...Object.values(PET_RARE_DROP_TABLES).flatMap((table) => table.map((entry) => entry.item)),
    ].filter((key) => !normalizePetMaterial(key)),
  };
}
