const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const runnerPath = path.join(__dirname, "block-topia-build-queue.cjs");
const { applyDistrictEdits, enforceProductionCandidate, selectOllamaModel, validateDistrict, waterfrontTemplate } = require(runnerPath);

test("Ollama selection uses an installed preferred model and supports an explicit override", () => {
  assert.equal(selectOllamaModel(["nomic-embed-text:latest", "qwen2.5:7b"], undefined), "qwen2.5:7b");
  assert.equal(selectOllamaModel(["llama3.2:latest", "qwen2.5:7b"], "llama3.2:latest"), "llama3.2:latest");
  assert.throws(() => selectOllamaModel(["nomic-embed-text:latest"], undefined), /No chat-capable/);
  assert.throws(() => selectOllamaModel(["qwen2.5:7b"], "missing:latest"), /is not installed/);
});

test("production candidates preserve valid model choices and replace occupied guesses", () => {
  const lots = [{ x: 10, y: 4 }, { x: 12, y: 8 }];
  const sprites = ["flowers-0", "furniture-2"];
  assert.deepEqual(
    enforceProductionCandidate({ x: 12, y: 8, sprite: "furniture-2" }, lots, sprites, 0),
    { x: 12, y: 8, sprite: "furniture-2" }
  );
  assert.deepEqual(
    enforceProductionCandidate({ x: 99, y: 99, sprite: "missing-4" }, lots, sprites, 1),
    { x: 12, y: 8, sprite: "furniture-2" }
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


test("production placement sends bounded candidates and allows the local model to finish", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /candidateLots, sprites, reviewFeedback/);
  assert.match(source, /numPredict: 160, timeoutMs: 900_000/);
  assert.match(source, /request\.setTimeout\(timeoutMs/);
  assert.match(source, /response\.on\("aborted"/);
  assert.match(source, /response\.on\("error", fail\)/);
  assert.match(source, /!response\.complete/);
  assert.doesNotMatch(source, /fetch\("http:\/\/127\.0\.0\.1:11434/);
  assert.match(source, /brief\.slice\(0, 4000\)/);
  assert.match(source, /library\.slice\(0, 3000\)/);
});

test("production repairs discard rejected placements and refresh an advanced main base", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  assert.match(source, /context\.base !== latest\.object\.sha/);
  assert.match(source, /if \(pr\.merged\) return \{ url: pr\.html_url \};/);
  assert.match(source, /Main advanced after publication\. Rebuild on a new attempt branch\./);
  assert.match(source, /\["production-placement\.json", "publication\.json"\]/);
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
