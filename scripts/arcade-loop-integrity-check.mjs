let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch (error) {
  const message = error && error.message ? String(error.message) : '';
  const code = error && error.code ? String(error.code) : '';

  if (code === 'ERR_MODULE_NOT_FOUND' || message.includes('Cannot find package')) {
    console.error('[arcade-loop-integrity-check] Missing optional dependency: playwright-core');
    console.error('Install it before running this browser audit: npm install --save-dev playwright-core');
    process.exit(1);
  }

  console.error('[arcade-loop-integrity-check] Failed to load playwright-core:');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const port = 4173;

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  try {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const cleanPath = requestPath.replace(/^\/+/, '');
    let filePath = path.join(rootDir, cleanPath);

    if (requestPath.endsWith('/')) {
      filePath = path.join(rootDir, cleanPath, 'index.html');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.setHeader('Content-Type', mimeType(filePath));
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

const base = 'http://127.0.0.1:' + port;
const games = [
  { id: 'invaders', path: '/games/invaders-3008/' },
  { id: 'pac-chain', path: '/games/pac-chain/' },
  { id: 'asteroid-fork', path: '/games/asteroid-fork/' },
  { id: 'snake', path: '/games/snake-run/' },
  { id: 'tetris', path: '/games/tetris-block-topia/' },
];

function parseTsFromFrameLog(line) {
  const match = /ts=([0-9.]+)/.exec(line);
  if (!match) return null;
  return Number(match[1]);
}

function summarizeTiming(frameLogs) {
  const ts = frameLogs
    .map(function (entry) { return parseTsFromFrameLog(entry.text); })
    .filter(function (value) { return Number.isFinite(value); });

  if (ts.length < 3) {
    return { samples: ts.length, avgDeltaMs: null, maxDeltaMs: null, minDeltaMs: null };
  }

  const deltas = [];
  for (let i = 1; i < ts.length; i += 1) {
    deltas.push(ts[i] - ts[i - 1]);
  }

  const sum = deltas.reduce(function (acc, value) { return acc + value; }, 0);
  const avg = sum / deltas.length;
  const min = Math.min.apply(null, deltas);
  const max = Math.max.apply(null, deltas);
  return {
    samples: deltas.length,
    avgDeltaMs: Number(avg.toFixed(3)),
    minDeltaMs: Number(min.toFixed(3)),
    maxDeltaMs: Number(max.toFixed(3)),
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});

const results = [];

for (const game of games) {
  const page = await browser.newPage();
  const logs = [];
  const errors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });
    if (msg.type() === 'error') errors.push(text);
  });

  page.on('pageerror', (err) => {
    errors.push(String(err));
  });

  await page.addInitScript(() => {
    window.__ARCADE_DEBUG_FRAMES = true;
  });

  await page.goto(base + game.path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const fullscreenSupported = await page.evaluate(() => !!document.fullscreenEnabled);
  const startBtnCount = await page.locator('#startBtn').count();
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#startBtn'));
    for (const button of buttons) {
      button.click();
    }
  });

  await page.waitForTimeout(150);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');

  await page.waitForTimeout(2200);

  const frameLogs = logs.filter((l) => l.text.includes('[frame-debug]') && l.text.includes('tick='));
  const inputLogs = logs.filter((l) => l.text.includes('[frame-debug]') && l.text.includes('input='));
  const duplicateWarnings = logs.filter((l) => l.text.includes('duplicate tick detected'));
  const timing = summarizeTiming(frameLogs);
  const invadersState = await page.evaluate(() => {
    if (typeof window.__invadersOverlayStateHook !== 'function') return null;
    return window.__invadersOverlayStateHook();
  });
  const waveLabel = await page.evaluate(() => {
    const el = document.getElementById('wave');
    return el ? String(el.textContent || '').trim() : null;
  });

  results.push({
    game: game.id,
    fullscreenSupported,
    startBtnCount,
    frameLogCount: frameLogs.length,
    inputLogCount: inputLogs.length,
    duplicateWarnings: duplicateWarnings.length,
    timing,
    invadersState,
    waveLabel,
    consoleErrors: errors,
  });

  await page.close();
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(JSON.stringify(results, null, 2));
