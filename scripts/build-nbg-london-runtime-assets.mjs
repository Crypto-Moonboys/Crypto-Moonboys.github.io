import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const absolute = relativePath => path.join(root, relativePath);
const created = [];

async function encode(source, output, transform, webp) {
  const sourcePath = absolute(source);
  const outputPath = absolute(output);
  let pipeline = sharp(sourcePath, { limitInputPixels: false });
  if (transform) pipeline = transform(pipeline);
  await pipeline.webp(webp).toFile(outputPath);
  const [sourceStat, outputStat, metadata] = await Promise.all([
    fs.stat(sourcePath), fs.stat(outputPath), sharp(outputPath).metadata()
  ]);
  created.push({ source, output, sourceBytes: sourceStat.size,
    outputBytes: outputStat.size, width: metadata.width, height: metadata.height });
}

async function encodeRaw(source, output, mutate, crop) {
  const sourcePath = absolute(source);
  const metadata = await sharp(sourcePath, { limitInputPixels: false }).metadata();
  const { data, info } = await sharp(sourcePath, { limitInputPixels: false })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`Expected RGBA source: ${source}`);
  mutate(data, info.width, info.height);
  let pipeline = sharp(data, { raw: info });
  if (crop) pipeline = pipeline.extract(crop);
  await pipeline.webp({ lossless: true, effort: 6 }).toFile(absolute(output));
  const [sourceStat, outputStat, outputMetadata] = await Promise.all([
    fs.stat(sourcePath), fs.stat(absolute(output)), sharp(absolute(output)).metadata()
  ]);
  created.push({ source, output, sourceBytes: sourceStat.size,
    outputBytes: outputStat.size, width: outputMetadata.width, height: outputMetadata.height });
}

function removeSprayMatte(rgba) {
  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const matte = green > red + 12 && green > blue + 8 &&
      red >= 45 && red <= 115 && green >= 75 && green <= 155 &&
      blue >= 40 && blue <= 120;
    const pageWhite = red >= 250 && green >= 250 && blue >= 250;
    if (matte || pageWhite) rgba[index + 3] = 0;
  }
}

function removeCrouchMatte(rgba, width, height) {
  const columns = 5;
  const frameWidth = 256;
  const frameHeight = 256;
  const rows = 5;
  if (width !== columns * frameWidth || height !== rows * frameHeight)
    throw new Error(`Unexpected crouch sheet dimensions: ${width}x${height}`);
  const matte = [rgba[0], rgba[1], rgba[2]];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const left = col * frameWidth;
      const top = row * frameHeight;
      const seen = new Uint8Array(frameWidth * frameHeight);
      const stack = [];
      for (let x = 0; x < frameWidth; x += 1)
        stack.push(x, (frameHeight - 1) * frameWidth + x);
      for (let y = 0; y < frameHeight; y += 1)
        stack.push(y * frameWidth, y * frameWidth + frameWidth - 1);
      while (stack.length) {
        const local = stack.pop();
        if (seen[local]) continue;
        seen[local] = 1;
        const localX = local % frameWidth;
        const localY = Math.floor(local / frameWidth);
        const index = ((top + localY) * width + left + localX) * 4;
        if (rgba[index] !== matte[0] || rgba[index + 1] !== matte[1] ||
            rgba[index + 2] !== matte[2]) continue;
        rgba[index + 3] = 0;
        if (localX > 0) stack.push(local - 1);
        if (localX < frameWidth - 1) stack.push(local + 1);
        if (localY > 0) stack.push(local - frameWidth);
        if (localY < frameHeight - 1) stack.push(local + frameWidth);
      }
    }
  }
}

await encode('img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png',
  'img/CRYPTO-MOONBOYS-BITCOIN-LOGO-runtime.webp',
  image => image.resize(64, 64, { fit: 'fill', kernel: 'lanczos3' }),
  { lossless: true, effort: 6 });
await encode('game/assets/world/nbg-classic/clouds.jpg',
  'game/assets/world/nbg-classic/clouds-runtime.webp', null,
  { quality: 95, effort: 6 });
await encode('game/assets/world/nbg-classic/LONDON BACKGROUND1.png',
  'game/assets/world/nbg-classic/LONDON BACKGROUND1-runtime.webp', null,
  { lossless: true, effort: 6 });

const simplePlayerSheets = [
  ['game/assets/player/animations/idle.png', 'game/assets/player/animations/idle-runtime.webp'],
  ['game/assets/player/animations/run.png', 'game/assets/player/animations/run-runtime.webp'],
  ['game/assets/player/animations/jump.png', 'game/assets/player/animations/jump-runtime.webp'],
  ['game/assets/player/animations/NBG Runner Final-backflip.png',
    'game/assets/player/animations/NBG Runner Final-backflip-runtime.webp'],
  ['game/assets/player/animations/fall.png', 'game/assets/player/animations/fall-runtime.webp'],
  ['game/assets/player/animations/hurt.png', 'game/assets/player/animations/hurt-runtime.webp'],
  ['game/assets/player/animations/victory.png', 'game/assets/player/animations/victory-runtime.webp']
];
for (const [source, output] of simplePlayerSheets)
  await encode(source, output, null, { lossless: true, effort: 6 });

await encodeRaw('game/assets/player/NBG Runner Final-spray.png',
  'game/assets/player/NBG Runner Final-spray-prepared-runtime.webp', removeSprayMatte);
for (const [source, output] of [
  ['game/assets/player/animations/NBG Runner Final-crouchr.png',
    'game/assets/player/animations/NBG Runner Final-crouchr-prepared-runtime.webp'],
  ['game/assets/player/animations/NBG Runner Final-sneaking_left.png',
    'game/assets/player/animations/NBG Runner Final-sneaking_left-prepared-runtime.webp']
]) {
  await encodeRaw(source, output, removeCrouchMatte,
    { left: 0, top: 256, width: 1280, height: 1024 });
}

for (const [source, output] of [
  ['game/assets/enemies/BRATTY1-asm_dagger_blade_flurry.png',
    'game/assets/enemies/BRATTY1-asm_dagger_blade_flurry-runtime.webp'],
  ['game/assets/enemies/BRATTY1-asm_dagger_viper_pounce.png',
    'game/assets/enemies/BRATTY1-asm_dagger_viper_pounce-runtime.webp']
]) {
  await encode(source, output,
    image => image.resize(1280, 1280, { fit: 'fill', kernel: 'lanczos3' }),
    { lossless: true, effort: 6 });
}

// These 5x5 sheets were authored far above their largest possible draw on
// the fixed 960x540 backing canvas. Keep at least one source pixel per final
// physical canvas pixel, use maximum WebP colour quality and preserve alpha.
for (const [source, output, size] of [
  ['game/assets/objects/2300-spritesheet.png',
    'game/assets/objects/2300-spritesheet-runtime.webp', 640],
  ['game/assets/enemies/BRATTY1-walk.png',
    'game/assets/enemies/BRATTY1-walk-runtime.webp', 640],
  ['game/assets/enemies/bX4VuQWSc3xcqQaY7FQFP3-spritesheet.png',
    'game/assets/enemies/bX4VuQWSc3xcqQaY7FQFP3-spritesheet-runtime.webp', 640],
  ['game/assets/enemies/dds-dss.png', 'game/assets/enemies/dds-dss-runtime.webp', 640],
  ['game/assets/enemies/fgg-ggf.png', 'game/assets/enemies/fgg-ggf-runtime.webp', 640],
  ['game/assets/enemies/ggdf-walk.png', 'game/assets/enemies/ggdf-walk-runtime.webp', 640],
  ['game/assets/enemies/ggdf-kick.png', 'game/assets/enemies/ggdf-kick-runtime.webp', 640],
  ['game/assets/enemies/ggdf-punch.png', 'game/assets/enemies/ggdf-punch-runtime.webp', 640],
  ['game/assets/enemies/bb8-walk.png', 'game/assets/enemies/bb8-walk-runtime.webp', 800],
  ['game/assets/enemies/bb8-kick.png', 'game/assets/enemies/bb8-kick-runtime.webp', 800],
  ['game/assets/enemies/bb8-hurt.png', 'game/assets/enemies/bb8-hurt-runtime.webp', 800]
]) {
  await encode(source, output,
    image => image.resize(size, size, { fit: 'fill', kernel: 'lanczos3' }),
    { quality: 100, alphaQuality: 100, effort: 6 });
}

for (const asset of created) {
  const reduction = (100 * (1 - asset.outputBytes / asset.sourceBytes)).toFixed(1);
  console.log(`${asset.output} ${asset.width}x${asset.height} ` +
    `${asset.outputBytes} bytes (${reduction}% versus master)`);
}
