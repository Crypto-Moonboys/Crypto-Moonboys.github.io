import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../moonpet-pixel-style-lab.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/moonpet-pixel-style-lab.js', import.meta.url), 'utf8');

assert.match(html, /moonpet-style-canvas/);
assert.match(html, /\/js\/moonpet-pixel-style-lab\.js\?v=20260814-pixel-style-lab/);
assert.match(html + client, /image-rendering:\s*pixelated/);
assert.match(client, /function drawFineMascot/);
assert.match(client, /function drawGraffitiWall/);
assert.match(client, /function drawSkyline/);
assert.match(client, /getContext\('2d', \{ alpha: false \}\)/);
assert.doesNotMatch(html.replace(/favicon\.png/g, '') + client, /\.(?:jpe?g|png|gif|webp|svg)(?:[?#"'])/i);
assert.doesNotMatch(client, /new Image\s*\(/);
assert.doesNotMatch(client, /drawImage\s*\(/);
assert.match(client, /fillRect/);
