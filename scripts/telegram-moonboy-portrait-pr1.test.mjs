import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  PORTRAIT_LAYER_ORDER, PORTRAIT_MAX_BYTES, PORTRAIT_SIZE,
  PORTRAIT_ASSET_ORIGIN, PORTRAIT_MANIFEST_URL,
  TELEGRAM_FEMALE_ONLY_TRAITS,
  chooseTelegramMoonboyTraits, loadHomepageMoonboyManifest,
  composeTelegramMoonboy
} from '../workers/moonboys-api/telegram/moonboy-portrait.js';

const original = JSON.parse(readFileSync(
  new URL('../data/avatar-builder-manifest.json', import.meta.url), 'utf8'));
const seed = 'bulletin:-1001234567890:2026-11-10:16';
const clone = () => structuredClone(original);

function imageResponse(bytes = 20, type = 'image/webp') {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Response(payload, {
    status: 200, headers: { 'content-type': type }
  });
}
function fakeImages({ outputSizes = [36_000], outputType = 'image/jpeg' } = {}) {
  const calls = [];
  let encodeCount = 0;
  const images = {
    input(stream) {
      assert.equal(typeof stream?.getReader, 'function');
      // Decode the actual WebP stream supplied to Images.input. The fake
      // fetcher writes a distinct marker byte into each source, so a test
      // cannot pass just because fetch order or draw counts look correct.
      const sourceId = new Response(stream).arrayBuffer()
        .then(buffer => new Uint8Array(buffer)[0]);
      calls.push(['input', sourceId]);
      return {
        sourceId,
        transform(opts) {
          calls.push(['transform', sourceId, opts]);
          return this;
        },
        draw(overlay, opts) {
          assert.ok(overlay?.sourceId, 'draw must consume an input handle');
          calls.push(['draw', sourceId, overlay.sourceId, opts]);
          return this;
        },
        async output(opts) {
          calls.push(['output', opts]);
          const size = outputSizes[Math.min(encodeCount++, outputSizes.length - 1)];
          return { response: () => imageResponse(size, outputType) };
        }
      };
    }
  };
  return { images, calls };
}
function fakeFetch(paths, options = {}) {
  return async (url, init) => {
    paths.push({ url, init });
    if (url === PORTRAIT_MANIFEST_URL) {
      return new Response(JSON.stringify(original), {
        headers: { 'content-type': 'application/json' }
      });
    }
    if (options.failUrl === url) return new Response('missing', { status: 404 });
    const bytes = options.largeLayer ? 850_001 : 32;
    const payload = new Uint8Array(bytes);
    payload[0] = paths.length; // 1..9: distinct layer identities
    return imageResponse(payload);
  };
}

test('homepage asset manifest remains the authoritative nine category catalog', () => {
  assert.deepEqual(original.categoryOrder, PORTRAIT_LAYER_ORDER);
  assert.deepEqual(original.categories.map(c => c.id), PORTRAIT_LAYER_ORDER);
  assert.equal(original.layerSize, 1000);
  assert.equal(original.traits.filter(t => t.kind !== 'animated').length, 912);
  assert.equal(original.traits.filter(t => t.kind === 'animated').length, 12);
  assert.equal(original.traits.filter(t => t.category === 'body' && t.layer).length, 1);
});

test('stable seed picks exactly one static, real builder image in original z-order', async () => {
  const first = await chooseTelegramMoonboyTraits(original, seed, webcrypto);
  const same = await chooseTelegramMoonboyTraits(original, seed, webcrypto);
  assert.deepEqual(first, same);
  assert.ok(Object.isFrozen(first.layers));
  assert.equal(first.size, 640);
  assert.deepEqual(first.layers.map(l => l.category), PORTRAIT_LAYER_ORDER);
  for (const layer of first.layers) {
    assert.ok(original.traits.some(t => t.id === layer.id &&
      t.category === layer.category && t.layer === layer.path &&
      t.kind !== 'animated'));
    assert.match(layer.path, /^\/img\/avatar-builder\/layers\/[a-z-]+\/[a-z0-9-]+\.webp$/);
  }
  const other = await chooseTelegramMoonboyTraits(original,
    'bulletin:-1001234567890:2026-11-10:20', webcrypto);
  assert.notDeepEqual(first.layers.map(l => l.id), other.layers.map(l => l.id));
});

test('supplied 67 female-only asset IDs resolve in the homepage manifest', () => {
  const counts = { clothes: 18, face: 12, hat: 32, 'left-arm': 1, 'right-arm': 4 };
  assert.deepEqual(Object.fromEntries(Object.entries(TELEGRAM_FEMALE_ONLY_TRAITS)
    .map(([category, ids]) => [category, ids.length])), counts);
  for (const [category, ids] of Object.entries(TELEGRAM_FEMALE_ONLY_TRAITS)) {
    for (const id of ids) {
      const trait = original.traits.find(trait => trait.id === id);
      assert.ok(trait, id + ' must exist in homepage catalogue');
      assert.equal(trait.category, category);
      assert.equal(trait.kind === 'animated', false);
    }
  }
});

test('gender choice is deterministic, roughly 50/50, and independent of trait counts', async () => {
  const genderCounts = { male: 0, female: 0 };
  for (let n = 0; n < 400; n++) {
    const currentSeed = 'tag-command:100:2026-11-13:' + n;
    const plan = await chooseTelegramMoonboyTraits(original, currentSeed, webcrypto);
    assert.ok(Object.isFrozen(plan.layers));
    assert.ok(['male', 'female'].includes(plan.avatarType));
    genderCounts[plan.avatarType]++;
    if (n < 8) {
      const repeated = await chooseTelegramMoonboyTraits(original, currentSeed, webcrypto);
      assert.deepEqual(repeated, plan);
    }
  }
  assert.ok(genderCounts.female >= 160 && genderCounts.female <= 240,
    'hash partition should remain balanced regardless of catalogue sizes');
});

test('female-only faces and hats never mix, and male PFPs exclude female-only variants', async () => {
  const femaleIds = Object.fromEntries(Object.entries(TELEGRAM_FEMALE_ONLY_TRAITS)
    .map(([category, ids]) => [category, new Set(ids)]));
  let seenMale = false;
  let seenFemale = false;
  for (let n = 0; n < 150; n++) {
    const plan = await chooseTelegramMoonboyTraits(original, 'group:42:pfp:' + n, webcrypto);
    const selected = Object.fromEntries(plan.layers.map(layer => [layer.category, layer.id]));
    if (plan.avatarType === 'female') {
      seenFemale = true;
      assert.ok(femaleIds.face.has(selected.face), 'female face must be in supplied female pool');
      assert.ok(femaleIds.hat.has(selected.hat), 'female hat must be in supplied female pool');
    } else {
      seenMale = true;
      for (const [category, ids] of Object.entries(femaleIds)) {
        assert.equal(ids.has(selected[category]), false, category + ' leaked female-only trait');
      }
    }
  }
  assert.ok(seenMale && seenFemale);
});

test('missing female face/hat pools fail closed, never silently use male versions', async () => {
  const changed = clone();
  const femaleFaces = new Set(TELEGRAM_FEMALE_ONLY_TRAITS.face);
  changed.traits = changed.traits.filter(trait => !femaleFaces.has(trait.id));
  let femaleSeed;
  for (let n = 0; n < 20; n++) {
    const candidate = 'missing:faces:' + n;
    const plan = await chooseTelegramMoonboyTraits(original, candidate, webcrypto);
    if (plan.avatarType === 'female') { femaleSeed = candidate; break; }
  }
  assert.ok(femaleSeed);
  await assert.rejects(chooseTelegramMoonboyTraits(changed, femaleSeed, webcrypto),
    /telegram_moonboy_missing_female_category_face/);
});

test('random selection never uses browser-canvas animated backgrounds', async () => {
  for (let i = 0; i < 25; i++) {
    const plan = await chooseTelegramMoonboyTraits(original,
      'message:100:2026-11-10:' + i, webcrypto);
    const background = original.traits.find(x => x.id === plan.layers[0].id);
    assert.ok(background?.layer?.endsWith('.webp'));
    assert.notEqual(background.kind, 'animated');
  }
});

test('manifest tampering and arbitrary source URLs fail before network image fetch', async () => {
  const c = clone();
  c.traits[0].layer = 'https://attacker.example/trait.webp';
  await assert.rejects(chooseTelegramMoonboyTraits(c, seed, webcrypto),
    /telegram_moonboy_unsafe_builder_asset_path/);
  const d = clone();
  d.categoryOrder.reverse();
  await assert.rejects(chooseTelegramMoonboyTraits(d, seed, webcrypto),
    /telegram_moonboy_invalid_builder_manifest/);
  const e = clone();
  e.traits.push({ ...e.traits[0] });
  await assert.rejects(chooseTelegramMoonboyTraits(e, seed, webcrypto),
    /telegram_moonboy_invalid_builder_trait/);
  await assert.rejects(chooseTelegramMoonboyTraits(original,
    'secret key copied with spaces', webcrypto), /telegram_moonboy_invalid_seed/);
});

test('no static image in a category fails closed instead of using a thumbnail', async () => {
  const changed = clone();
  changed.traits = changed.traits.filter(x =>
    x.category !== 'body' || x.kind === 'animated');
  await assert.rejects(chooseTelegramMoonboyTraits(changed, seed, webcrypto),
    /telegram_moonboy_missing_builder_category_body/);
});

test('manifest is loaded only from fixed homepage URL with a byte limit', async () => {
  const calls = [];
  const loaded = await loadHomepageMoonboyManifest(fakeFetch(calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PORTRAIT_MANIFEST_URL);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(loaded.traits.length, original.traits.length);
  await assert.rejects(loadHomepageMoonboyManifest(async () =>
    new Response(null, { status: 302, headers: { location: 'https://example.com/' } })),
  /telegram_moonboy_manifest_unavailable/);
  await assert.rejects(loadHomepageMoonboyManifest(async () =>
    new Response(new Uint8Array(600_001))), /telegram_moonboy_manifest_oversize/);
});

test('composer scales all nine layers and draws them in homepage order', async () => {
  const requests = [];
  const fake = fakeImages();
  const output = await composeTelegramMoonboy({
    images: fake.images, manifest: original, seed, cryptoImpl: webcrypto,
    fetchImpl: fakeFetch(requests)
  });
  assert.equal(requests.length, 9);
  const plan = await chooseTelegramMoonboyTraits(original, seed, webcrypto);
  assert.deepEqual(requests.map(x => x.url),
    plan.layers.map(x => PORTRAIT_ASSET_ORIGIN + x.path));
  assert.deepEqual(output.selected, plan.layers.map(x => x.id));
  assert.equal(output.mimeType, 'image/jpeg');
  assert.equal(output.width, PORTRAIT_SIZE);
  assert.equal(output.height, PORTRAIT_SIZE);
  assert.equal(output.byteSize, 36_000);
  assert.ok(output.byteSize <= PORTRAIT_MAX_BYTES);
  // Validate *which* input streams the binding used and the actual order
  // passed to Images.draw. Reversing the overlays must break this test.
  const inputs = fake.calls.filter(x => x[0] === 'input');
  assert.equal(inputs.length, 9);
  assert.deepEqual(await Promise.all(inputs.map(x => x[1])),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const overlays = fake.calls.filter(x => x[0] === 'draw');
  assert.equal(overlays.length, 8);
  assert.deepEqual(await Promise.all(overlays.map(x => x[1])),
    Array(8).fill(1), 'all overlays must use the background as the base');
  assert.deepEqual(await Promise.all(overlays.map(x => x[2])),
    [2, 3, 4, 5, 6, 7, 8, 9],
    'overlays must match builder bottom-to-top category order');
  for (const overlay of overlays) {
    assert.deepEqual(overlay[3], { left: 0, top: 0, composite: 'over' });
  }
  const transforms = fake.calls.filter(x => x[0] === 'transform');
  assert.equal(transforms.length, 1);
  assert.deepEqual(await Promise.all(transforms.map(x => x[1])), [1]);
  assert.deepEqual(transforms[0][2], {
    width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, fit: 'squeeze'
  });
  assert.equal(overlays.length + transforms.length, 9,
    'Cloudflare Images pipeline must stay below the ten-transform maximum');
  assert.deepEqual(fake.calls.filter(x => x[0] === 'output').map(x => x[1]),
    [{ format: 'image/jpeg', quality: 76 }]);
  assert.equal(requests.every(x => x.init.redirect === 'manual'), true);
});

test('oversized JPEG triggers lower-quality retry; final result is always bounded', async () => {
  const one = fakeImages({ outputSizes: [600_000, 125_000] });
  const result = await composeTelegramMoonboy({
    images: one.images, manifest: original, seed, cryptoImpl: webcrypto,
    fetchImpl: fakeFetch([])
  });
  assert.equal(result.byteSize, 125_000);
  assert.deepEqual(one.calls.filter(x => x[0] === 'output').map(x => x[1].quality),
    [76, 62]);
  const two = fakeImages({ outputSizes: [600_000] });
  await assert.rejects(composeTelegramMoonboy({
    images: two.images, manifest: original, seed, cryptoImpl: webcrypto,
    fetchImpl: fakeFetch([])
  }), /telegram_moonboy_output_exceeds_500kb/);
  assert.equal(two.calls.filter(x => x[0] === 'output').length, 3);
});

test('missing binding, failed asset, unsupported output or oversized layer never sends', async () => {
  await assert.rejects(composeTelegramMoonboy({
    manifest: original, seed, cryptoImpl: webcrypto, fetchImpl: fakeFetch([])
  }), /telegram_moonboy_images_binding_unavailable/);
  const plan = await chooseTelegramMoonboyTraits(original, seed, webcrypto);
  await assert.rejects(composeTelegramMoonboy({
    images: fakeImages().images, manifest: original, seed,
    cryptoImpl: webcrypto, fetchImpl: fakeFetch([], {
      failUrl: PORTRAIT_ASSET_ORIGIN + plan.layers[3].path
    })
  }), /telegram_moonboy_layer_unavailable/);
  await assert.rejects(composeTelegramMoonboy({
    images: fakeImages({ outputType: 'image/webp' }).images,
    manifest: original, seed, cryptoImpl: webcrypto,
    fetchImpl: fakeFetch([])
  }), /telegram_moonboy_invalid_output_format/);
  await assert.rejects(composeTelegramMoonboy({
    images: fakeImages().images, manifest: original, seed,
    cryptoImpl: webcrypto, fetchImpl: fakeFetch([], { largeLayer: true })
  }), /telegram_moonboy_layer_oversize/);
});

test('no Telegram sending, token transfers or mutation is enabled by the binding release', () => {
  const source = readFileSync(new URL(
    '../workers/moonboys-api/telegram/moonboy-portrait.js', import.meta.url), 'utf8');
  for (const forbidden of ['/sendPhoto', '/sendMessage', 'push_transaction',
    'env.DB.prepare(', 'signAndBroadcast(', 'fetchTelegram(']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  const wrangler = readFileSync(new URL(
    '../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /\[images\][\s\S]*?binding\s*=\s*"IMAGES"/,
    'post-merge release must provision the approved Images binding');
});
