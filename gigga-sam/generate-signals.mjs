import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../games/block-topia/data/live-signals.json');
const OUTPUT_DIR = path.dirname(OUTPUT_PATH);
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const REQUEST_TIMEOUT_MS = 7000;

function withTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'user-agent': 'gigga-sam-signal-generator/1.0',
      accept: 'application/json',
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timer));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text, fallback = 'Signal unavailable.') {
  const raw = String(text || '').trim();
  if (!raw) return fallback;
  const noUrls = raw.replace(/https?:\/\/\S+/gi, '[redacted-link]');
  const noPrices = noUrls.replace(/[$€£]?\d[\d,]*(\.\d+)?/g, '##');
  const noHandles = noPrices.replace(/@\w+/g, '@node');
  const noFullNames = noHandles.replace(/\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g, 'an operator');
  const compact = noFullNames.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 160) || fallback;
}

function buildSignalId(index) {
  return `signal-${Date.now()}-${index + 1}`;
}

async function readJsonSafe(url, sourceName) {
  try {
    const response = await withTimeout(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { source: sourceName, ok: true, data: json, error: null };
  } catch (error) {
    return {
      source: sourceName,
      ok: false,
      data: null,
      error: String(error?.message || error),
    };
  }
}

async function fetchExternalInputs() {
  const [globalMarket, trending, fearGreed] = await Promise.all([
    readJsonSafe('https://api.coingecko.com/api/v3/global', 'coingecko-global'),
    readJsonSafe('https://api.coingecko.com/api/v3/search/trending', 'coingecko-trending'),
    readJsonSafe('https://api.alternative.me/fng/?limit=1', 'fear-greed'),
  ]);
  return [globalMarket, trending, fearGreed];
}

function makeCompactInput(sources) {
  const sourceHealth = {};
  const compact = {};

  for (const source of sources) {
    sourceHealth[source.source] = source.ok ? 'ok' : 'degraded';

    if (!source.ok || !source.data) continue;
    if (source.source === 'coingecko-global') {
      compact.market = {
        activeCryptocurrencies: source.data?.data?.active_cryptocurrencies ?? null,
        markets: source.data?.data?.markets ?? null,
        marketCapChange24h: source.data?.data?.market_cap_change_percentage_24h_usd ?? null,
      };
    }
    if (source.source === 'coingecko-trending') {
      compact.trending = (source.data?.coins || [])
        .slice(0, 5)
        .map((entry) => ({
          symbol: String(entry?.item?.symbol || '').toUpperCase(),
          score: entry?.item?.score ?? null,
        }))
        .filter((entry) => entry.symbol);
    }
    if (source.source === 'fear-greed') {
      const latest = source.data?.data?.[0] || {};
      compact.sentiment = {
        value: Number(latest?.value ?? NaN),
        label: String(latest?.value_classification || ''),
      };
    }
  }

  return { sourceHealth, compact };
}

function buildFallbackSignals(compact) {
  const sentimentValue = Number(compact?.sentiment?.value);
  const sentimentLabel = String(compact?.sentiment?.label || 'Neutral');
  const pressure =
    Number.isFinite(sentimentValue) && sentimentValue < 35
      ? 'high'
      : Number.isFinite(sentimentValue) && sentimentValue > 65
        ? 'low'
        : 'mixed';
  const trendSymbols = (compact?.trending || []).map((item) => item.symbol).slice(0, 3).join(' · ');
  const trendText = trendSymbols || 'ALT · CORE · HASH';

  return [
    {
      lane: 'world',
      priority: 3,
      ttlMinutes: 45,
      npcLine: normalizeText(`Signal board shows ${sentimentLabel} pressure. Keep your routes adaptive.`),
      questPulse: normalizeText('Map three unstable relay corners before the next SAM sweep.'),
      worldFeed: normalizeText(`Network mood: ${sentimentLabel}. Surveillance pressure remains ${pressure}.`),
      clueEvent: normalizeText('Hidden relay mark: look for the glyph where east lanes cross old neon rail.'),
      tags: ['sam', 'mood', 'relay'],
    },
    {
      lane: 'ops',
      priority: 4,
      ttlMinutes: 40,
      npcLine: normalizeText(`Trend signatures rotating: ${trendText}. Couriers are rerouting tonight.`),
      questPulse: normalizeText('Intercept two phantom couriers carrying unsigned signal chips.'),
      worldFeed: normalizeText('Ops pulse: district relays are shifting faster than normal.'),
      clueEvent: normalizeText('Clue pulse: seek a dead terminal with three blinking amber bars.'),
      tags: ['ops', 'courier', 'quest'],
    },
    {
      lane: 'clue',
      priority: 2,
      ttlMinutes: 60,
      npcLine: normalizeText('A rumor says the old tunnel net is awake again.'),
      questPulse: normalizeText('Trace a memory shard path without triggering patrol beacons.'),
      worldFeed: normalizeText('World feed: encrypted whispers detected under Revolt blocks.'),
      clueEvent: normalizeText('Hidden link hunt: the passphrase starts with moon and ends with static.'),
      tags: ['clue', 'hunt', 'world'],
    },
  ];
}

function normalizeSignal(candidate, index) {
  const lane = ['world', 'ops', 'clue', 'quest', 'npc'].includes(candidate?.lane)
    ? candidate.lane
    : 'world';

  const ttlMinutes = clamp(Number(candidate?.ttlMinutes ?? 45) || 45, 10, 180);
  const priority = clamp(Number(candidate?.priority ?? 3) || 3, 1, 5);
  const clueEvent = normalizeText(candidate?.clueEvent, 'No active clue pulse.');
  const now = Date.now();

  return {
    id: buildSignalId(index),
    lane,
    priority,
    ttlMinutes,
    npcLine: normalizeText(candidate?.npcLine, 'Signal noise. Keep moving.'),
    questPulse: normalizeText(candidate?.questPulse, 'Survey the grid and report anomalies.'),
    worldFeed: normalizeText(candidate?.worldFeed, 'City signal conditions are unstable.'),
    clueEvent,
    tags: Array.isArray(candidate?.tags)
      ? candidate.tags.slice(0, 5).map((tag) => normalizeText(tag, '').toLowerCase()).filter(Boolean)
      : [],
    expiresAt: new Date(now + ttlMinutes * 60 * 1000).toISOString(),
  };
}

async function transformWithOpenAI(compactInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mode: 'fallback-no-key',
      signals: buildFallbackSignals(compactInput),
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const prompt = [
      'Convert the provided market intelligence into short in-game cyberpunk signals.',
      'Output valid JSON with this exact shape:',
      '{ "signals": [ { "lane": "world|ops|clue|quest|npc", "priority": 1-5, "ttlMinutes": number, "npcLine": string, "questPulse": string, "worldFeed": string, "clueEvent": string, "tags": ["tag"] } ] }',
      'Rules:',
      '- Keep each field short and playable (max ~18 words).',
      '- Never include real person names.',
      '- Never include exact prices, exact percentages, or direct headlines.',
      '- Avoid URLs and exchange names.',
      '- Tone: dystopian cyberpunk intelligence bulletin.',
      '- Return 3 to 6 signals.',
      `Input JSON: ${JSON.stringify(compactInput)}`,
    ].join('\n');

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const raw = String(response.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(raw);
    const aiSignals = Array.isArray(parsed?.signals) ? parsed.signals : [];
    if (!aiSignals.length) throw new Error('OpenAI returned no signals');

    return {
      mode: 'live-ai',
      signals: aiSignals,
    };
  } catch (error) {
    return {
      mode: 'fallback-ai-error',
      signals: buildFallbackSignals(compactInput),
      aiError: String(error?.message || error),
    };
  }
}

async function writeSignalsFile(payload) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function run() {
  const sources = await fetchExternalInputs();
  const { compact, sourceHealth } = makeCompactInput(sources);
  const transformed = await transformWithOpenAI(compact);
  const normalized = (transformed.signals || []).slice(0, 6).map(normalizeSignal);

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: transformed.mode,
    sourceHealth,
    signalCount: normalized.length,
    signals: normalized,
  };

  await writeSignalsFile(payload);

  const unhealthySources = sources.filter((source) => !source.ok);
  console.log(`GIGGA SAM signals written: ${normalized.length} entries (${payload.mode})`);
  if (unhealthySources.length) {
    console.log(`Degraded sources: ${unhealthySources.map((entry) => entry.source).join(', ')}`);
  }
  if (transformed.aiError) {
    console.log(`OpenAI fallback reason: ${transformed.aiError}`);
  }
}

run().catch((error) => {
  console.error('Signal generation failed:', error);
  process.exit(1);
});
