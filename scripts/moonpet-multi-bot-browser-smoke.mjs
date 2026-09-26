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
const BOTS = [
  ["vinyl_crab", "BOTTY"], ["neon_raccoon", "F1 EDDY"], ["bubble_ram", "JAKE THE SNAKE"],
  ["comet_gecko", "TUBBY"], ["lantern_fox", "RED ALERT"], ["sneaker_snail", "THE TING"],
  ["alley_drake", "TATTOO JOHN"], ["moon_ferret", "TIN BOB"]
];
const ART_REGISTRY = JSON.parse(fsSync.readFileSync(path.join(ROOT, "data", "moonpet-bot-art-registry.json"), "utf8"));
const STREET_READY = ART_REGISTRY.shared_stages?.stage_1?.status === "complete";
const STREET_BOT = STREET_READY ? "WTFBOI" : null;

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
  const animatedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await animatedPage.emulateMedia({ reducedMotion: "no-preference" });
  await animatedPage.route("https://telegram.org/**", (route) => route.fulfill({ contentType: "text/javascript", body: "window.Telegram={WebApp:{initData:'',viewportHeight:520,viewportStableHeight:520,ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){}}};" }));
  await animatedPage.goto(`http://127.0.0.1:${address.port}/moonpet-game.html?botArt=1&sideSprites=0`, { waitUntil: "networkidle" });
  await animatedPage.waitForFunction(() => Boolean(window.MoonpetBetaAppearance));
  const frameSnapshot = () => animatedPage.evaluate(() => {
    const canvas = document.getElementById("moonpet-canvas");
    return canvas.toDataURL("image/png");
  });
  await animatedPage.waitForTimeout(1200);
  const firstFrame = await frameSnapshot();
  await animatedPage.waitForTimeout(250);
  const secondFrame = await frameSnapshot();
  assert.notEqual(secondFrame, firstFrame, "the retro space battle must animate between live canvas frames");
  await animatedPage.close();

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://telegram.org/**", (route) => route.fulfill({ contentType: "text/javascript", body: "window.Telegram={WebApp:{initData:'',viewportHeight:520,viewportStableHeight:520,ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){}}};" }));
  await page.goto(`http://127.0.0.1:${address.port}/moonpet-game.html?botArt=1&sideSprites=0`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.MoonpetBotArtRenderer));
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--moonpet-viewport-height").trim() === "520px");

  const shellLayout = await page.evaluate(() => {
    const nav = document.getElementById("nav");
    nav.innerHTML = ["HOME", "MISSIONS", "EXPLORE", "WORK", "ECONOMY", "PROFILE"]
      .map((label) => `<button type="button"><span>+</span>${label}</button>`).join("");
    const shell = document.getElementById("moonpet-app").getBoundingClientRect();
    const viewport = document.querySelector(".viewport").getBoundingClientRect();
    const output = document.getElementById("terminal-output");
    const outputText = output.querySelector(".terminal-output-text");
    outputText.textContent = "ACTION COMPLETE // +5 PET XP // GROWTH MARK AWARDED // MOONPET REACTION CONFIRMED";
    output.classList.add("is-scrolling");
    const outputBox = output.getBoundingClientRect();
    const outputStyle = getComputedStyle(output);
    const outputTextStyle = getComputedStyle(outputText);
    const screenBox = document.getElementById("screen").getBoundingClientRect();
    const dock = nav.getBoundingClientRect();
    const buttons = Array.from(nav.querySelectorAll("button"), (button) => button.getBoundingClientRect());
    return {
      viewportVariable: getComputedStyle(document.documentElement).getPropertyValue("--moonpet-viewport-height").trim(),
      shellBottom: shell.bottom,
      viewportBottom: viewport.bottom,
      outputTop: outputBox.top,
      outputBottom: outputBox.bottom,
      outputHeight: outputBox.height,
      outputPosition: outputStyle.position,
      outputAnimation: outputStyle.animationName,
      outputTextAnimation: outputTextStyle.animationName,
      screenTop: screenBox.top,
      dockBottom: dock.bottom,
      buttonBottoms: buttons.map((button) => button.bottom),
    };
  });
  assert.equal(shellLayout.viewportVariable, "520px", "shell must use Telegram's visible viewport height");
  assert.ok(shellLayout.shellBottom <= 520.5, "shell must fit inside Telegram's visible viewport");
  assert.ok(Math.abs(shellLayout.outputTop - shellLayout.viewportBottom) < 1, "status strip must sit directly below the canvas");
  assert.ok(shellLayout.outputHeight >= 34, "status strip must remain visible");
  assert.equal(shellLayout.outputPosition, "relative", "status strip must occupy a stable grid row");
  assert.equal(shellLayout.outputAnimation, "none", "the fixed status bar must not move or animate");
  assert.equal(shellLayout.outputTextAnimation, "terminal-status-scroll", "overflowing details must scroll inside the fixed strip");
  assert.ok(shellLayout.outputBottom <= shellLayout.screenTop + 1, "status strip must stay above the scrollable controls");
  assert.ok(shellLayout.dockBottom <= 520.5, "bottom dock must not be cropped by Telegram's visible viewport");
  assert.ok(shellLayout.buttonBottoms.every((bottom) => bottom <= 513.5), "every dock button must fit above the dock's bottom padding");

  await fs.mkdir(OUTPUT, { recursive: true });
  await selectAndWaitForPack(page, { speciesId: "neon_raccoon", speciesName: "F1 EDDY", evolutionStage: 2 }, "F1 EDDY");
  const liveComposition = await page.evaluate(() => {
    const canvas = document.getElementById("moonpet-canvas");
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 64) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    document.getElementById("hud").innerHTML = ["LVL 12", "GOLD 4,250", "GEMS 84"]
      .map((value) => `<div class="hud-chip"><strong>${value}</strong></div>`).join("");
    const renderer = window.MoonpetBotArtRenderer;
    const drew = renderer.renderMoonpetBot(context, "idle", 160, 219, 1, 0, { active: false, startedAt: 0 });
    return { drew, colors: colors.size, render: renderer.getMoonpetBotArtRendererState().lastRender };
  });
  assert.equal(liveComposition.drew, true, "the selected bot must render over the space battle");
  assert.ok(liveComposition.colors >= 8, "the retro space battle must render a nonblank multicolor frame");
  assert.ok(liveComposition.render.drawWidth <= 184.01 && liveComposition.render.drawHeight <= 184.01,
    "the enlarged bot must stay inside the shared fit box");
  assert.ok(219 - liveComposition.render.drawHeight >= 35 - 0.01,
    "the bot frame must start below the HUD detail row");
  assert.ok(Math.abs(liveComposition.render.sourceAspect - liveComposition.render.drawAspect) < 1e-9,
    "the live bot must preserve its source aspect ratio");
  await page.locator(".viewport").screenshot({ path: path.join(OUTPUT, "retro-space-stage-mobile-390.png") });

  const result = await page.evaluate(async (modes) => {
    const renderer = window.MoonpetBotArtRenderer;
    const makeIdentity = (speciesId, speciesName) => ({ speciesId, speciesName, evolutionStage: 1 });
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
  assert.equal(result.botty.resolvedBot, STREET_BOT || "BOTTY");
  assert.equal(result.staleDrew, false, "character switch must clear stale sprites immediately");

  for (const [speciesId, botName] of BOTS) {
    await page.evaluate((identity) => window.MoonpetBotArtRenderer.selectMoonpetBot(identity), { speciesId, speciesName: botName, evolutionStage: 0 });
    await page.waitForFunction(() => {
      const selected = window.MoonpetBotArtRenderer.getMoonpetBotArtRendererState();
      return selected.ready && selected.resolvedBot === "EGGYONE" && selected.loadedRoles.length === 7;
    }, null, { timeout: 20000 });
    const stageZero = await page.evaluate(() => window.MoonpetBotArtRenderer.getMoonpetBotArtRendererState());
    assert.equal(stageZero.requestedEvolution, "stage_0", `${botName} must request Stage 0`);
    assert.equal(stageZero.resolvedEvolution, "stage_0", `${botName} must resolve to Stage 0`);
    assert.equal(stageZero.fallbackUsed, false, `${botName} Stage 0 must not use fallback art`);
  }

  const eggyoneRenders = await page.evaluate(async () => {
    const renderer = window.MoonpetBotArtRenderer;
    const proof = document.getElementById("multi-bot-proof");
    const context = proof.getContext("2d");
    const background = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = "/games/assets/BITTY BACKGROUND.jpg";
    });
    const cases = [
      ["idle", 0], ["idle", 8], ["sleep", 0], ["interact", 0],
      ["feed", 0], ["idle", 11], ["hatch", 12]
    ];
    context.drawImage(background, 0, 0, proof.width, proof.height);
    return cases.map(([mode, progress], index) => {
      const drew = renderer.renderMoonpetBot(context, mode, 80 + index % 4 * 160, 150 + Math.floor(index / 4) * 220, 0.65, 1000, {
        active: true,
        startedAt: 0,
        lifecycle: { incubation: { progress, target: 12 } }
      });
      return { drew, ...renderer.getMoonpetBotArtRendererState().lastRender };
    });
  });
  assert.deepEqual(eggyoneRenders.map((entry) => entry.role), ["egg_idle", "egg_wobble", "egg_sleep", "egg_react", "egg_care", "egg_breakout", "egg_hatch"]);
  assert.ok(eggyoneRenders.every((entry) => entry.drew && entry.frameCount === 25 && entry.resolvedBot === "EGGYONE"));
  assert.ok(eggyoneRenders.every((entry) => Math.abs(entry.sourceAspect - entry.drawAspect) < 1e-9), "EGGYONE frames must preserve aspect ratio");
  await page.locator("#multi-bot-proof").screenshot({ path: path.join(OUTPUT, "eggyone-stage0-seven-roles.png") });

  for (const [speciesId, botName] of BOTS) {
    for (let evolutionStage = 1; evolutionStage <= 5; evolutionStage += 1) {
      const expectedBot = evolutionStage === 1 && STREET_READY ? STREET_BOT : botName;
      const selection = await selectAndWaitForPack(page, { speciesId, speciesName: botName, evolutionStage }, expectedBot);
      assert.equal(selection.requestedEvolution, `stage_${evolutionStage}`);
      assert.equal(selection.resolvedEvolution, "stage_1");
      assert.equal(selection.evolutionFallbackUsed, evolutionStage > 1);
      assert.equal(selection.display.fit_width, 184, `${botName} must use shared fit width`);
      assert.equal(selection.display.fit_height, 184, `${botName} must use shared fit height`);
      assert.equal(selection.display.scale, 1, `${botName} must use shared scale`);
      assert.equal(selection.display.pivot_y, 1, `${botName} must stand on the bottom edge`);
      const renders = await page.evaluate((modes) => {
        const renderer = window.MoonpetBotArtRenderer;
        const canvas = document.getElementById("multi-bot-proof");
        const context = canvas.getContext("2d");
        return modes.map((mode, index) => ({
          mode,
          drew: renderer.renderMoonpetBot(context, mode, 80, 150, 0.65, 500 + index * 100, { active: true, startedAt: 0 }),
          lastRender: renderer.getMoonpetBotArtRendererState().lastRender
        }));
      }, MODES);
      assert.ok(renders.every((entry) => entry.drew && entry.lastRender.resolvedBot === expectedBot), `${botName} stage ${evolutionStage} must render every action`);
      assert.ok(renders.every((entry) => entry.lastRender.drawWidth <= 184 * 0.65 + 0.01 && entry.lastRender.drawHeight <= 184 * 0.65 + 0.01),
        `${botName} stage ${evolutionStage} must stay inside the shared canvas fit box`);
      assert.ok(renders.every((entry) => Math.abs(entry.lastRender.sourceAspect - entry.lastRender.drawAspect) < 1e-9),
        `${botName} stage ${evolutionStage} must preserve sprite aspect ratio without squashing`);
    }
  }

  await selectAndWaitForPack(page, { speciesId: "comet_gecko", speciesName: "TUBBY", evolutionStage: 2 }, "TUBBY");
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

  const tinBobSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "moon_ferret", speciesName: "TIN BOB", evolutionStage: 2 }));
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

  const theTingSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "sneaker_snail", speciesName: "THE TING", evolutionStage: 2 }));
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

  const tattooJohnSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "alley_drake", speciesName: "TATTOO JOHN", evolutionStage: 2 }));
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

  const redAlertSelection = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "lantern_fox", speciesName: "RED ALERT", evolutionStage: 2 }));
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

  const jakeSelection = await selectAndWaitForPack(page, { speciesId: "bubble_ram", speciesName: "JACK THE SNAKE", evolutionStage: 2 }, "JAKE THE SNAKE");
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

  const f1EddySelection = await selectAndWaitForPack(page, { speciesId: "neon_raccoon", speciesName: "F1 EDDY", evolutionStage: 2 }, "F1 EDDY");
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

  const unknown = await page.evaluate(() => window.MoonpetBotArtRenderer.selectMoonpetBot({ speciesId: "future_bot", speciesName: "BOT 9", evolutionStage: 2 }));
  assert.equal(unknown.resolvedBot, "BOTTY");
  assert.equal(unknown.fallbackUsed, true);
  const returned = await selectAndWaitForPack(page, { speciesId: "neon_raccoon", speciesName: "F1 EDDY", evolutionStage: 2 }, "F1 EDDY");
  assert.equal(returned.resolvedBot, "F1 EDDY");
  assert.equal(returned.fallbackUsed, false);

  await waitForPack(page, "F1 EDDY");
  await page.screenshot({ path: path.join(OUTPUT, "f1-eddy-mobile-390x844.png"), fullPage: false });
  console.log(JSON.stringify({ botty: "pass", streetStage: STREET_BOT || "pending-install", tubbyActions: tubby.renders.length, tinBobActions: tinBob.renders.length, theTingActions: theTing.renders.length, tattooJohnActions: tattooJohn.renders.length, redAlertActions: redAlert.renders.length, jakeTheSnakeActions: jakeTheSnake.renders.length, f1EddyActions: f1Eddy.renders.length, activationOverlay: "removed", unknownFallback: unknown.resolvedBot, switchBack: returned.resolvedBot, mobile: "390x844" }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
