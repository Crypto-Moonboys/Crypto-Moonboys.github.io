import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  const server = http.createServer((req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const cleanPath = requestPath.replace(/^\/+/, '');
      const basePath = requestPath.endsWith('/')
        ? path.resolve(rootDir, cleanPath, 'index.html')
        : path.resolve(rootDir, cleanPath);
      const rel = path.relative(rootDir, basePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      const filePath = basePath;
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
  return server;
}

function chromePath() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const platform = process.platform;
  if (platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
  }

  if (platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
  }

  const bins = ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];
  for (const bin of bins) {
    const found = spawnSync('which', [bin], { encoding: 'utf8' });
    if (found.status === 0) {
      const resolved = (found.stdout || '').trim().split('\n')[0];
      if (resolved && fs.existsSync(resolved)) return resolved;
    }
  }
  return null;
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
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (_) {
    console.error('playwright-core is required for screenshot capture. Install dependencies or run npm install.');
    process.exit(1);
  }

  const browserExecutable = chromePath();
  if (!browserExecutable) {
    console.error('No Chrome/Edge executable found. Install Chrome or Edge, or set CHROME_PATH to a valid executable path.');
    process.exit(1);
  }

  const server = createServer(0);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (err) {
    console.error('Failed to start local screenshot server:', err && err.message ? err.message : err);
    process.exit(1);
  }
  const address = server.address();
  const localPort = address && typeof address === 'object' ? address.port : null;
  if (!localPort) {
    console.error('Failed to determine local screenshot server port.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
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
    if (server.listening) {
      await new Promise((r) => server.close(r));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
