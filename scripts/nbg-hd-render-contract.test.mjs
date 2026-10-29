import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const runtime = readFileSync('game/nbg-level1.js', 'utf8');
const route = readFileSync('games/nbg-london/index.html', 'utf8');
const css = readFileSync('game/game.css', 'utf8');
const manifest = JSON.parse(readFileSync('game/assets/asset-manifest.json', 'utf8'));
const animation = JSON.parse(readFileSync('game/assets/player/nbg-runner-animation-manifest.json', 'utf8'));

// Higher *backing bitmap* resolution: not doubled world units, sprite visual
// dimensions, camera zoom or collision geometry.
assert.match(runtime, /var WIDTH = 480;/);
assert.match(runtime, /var HEIGHT = 270;/);
assert.match(runtime, /var RENDER_SCALE = 2;/);
assert.match(route, /<canvas id="game" width="960" height="540"/);
assert.match(runtime, /canvas\.width !== WIDTH \* RENDER_SCALE/);
assert.match(runtime, /canvas\.height !== HEIGHT \* RENDER_SCALE/);
assert.match(runtime, /ctx\.setTransform\(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0\)/);
assert.match(runtime, /ctx\.imageSmoothingEnabled = true;/);
assert.match(runtime, /ctx\.imageSmoothingQuality = 'high';/);
assert.match(css, /canvas#game\s*\{\s*image-rendering:\s*auto;/);
assert.match(runtime, /get renderScale\(\) \{ return RENDER_SCALE; \}/);
assert.match(runtime, /get renderWidth\(\) \{ return canvas\.width; \}/);
assert.match(runtime, /get renderHeight\(\) \{ return canvas\.height; \}/);

// The renderer still draws the same logical 480x270 view, camera and world.
// Only a browser presentation test can prove visible size in actual CSS pixels.
assert.match(runtime, /var WORLD_WIDTH = 22000;/);
assert.match(runtime, /var FLOOR_Y = 214;/);
assert.match(runtime, /var MAX_SPEED = 2\.4;/);
assert.match(runtime, /var RUN_ACCEL = 0\.42;/);
assert.match(runtime, /var COURSE_LAYOUT_VERSION = 8;/);
assert.match(runtime, /var CAMERA_ZOOM_DEFAULT = 1\.25;/);
assert.match(runtime, /var CAMERA_ZOOM_LEVELS = \[1, 1\.25, 1\.5\];/);
assert.match(runtime, /var visibleWorldWidth = WIDTH \/ cameraZoom;/);
assert.match(runtime, /var x = Math\.round\(player\.x - cameraX\);/);
assert.match(runtime, /var drawWidth = frameMeta\.renderWidth;/);
assert.match(runtime, /var drawHeight = frameMeta\.renderHeight;/);
assert.match(runtime, /drawImageLayer\(images\.wall, 0\.58, 154, 88, '#2d2033'\);/);
assert.equal(manifest.world.width, 22000);
assert.equal(manifest.player.hitbox.width, 24);
assert.equal(manifest.player.hitbox.height, 34);
assert.ok(manifest.world.layers[2], 'canonical wall texture must still be supplied');
assert.ok(animation.animations.run.renderWidth > 0 &&
  animation.animations.run.renderHeight > 0,
  'sprite display sizes are still independent of their source frame pixels');

// No return of the rejected decorative graffiti system.
assert.equal(Object.hasOwn(manifest.world, 'wallGraffiti'), false);
assert.doesNotMatch(runtime, /configureWallGraffiti|drawWallGraffiti/);

// Source images are neither upscaled nor duplicated: replacing them with
// real high-resolution artwork later is a separate deliberate asset update.
assert.ok(!/new Image\(\)\.src\s*=\s*.*hd/i.test(runtime),
  'HD display pipeline must not invent a parallel asset collection');

// Future full-res crouch PNGs are accepted when the sheet metadata changes.
// Exercise the REAL flood fill with two different cell resolutions. Transparent
// outer matte must be removed without erasing coloured character pixels.
const start = runtime.indexOf('function prepareCrouchSheet(image, animation) {');
const end = runtime.indexOf('// The source flying-pig export', start);
assert.ok(start > 0 && end > start, 'crouch source must be metadata-driven');
const functionText = runtime.slice(start, end);
assert.match(runtime, /prepareCrouchSheet\(result\.image, animation\)/);
for (const frameSize of [8,16]) {
  const width = frameSize * 5, height = frameSize * 5;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    rgba[i] = 0; rgba[i + 1] = 255; rgba[i + 2] = 0; rgba[i + 3] = 255;
  }
  const sampleX = frameSize + Math.floor(frameSize / 2);
  const sampleY = frameSize + Math.floor(frameSize / 2);
  const sample = (sampleY * width + sampleX) * 4;
  rgba[sample] = 180; rgba[sample + 1] = 35; rgba[sample + 2] = 25;

  let output = null, originalImage = null;
  const document = {
    createElement() {
      return {
        width:0, height:0,
        getContext() {
          return {
            drawImage(image) { originalImage = image; },
            getImageData() { return { data: new Uint8ClampedArray(rgba) }; },
            putImageData(pixels) { output = pixels.data; },
          };
        },
      };
    },
  };
  const image = {naturalWidth:width,naturalHeight:height,src:'mock-crouch.png'};
  const animation = {columns:5,sourceFrameWidth:frameSize,
    sourceFrameHeight:frameSize,frameStart:5,frames:20};
  const prepared = runInNewContext(
    functionText + '\nprepareCrouchSheet(image, animation);',
    {image,animation,document,Uint8Array,Math,Number,Error}
  );
  assert.equal(prepared.width,width);
  assert.equal(prepared.height,height);
  assert.strictEqual(originalImage,image);
  assert.equal(output[3],0,'exterior matte must become transparent');
  assert.equal(output[sample + 3],255,'coloured character content must be retained');
  assert.equal(output[sample],180,'full-colour pixels must not be recoloured');
}

console.log('[PASS] NBG HD rendering: 960x540 output, unchanged v8 geometry, metadata-ready crouch art');
