import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, ".tmp", "botty-front-browser-smoke");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

const EXPECTED_ROLE_MAP = {
  idle: "front_idle",
  feed: "front_feed",
  play: "front_play",
  clean: "front_clean",
  sleep: "front_sleep",
  train: "front_train",
  travel: "front_travel",
  work: "front_work",
  equip: "front_equip",
  evolve: "front_evolve",
  trade: "front_trade",
  celebrate: "front_celebrate",
  interact: "front_interact",
  greet: "front_interact",
  blocked: "front_blocked",
  battle: "front_battle"
};

const LOOPING_ROLES = new Set(["front_idle", "front_sleep", "front_train", "front_travel", "front_work", "front_play"]);

function serveStatic() {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const requestPath = decodeURIComponent(requestUrl.pathname);
      const relativePath = requestPath === "/" ? "moonpet-game.html" : requestPath.replace(/^\/+/, "");
      const target = path.resolve(ROOT, relativePath);
      if (!target.startsWith(ROOT + path.sep) && target !== ROOT) throw new Error("outside root");
      const body = await fs.readFile(target);
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
}

async function renderAllRoles(page) {
  return page.evaluate(async ({ expectedRoleMap, loopingRoles }) => {
    const renderer = window.MoonpetBottyFrontSpriteRenderer;
    if (!renderer) throw new Error("BOTTY renderer is unavailable");
    await renderer.initMoonpetBottyFrontRenderer({ cacheBust: "browser-smoke" });
    const state = renderer.getMoonpetBottyFrontRendererState();
    if (!state.ready) throw new Error(`BOTTY renderer not ready: ${state.reason} ${state.errors.join(" | ")}`);
    const canvas = document.getElementById("moonpet-canvas");
    const ctx = canvas.getContext("2d");
    const results = [];
    let column = 0;
    let row = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const [mode, expectedRole] of Object.entries(expectedRoleMap)) {
      const x = 72 + column * 124;
      const y = 180 + row * 120;
      const drew = renderer.renderBottyFrontMoonpet(ctx, mode, x, y, 0.72, 600, { active: true, startedAt: 0 });
      const lastRender = renderer.getMoonpetBottyFrontRendererState().lastRender;
      if (!drew || !lastRender || lastRender.role !== expectedRole) {
        throw new Error(`${mode} rendered ${lastRender && lastRender.role}, expected ${expectedRole}`);
      }
      if (Boolean(lastRender.loop) !== loopingRoles.includes(expectedRole)) {
        throw new Error(`${expectedRole} loop policy mismatch`);
      }
      results.push(lastRender);
      column += 1;
      if (column >= 5) {
        column = 0;
        row += 1;
      }
    }
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) nonTransparentPixels += 1;
    }
    return {
      ready: state.ready,
      loadedRoles: state.loadedRoles,
      results,
      nonTransparentPixels,
      overlayPresent: Boolean(document.getElementById("moonpet-art-v2-overlay")),
      sideScrollerEnabled: window.MoonpetBetaAppearance && window.MoonpetBetaAppearance.isSideScrollerEnabled
        ? window.MoonpetBetaAppearance.isSideScrollerEnabled()
        : null,
      rendererReady: renderer.getMoonpetBottyFrontRendererState().ready
    };
  }, { expectedRoleMap: EXPECTED_ROLE_MAP, loopingRoles: [...LOOPING_ROLES] });
}

const server = serveStatic();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const launchOptions = process.platform === "win32"
  ? { headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" }
  : { headless: true };
const browser = await chromium.launch(launchOptions);

try {
  await fs.mkdir(OUTPUT, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await context.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "query_id=botty-browser-smoke&user=%7B%22id%22%3A1%7D&auth_date=1&hash=local",
        ready() {},
        expand() {},
        disableVerticalSwipes() {},
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
      }
    };
    window.MOONPET_USE_BOTTY_FRONT_SPRITES = true;
    window.MOONPET_USE_SIDE_SCROLLER_SPRITES = false;
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (["error"].includes(message.type())) consoleErrors.push(message.text());
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  await page.route("**/telegram-pets/app/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/state")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: {
            adopted: true,
            name: "BOTTY",
            active: true,
            hunger: 80,
            happiness: 80,
            cleanliness: 80,
            energy: 80,
            level: 7,
            xp: 420,
            mood: "ready"
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { accepted: true }, state: { adopted: true, name: "BOTTY", active: true } })
    });
  });

  await page.goto(`${baseUrl}/moonpet-game.html?bottySprites=1&sideSprites=0`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.MoonpetBottyFrontSpriteRenderer), null, { timeout: 15000 });
  const proof = await renderAllRoles(page);
  assert.equal(proof.ready, true);
  assert.equal(proof.overlayPresent, false, "old moonpet-art-v2 overlay must not be present");
  assert.equal(proof.sideScrollerEnabled, false, "side-scroller renderer must be disabled by default");
  assert.equal(proof.rendererReady, true, "exported BOTTY renderer must report ready");
  assert.equal(proof.loadedRoles.length, 15, "all 15 BOTTY roles must load in browser");
  assert.equal(proof.results.length, 16, "role map smoke includes idle plus all routed action modes");
  assert.ok(proof.nonTransparentPixels > 5000, `BOTTY proof canvas must be nonblank, got ${proof.nonTransparentPixels} pixels`);
  assert.deepEqual(consoleErrors, []);
  await page.screenshot({ path: path.join(OUTPUT, "botty-front-mobile-390x844.png"), fullPage: true });

  console.log(`BOTTY front browser smoke passed; screenshot written to ${path.relative(ROOT, OUTPUT)}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
