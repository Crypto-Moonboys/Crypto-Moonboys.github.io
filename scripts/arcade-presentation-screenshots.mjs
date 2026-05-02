import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'artifacts', 'arcade-presentation');
fs.mkdirSync(outDir, { recursive: true });

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function createServer(port) {
  return http.createServer((req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const cleanPath = requestPath.replace(/^\/+/, '');
      let filePath = path.join(rootDir, cleanPath);
      if (requestPath.endsWith('/')) filePath = path.join(rootDir, cleanPath, 'index.html');
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
  }).listen(port, '127.0.0.1');
}

function chromePath() {
  const c = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge executable found.');
}

const pages = [
  { key: 'snake-run', path: '/games/snake-run/' },
  { key: 'crystal-quest', path: '/games/crystal-quest/' },
  { key: 'block-topia-quest-maze', path: '/games/block-topia-quest-maze/' },
  { key: 'tetris-block-topia', path: '/games/tetris-block-topia/' },
];

async function openOverlay(page) {
  const start = page.locator('#startBtn');
  if (await start.count()) {
    await start.first().click({ timeout: 3000 });
    await page.waitForSelector('#game-overlay.active', { timeout: 4000 });
  }
}

async function main() {
  const localPort = 4321;
  const server = createServer(localPort);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath() });
  try {
    const contexts = {
      before: await browser.newContext({ viewport: { width: 1600, height: 900 } }),
      after: await browser.newContext({ viewport: { width: 1600, height: 900 } }),
    };
    for (const p of pages) {
      for (const mode of ['normal', 'fullscreen']) {
        const b = await contexts.before.newPage();
        await b.goto(`https://cryptomoonboys.com${p.path}`, { waitUntil: 'networkidle' });
        if (mode === 'fullscreen') await openOverlay(b);
        await b.screenshot({ path: path.join(outDir, `${p.key}-before-${mode}.png`), fullPage: true });
        await b.close();

        const a = await contexts.after.newPage();
        await a.goto(`http://127.0.0.1:${localPort}${p.path}`, { waitUntil: 'networkidle' });
        if (mode === 'fullscreen') await openOverlay(a);
        await a.screenshot({ path: path.join(outDir, `${p.key}-after-${mode}.png`), fullPage: true });
        await a.close();
      }
    }

    for (const [label, ctx] of Object.entries(contexts)) {
      await ctx.close();
      console.log(`Captured ${label} screenshots.`);
    }
    console.log(`Output: ${outDir}`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
