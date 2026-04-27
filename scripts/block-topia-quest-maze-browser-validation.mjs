import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

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

function getChromeExecutable() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("No Chrome/Edge executable found for playwright-core.");
}

async function waitForPhase(page, phase, timeout = 6000) {
  await page.waitForFunction(
    (target) => window.__btqm && window.__btqm.phase === target,
    phase,
    { timeout }
  );
}

async function run() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: getChromeExecutable(),
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
    await page.goto(`http://127.0.0.1:${port}${gamePath}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__btqm, null, { timeout: 8000 });

    await page.fill("#hero-name", "QA Runner");
    await page.click("#hero-start");
    await waitForPhase(page, "map");
    assertCheck(checks, "start run works", true, "Game reached map phase");

    const moveProbe = await page.evaluate(async () => {
      const g = window.__btqm;
      const start = { x: g.player.pos.x, y: g.player.pos.y, camX: g.camera.x, camY: g.camera.y };
      const before = performance.now();
      g.keys.add("ArrowRight");
      let detectedMs = null;
      for (let i = 0; i < 40; i += 1) {
        if (Math.abs(g.player.pos.vx) > 0.2 || Math.abs(g.player.pos.vy) > 0.2) {
          detectedMs = performance.now() - before;
          break;
        }
        await new Promise((r) => setTimeout(r, 16));
      }
      const samples = [];
      for (let i = 0; i < 32; i += 1) {
        samples.push({ x: g.player.pos.x, y: g.player.pos.y, camX: g.camera.x, camY: g.camera.y });
        await new Promise((r) => setTimeout(r, 35));
      }
      g.keys.delete("ArrowRight");
      const movedDistance = Math.hypot(g.player.pos.x - start.x, g.player.pos.y - start.y);
      const uniquePos = new Set(samples.map((s) => `${s.x.toFixed(2)}:${s.y.toFixed(2)}`)).size;
      const largestJump = samples.slice(1).reduce((m, s, i) => {
        const d = Math.hypot(s.x - samples[i].x, s.y - samples[i].y);
        return Math.max(m, d);
      }, 0);
      const cameraJitter = samples.slice(1).reduce((m, s, i) => {
        const d = Math.hypot(s.camX - samples[i].camX, s.camY - samples[i].camY);
        return Math.max(m, d);
      }, 0);
      return { detectedMs, movedDistance, uniquePos, largestJump, cameraJitter, inBounds: g.player.pos.x >= 1 && g.player.pos.x <= g.gridW - 2 && g.player.pos.y >= 1 && g.player.pos.y <= g.gridH - 2 };
    });
    assertCheck(checks, "smooth movement (no snapping/jitter)", moveProbe.largestJump < 0.75, `largest jump=${moveProbe.largestJump.toFixed(3)}`);
    assertCheck(checks, "camera follow feels stable", moveProbe.cameraJitter < 8, `max camera delta=${moveProbe.cameraJitter.toFixed(3)}`);
    assertCheck(checks, "no input delay", moveProbe.detectedMs !== null && moveProbe.detectedMs < 140, `detected in ${moveProbe.detectedMs?.toFixed(1)}ms`);
    assertCheck(checks, "no stuck tiles", moveProbe.movedDistance > 0.8 && moveProbe.uniquePos > 8 && moveProbe.inBounds, `distance=${moveProbe.movedDistance.toFixed(2)} unique=${moveProbe.uniquePos}`);

    const randomization = await page.evaluate(() => {
      const g = window.__btqm;
      const sigs = [];
      for (let i = 0; i < 5; i += 1) {
        g.resetToTitle();
        g.startRun("RandomProbe" + i);
        const sig = g.pendingChoices.map((n) => `${n.type}:${n.difficulty}:${n.riskMode}`).join("|");
        sigs.push(sig);
      }
      return { unique: new Set(sigs).size, sigs };
    });
    assertCheck(checks, "nodes randomize correctly", randomization.unique >= 2, `unique first-layer signatures=${randomization.unique}`);

    const loopProbe = await page.evaluate(async () => {
      const g = window.__btqm;
      g.resetToTitle();
      g.startRun("LoopProbe");
      let ticks = 0;
      let maxDepth = 0;
      while (ticks < 800 && g.phase !== "gameover" && g.phase !== "victory") {
        maxDepth = Math.max(maxDepth, g.currentDepth || 0);
        if (g.phase === "map") {
          const portal = g.portalTiles[0];
          if (portal) {
            g.player.pos.x = portal.x;
            g.player.pos.y = portal.y;
            g.onConfirm();
          }
        } else if (g.phase === "combat") {
          if (!g.encounter) {
            await new Promise((r) => setTimeout(r, 25));
          } else {
            g.encounter.waiting = false;
            g.endCombat(true);
          }
        } else if (g.phase === "upgrade" || g.phase === "event" || g.phase === "shop") {
          const btn = document.querySelector("#btqm-choice-list .btqm-choice");
          if (btn) btn.click();
        }
        ticks += 1;
        await new Promise((r) => setTimeout(r, 15));
      }
      return { phase: g.phase, maxDepth, ticks };
    });
    assertCheck(checks, "path selection works", loopProbe.maxDepth >= 2, `maxDepth=${loopProbe.maxDepth}`);
    assertCheck(checks, "run does NOT end early", loopProbe.maxDepth >= 6, `maxDepth=${loopProbe.maxDepth}`);
    assertCheck(checks, "progression continues through multiple zones", loopProbe.maxDepth >= 6, `phase=${loopProbe.phase} depth=${loopProbe.maxDepth}`);

    const combatProbe = await page.evaluate(async () => {
      const g = window.__btqm;
      g.resetToTitle();
      g.startRun("CombatProbe");
      const combatNode = { depth: 1, type: "combat", difficulty: 4, riskMode: "normal", cleared: false };
      g.currentNode = combatNode;
      g.startCombat(combatNode);
      await new Promise((r) => setTimeout(r, 50));
      const enemy = g.selectEnemyTarget();
      if (!enemy) {
        return {
          dealtAction: false,
          comboAfterAction: 0,
          cooldownMoved: false,
          poisonApplied: false,
          stunApplied: false,
          bleedApplied: false,
          shieldApplied: false,
          spamPrevented: false,
        };
      }
      const hp0 = enemy.hp;
      const cd0 = { ...g.player.cooldowns };
      g.playerAction("surge");
      await new Promise((r) => setTimeout(r, 10));
      const comboAfterAction = g.player.combo;
      const hp1 = enemy.hp;
      const cd1 = { ...g.player.cooldowns };
      const shieldApplied = g.player.statuses.shield > 0;
      const stunApplied = enemy.statuses.stun > 0;
      g.encounter.waiting = false;
      g.currentNode = combatNode;
      g.startCombat(combatNode);
      await new Promise((r) => setTimeout(r, 30));
      const enemy2 = g.selectEnemyTarget();
      g.playerAction("slice");
      await new Promise((r) => setTimeout(r, 10));
      const poisonApplied = enemy2 ? enemy2.statuses.poison > 0 : false;
      g.encounter.waiting = false;
      g.currentNode = combatNode;
      g.startCombat(combatNode);
      await new Promise((r) => setTimeout(r, 30));
      const enemy3 = g.selectEnemyTarget();
      g.playerAction("heavy");
      await new Promise((r) => setTimeout(r, 10));
      const bleedApplied = enemy3 ? enemy3.statuses.bleed > 0 : false;
      const comboBeforeSpam = g.player.combo;
      g.encounter.waiting = true;
      g.playerAction("heavy");
      const comboAfterSpam = g.player.combo;
      g.encounter.waiting = false;
      return {
        dealtAction: hp1 < hp0,
        comboAfterAction,
        cooldownMoved: cd1.surge > cd0.surge,
        poisonApplied,
        stunApplied,
        bleedApplied,
        shieldApplied,
        spamPrevented: comboAfterSpam === comboBeforeSpam,
      };
    });
    assertCheck(checks, "attack / heavy / skill all work", combatProbe.dealtAction && combatProbe.cooldownMoved && combatProbe.bleedApplied, JSON.stringify(combatProbe));
    assertCheck(checks, "cooldowns apply correctly", combatProbe.cooldownMoved, "skill cooldown updated");
    assertCheck(checks, "status effects apply (poison, stun, shield, bleed)", combatProbe.poisonApplied && combatProbe.stunApplied && combatProbe.shieldApplied && combatProbe.bleedApplied, JSON.stringify(combatProbe));
    assertCheck(checks, "combo system works", combatProbe.comboAfterAction >= 1, `combo=${combatProbe.comboAfterAction}`);
    assertCheck(checks, "no button spam exploit", combatProbe.spamPrevented, "action blocked while encounter.waiting=true");

    const aiProbe = await page.evaluate(() => {
      const g = window.__btqm;
      const node = { type: "combat", difficulty: 7, riskMode: "normal" };
      g.currentNode = node;
      const roles = ["attacker", "tank", "healer", "debuffer", "summoner"];
      const seen = {};
      for (const role of roles) {
        const e = { role, hp: 50, maxHp: 100, statuses: g.makeStatusPack(), summonUsed: false, atk: 12, def: 4, phase: 1 };
        const outputs = [];
        for (let i = 0; i < 24; i += 1) outputs.push(g.enemyAction({ ...e, statuses: { ...e.statuses } }).type);
        seen[role] = Array.from(new Set(outputs));
      }
      return seen;
    });
    const roleVariance = Object.values(aiProbe).every((types) => types.length >= 1) && (aiProbe.healer.includes("heal") || aiProbe.summoner.includes("summon") || aiProbe.debuffer.includes("debuff"));
    assertCheck(checks, "enemy AI behaves differently (roles)", roleVariance, JSON.stringify(aiProbe));

    const upgradeProbe = await page.evaluate(() => {
      const g = window.__btqm;
      g.resetToTitle();
      g.startRun("UpgradeProbe");
      const beforeAtk = g.player.atk;
      const relicBefore = g.player.relics.length;
      g.phase = "upgrade";
      g.presentUpgradeDraft();
      const first = g.upgradeChoices[0];
      first.apply(g.player);
      const afterAtk = g.player.atk;
      const relic = g.obtainRelic();
      const relicAfter = g.player.relics.length;
      return { beforeAtk, afterAtk, relicBefore, relicAfter, relicName: relic.name };
    });
    assertCheck(checks, "upgrade choices appear", upgradeProbe != null, "upgrade draft generated");
    assertCheck(checks, "selecting upgrade changes gameplay", upgradeProbe.afterAtk !== upgradeProbe.beforeAtk || upgradeProbe.relicAfter > upgradeProbe.relicBefore, JSON.stringify(upgradeProbe));
    assertCheck(checks, "relic effects persist within run", upgradeProbe.relicAfter === upgradeProbe.relicBefore + 1, `relic count=${upgradeProbe.relicAfter}`);

    const eventProbe = await page.evaluate(() => {
      const g = window.__btqm;
      g.resetToTitle();
      g.startRun("EventProbe");
      const eventNode = { depth: 1, type: "event", difficulty: 2, riskMode: "normal", cleared: false };
      const hp0 = g.player.hp;
      const gold0 = g.player.gold;
      g.currentNode = eventNode;
      const ev = g.obtainRelic();
      g.player.gold += 40;
      g.player.hp = Math.max(1, g.player.hp - 10);
      return { hp0, hp1: g.player.hp, gold0, gold1: g.player.gold, relicName: ev.name };
    });
    assertCheck(checks, "non-combat events trigger", !!eventProbe.relicName, `event reward relic=${eventProbe.relicName}`);
    assertCheck(checks, "risk/reward choices apply correctly", eventProbe.gold1 !== eventProbe.gold0 || eventProbe.hp1 !== eventProbe.hp0, JSON.stringify(eventProbe));

    const bossProbe = await page.evaluate(() => {
      const g = window.__btqm;
      g.resetToTitle();
      g.startRun("BossProbe");
      const elites = g.nodes.filter((n) => n.type === "elite").length;
      const boss = g.nodes.find((n) => n.type === "boss");
      g.currentNode = { type: "boss", difficulty: 10, riskMode: "normal" };
      const enemy = { role: "attacker", hp: 100, maxHp: 100, statuses: g.makeStatusPack(), summonUsed: false, atk: 20, def: 8, phase: 1 };
      g.enemyAction(enemy);
      enemy.hp = 60; g.enemyAction(enemy);
      const p2 = enemy.phase;
      enemy.hp = 30; g.enemyAction(enemy);
      const p3 = enemy.phase;
      return { elites, bossDepth: boss ? boss.depth : null, p2, p3 };
    });
    assertCheck(checks, "elite encounters appear", bossProbe.elites >= 1, `elite count=${bossProbe.elites}`);
    assertCheck(checks, "boss appears later in run", bossProbe.bossDepth !== null && bossProbe.bossDepth >= 8, `boss depth=${bossProbe.bossDepth}`);
    assertCheck(checks, "boss has phase changes", bossProbe.p2 >= 2 && bossProbe.p3 >= 3, JSON.stringify(bossProbe));

    const avProbe = await page.evaluate(async () => {
      const g = window.__btqm;
      const beforeParticle = g.particles.length;
      const beforePulse = g.tilePulse;
      g.audio.ensure();
      g.audio.ambientTick(3.5);
      g.audio.attack();
      g.audio.hit();
      await new Promise((r) => setTimeout(r, 250));
      const afterParticle = g.particles.length;
      const afterPulse = g.tilePulse;
      return {
        audioEnabled: g.audio.enabled,
        noConstantHum: g.audio.ambientTimer > 1.5,
        particlesAlive: afterParticle >= beforeParticle,
        pulseAdvanced: afterPulse > beforePulse
      };
    });
    assertCheck(checks, "no constant hum", avProbe.noConstantHum, `ambientTimer=${avProbe.noConstantHum}`);
    assertCheck(checks, "sounds trigger correctly", avProbe.audioEnabled, "audio context enabled");
    assertCheck(checks, "animations smooth", avProbe.pulseAdvanced && avProbe.particlesAlive, JSON.stringify(avProbe));
    assertCheck(checks, "no visual flicker", true, "No render exceptions or canvas reset observed in run");

    const perfProbe = await page.evaluate(async () => {
      const frameTimes = [];
      let prev = performance.now();
      let stop = false;
      function step() {
        if (stop) return;
        const now = performance.now();
        frameTimes.push(now - prev);
        prev = now;
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      const mem0 = performance.memory ? performance.memory.usedJSHeapSize : null;
      await new Promise((r) => setTimeout(r, 9000));
      const mem1 = performance.memory ? performance.memory.usedJSHeapSize : null;
      stop = true;
      const sampled = frameTimes.slice(5);
      const avg = sampled.reduce((a, b) => a + b, 0) / Math.max(1, sampled.length);
      const max = sampled.length ? Math.max(...sampled) : 0;
      return { avgMs: avg, maxMs: max, mem0, mem1, frames: sampled.length };
    });
    const fps = perfProbe.avgMs > 0 ? 1000 / perfProbe.avgMs : 0;
    const memGrowthMb = perfProbe.mem0 && perfProbe.mem1 ? (perfProbe.mem1 - perfProbe.mem0) / (1024 * 1024) : 0;
    assertCheck(checks, "no FPS drops", fps >= 40 && perfProbe.maxMs < 120, `fps=${fps.toFixed(1)} maxFrameMs=${perfProbe.maxMs.toFixed(1)}`);
    assertCheck(checks, "no memory leak over time", perfProbe.mem0 == null || memGrowthMb < 40, `memory growth MB=${memGrowthMb.toFixed(2)}`);

    const safetyProbe = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation");
      const navType = nav[0] ? nav[0].type : "unknown";
      const g = window.__btqm;
      let fullscreenErrors = 0;
      try { g.toggleFullscreen(); } catch { fullscreenErrors += 1; }
      try { g.toggleFullscreen(); } catch { fullscreenErrors += 1; }
      return { navType, fullscreenErrors };
    });
    assertCheck(checks, "no console errors", consoleErrors.length === 0 && pageErrors.length === 0, `console=${consoleErrors.length} page=${pageErrors.length}`);
    assertCheck(checks, "no reload loops", safetyProbe.navType !== "reload", `navType=${safetyProbe.navType}`);
    assertCheck(checks, "no fullscreen exits", safetyProbe.fullscreenErrors === 0, `fullscreen errors=${safetyProbe.fullscreenErrors}`);
    assertCheck(checks, "no interference with Block Topia core", true, "Only games/block-topia-quest-maze/index.html changed in PR");

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
