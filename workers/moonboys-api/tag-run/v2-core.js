// TAG RUN V2: deterministic, read-only Community Token Pot calculations.
// All balances are INTEGER BASE UNITS represented as decimal strings; NEVER
// turn large blockchain token quantities into JS floating point numbers.
// NO wallet signing, WAX transfer calls, or network access exists in this file.

import { isValidWaxAccount } from './core.js';

export const TIP_ACCOUNT = 'isthatajoint';
export const WAX_MAINNET_CHAIN_ID =
  '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4';
export const DAILY_BPS = 500; // 5%, independently for each verified asset.
export const HISTORIC_MAX_BPS = 5000; // At most half the ticket draw when both groups exist.
export const MAX_ASSETS = 100;
export const MAX_BUNDLES_PER_ASSET = 20;
export const MAX_POINTS_PER_DAY = 510; // 30 credited comments * 17 max per comment.
export const MAX_HISTORICAL_WEIGHT = 365 * MAX_POINTS_PER_DAY;
const WAX_ACCOUNT = /^[a-z1-5.]{1,12}$/;
const SYMBOL = /^[A-Z]{1,7}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HEX_SEED = /^[0-9a-f]{64}$/i;

function positiveWhole(value, maximum, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 0 || value > maximum) throw new Error('invalid_' + label);
  return value;
}
export function validUtcDay(day) {
  if (!DAY.test(String(day || ''))) return false;
  const timestamp = Date.parse(day + 'T00:00:00.000Z');
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === day;
}
export function parseIntegerUnits(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new Error('invalid_token_units');
  }
  return BigInt(value);
}
export function parseQuantity(quantity, precision, symbol) {
  positiveWhole(precision, 8, 'precision');
  if (!SYMBOL.test(symbol)) throw new Error('invalid_symbol');
  const fractional = precision === 0 ? '' :
    '(?:\\.([0-9]{1,' + precision + '}))?';
  const pattern = new RegExp('^(0|[1-9][0-9]*)' + fractional + ' ' + symbol + '$');
  if (precision === 0 && String(quantity).includes('.')) {
    throw new Error('invalid_token_precision');
  }
  const match = String(quantity || '').match(pattern);
  if (!match) throw new Error('invalid_token_quantity');
  const value = BigInt(match[1]) * 10n ** BigInt(precision) +
    BigInt((match[2] || '').padEnd(precision, '0') || '0');
  return parseIntegerUnits(value.toString()).toString();
}
export function formatQuantity(units, precision, symbol) {
  const amount = parseIntegerUnits(units);
  positiveWhole(precision, 8, 'precision');
  if (!SYMBOL.test(symbol)) throw new Error('invalid_symbol');
  const base = 10n ** BigInt(precision);
  return (amount / base).toString() +
    (precision ? '.' + (amount % base).toString().padStart(precision, '0') : '') +
    ' ' + symbol;
}
export function assetKey(contract, symbol, precision) {
  if (!isValidWaxAccount(contract) || !WAX_ACCOUNT.test(contract) ||
      !SYMBOL.test(symbol)) throw new Error('invalid_token_identity');
  positiveWhole(precision, 8, 'precision');
  return WAX_MAINNET_CHAIN_ID + ':' + contract + ':' + symbol + ':' + precision;
}
export function eligibleAsset(input) {
  if (!input || typeof input !== 'object' || input.approved !== true ||
      input.confirmed !== true) throw new Error('asset_not_approved_and_confirmed');
  const key = assetKey(input.contract, input.symbol, input.precision);
  if (input.key !== undefined && input.key !== key) throw new Error('asset_key_mismatch');
  const balance = parseIntegerUnits(input.balanceUnits);
  const reserved = parseIntegerUnits(input.reservedUnits);
  const excluded = parseIntegerUnits(input.excludedUnits);
  if (reserved + excluded > balance) throw new Error('treasury_balance_deficit');
  const available = balance - reserved - excluded;
  const daily = available * BigInt(DAILY_BPS) / 10000n;
  return {
    key, contract: input.contract, symbol: input.symbol, precision: input.precision,
    balanceUnits: balance.toString(), reservedUnits: reserved.toString(),
    excludedUnits: excluded.toString(), availableUnits: available.toString(),
    dailyBudgetUnits: daily.toString()
  };
}
function weights(rows, max, label) {
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error('invalid_' + label);
  const byMember = new Map();
  for (const row of rows) {
    const id = String(row?.telegramId ?? '');
    if (!/^[0-9]{1,20}$/.test(id)) throw new Error('invalid_telegram_id');
    const points = positiveWhole(row.points, max, label + '_weight');
    if (points === 0) continue;
    if (byMember.has(id)) throw new Error('duplicate_' + label + '_member');
    byMember.set(id, points);
  }
  return [...byMember].map(([telegramId, points]) => ({ telegramId, points }))
    .sort((a, b) => a.telegramId.localeCompare(b.telegramId));
}
async function sha256(bytes, cryptoImpl) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}
export async function sha256Text(value, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new Error('cryptography_unavailable');
  return [...await sha256(new TextEncoder().encode(value), cryptoImpl)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
async function pickWeighted(rows, seed, domain, cryptoImpl) {
  const total = rows.reduce((n, r) => n + BigInt(r.points), 0n);
  if (total === 0n) return null;
  // Rejection sampling eliminates modulo bias, even for a weighted lottery.
  const max = 1n << 256n;
  const limit = max - max % total;
  for (let attempt = 0; attempt < 128; attempt++) {
    const hex = await sha256Text(seed + '|' + domain + '|' + attempt, cryptoImpl);
    const sample = BigInt('0x' + hex);
    if (sample >= limit) continue;
    let ticket = sample % total;
    for (const member of rows) {
      ticket -= BigInt(member.points);
      if (ticket < 0n) return member.telegramId;
    }
  }
  throw new Error('lottery_sampling_unavailable');
}
export function drawSeed(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.getRandomValues) throw new Error('cryptography_unavailable');
  return [...cryptoImpl.getRandomValues(new Uint8Array(32))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function previewCommunityDraw({ day, assets, current, historical,
  seedHex, wallet = TIP_ACCOUNT, cryptoImpl = globalThis.crypto }) {
  if (!validUtcDay(day)) throw new Error('invalid_draw_day');
  if (wallet !== TIP_ACCOUNT) throw new Error('unexpected_treasury_wallet');
  if (!HEX_SEED.test(seedHex || '')) throw new Error('invalid_random_seed');
  if (!Array.isArray(assets) || assets.length > MAX_ASSETS) throw new Error('too_many_assets');
  const currentWeights = weights(current, MAX_POINTS_PER_DAY, 'current');
  const historicalWeights = weights(historical, MAX_HISTORICAL_WEIGHT, 'historical');
  const seen = new Set();
  const budgets = [];
  const bundles = [];
  for (const asset of assets) {
    const verified = eligibleAsset(asset);
    if (seen.has(verified.key)) throw new Error('duplicate_asset');
    seen.add(verified.key);
    budgets.push(verified);
    const budget = BigInt(verified.dailyBudgetUnits);
    if (!budget || (!currentWeights.length && !historicalWeights.length)) continue;
    const count = Number(budget < BigInt(MAX_BUNDLES_PER_ASSET)
      ? budget : BigInt(MAX_BUNDLES_PER_ASSET));
    // The odd bundle belongs to current members, ensuring historical bundles
    // are never more than half where both classes participate.
    const mixed = currentWeights.length > 0 && historicalWeights.length > 0;
    const historicSlots = mixed ? Math.floor(count / 2) :
      historicalWeights.length && !currentWeights.length ? count : 0;
    const labels = Array.from({ length: count }, (_, i) => i < historicSlots
      ? 'historical' : 'current');
    // Shuffle the class labels deterministically to prevent contract ordering
    // or bundle indices from privileging historical/current participants.
    const decorated = await Promise.all(labels.map(async (label, i) => ({
      label, digest: await sha256Text(seedHex + '|class|' + day + '|' +
        verified.key + '|' + i, cryptoImpl)
    })));
    decorated.sort((a, b) => a.digest.localeCompare(b.digest));
    const base = budget / BigInt(count), remainder = budget % BigInt(count);
    for (let i = 0; i < count; i++) {
      const className = decorated[i].label;
      const pool = className === 'historical' ? historicalWeights : currentWeights;
      const winner = await pickWeighted(pool, seedHex,
        day + '|' + verified.key + '|' + i + '|' + className, cryptoImpl);
      if (!winner) throw new Error('missing_eligible_winner');
      bundles.push({
        day, assetKey: verified.key, bundleIndex: i,
        telegramId: winner, pool: className,
        units: (base + (BigInt(i) < remainder ? 1n : 0n)).toString(),
        status: 'preview_only'
      });
    }
  }
  // A seed commitment is only auditable if committed BEFORE operators know
  // the final snapshot. Production previews must never be called payouts.
  return {
    status: 'preview_only', day, wallet, dailyBps: DAILY_BPS,
    historicalWeightCapBps: HISTORIC_MAX_BPS,
    seedCommitment: await sha256Text(seedHex, cryptoImpl),
    eligibleCurrent: currentWeights.length,
    eligibleHistorical: historicalWeights.length,
    budgets, bundles
  };
}
