// Telegram Moonboy portrait PR1: an unused, opt-in composition foundation.
// Cloudflare Workers Images binding is required by the caller (not provisioned
// by this PR). No Telegram request, D1 write, signer or scheduled task here.
// The homepage's data/avatar-builder-manifest.json is the ONLY trait catalogue.

export const PORTRAIT_LAYER_ORDER = Object.freeze([
  'background', 'body', 'tattoos', 'clothes', 'chains', 'face',
  'hat', 'left-arm', 'right-arm'
]);
export const PORTRAIT_MANIFEST_URL =
  'https://cryptomoonboys.com/data/avatar-builder-manifest.json';
export const PORTRAIT_ASSET_ORIGIN = 'https://cryptomoonboys.com';
export const PORTRAIT_SIZE = 640;
export const PORTRAIT_MAX_BYTES = 500_000;
const MAX_MANIFEST_BYTES = 600_000;
const MAX_LAYER_BYTES = 850_000;
const MAX_TRAITS = 2_000;
const SEED_PATTERN = /^[A-Za-z0-9_.:|/-]{1,200}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const decoder = new TextDecoder('utf-8', { fatal: true });

const fail = reason => { throw new Error('telegram_moonboy_' + reason); };

// Read response streams with a hard cap, even if Content-Length is absent or
// untrusted. Never buffer an arbitrarily large manifest, layer or JPEG.
async function boundedBytes(response, limit, label) {
  if (!response || response.ok !== true || !response.body?.getReader) {
    fail(label + '_unavailable');
  }
  const declared = response.headers?.get?.('content-length');
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > limit)) {
    fail(label + '_oversize');
  }
  const reader = response.body.getReader();
  const pieces = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail(label + '_invalid_stream');
      total += value.byteLength;
      if (total > limit) fail(label + '_oversize');
      pieces.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* ignore cleanup error */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!total) fail(label + '_empty');
  const data = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) { data.set(piece, offset); offset += piece.length; }
  return data;
}

function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || manifest.layerSize !== 1000 ||
      !Array.isArray(manifest.categoryOrder) ||
      manifest.categoryOrder.length !== PORTRAIT_LAYER_ORDER.length ||
      !PORTRAIT_LAYER_ORDER.every((id, index) => manifest.categoryOrder[index] === id) ||
      !Array.isArray(manifest.categories) ||
      manifest.categories.length !== PORTRAIT_LAYER_ORDER.length ||
      !Array.isArray(manifest.traits) ||
      manifest.traits.length < 9 || manifest.traits.length > MAX_TRAITS) {
    fail('invalid_builder_manifest');
  }
  for (let index = 0; index < PORTRAIT_LAYER_ORDER.length; index++) {
    const category = manifest.categories[index];
    if (category?.id !== PORTRAIT_LAYER_ORDER[index] ||
        category.order !== index) fail('invalid_builder_categories');
  }
  const entries = new Map(PORTRAIT_LAYER_ORDER.map(id => [id, []]));
  const seen = new Set();
  for (const trait of manifest.traits) {
    const category = trait?.category;
    if (!entries.has(category) || typeof trait.id !== 'string' ||
        !ID_PATTERN.test(trait.id) || seen.has(trait.id)) {
      fail('invalid_builder_trait');
    }
    seen.add(trait.id);
    // Browser canvas-only backgrounds have no still layer URL. PR1 must
    // neither fetch their thumbnail nor claim an equivalent animated frame.
    if (trait.kind === 'animated') {
      if (category !== 'background' || trait.layer !== undefined) {
        fail('invalid_animated_trait');
      }
      continue;
    }
    if (trait.kind !== undefined && trait.kind !== 'static') fail('invalid_builder_trait');
    const expected = '/img/avatar-builder/layers/' +
      category + '/' + trait.id + '.webp';
    if (trait.layer !== expected) fail('unsafe_builder_asset_path');
    entries.get(category).push({ id: trait.id, category, path: expected });
  }
  for (const category of PORTRAIT_LAYER_ORDER) {
    if (!entries.get(category)?.length) fail('missing_builder_category_' + category);
  }
  return entries;
}

// A stable logical-message seed makes retries reproducible. Each category is
// independently hashed, and each selection is from the live homepage catalogue.
export async function chooseTelegramMoonboyTraits(manifest, seed, cryptoImpl = globalThis.crypto) {
  if (typeof seed !== 'string' || !SEED_PATTERN.test(seed)) fail('invalid_seed');
  if (!cryptoImpl?.subtle?.digest) fail('crypto_unavailable');
  const choices = validateManifest(manifest);
  const layers = [];
  for (const category of PORTRAIT_LAYER_ORDER) {
    const data = new TextEncoder().encode(
      'telegram-moonboy:v1|' + manifest.version + '|' + category + '|' + seed
    );
    const hash = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', data));
    const number = new DataView(hash.buffer, hash.byteOffset, hash.byteLength)
      .getUint32(0, false);
    const pool = choices.get(category);
    const picked = pool[number % pool.length];
    layers.push(Object.freeze({ ...picked }));
  }
  return Object.freeze({
    manifestVersion: manifest.version,
    size: PORTRAIT_SIZE,
    layers: Object.freeze(layers)
  });
}

export async function loadHomepageMoonboyManifest(fetchImpl = fetch) {
  const response = await fetchImpl(PORTRAIT_MANIFEST_URL, {
    method: 'GET', redirect: 'error',
    headers: { Accept: 'application/json' }
  });
  const bytes = await boundedBytes(response, MAX_MANIFEST_BYTES, 'manifest');
  let parsed;
  try { parsed = JSON.parse(decoder.decode(bytes)); }
  catch { fail('manifest_invalid_json'); }
  validateManifest(parsed);
  return parsed;
}

function blobStream(bytes) {
  return new Blob([bytes], { type: 'image/webp' }).stream();
}

// Runtime rendering via the Cloudflare Images binding; no native Sharp,
// browser canvas, Pages image generator or change to Telegram transports.
// Source URLs are constructed solely from validated builder paths.
export async function composeTelegramMoonboy({
  images, manifest, seed, fetchImpl = fetch, cryptoImpl = globalThis.crypto
} = {}) {
  if (!images?.input) fail('images_binding_unavailable');
  const plan = await chooseTelegramMoonboyTraits(manifest, seed, cryptoImpl);
  const layers = await Promise.all(plan.layers.map(async layer => {
    const response = await fetchImpl(PORTRAIT_ASSET_ORIGIN + layer.path, {
      method: 'GET', redirect: 'error',
      headers: { Accept: 'image/webp' }
    });
    const contentType = response?.headers?.get?.('content-type') || '';
    if (!/^image\/webp(?:;|$)/i.test(contentType)) fail('invalid_layer_format');
    return boundedBytes(response, MAX_LAYER_BYTES, 'layer');
  }));
  // Cloudflare Images composites in draw order, and overlay dimensions match
  // the homepage's 1000x1000 layers scaled together to the same 640px square.
  // Retry at progressively smaller JPEG quality only if output > 500 KB.
  for (const quality of [76, 62, 48]) {
    let transform = images.input(blobStream(layers[0]))
      .transform({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, fit: 'fill' });
    for (let i = 1; i < layers.length; i++) {
      transform = transform.draw(
        images.input(blobStream(layers[i]))
          .transform({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, fit: 'fill' }),
        { left: 0, top: 0, composite: 'over' }
      );
    }
    const output = await transform.output({ format: 'image/jpeg', quality });
    const response = output.response();
    if (!/^image\/jpeg(?:;|$)/i.test(response.headers?.get?.('content-type') || '')) {
      fail('invalid_output_format');
    }
    const imageBytes = await boundedBytes(response, 1_000_000, 'output');
    if (imageBytes.length <= PORTRAIT_MAX_BYTES) {
      return Object.freeze({
        bytes: imageBytes,
        mimeType: 'image/jpeg',
        width: PORTRAIT_SIZE,
        height: PORTRAIT_SIZE,
        byteSize: imageBytes.byteLength,
        selected: Object.freeze(plan.layers.map(l => l.id)),
        manifestVersion: plan.manifestVersion
      });
    }
  }
  fail('output_exceeds_500kb');
}
