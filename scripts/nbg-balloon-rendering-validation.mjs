import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Real runtime canvas evidence; no replacement animation or mocked renderer.
const root = process.cwd();
const output = path.resolve(process.env.NBG_BALLOON_OUTPUT || 'output/nbg-balloon');
await fs.mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  let file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executablePath;
for (const file of candidates) { try { await fs.access(file); executablePath = file; break; } catch {} }
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
try {
  for (const mode of [
    { name: 'desktop', options: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]) {
    const page = await browser.newPage(mode.options);
    page.on('pageerror', error => console.error(mode.name, error.message));
    page.on('response', response => { if (response.status() >= 400) console.error(response.status(), response.url()); });
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin + '/games/nbg-london/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.NBGLevel1State?.assetsLoaded);
    await page.clock.pauseAt(Date.now() + 100);
    const alpha = await page.evaluate(async () => {
      const result = {};
      for (const key of ['balloonWalk', 'balloonRelease']) {
        const original = new Image();
        original.src = window.NBGLevel1State.assetStatus[key].src;
        await original.decode();
        const read = image => {
          const c = document.createElement('canvas'); c.width = 512; c.height = 512;
          const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, 512, 512).data;
        };
        const source = read(original), actual = read(window.NBGLevel1State.objectImages[key]);
        let changed = 0, white = 0, dark = 0, translucent = 0;
        for (let i = 0; i < source.length; i += 4) {
          if (source.slice(i, i + 4).some((v, j) => v !== actual[i + j])) changed++;
          if (source[i + 3] && source[i] > 180 && source[i + 1] > 180 && source[i + 2] > 180) white++;
          if (source[i + 3] && source[i] <= 18 && source[i + 1] <= 18 && source[i + 2] <= 18) dark++;
          if (source[i + 3] > 0 && source[i + 3] < 255) translucent++;
        }
        result[key] = { changed, white, dark, translucent, cornerAlpha: actual[3] };
      }
      return result;
    });
    for (const [key, counts] of Object.entries(alpha)) {
      assert.equal(counts.changed, 0, `${mode.name} ${key}: every source RGBA pixel preserved`);
      assert.ok(counts.white > 0 && counts.dark > 0 && counts.translucent > 0);
      assert.equal(counts.cornerAlpha, 0);
    }
    await page.evaluate(() => {
      window.__balloonEvidence = { draws: [], captures: {}, defeats: [] };
      window.addEventListener('nbg-enemy-defeated', event => {
        if (event.detail.type === 'balloon') window.__balloonEvidence.defeats.push(event.detail);
      });
      const game = document.getElementById('game').getContext('2d');
      const original = game.drawImage;
      game.drawImage = function (image, ...args) {
        const s = window.NBGLevel1State;
        const key = image === s.objectImages.balloonWalk ? 'walk' :
          image === s.objectImages.balloonRelease ? 'release' : null;
        if (key && args.length === 8) {
          const enemy = s.enemies.find(e => e.type === 'balloon');
          const frame = Math.floor(args[0] / 128) + Math.floor(args[1] / 128) * 4;
          const t = this.getTransform();
          const crop = document.createElement('canvas'); crop.width = args[2]; crop.height = args[3];
          const brush = crop.getContext('2d');
          brush.drawImage(image, args[0], args[1], args[2], args[3], 0, 0, args[2], args[3]);
          const pixels = brush.getImageData(0, 0, crop.width, crop.height).data;
          // Locate the person's head separately from the balloon/burst above it.
          let top = crop.height;
          for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
            const cellX = args[0] % 128 + x, cellY = args[1] % 128 + y;
            if (pixels[(y * crop.width + x) * 4 + 3] &&
                (key === 'walk' || (cellX >= 28 && cellX <= 56 && cellY >= 60))) top = Math.min(top, y);
          }
          const record = { key, frame, cycle: enemy.balloonCycles, facing: t.a,
            scaleX: args[6] / args[2], scaleY: args[7] / args[3],
            personHeight: (args[3] - top) * args[7] / args[3],
            foot: t.f + args[5] + args[7],
            expectedFoot: enemy.y + enemy.h + 38 + Math.round(s.cameraY),
            anchor: t.e, expectedAnchor: Math.round(enemy.x - s.cameraX) + enemy.w / 2,
            source: args.slice(0, 4), destination: args.slice(4) };
          window.__balloonEvidence.draws.push(record);
          const id = `${key}-${enemy.balloonCycles}-${frame}-${t.a}`;
          if (!window.__balloonEvidence.captures[id]) {
            // Left: untouched source cell. Right: exact runtime draw/crop/scale.
            const c = document.createElement('canvas'); c.width = 300; c.height = 155;
            const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#aaa'; ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = '#111'; ctx.font = '11px monospace';
            ctx.fillText(`${key} ${enemy.balloonCycles + 1}:${frame} ${t.a < 0 ? 'left' : 'right'}`, 4, 12);
            ctx.drawImage(image, Math.floor(args[0] / 128) * 128, Math.floor(args[1] / 128) * 128,
              128, 128, 0, 20, 128, 128);
            ctx.fillText('SOURCE', 4, 150); ctx.fillText('GAME 52px body', 145, 150);
            ctx.fillStyle = '#678'; ctx.fillRect(140, 139, 160, 1);
            ctx.translate(195, 139); ctx.scale(t.a, 1); ctx.drawImage(image, ...args);
            window.__balloonEvidence.captures[id] = c.toDataURL();
          }
        }
        return original.call(this, image, ...args);
      };
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      s.player.x = b.x - 120; s.player.y = 214 - s.player.h;
      s.player.invuln = 999999; s.player.vx = 0;
      b.nextBalloonAt = Infinity;
      b.min = 1500; b.max = 2000; // Keep a full walk loop in each facing in this fixture.
    });
    if (mode.name === 'mobile') {
      const control = page.locator('[data-control="right"]').first();
      await control.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true });
      await control.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true });
    } else await page.keyboard.press('KeyD');
    await page.clock.runFor(800);
    await page.screenshot({ path: path.join(output, `${mode.name}-walking.png`), fullPage: true });
    await page.clock.runFor(800);
    await page.evaluate(() => {
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      b.vx = -Math.abs(b.vx); s.player.x = b.x - 120; s.player.vx = 0;
    });
    await page.clock.runFor(1600);
    const beforeSwitch = await page.locator('#game').screenshot();
    await page.evaluate(() => {
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      b.nextBalloonAt = 0; s.player.vx = 0;
    });
    await page.clock.runFor(16);
    await page.screenshot({ path: path.join(output, `${mode.name}-release.png`), fullPage: true });
    const afterSwitch = await page.locator('#game').screenshot();
    const switchFrames = await Promise.all([beforeSwitch, afterSwitch].map(b => sharp(b).resize(960, 540, { kernel: 'nearest' }).png().toBuffer()));
    await sharp({ create: { width: 960, height: 1080, channels: 4, background: '#aaa' } })
      .composite(switchFrames.map((input, i) => ({ input, left: 0, top: i * 540 })))
      .png().toFile(path.join(output, `${mode.name}-switch.png`));
    await page.evaluate(() => {
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      const r = s.enemyCombatRect(b), ctx = document.getElementById('game').getContext('2d');
      ctx.save(); ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1;
      ctx.strokeRect(r.x - s.cameraX, r.y + 38 + Math.round(s.cameraY), r.w, r.h);
      ctx.beginPath(); ctx.moveTo(0, 252 + Math.round(s.cameraY));
      ctx.lineTo(480, 252 + Math.round(s.cameraY)); ctx.stroke(); ctx.restore();
    });
    await page.locator('#game').screenshot({ path: path.join(output, `${mode.name}-collision.png`) });
    await page.clock.runFor(16); // Clear the diagnostic overlay before cycle screenshots.
    const cycleCaptures = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let frame = 0; frame < 16; frame++) {
        let found = false;
        for (let tick = 0; tick < 120; tick++) {
          found = await page.evaluate(({ cycle, frame }) => {
            const last = window.__balloonEvidence.draws.at(-1);
            return last?.key === 'release' && last.cycle === cycle && last.frame === frame;
          }, { cycle, frame });
          if (found) break;
          await page.clock.runFor(16);
        }
        assert.ok(found, `capture actual cycle ${cycle + 1} frame ${frame}`);
        const screenshot = await page.locator('#game').screenshot();
        const crop = await page.evaluate(() => {
          const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
          return { x: b.x - s.cameraX + b.w / 2, foot: b.y + b.h + 38 + Math.round(s.cameraY) };
        });
        const native = await sharp(screenshot).resize(480, 270).png().toBuffer();
        cycleCaptures.push(await sharp(native).extract({ left: Math.max(0, Math.min(320, Math.round(crop.x) - 80)),
          top: Math.max(0, Math.min(120, Math.round(crop.foot) - 140)), width: 160, height: 150 }).png().toBuffer());
      }
      if (cycle === 0) await page.evaluate(() => {
        const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
        s.player.x = b.x + 120; s.player.vx = 0;
      });
    }
    await page.clock.runFor(1800);
    const evidence = await page.evaluate(() => window.__balloonEvidence);
    const state = await page.evaluate(() => {
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      return { cycles: b.balloonCycles, state: b.balloonState, collision: s.enemyCombatRect(b) };
    });
    assert.equal(state.cycles, 2); assert.equal(state.state, 'walk');
    assert.equal(state.collision.w, 42); assert.equal(state.collision.h, 52);
    for (const draw of evidence.draws) {
      assert.ok(Math.abs(draw.scaleX - draw.scaleY) < 1e-10, 'no aspect distortion');
      assert.ok(Math.abs(draw.foot - draw.expectedFoot) < 1e-8, 'visible feet on physics ground');
      assert.ok(Math.abs(draw.anchor - draw.expectedAnchor) < 1e-8, 'stable character anchor');
      assert.ok(draw.personHeight >= 50 && draw.personHeight <= 53,
        `${mode.name} ${draw.key} ${draw.frame}: person height ${draw.personHeight}`);
    }
    for (const facing of [-1, 1]) assert.deepEqual(
      [...new Set(evidence.draws.filter(d => d.key === 'walk' && d.facing === facing).map(d => d.frame))].sort((a,b) => a-b),
      Array.from({ length: 14 }, (_, i) => i), 'all walking frames both directions');
    for (const cycle of [0, 1]) assert.deepEqual(
      [...new Set(evidence.draws.filter(d => d.key === 'release' && d.cycle === cycle).map(d => d.frame))].sort((a,b) => a-b),
      Array.from({ length: 16 }, (_, i) => i), 'all 16 release frames in each cycle');
    // Actual game screenshots, all 32 frames across the two complete cycles.
    const thumbs = cycleCaptures;
    await sharp({ create: { width: 160 * 4, height: 150 * 8, channels: 4, background: '#aaa' } })
      .composite(thumbs.map((input, i) => ({ input, left: (i % 4) * 160, top: Math.floor(i / 4) * 150 })))
      .png().toFile(path.join(output, `${mode.name}-two-cycles.png`));
    const selected = Object.entries(evidence.captures).filter(([key]) =>
      key.startsWith('walk-0-') || key.startsWith('release-0-'))
      .sort(([a], [b]) => a.split('-')[0].localeCompare(b.split('-')[0]) ||
        Number(a.split('-')[2]) - Number(b.split('-')[2]) || a.localeCompare(b));
    await sharp({ create: { width: 300 * 4, height: 155 * Math.ceil(selected.length / 4), channels: 4, background: '#aaa' } })
      .composite(selected.map(([, data], i) => ({ input: Buffer.from(data.split(',')[1], 'base64'),
        left: (i % 4) * 300, top: Math.floor(i / 4) * 155 })))
      .png().toFile(path.join(output, `${mode.name}-source-vs-render.png`));
    await page.clock.runFor(4000);
    assert.equal(await page.evaluate(() => window.NBGLevel1State.enemies.find(e => e.type === 'balloon').balloonCycles), 2);
    await page.evaluate(() => {
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      s.player.x = b.x - 34; s.player.y = 214 - s.player.h; s.player.facing = 1; s.player.vx = 0;
      window.__balloonXpBefore = s.xp;
      window.NBGLevel1Runtime.setTouchControl('spray', true);
    });
    await page.clock.runFor(180);
    const defeat = await page.evaluate(() => {
      window.NBGLevel1Runtime.setTouchControl('spray', false);
      const s = window.NBGLevel1State, b = s.enemies.find(e => e.type === 'balloon');
      return { defeated: b.defeated, reward: b.balloonRewardXp, delta: s.xp - window.__balloonXpBefore,
        events: window.__balloonEvidence.defeats.length };
    });
    assert.equal(defeat.defeated, true); assert.equal(defeat.events, 1);
    assert.equal(defeat.delta, defeat.reward);
    assert.ok(Number.isInteger(defeat.reward) && defeat.reward >= 10 && defeat.reward <= 10000);
    results.push({ mode: mode.name, alpha, state, defeat, frames: evidence.draws.length,
      personHeightRange: [Math.min(...evidence.draws.map(d => d.personHeight)), Math.max(...evidence.draws.map(d => d.personHeight))] });
    await page.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  console.log(`Balloon Girl visual evidence: ${output}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
