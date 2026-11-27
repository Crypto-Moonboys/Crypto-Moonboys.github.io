import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildRuntimeImages, registerRuntimeImages } from './build-runtime-images.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-images-'));
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({
    version: 1,
    defaults: {
      lossyQuality: 86,
      minPsnr: 30,
      minSavingsPercent: 1,
      preserveAlpha: true,
      resizeKernel: 'lanczos3',
    },
    assets: [],
  }, null, 2)}\n`);
  await writeFile(path.join(root, 'lock.json'), `${JSON.stringify({
    version: 1,
    generatedBy: 'scripts/build-runtime-images.mjs',
    assets: {},
  }, null, 2)}\n`);
  return root;
}

function transparentSprite(width = 512, height = 256) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const active = (x % 128) > 18 && (x % 128) < 110 && (y % 128) > 14 && (y % 128) < 114;
      if (!active) continue;
      data[offset] = (x * 7) % 256;
      data[offset + 1] = (y * 11) % 256;
      data[offset + 2] = ((x + y) * 5) % 256;
      data[offset + 3] = 255;
    }
  }
  return { data, raw: { width, height, channels: 4 } };
}

test('builds and checks a visibly lossless transparent sprite derivative', async () => {
  const root = await fixtureRoot();
  const source = path.join(root, 'runner-master.png');
  const output = path.join(root, 'runner-runtime.webp');
  const sprite = transparentSprite();
  await sharp(sprite.data, { raw: sprite.raw }).png({ compressionLevel: 0 }).toFile(source);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'runner-master.png',
    output: 'runner-runtime.webp',
    mode: 'lossless',
    minSavingsPercent: 1,
    sprite: { columns: 4, rows: 2 },
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const built = await buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' });
  assert.equal(built.results.length, 1);
  assert.ok(built.results[0].outputBytes < built.results[0].sourceBytes);
  assert.equal(built.results[0].width, 512);
  assert.equal(built.results[0].height, 256);
  const [sourcePixels, outputPixels] = await Promise.all([
    sharp(source).flatten({ background: '#ffffff' }).raw().toBuffer(),
    sharp(output).flatten({ background: '#ffffff' }).raw().toBuffer(),
  ]);
  assert.deepEqual(outputPixels, sourcePixels);

  const checked = await buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json', check: true });
  assert.equal(checked.results.length, 1);

  const changed = transparentSprite();
  changed.data[0] = 255;
  changed.data[3] = 255;
  await sharp(changed.data, { raw: changed.raw }).png({ compressionLevel: 0 }).toFile(source);
  await assert.rejects(
    buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json', check: true }),
    /stale because runner-master\.png changed/u,
  );
});

test('resizes high-resolution art and enforces its declared quality floor', async () => {
  const root = await fixtureRoot();
  const width = 800;
  const height = 600;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      data[offset] = (x * 255 / width) | 0;
      data[offset + 1] = (y * 255 / height) | 0;
      data[offset + 2] = ((x + y) * 255 / (width + height)) | 0;
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path.join(root, 'hero-master.png'));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'hero-master.png',
    output: 'hero-runtime.webp',
    mode: 'lossy',
    quality: 86,
    width: 400,
    height: 300,
    minPsnr: 30,
    minSavingsPercent: 50,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const built = await buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' });
  assert.equal(built.results[0].width, 400);
  assert.equal(built.results[0].height, 300);
  assert.ok(built.results[0].psnr >= 30);
  assert.ok(built.results[0].savingsPercent >= 50);
  const metadata = await sharp(path.join(root, 'hero-runtime.webp')).metadata();
  assert.equal(metadata.format, 'webp');
});

test('registers conventionally named masters without guessing sprite geometry', async () => {
  const root = await fixtureRoot();
  const sprite = transparentSprite(256, 128);
  await sharp(sprite.data, { raw: sprite.raw }).png().toFile(path.join(root, 'Hero Sprite Sheet-master.png'));
  await sharp({ create: { width: 320, height: 180, channels: 3, background: '#6a385f' } })
    .jpeg({ quality: 100 })
    .toFile(path.join(root, 'Painting-master.jpg'));

  const additions = await registerRuntimeImages({
    root,
    manifestPath: 'manifest.json',
    paths: ['Hero Sprite Sheet-master.png', 'Painting-master.jpg'],
  });
  assert.equal(additions.length, 2);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const spriteEntry = manifest.assets.find(asset => asset.source.startsWith('Hero'));
  const paintingEntry = manifest.assets.find(asset => asset.source.startsWith('Painting'));
  assert.equal(spriteEntry.mode, 'lossless');
  assert.equal(spriteEntry.output, 'Hero Sprite Sheet-runtime.webp');
  assert.match(spriteEntry.note, /Declare sprite\.columns/u);
  assert.equal(paintingEntry.mode, 'lossy');
  assert.equal(paintingEntry.output, 'Painting-runtime.webp');
  assert.equal(paintingEntry.quality, 86);
});

test('rejects unsafe output paths and aspect-ratio changes', async () => {
  const root = await fixtureRoot();
  await sharp({ create: { width: 400, height: 200, channels: 4, background: '#993366ff' } })
    .png({ compressionLevel: 0 })
    .toFile(path.join(root, 'unsafe-master.png'));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'unsafe-master.png',
    output: 'unsafe-runtime.webp',
    mode: 'lossless',
    width: 200,
    height: 200,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' }),
    /changes the unsafe-master\.png aspect ratio/u,
  );

  manifest.assets[0].output = '../escaped-runtime.webp';
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' }),
    /must stay inside the repository/u,
  );
});

test('automatic workflow is narrow, owner-only and cannot write production branches', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/runtime-image-derivatives.yml'), 'utf8');
  assert.match(workflow, /^  push:\s*$/mu);
  assert.match(workflow, /^  workflow_dispatch:\s*$/mu);
  assert.match(workflow, /branches-ignore:\s*\n\s+- main\s*\n\s+- master/u);
  assert.match(workflow, /github\.actor == 'HODLKONG64'/u);
  assert.match(workflow, /github\.ref_name != 'main' && github\.ref_name != 'master'/u);
  assert.match(workflow, /contents: write/u);
  assert.doesNotMatch(workflow, /pull_request_target|\$\{\{\s*secrets\./u);
  assert.match(workflow, /\*\*\/\*-master\.png/u);
  assert.match(workflow, /npm run images:runtime:check/u);
});

test('failed quality verification leaves an existing runtime file untouched', async () => {
  const root = await fixtureRoot();
  const source = path.join(root, 'protected-master.png');
  const output = path.join(root, 'protected-runtime.webp');
  const width = 480;
  const height = 320;
  const data = Buffer.alloc(width * height * 3);
  for (let index = 0; index < data.length; index++) data[index] = (index * 37) % 256;
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(source);
  await sharp({ create: { width, height, channels: 3, background: '#124466' } }).webp({ lossless: true }).toFile(output);
  const originalRuntime = await readFile(output);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'protected-master.png',
    output: 'protected-runtime.webp',
    mode: 'lossy',
    quality: 10,
    minPsnr: 90,
    minSavingsPercent: 0,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' }),
    /PSNR .* is below 90/u,
  );
  assert.deepEqual(await readFile(output), originalRuntime);
});

test('accepts an omitted WebP alpha channel when an RGBA master is fully opaque', async () => {
  const root = await fixtureRoot();
  const width = 256;
  const height = 256;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = (offset * 3) % 256;
    data[offset + 1] = (offset * 5) % 256;
    data[offset + 2] = (offset * 7) % 256;
    data[offset + 3] = 255;
  }
  const source = path.join(root, 'opaque-master.png');
  const output = path.join(root, 'opaque-runtime.webp');
  await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toFile(source);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'opaque-master.png',
    output: 'opaque-runtime.webp',
    mode: 'lossless',
    minSavingsPercent: 0,
    preserveAlpha: true,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const built = await buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' });
  assert.equal(built.results.length, 1);
  const [sourcePixels, outputPixels] = await Promise.all([
    sharp(source).flatten({ background: '#000000' }).raw().toBuffer(),
    sharp(output).flatten({ background: '#000000' }).raw().toBuffer(),
  ]);
  assert.deepEqual(outputPixels, sourcePixels);
});

test('rejects output directories that resolve outside the repository through symlinks', async () => {
  const root = await fixtureRoot();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'runtime-images-outside-'));
  await symlink(outside, path.join(root, 'linked'), 'dir');
  await sharp({ create: { width: 320, height: 180, channels: 3, background: '#551177' } })
    .png({ compressionLevel: 0 })
    .toFile(path.join(root, 'safe-master.png'));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'safe-master.png',
    output: 'linked/escaped-runtime.webp',
    mode: 'lossless',
    minSavingsPercent: 0,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' }),
    /resolves outside the repository/u,
  );
  await assert.rejects(access(path.join(outside, 'escaped-runtime.webp')), { code: 'ENOENT' });
});

test('applies JPEG EXIF orientation before calculating runtime dimensions', async () => {
  const root = await fixtureRoot();
  const source = path.join(root, 'portrait-master.jpg');
  const width = 160;
  const height = 80;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      data[offset] = x < width / 2 ? 240 : 20;
      data[offset + 1] = y < height / 2 ? 180 : 35;
      data[offset + 2] = (x + y) % 256;
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100 })
    .withMetadata({ orientation: 6 })
    .toFile(source);
  const sourceMetadata = await sharp(source).metadata();
  assert.equal(sourceMetadata.orientation, 6);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.assets.push({
    source: 'portrait-master.jpg',
    output: 'portrait-runtime.webp',
    mode: 'lossy',
    quality: 86,
    minPsnr: 30,
    minSavingsPercent: 0,
  });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const built = await buildRuntimeImages({ root, manifestPath: 'manifest.json', lockPath: 'lock.json' });
  assert.equal(built.results[0].width, 80);
  assert.equal(built.results[0].height, 160);
  const outputMetadata = await sharp(path.join(root, 'portrait-runtime.webp')).metadata();
  assert.equal(outputMetadata.width, 80);
  assert.equal(outputMetadata.height, 160);
  assert.equal(outputMetadata.orientation, undefined);
});
