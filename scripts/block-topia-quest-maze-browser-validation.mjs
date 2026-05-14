import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";

const rootDir = process.cwd();
const port = 4187;
const gamePath = "/games/block-topia-quest-maze/";

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function createServer() {
  return http.createServer((req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const cleanPath = requestPath.replace(/^\/+/, "");
      let filePath = path.join(rootDir, cleanPath);
      if (requestPath.endsWith("/")) filePath = path.join(rootDir, cleanPath, "index.html");
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", mimeType(filePath));
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
}

function assertCheck(results, name, pass, details) {
  results.push({ name, pass: !!pass, details: details || "" });
}

function getBrowserExecutable() {
  const linuxPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ];
  for (const p of linuxPaths) {
    if (existsSync(p)) return p;
  }

  const winPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of winPaths) {
    if (existsSync(p)) return p;
  }

  throw new Error("No Chrome, Chromium, or Edge executable found for playwright-core.");
}

async function waitForPhase(page, phase, timeout = 8000) {
  await page.waitForFunction((target) => window.__btqm && window.__btqm.phase === target, phase, { timeout });
}

async function run() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: getBrowserExecutable(),
  });
  const page = await browser.newPage();
  const checks = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  try {
    const navResp = await page.goto(`http://127.0.0.1:${port}${gamePath}`, { waitUntil: "networkidle" });
    assertCheck(checks, "page loads", !!(navResp && navResp.ok()), `status=${navResp && navResp.status()}`);

    await page.fill("#btqm-name-input", "BombTester");
    await page.click("#btqm-start-btn");
    await page.waitForFunction(() => !!window.__btqm, null, { timeout: 10000 });
    await waitForPhase(page, "running", 8000);
    assertCheck(checks, "window.__btqm exists", true, "ZoneScene exposed runtime hooks");
    assertCheck(checks, "start run works", true, "phase=running");

    const moveBefore = await page.evaluate(() => ({ x: window.__btqm.player.x, y: window.__btqm.player.y }));
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowRight");
    const moveAfter = await page.evaluate(() => ({ x: window.__btqm.player.x, y: window.__btqm.player.y }));
    const moveCheck = {
      moved: moveAfter.x !== moveBefore.x || moveAfter.y !== moveBefore.y,
      before: moveBefore,
      after: moveAfter,
    };
    assertCheck(checks, "player moves", moveCheck.moved, `before=${JSON.stringify(moveCheck.before)} after=${JSON.stringify(moveCheck.after)}`);

    const bombPlaceCheck = await page.evaluate(() => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearBombs();
      t.setBombCapacity(2);
      const before = g.bombs.length;
      g.placeBomb();
      const after = g.bombs.length;
      return { before, after, placed: after === before + 1 };
    });
    assertCheck(checks, "bomb places", bombPlaceCheck.placed, JSON.stringify(bombPlaceCheck));

    const bombExplodeCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearBombs();
      t.setBombCapacity(2);
      g.placeBomb();
      const before = g.bombs.length;
      if (before < 1) return { exploded: false, reason: "no bomb placed", before, after: g.bombs.length };
      g.triggerBomb(0);
      await new Promise((r) => setTimeout(r, 250));
      const after = g.bombs.length;
      return { exploded: after === before - 1, before, after };
    });
    assertCheck(checks, "bomb explodes", bombExplodeCheck.exploded, JSON.stringify(bombExplodeCheck));

    const softBlockCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearBombs();
      t.clearEnemies();
      t.setBombCapacity(2);

      const x = 5;
      const y = 5;
      t.setTile(x, y, 1);
      t.setTile(x + 1, y, 2);
      t.setTile(x + 2, y, 1);
      t.setTile(x, y - 1, 1);
      t.setTile(x, y + 1, 1);
      t.setPlayerCell(x, y);

      g.placeBomb();
      if (g.bombs.length !== 1) return { destroyed: false, reason: "bomb not placed" };
      g.triggerBomb(0);
      await new Promise((r) => setTimeout(r, 300));

      return { destroyed: g.grid[y][x + 1] === 1, tileAfter: g.grid[y][x + 1] };
    });
    assertCheck(checks, "explosion destroys soft block", softBlockCheck.destroyed, JSON.stringify(softBlockCheck));

    const chainCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearBombs();
      t.clearEnemies();
      t.setBombCapacity(3);

      const x = 8;
      const y = 6;
      t.setTile(x, y, 1);
      t.setTile(x + 1, y, 1);
      t.setTile(x + 2, y, 1);
      t.setTile(x + 3, y, 1);

      t.setPlayerCell(x, y);
      g.placeBomb();
      t.setPlayerCell(x + 1, y);
      g.placeBomb();

      if (g.bombs.length !== 2) return { chained: false, reason: "could not place 2 bombs", bombs: g.bombs.length };
      g.triggerBomb(0);
      await new Promise((r) => setTimeout(r, 450));
      return { chained: g.bombs.length === 0, bombsAfter: g.bombs.length };
    });
    assertCheck(checks, "chain reaction triggers second bomb", chainCheck.chained, JSON.stringify(chainCheck));

    const enemyDamageCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearBombs();
      t.clearEnemies();
      t.setBombCapacity(2);
      t.setScore(0);

      const x = 10;
      const y = 8;
      t.setTile(x, y, 1);
      t.setTile(x + 1, y, 1);
      t.setTile(x + 2, y, 1);
      t.setPlayerCell(x, y);
      t.spawnEnemyAt(x + 1, y, 1, "basic-chaser");

      const before = { enemies: g.enemies.length, score: g.score };
      g.placeBomb();
      if (g.bombs.length !== 1) return { damaged: false, scoreChanged: false, reason: "bomb not placed" };
      g.triggerBomb(0);
      await new Promise((r) => setTimeout(r, 320));

      const after = { enemies: g.enemies.length, score: g.score };
      return {
        damaged: after.enemies < before.enemies,
        scoreChanged: after.score > before.score,
        before,
        after,
      };
    });
    assertCheck(checks, "enemy takes damage/dies", enemyDamageCheck.damaged, JSON.stringify(enemyDamageCheck));
    assertCheck(checks, "score changes", enemyDamageCheck.scoreChanged, JSON.stringify(enemyDamageCheck));

    const zoneUpgradeCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      t.clearEnemies();
      t.activateExitByClear();

      let exit = null;
      for (let r = 0; r < g.grid.length; r++) {
        for (let c = 0; c < g.grid[0].length; c++) {
          if (g.grid[r][c] === 4) {
            exit = { x: c, y: r };
            break;
          }
        }
        if (exit) break;
      }
      if (!exit) return { zoneClearWorked: false, upgradeShown: false, reason: "exit tile not found" };

      t.setPlayerCell(exit.x, exit.y);
      t.enterExitIfOpen();
      await new Promise((r) => setTimeout(r, 120));
      const state = t.getUpgradeState();
      return {
        zoneClearWorked: state.inUpgrade,
        upgradeShown: state.inUpgrade && state.optionCount === 3,
        state,
      };
    });
    assertCheck(checks, "zone clear path works", zoneUpgradeCheck.zoneClearWorked, JSON.stringify(zoneUpgradeCheck));
    assertCheck(checks, "upgrade picker appears", zoneUpgradeCheck.upgradeShown, JSON.stringify(zoneUpgradeCheck));

    const multiUpgradeGuardCheck = await page.evaluate(async () => {
      const g = window.__btqm;
      const t = g.__test;
      const before = t.getUpgradeState();
      t.clickUpgrade(0);
      t.clickUpgrade(1);
      await new Promise((r) => setTimeout(r, 120));
      const after = t.getUpgradeState();
      return {
        singleApply: after.applyCount === 1,
        before,
        after,
      };
    });
    assertCheck(checks, "upgrade picker prevents multiple selections", multiUpgradeGuardCheck.singleApply, JSON.stringify(multiUpgradeGuardCheck));

    await page.evaluate(() => window.__btqm.endRun());
    await waitForPhase(page, "gameover", 6000);
    assertCheck(checks, "run can end", true, "phase=gameover");

    const metaHooks = await page.evaluate(() => ({
      hasPlayerKey: localStorage.getItem("btqm_player_v2") !== null,
      hasWidgetKey: localStorage.getItem("btqm_widget_v1") !== null,
    }));
    assertCheck(checks, "leaderboard/meta hooks exist", metaHooks.hasPlayerKey || metaHooks.hasWidgetKey, JSON.stringify(metaHooks));

    const manifestResp = await page.request.get(`http://127.0.0.1:${port}/art/btqm/manifest.json`);
    const manifest = await manifestResp.json().catch(() => null);
    const hydrateResp = await page.request.get(`http://127.0.0.1:${port}/scripts/hydrate-btqm-generated-assets.mjs`);
    assertCheck(checks, "PixelLab manifest exists", manifestResp.ok() && manifest && Array.isArray(manifest.assets), `status=${manifestResp.status()}`);
    assertCheck(checks, "PixelLab hydration script exists", hydrateResp.ok(), `status=${hydrateResp.status()}`);

    const nonNoiseConsoleErrors = consoleErrors.filter((e) =>
      !e.includes("favicon") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR")
    );
    assertCheck(checks, "no console errors", nonNoiseConsoleErrors.length === 0, JSON.stringify(nonNoiseConsoleErrors));
    assertCheck(checks, "no page errors", pageErrors.length === 0, JSON.stringify(pageErrors));

    const failed = checks.filter((c) => !c.pass);
    const output = {
      summary: {
        total: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length,
      },
      failed,
      checks,
      consoleErrors,
      pageErrors,
    };
    console.log(JSON.stringify(output, null, 2));
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
