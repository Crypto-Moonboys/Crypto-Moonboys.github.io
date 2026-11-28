const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const runnerPath = path.join(__dirname, "block-topia-build-queue.cjs");
const { applyDistrictEdits, enforceProductionCandidate, isTransientGithubFailure, markdownSections, productionCandidates, productionLedger, productionPlacement, productionVisualCheck, selectOllamaModel, validateDistrict, waterfrontTemplate, zoneForLot } = require(runnerPath);

async function liveWaterfrontDistrict(root) {
  const districtSource = fs.readFileSync(path.join(__dirname, "..", "workers", "moonboys-api", "blocktopia", "waterfront-district.js"), "utf8");
  const harbor = vm.runInNewContext(districtSource.replace(/export default district;\s*$/, "district;"), {}, { timeout: 1000 });
  const { extendWaterfront } = await import(pathToFileURL(path.join(root, "nature-island.mjs")).href);
  return extendWaterfront(harbor);
}

function liveAtlasAssets(root) {
  const names = ["cargo-runtime.webp", "factions-runtime.webp", "bots-runtime.webp", "hk-night-runtime.webp",
    "trees-runtime.webp", "street-detail-runtime.webp", "terrain-runtime.webp", "bitcoin-cash-tower-overhead.webp",
    "zcash-fortress-overhead-runtime.webp", "wax-bee-overhead-runtime.webp"];
  return Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, "assets", "atlases", name))]));
}

test("Waterfront queue has no Hermes research dependency", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  const installer = fs.readFileSync(path.join(__dirname, "block-topia-build-queue-install.sh"), "utf8");
  assert.doesNotMatch(source, /block-topia-research|research\.notes|research\.json/);
  assert.doesNotMatch(installer, /block-topia-research/);
  assert.equal(fs.existsSync(path.join(__dirname, "block-topia-research.sh")), false);
});

test("Ollama selection uses an installed preferred model and supports an explicit override", () => {
  assert.equal(selectOllamaModel(["nomic-embed-text:latest", "qwen2.5:7b"], undefined), "qwen2.5:7b");
  assert.equal(selectOllamaModel(["llama3.2:latest", "qwen2.5:7b"], "llama3.2:latest"), "llama3.2:latest");
  assert.throws(() => selectOllamaModel(["nomic-embed-text:latest"], undefined), /No chat-capable/);
  assert.throws(() => selectOllamaModel(["qwen2.5:7b"], "missing:latest"), /is not installed/);
});

test("transient GitHub failures are eligible for a scheduled retry", () => {
  assert.equal(isTransientGithubFailure(429), true);
  assert.equal(isTransientGithubFailure(500), true);
  assert.equal(isTransientGithubFailure(503), true);
  assert.equal(isTransientGithubFailure(404), false);
  assert.equal(isTransientGithubFailure(422), false);

  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /retryableGithubMethods = new Set\(\["GET"\]\)/);
  assert.match(source, /Retrying on the next scheduled run/);
  assert.match(source, /if \(current\.merged\) return \{ url: current\.html_url \};/);
  assert.match(source, /await checkApproval\(issue, iterationLabel\);/);
  assert.match(source, /Integration advanced during a transient merge failure/);
});

test("planned production candidates preserve valid choices and replace invalid guesses", () => {
  const plan = {
    rules: { maxSameAssetPerZone: 1 },
    assets: {
      flowers: [{ id: "flowers-0", class: "flowers" }],
      furniture: [{ id: "furniture-2", class: "furniture" }]
    }
  };
  const ledger = { zones: { park: { assets: {} } } };
  const lots = [
    { x: 10, y: 4, zone: "park", allowedClasses: ["flowers"] },
    { x: 12, y: 8, zone: "park", allowedClasses: ["furniture"] }
  ];
  assert.deepEqual(
    enforceProductionCandidate({ zone: "park", x: 12, y: 8, asset: "furniture-2", purpose: "rest", playerBenefit: "seat" }, lots, plan, ledger, 0),
    { zone: "park", x: 12, y: 8, asset: "furniture-2", class: "furniture", purpose: "rest", playerBenefit: "seat" }
  );
  assert.deepEqual(
    enforceProductionCandidate({ x: 99, y: 99, asset: "missing-4" }, lots, plan, ledger, 1),
    { zone: "park", x: 12, y: 8, asset: "furniture-2", class: "furniture", purpose: "", playerBenefit: "" }
  );
});

test("starter has a connected dock, street, lighthouse, and two buildable plots", () => {
  const district = validateDistrict(waterfrontTemplate);
  const tiles = district.rows.join("");
  assert.equal(district.rows.length, 12);
  assert.equal(tiles.match(/_/g).length, 2);
  assert.ok(tiles.includes("h"));
  assert.ok(tiles.includes("d"));
  assert.equal(district.route.length, tiles.match(/[rd]/g).length);
});

test("a small proposal extends the street and adds a plot without mutating the template", () => {
  const next = applyDistrictEdits(waterfrontTemplate, {
    edits: [{ x: 4, y: 6, tile: "r" }, { x: 5, y: 6, tile: "_" }]
  });
  assert.equal(next.rows[6], "....r_......");
  assert.equal(waterfrontTemplate.rows[6], "............");
});

test("invalid, duplicate, and disconnected edits fail", () => {
  assert.throws(() => applyDistrictEdits(waterfrontTemplate, {
    edits: [{ x: 12, y: 6, tile: "r" }]
  }), /coordinates/);
  assert.throws(() => applyDistrictEdits(waterfrontTemplate, {
    edits: [{ x: 4, y: 6, tile: "r" }, { x: 4, y: 6, tile: "d" }]
  }), /at most once/);
  assert.throws(() => applyDistrictEdits(waterfrontTemplate, {
    edits: [{ x: 9, y: 10, tile: "r" }]
  }), /connect/);
  assert.throws(() => applyDistrictEdits(waterfrontTemplate, {
    edits: [{ x: 5, y: 3, tile: "." }]
  }), /two connected buildable plots/);
});

test("an empty tile edit preserves the map for palette-only repairs", () => {
  assert.deepEqual(applyDistrictEdits(waterfrontTemplate, { edits: [] }).rows, waterfrontTemplate.rows);
});

test("the starter preview can be rendered without queue credentials", () => {
  const result = spawnSync(process.execPath, [runnerPath, "--starter-preview"], {
    encoding: "utf8", env: {}
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Lumina’s Waterfront/);
  assert.match(result.stdout, /<canvas id="map"/);
});


test("production planner receives full structured context without lossy prefix slices", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  const brief = fs.readFileSync(path.join(__dirname, "..", "games", "block-topia", "waterfront", "CITY-BRIEF.md"), "utf8");
  const library = fs.readFileSync(path.join(__dirname, "..", "games", "block-topia", "waterfront", "SPRITE-LIBRARY.md"), "utf8");
  assert.ok(markdownSections(brief).some(section => section.heading === "VPS build worker"));
  assert.ok(markdownSections(library).some(section => section.heading === "Bot fish"));
  assert.match(source, /cityBrief: markdownSections\(brief\)/);
  assert.match(source, /spriteLibrary: markdownSections\(library\)/);
  assert.match(source, /contextTokens: 16384/);
  assert.match(source, /numPredict: 320/);
  assert.doesNotMatch(source, /brief\.slice\(0, 4000\)/);
  assert.doesNotMatch(source, /library\.slice\(0, 3000\)/);
  assert.match(source, /request\.setTimeout\(timeoutMs/);
  assert.doesNotMatch(source, /fetch\("http:\/\/127\.0\.0\.1:11434/);
});

test("zone plan enforces finite density, spacing, variety, and tree support", async () => {
  const root = path.join(__dirname, "..", "games", "block-topia", "waterfront");
  const plan = JSON.parse(fs.readFileSync(path.join(root, "BUILD-ZONES.json"), "utf8"));
  const renderer = fs.readFileSync(path.join(root, "harbor-art.js"), "utf8");
  const district = await liveWaterfrontDistrict(root);
  const ledger = productionLedger(renderer, plan, district);
  assert.ok(ledger.placements.some(item => item.x === 15 && item.y === 26 && item.asset === "furniture-5"));
  assert.ok(ledger.placements.some(item => item.x === 15 && item.y === 27 && item.asset === "flowers-8"));
  assert.equal(ledger.zones["east-shore"].complete, true);
  assert.equal(ledger.zones["east-common"].complete, true);
  assert.equal(zoneForLot(plan, 15, 22).id, "west-meadow");
  const { candidates } = productionCandidates(district, renderer, plan);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(candidate => !["east-shore", "east-common"].includes(candidate.zone)));
  for (const candidate of candidates) {
    assert.ok(ledger.placements.every(item =>
      Math.max(Math.abs(candidate.x - item.x), Math.abs(candidate.y - item.y)) > plan.rules.minChebyshevSpacing));
  }
  const treeLot = candidates.find(candidate => candidate.allowedClasses.includes("tree"));
  assert.ok(treeLot);
  const selected = enforceProductionCandidate({ ...treeLot, asset: "tree-3" }, candidates, plan, ledger, 0);
  assert.match(productionPlacement(renderer, district, selected), /tree\(x, y, 3, 0\.82\)/);
});

test("production performs rendered desktop and mobile Chromium validation", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /productionVisualCheck/);
  assert.match(source, /baselineChecksum/);
  assert.match(source, /candidate-desktop\.png/);
  assert.match(source, /candidate-mobile\.png/);
  assert.match(source, /\[1440, 1000\]/);
  assert.match(source, /\[390, 844\]/);
  assert.match(source, /The rendered Waterfront candidate is visually identical to its base/);
  assert.match(source, /production-validation\.json/);
  assert.match(source, /completed\.json/);
  assert.match(source, /nature-island\.mjs/);
  assert.match(source, /extendWaterfront\(harbor\)/);
  assert.match(source, /waterfrontIslandPatrol=islandPatrol/);
  assert.match(source, /waterfrontIslandSeed=islandSeed/);
  assert.match(source, /function findRoute\(start,goal,canWalk\)/);
  assert.match(source, /landmarkLoads>=3/);
  assert.match(source, /Waterfront landmark artwork did not finish loading/);
  assert.match(source, /image\.onload=resolve/);
  assert.match(source, /Waterfront preview artwork failed to load/);
  assert.match(source, /document\.body\.append\(image\)/);
  assert.match(source, /recordPreviewError/);
  assert.match(source, /unhandledrejection/);
  assert.match(source, /Image\.prototype\.decode=function previewDecode/);
  assert.match(source, /image\.naturalWidth>0/);
  assert.match(source, /Waterfront preview image failed to load/);
  assert.match(source, /--headless=new/);
  assert.match(source, /--disable-dev-shm-usage/);
  assert.match(source, /DBUS_SESSION_BUS_ADDRESS/);
  assert.match(source, /"disabled:"/);
  assert.match(source, /const rendered = dom\.stdout/);
  assert.match(source, /rmSync\(screenshot, \{ force: true \}\)/);
  assert.match(source, /statSync\(screenshot\)\.size >= 1024/);
  for (const name of ["bitcoin-cash-tower-overhead.webp", "zcash-fortress-overhead-runtime.webp", "wax-bee-overhead-runtime.webp"]) {
    assert.match(source, new RegExp(name.replaceAll(".", "\\.")));
  }
  for (const name of ["cargo", "factions", "bots", "hk-night", "trees", "street-detail", "terrain"]) {
    assert.match(source, new RegExp(`"${name}-runtime\\.webp"`));
  }
  assert.match(source, /if \(blockedClass\) allowedClasses = allowedClasses\.filter/);
});

test("available Chromium renders the real proposed Waterfront at both viewports", async t => {
  const browser = process.env.BLOCK_TOPIA_CHROMIUM || "chromium";
  if (spawnSync(browser, ["--version"], { encoding: "utf8" }).status !== 0) {
    t.skip("Chromium is not installed in this test environment");
    return;
  }
  const root = path.join(__dirname, "..", "games", "block-topia", "waterfront");
  const plan = JSON.parse(fs.readFileSync(path.join(root, "BUILD-ZONES.json"), "utf8"));
  const renderer = fs.readFileSync(path.join(root, "harbor-art.js"), "utf8");
  const district = await liveWaterfrontDistrict(root);
  const { candidates, ledger } = productionCandidates(district, renderer, plan);
  const candidate = candidates.find(item => item.allowedClasses.includes("tree")) ?? candidates[0];
  assert.ok(candidate);
  const asset = candidate.allowedClasses.includes("tree") ? "tree-3"
    : candidate.allowedClasses.includes("furniture") ? "furniture-2" : "flowers-2";
  const proposal = enforceProductionCandidate({ ...candidate, asset }, candidates, plan, ledger, 0);
  const updated = productionPlacement(renderer, district, proposal);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waterfront-visual-"));
  try {
    const natureSource = fs.readFileSync(path.join(root, "nature-island.mjs"), "utf8");
    const visual = await productionVisualCheck(dir, renderer, updated, district, proposal, liveAtlasAssets(root), natureSource);
    assert.equal(visual.status, "passed");
    assert.notEqual(visual.baselineChecksum, visual.desktopChecksum);
    assert.equal(visual.screenshots.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("production repairs discard rejected placements and refresh an advanced main base", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /context\.base !== latest\.object\.sha/);
  assert.match(source, /if \(pr\.merged\) return \{ url: pr\.html_url \};/);
  assert.match(source, /Main advanced after publication\. Rebuild on a new attempt branch\./);
  assert.match(source, /\["production-placement\.json", "publication\.json", "production-visual\.json"\]/);
  assert.match(source, /for \(let retry = 0; retry < 3; retry\+\+\)/);
  assert.match(source, /fs\.rm\(placementFile, \{ force: true \}\)/);
  assert.match(source, /proposal = null/);
});

test("production rounds target main and use a linear-history squash merge", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /const productionTarget = "main";/);
  assert.match(source, /context = \{ branch: productionTarget, base: latest\.object\.sha \};/);
  assert.match(source, /merge_method: production \? "squash" : "merge"/);
  assert.doesNotMatch(source, /waterfront-production-integration/);
});

test("the live Waterfront reloads after twenty minutes without discarding unsaved edits", () => {
  const root = path.join(__dirname, "..", "games", "block-topia", "waterfront");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const map = fs.readFileSync(path.join(root, "map.js"), "utf8");
  assert.match(html, /20 \* 60_000/);
  assert.match(html, /waterfrontReloadSafe !== false/);
  assert.match(html, /setTimeout\(refreshWaterfrontWhenSafe, 60_000\)/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.match(map, /waterfrontReloadSafe = false/);
  assert.match(map, /waterfrontReloadSafe = true/);
});
