// PR4 — bounded edge cache for deterministic Moonboy composites and confirmed
// Telegram file_ids. Uses the Workers Cache API only; no KV/D1 migration or
// billable binding is introduced. Cache absence/failure is always non-fatal.
import { TELEGRAM_PHOTO_MAX_BYTES } from './moonboy-photo-transport.js';

const CACHE_VERSION = 'v1';
const CACHE_ORIGIN = 'https://telegram-moonboy-cache.invalid/';
const FILE_ID = /^[A-Za-z0-9_-]{20,256}$/;
const SEED = /^[A-Za-z0-9_.:|/-]{1,200}$/;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function cacheRequest(kind, seed) {
  if (!SEED.test(String(seed || ''))) return null;
  return new Request(CACHE_ORIGIN + CACHE_VERSION + '/' + kind + '/' +
    encodeURIComponent(seed), { method: 'GET' });
}

function usable(cache) {
  return !!cache && typeof cache.match === 'function' &&
    typeof cache.put === 'function';
}

export function resolveMoonboyMediaCache(cacheImpl = undefined) {
  if (usable(cacheImpl)) return cacheImpl;
  const candidate = globalThis.caches?.default;
  return usable(candidate) ? candidate : null;
}

export async function readMoonboyMediaCache(cacheImpl, seed) {
  const cache = resolveMoonboyMediaCache(cacheImpl);
  if (!cache) return { hit: false, source: 'none' };
  const fileRequest = cacheRequest('telegram-file', seed);
  const imageRequest = cacheRequest('jpeg', seed);
  if (!fileRequest || !imageRequest) return { hit: false, source: 'invalid_seed' };
  try {
    const fileResponse = await cache.match(fileRequest);
    if (fileResponse?.ok) {
      const body = await fileResponse.json().catch(() => null);
      if (body?.version === CACHE_VERSION && FILE_ID.test(String(body.file_id || ''))) {
        return { hit: true, source: 'telegram_file_id', telegramFileId: body.file_id };
      }
    }
    const imageResponse = await cache.match(imageRequest);
    if (imageResponse?.ok &&
        /^image\/jpeg(?:;|$)/i.test(imageResponse.headers.get('content-type') || '')) {
      const declared = Number(imageResponse.headers.get('content-length') || 0);
      if (declared > TELEGRAM_PHOTO_MAX_BYTES) return { hit: false, source: 'oversize' };
      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      if (bytes.byteLength > 0 && bytes.byteLength <= TELEGRAM_PHOTO_MAX_BYTES) {
        return {
          hit: true, source: 'jpeg', portrait: {
            bytes, mimeType: 'image/jpeg', width: 640, height: 640
          }
        };
      }
    }
  } catch {
    return { hit: false, source: 'cache_error' };
  }
  return { hit: false, source: 'miss' };
}

export async function cacheMoonboyPortrait(cacheImpl, seed, portrait) {
  const cache = resolveMoonboyMediaCache(cacheImpl);
  const request = cacheRequest('jpeg', seed);
  if (!cache || !request || portrait?.mimeType !== 'image/jpeg' ||
      !(portrait.bytes instanceof Uint8Array) || portrait.width !== 640 ||
      portrait.height !== 640 || portrait.bytes.byteLength === 0 ||
      portrait.bytes.byteLength > TELEGRAM_PHOTO_MAX_BYTES) return false;
  try {
    await cache.put(request, new Response(portrait.bytes, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(portrait.bytes.byteLength),
        'cache-control': 'public, max-age=' + MAX_AGE_SECONDS,
        'x-moonboy-cache-version': CACHE_VERSION
      }
    }));
    return true;
  } catch {
    return false;
  }
}

export async function cacheMoonboyTelegramFileId(cacheImpl, seed, fileId) {
  const cache = resolveMoonboyMediaCache(cacheImpl);
  const request = cacheRequest('telegram-file', seed);
  if (!cache || !request || !FILE_ID.test(String(fileId || ''))) return false;
  try {
    await cache.put(request, new Response(JSON.stringify({
      version: CACHE_VERSION, file_id: String(fileId)
    }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=' + MAX_AGE_SECONDS
      }
    }));
    return true;
  } catch {
    return false;
  }
}

export const MOONBOY_MEDIA_CACHE_VERSION = CACHE_VERSION;
