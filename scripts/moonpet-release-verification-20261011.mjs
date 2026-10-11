import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { REQUIRED_D1_MIGRATIONS, verifyD1MigrationPayload } from './verify-d1-production-migrations.mjs';

const expected = 'bfa8997d0942ca1101aab26b7b7c19a29c3999ca';
const site = 'https://cryptomoonboys.com';
const git = (...args) => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const source = path => git('show', `${expected}:${path}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { checked_at: new Date().toISOString(), intended_commit: expected, assets: [], workers: [], bot_menus: [], migrations: {} };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Cache-Control': 'no-cache', ...options.headers }, signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { status: response.status, bytes };
}
const workerSource = source('workers/moonboys-api/worker.js').toString();
const launch = workerSource.match(/const MOONPET_MINI_APP_URL = `\$\{SITE_URL\}([^`]+)`/)[1];
const gamesMenu = workerSource.match(/const TELEGRAM_GAMES_MENU_URL = `\$\{SITE_URL\}([^`]+)`/)[1];
const html = source('moonpet-game.html').toString();
const assets = new Map([
  [new URL(launch, site).href, 'moonpet-game.html'],
  [new URL(gamesMenu, site).href, 'games/telegram/index.html'],
  [new URL('/how-to-play-crypto-moonboy-pets.html', site).href, 'how-to-play-crypto-moonboy-pets.html'],
]);
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=(['"])([^'"]+)\1/g)) {
  const url = new URL(match[2], site);
  if (url.origin === site && /\.(js|css)$/.test(url.pathname)) assets.set(url.href, url.pathname.slice(1));
}
await Promise.all([...assets].map(async ([url, path]) => {
  try {
    const live = await request(url), committedHash = hash(source(path)), liveHash = hash(live.bytes);
    report.assets.push({ path, url, http_status: live.status, status: liveHash === committedHash ? 'verified' : 'mismatch', sha256: liveHash, expected_sha256: committedHash });
    if (path === 'games/telegram/index.html') {
      const target = live.bytes.toString().match(/<a[^>]+href=(['"])([^'"]*\/moonpet-game\.html[^'"]*)\1[^>]*>\s*Moonpet OS\s*<\/a>/i)?.[2];
      report.launcher = { status: target && new URL(target, site).href === new URL(launch, site).href ? 'verified' : 'mismatch', actual_url: target ? new URL(target, site).href : null, expected_url: new URL(launch, site).href };
    }
  } catch (error) { report.assets.push({ path, url, status: 'unverified', reason: error.message }); }
}));
for (const [service, directory, origin] of [
  ['moonboys-api', 'moonboys-api', 'https://moonboys-api.sercullen.workers.dev'],
  ['moonboys-api', 'moonboys-api', 'https://api.cryptomoonboys.com'],
  ['moonboys-leaderboard', 'leaderboard', 'https://moonboys-leaderboard.sercullen.workers.dev'],
  ['moonboys-anti-cheat', 'anti-cheat', 'https://moonboys-anti-cheat.sercullen.workers.dev'],
]) {
  try {
    const live = JSON.parse((await request(`${origin}/deployment-info`)).bytes);
    if (live.service !== service || !/^[0-9a-f]{40}$/.test(live.commit) || live.environment !== 'production' || !Number.isFinite(Date.parse(live.deployed_at))) throw new Error('Invalid provenance response');
    git('merge-base', '--is-ancestor', live.commit, expected);
    const changed = git('diff', '--name-only', live.commit, expected, '--', `workers/${directory}`, 'workers/shared', 'package.json', 'package-lock.json').toString().trim().split('\n').filter(Boolean);
    const health = service === 'moonboys-api' ? JSON.parse((await request(`${origin}/health`)).bytes).ok === true : null;
    report.workers.push({ ...live, url: `${origin}/deployment-info`, status: changed.length || health === false ? 'mismatch' : 'verified', health_ok: health, changed_runtime_paths: changed, deployed_worker_tree: git('rev-parse', `${live.commit}:workers/${directory}`).toString().trim(), intended_worker_tree: git('rev-parse', `${expected}:workers/${directory}`).toString().trim() });
  } catch (error) { report.workers.push({ service, url: `${origin}/deployment-info`, status: 'unverified', reason: error.message }); }
}
for (const name of ['TELEGRAM_BOT_TOKEN', 'MOONPET_CANARY_BOT_TOKEN']) {
  const token = process.env[name];
  if (!token) { report.bot_menus.push({ credential: name, status: 'unverified', reason: 'Repository credential unavailable' }); continue; }
  try {
    const api = async (method, body) => {
      const result = JSON.parse((await request(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).bytes);
      if (!result.ok) throw new Error(`Telegram ${method} rejected`);
      return result.result;
    };
    const bot = await api('getMe');
    const menu = await api('getChatMenuButton', process.env.MOONPET_CANARY_TELEGRAM_ID ? { chat_id: process.env.MOONPET_CANARY_TELEGRAM_ID } : {});
    report.bot_menus.push({ credential: name, username: bot.username, scope: process.env.MOONPET_CANARY_TELEGRAM_ID ? 'dedicated-canary-chat' : 'default-menu', type: menu.type, url: menu.web_app?.url || null, expected_url: new URL(gamesMenu, site).href, status: menu.web_app?.url === new URL(gamesMenu, site).href ? 'verified' : menu.type === 'web_app' ? 'mismatch' : 'not-configured-for-this-chat' });
  } catch { report.bot_menus.push({ credential: name, status: 'unverified', reason: 'Telegram menu read failed' }); }
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  report.migrations = { status: 'unverified', reason: 'Cloudflare repository credentials unavailable', required_count: REQUIRED_D1_MIGRATIONS.length };
} else {
  const sql = `SELECT name FROM d1_migrations WHERE name IN (${REQUIRED_D1_MIGRATIONS.map(name => `'${name}'`).join(',')}) ORDER BY name`;
  const result = spawnSync('npx', ['--no-install', 'wrangler', 'd1', 'execute', 'wikicoms', '--remote', '--config', 'workers/moonboys-api/wrangler.toml', '--command', sql, '--json'], { encoding: 'utf8', timeout: 90000 });
  if (result.status !== 0) {
    fs.writeFileSync('d1-query.json', result.stdout || ''); fs.writeFileSync('d1-query.stderr', result.stderr || '');
    spawnSync(process.execPath, ['scripts/report-d1-query-failure.mjs', 'd1-query.json', 'd1-query.stderr', 'd1-query-failure.txt'], { stdio: 'ignore' });
    report.migrations = { status: 'unverified', reason: fs.readFileSync('d1-query-failure.txt', 'utf8'), required_count: REQUIRED_D1_MIGRATIONS.length };
  } else {
    try { report.migrations = verifyD1MigrationPayload(JSON.parse(result.stdout), JSON.parse(fs.readFileSync('deployments/d1-evidence-request.json', 'utf8'))); }
    catch (error) { report.migrations = { status: 'unverified', reason: error.message }; }
  }
}
report.checked_at = new Date().toISOString();
fs.writeFileSync('moonpet-release-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
const requiredWorkers = report.workers.filter(worker => worker.service === 'moonboys-api');
if (report.assets.some(asset => asset.status !== 'verified') || report.launcher?.status !== 'verified' || requiredWorkers.some(worker => worker.status !== 'verified') || report.migrations.status !== 'verified-applied') process.exitCode = 1;
