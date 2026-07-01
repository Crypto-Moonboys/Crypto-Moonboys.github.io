import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const FEED_REGISTRY_PATH = path.join(ROOT, 'data', 'feed-registry.json');
export const FEED_STATUS_PATH = path.join(ROOT, 'data', 'feed-status.json');
export const DEFAULT_SITE_FEED_BASE_URL = process.env.SITE_FEED_BASE_URL || 'https://cryptomoonboys.com';
export const DEFAULT_FEED_FETCH_TIMEOUT_MS = Number(process.env.SITE_FEED_FETCH_TIMEOUT_MS || 15000);
export const DEFAULT_FEED_RETRY_DELAY_MS = Number(process.env.SITE_FEED_RETRY_DELAY_MS || 250);

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function resolveRoot(relativePath) {
  return path.join(ROOT, relativePath);
}

export function loadRegistry() {
  const registry = readJson(FEED_REGISTRY_PATH);
  if (!registry || !Array.isArray(registry.feeds)) {
    throw new Error('data/feed-registry.json must contain a feeds array.');
  }
  return registry;
}

export function findFeed(feedId) {
  const registry = loadRegistry();
  const feed = registry.feeds.find((entry) => entry.feed_id === feedId);
  if (!feed) throw new Error(`Feed not found in registry: ${feedId}`);
  return feed;
}

export function endpointUrl(endpoint, baseUrl = DEFAULT_SITE_FEED_BASE_URL) {
  if (!endpoint) throw new Error('Missing endpoint URL.');
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return new URL(endpoint, baseUrl).toString();
}

export async function fetchJson(endpoint, options = {}) {
  const url = endpointUrl(endpoint, options.baseUrl);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_FEED_FETCH_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Feed fetch timeout after ${timeoutMs}ms`)), timeoutMs);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: options.signal || controller.signal,
  }).finally(() => clearTimeout(timer));
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  return response.json();
}

export function isTransientFeedError(error) {
  const message = error?.message || String(error || '');
  return /timeout|abort|HTTP\s+(?:408|429|500|502|503|504)\b/i.test(message);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export async function safeFetchJson(endpoint, options = {}) {
  const checkedAt = new Date().toISOString();
  const sourceKey = options.source_key || options.sourceKey || 'source';
  const sourceUrl = endpointUrl(endpoint, options.baseUrl);
  const retries = Math.max(0, Number(options.retries ?? 1));
  const retryDelayMs = Number(options.retryDelayMs ?? DEFAULT_FEED_RETRY_DELAY_MS);
  const retryBackoff = Number(options.retryBackoff ?? 2);
  const fetcher = options.fetchJson || fetchJson;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const payload = await fetcher(endpoint, {
        baseUrl: options.baseUrl,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        sourceKey,
        source_key: sourceKey,
        attempt,
      });
      return {
        ok: true,
        stale: false,
        source_key: sourceKey,
        source_url: sourceUrl,
        payload,
        error: null,
        used_previous: false,
        attempts: attempt + 1,
        checked_at: checkedAt,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientFeedError(error)) break;
      const backoffMs = retryDelayMs * (retryBackoff ** attempt);
      await delay(backoffMs);
    }
  }

  const previous = options.previousPath ? readPrevious(options.previousPath) : null;
  const usedPrevious = Boolean(previous && options.allowStale !== false);
  return {
    ok: false,
    stale: usedPrevious,
    source_key: sourceKey,
    source_url: sourceUrl,
    payload: usedPrevious ? previous : null,
    error: lastError?.message || String(lastError || 'Feed fetch failed'),
    used_previous: usedPrevious,
    attempts: retries + 1,
    checked_at: checkedAt,
  };
}

export function readPrevious(relativePath, fallback = null) {
  return readJson(resolveRoot(relativePath), fallback);
}

export function preserveOrWrite(relativePath, value) {
  if (value == null) return readPrevious(relativePath);
  writeJson(resolveRoot(relativePath), value);
  return value;
}

export function createFeedStatus(feed, partial = {}) {
  const now = partial.checked_at || new Date().toISOString();
  const sourceUpdatedAt = partial.source_updated_at || null;
  const lastSuccessfulCheck = partial.last_successful_check || (['ok', 'degraded'].includes(partial.status) ? now : null);
  const sourceAgeMinutes = sourceUpdatedAt && Number.isFinite(Date.parse(sourceUpdatedAt))
    ? Math.max(0, Math.round((Date.now() - Date.parse(sourceUpdatedAt)) / 60000))
    : null;
  const staleAfterHours = Number(feed.stale_after_hours || 24);
  const stale = partial.stale ?? (
    partial.status === 'error'
    || (sourceAgeMinutes != null && sourceAgeMinutes > staleAfterHours * 60)
  );
  return {
    feed_id: feed.feed_id,
    feed_mode: feed.feed_mode || 'scheduled_snapshot_primary',
    page_paths: feed.page_paths || [],
    output_files: feed.output_files || [],
    status: partial.status || (stale ? 'stale' : 'ok'),
    stale,
    stale_after_hours: staleAfterHours,
    checked_at: now,
    last_successful_check: lastSuccessfulCheck,
    last_successful_update: partial.last_successful_update || sourceUpdatedAt || lastSuccessfulCheck,
    source_updated_at: sourceUpdatedAt,
    source_age_minutes: sourceAgeMinutes,
    last_error: partial.last_error || null,
    fallback_behavior: feed.fallback_behavior || 'preserve previous data',
    analytics_status: partial.analytics_status || null,
    endpoint_status: partial.endpoint_status || {},
    notes: partial.notes || [],
  };
}

export function writeFeedStatus(feed, status) {
  const statusPath = resolveRoot(`data/${feed.feed_id}/sync-status.json`);
  writeJson(statusPath, status);
  return status;
}

export function loadAllFeedStatus() {
  return readJson(FEED_STATUS_PATH, { generated_at: null, feeds: {} });
}

export function writeAllFeedStatus(statuses) {
  const value = {
    generated_at: new Date().toISOString(),
    feeds: Object.fromEntries(statuses.map((status) => [status.feed_id, status])),
  };
  writeJson(FEED_STATUS_PATH, value);
  return value;
}

export function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  return {
    generated_at: data.generated_at || payload.generated_at || null,
    updated_at: data.updated_at || payload.updated_at || null,
    source: data.source || payload.source || null,
    token_count: Array.isArray(data.tokens) ? data.tokens.length : null,
    pair_count: Array.isArray(data.pairs) ? data.pairs.length : null,
  };
}

export function sourceUpdatedAt(payload) {
  const summary = summarizePayload(payload);
  return summary.updated_at || summary.generated_at || null;
}
