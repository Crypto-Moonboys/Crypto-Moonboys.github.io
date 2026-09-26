import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, ".tmp", "moonpet-multi-bot-browser-smoke");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const MODES = ["idle", "feed", "play", "clean", "sleep", "train", "travel", "work", "equip", "evolve", "trade", "celebrate", "interact", "blocked", "battle"];

function serveStatic() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname === "/" ? "/moonpet-game.html" : url.pathname).replace(/^\/+/, "");
      const target = path.resolve(ROOT, relative);
      if (!target.startsWith(ROOT + path.sep)) throw new Error("outside root");
      const body = await fs.readFile(target);
      response.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

async function waitForPack(page, expectedBot) {
  await page.waitForFunction((bot) => {
    const state = window.MoonpetBotArtRenderer?.getMoonpetBotArtRendererState();
    return state?.ready && state.resolvedBot === bot && state.loadedRoles.length === 15;
  }, expectedBot, { timeout: 20000 });
}

async function selectAndWaitForPack(page, identity, expectedBot) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await page.evaluate((nextIdentity) => window.MoonpetBotArtRenderer.selectMoonpetBot(nextIdentity), identity);
    try {
      await page.waitForFunction((bot) => {
        const state = window.MoonpetBotArtRenderer?.getMoonpetBotArtRendererState();
        return state?.ready && state.resolvedBot === bot && state.loadedRoles.length === 15;
      }, expectedBot, { timeout: 3000 });
      return await page.evaluate(() => window.MoonpetBotArtRenderer.getMoonpetBotArtRendererState());
    } catch {
      await page.waitForTimeout(250);
    }
  }
  throw new Error(`Timed out selecting ${expectedBot}`);
}

const server = serveStatic();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];
const executablePath = chromeCandidates.find((candidate) => fsSync.existsSync(candidate));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.route("https://telegram.org/**", (route) => route.fulfill({ contentType: "text/javascript", body: "window.Telegram={WebApp:{initData:'',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}};" }));
  await page.goto(`http://127.0.0.1:${address.port}/moonpet-game.html?botArt=1&sideSprites=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.MoonpetBotArtRenderer));

  const result = await page.evaluate(async (modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const makeIdentity = (speciesId, speciesName) => ({ speciesId, speciesName });
    await renderer.selectMoonpetBot(makeIdentity("vinyl_crab", "BOTTY"));
    const botty = renderer.getMoonpetBotArtRendererState();

    const switching = renderer.selectMoonpetBot(makeIdentity("comet_gecko", "TUBBY"));
    const proof = document.createElement("canvas");
    proof.id = "multi-bot-proof";
    proof.width = 640;
    proof.height = 640;
    proof.style.cssText = "position:fixed;inset:0;width:390px;height:390px;z-index:99999;background:#0e1014";
    document.body.appendChild(proof);
    const context = proof.getContext("2d");
    const staleDrew = renderer.renderMoonpetBot(context, "idle", 80, 150, 0.72, 500, { active: true, startedAt: 0 });
    await switching;
    return { botty, staleDrew };
  }, MODES);
  assert.equal(result.botty.resolvedBot, "BOTTY");
  assert.equal(result.staleDrew, false, "character switch must clear stale sprites immediately");

  await waitForPack(page, "TUBBY");
  const tubby = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 700, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(tubby.state.resolvedBot, "TUBBY");
  assert.equal(tubby.state.fallbackUsed, false);
  assert.equal(tubby.state.loadedRoles.length, 15);
  assert.ok(tubby.renders.every((entry) => entry.drew && entry.resolvedBot === "TUBBY"));
  assert.ok(tubby.renders.every((entry) => entry.frameCount === 25));

  const tinBobSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "moon_ferret", speciesName: "TIN BOB" }));
  assert.equal(tinBobSelection.resolvedBot, "TIN BOB");
  assert.equal(tinBobSelection.fallbackUsed, false);
  await waitForPack(page, "TIN BOB");
  const tinBob = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 900, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(tinBob.state.resolvedBot, "TIN BOB");
  assert.equal(tinBob.state.fallbackUsed, false);
  assert.equal(tinBob.state.loadedRoles.length, 15);
  assert.ok(tinBob.renders.every((entry) => entry.drew && entry.resolvedBot === "TIN BOB"));
  assert.ok(tinBob.renders.every((entry) => entry.frameCount === 25));

  const theTingSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "sneaker_snail", speciesName: "THE TING" }));
  assert.equal(theTingSelection.resolvedBot, "THE TING");
  assert.equal(theTingSelection.fallbackUsed, false);
  await waitForPack(page, "THE TING");
  const theTing = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 1100, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(theTing.state.resolvedBot, "THE TING");
  assert.equal(theTing.state.fallbackUsed, false);
  assert.equal(theTing.state.loadedRoles.length, 15);
  assert.ok(theTing.renders.every((entry) => entry.drew && entry.resolvedBot === "THE TING"));
  assert.ok(theTing.renders.every((entry) => entry.frameCount === 25));

  const tattooJohnSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "alley_drake", speciesName: "TATTOO JOHN" }));
  assert.equal(tattooJohnSelection.resolvedBot, "TATTOO JOHN");
  assert.equal(tattooJohnSelection.fallbackUsed, false);
  await waitForPack(page, "TATTOO JOHN");
  const tattooJohn = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 1300, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(tattooJohn.state.resolvedBot, "TATTOO JOHN");
  assert.equal(tattooJohn.state.fallbackUsed, false);
  assert.equal(tattooJohn.state.loadedRoles.length, 15);
  assert.ok(tattooJohn.renders.every((entry) => entry.drew && entry.resolvedBot === "TATTOO JOHN"));
  assert.ok(tattooJohn.renders.every((entry) => entry.frameCount === 25));

  const redAlertSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "lantern_fox", speciesName: "RED ALERT" }));
  assert.equal(redAlertSelection.resolvedBot, "RED ALERT");
  assert.equal(redAlertSelection.fallbackUsed, false);
  await waitForPack(page, "RED ALERT");
  const redAlert = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 1500, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(redAlert.state.resolvedBot, "RED ALERT");
  assert.equal(redAlert.state.fallbackUsed, false);
  assert.equal(redAlert.state.loadedRoles.length, 15);
  assert.ok(redAlert.renders.every((entry) => entry.drew && entry.resolvedBot === "RED ALERT"));
  assert.ok(redAlert.renders.every((entry) => entry.frameCount === 25));

  const jakeSelection = await selectAndWaitForPack(page, { speciesId: "bubble_ram", speciesName: "JACK THE SNAKE" }, "JAKE THE SNAKE");
  assert.equal(jakeSelection.resolvedBot, "JAKE THE SNAKE");
  assert.equal(jakeSelection.fallbackUsed, false);
  const jakeTheSnake = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 1700, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(jakeTheSnake.state.resolvedBot, "JAKE THE SNAKE");
  assert.equal(jakeTheSnake.state.fallbackUsed, false);
  assert.equal(jakeTheSnake.state.loadedRoles.length, 15);
  assert.ok(jakeTheSnake.renders.every((entry) => entry.drew && entry.resolvedBot === "JAKE THE SNAKE"));
  assert.ok(jakeTheSnake.renders.every((entry) => entry.frameCount === 25));

  const f1EddySelection = await selectAndWaitForPack(page, { speciesId: "neon_raccoon", speciesName: "F1 EDDY" }, "F1 EDDY");
  assert.equal(f1EddySelection.resolvedBot, "F1 EDDY");
  assert.equal(f1EddySelection.fallbackUsed, false);
  const f1Eddy = await page.evaluate((modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const canvas = document.getElementById("multi-bot-proof");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renders = modes.map((mode, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const drew = renderer.renderMoonpetBot(context, mode, 80 + column * 160, 150 + row * 150, 0.65, 1900, { active: true, startedAt: 0 });
      return { mode, drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
    return { state: renderer.getMoonpetBotArtRendererState(), renders };
  }, MODES);
  assert.equal(f1Eddy.state.resolvedBot, "F1 EDDY");
  assert.equal(f1Eddy.state.fallbackUsed, false);
  assert.equal(f1Eddy.state.loadedRoles.length, 15);
  assert.ok(f1Eddy.renders.every((entry) => entry.drew && entry.resolvedBot === "F1 EDDY"));
  assert.ok(f1Eddy.renders.every((entry) => entry.frameCount === 25));

  const unknown = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "future_bot", speciesName: "BOT 9" }));
  assert.equal(unknown.resolvedBot, "BOTTY");
  assert.equal(unknown.fallbackUsed, true);
  const returned = await selectAndWaitForPack(page, { speciesId: "neon_raccoon", speciesName: "F1 EDDY" }, "F1 EDDY");
  assert.equal(returned.resolvedBot, "F1 EDDY");
  assert.equal(returned.fallbackUsed, false);

  await waitForPack(page, "F1 EDDY");
  await fs.mkdir(OUTPUT, { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT, "f1-eddy-mobile-390x844.png"), fullPage: false });
  console.log(JSON.stringify({ botty: "pass", tubbyActions: tubby.renders.length, tinBobActions: tinBob.renders.length, theTingActions: theTing.renders.length, tattooJohnActions: tattooJohn.renders.length, redAlertActions: redAlert.renders.length, jakeTheSnakeActions: jakeTheSnake.renders.length, f1EddyActions: f1Eddy.renders.length, unknownFallback: unknown.resolvedBot, switchBack: returned.resolvedBot, mobile: "390x844" }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
