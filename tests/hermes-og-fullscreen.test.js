"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

const shellIndex = read("admin/hermes-webui/index.html");
const shellStyle = read("admin/hermes-webui/style.css");
const hermesPage = read("admin/hermes-chat.html");
const brainPage = read("admin/the-brain.html");
const runtimeJs = read("js/hermes-chat.js");
const adapterJs = read("js/hermes-webui-adapter.js");
const hermesApi = read("api/hermes-api.js");
const brainApi = read("api/brain-api.js");

test("imports actual hermes-webui shell structure and styling", () => {
  assert.match(shellIndex, /id="appTitlebarTitle"/u);
  assert.match(shellIndex, /class="layout"/u);
  assert.match(shellIndex, /id="composerWrap"/u);
  assert.match(shellIndex, /id="rightpanelResize"/u);
  assert.match(shellIndex, /id="kanbanBoardModal"/u);
  assert.match(shellIndex, /window\.__HERMES_WEBUI_IMPORTED\s*=\s*true/u);
  assert.match(shellStyle, /:root \{/u);
  assert.match(shellStyle, /:root\.dark/u);
  assert.match(shellStyle, /\.composer-wrap/u);
  assert.match(shellStyle, /\.rightpanel/u);
});

test("vendored hermes-webui static assets required by index exist", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "admin", "hermes-webui", "static", "vendor", "smd.min.js")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "admin", "hermes-webui", "sw.js")), true);
  assert.match(shellIndex, /import \* as smd from '.\/static\/vendor\/smd\.min\.js'/u);
  assert.match(shellIndex, /serviceWorker\.register\('sw\.js\?v=__WEBUI_VERSION__'\)/u);
});

test("shell asset paths are relative with dynamic base href", () => {
  assert.match(shellIndex, /base href enables subpath mount support/u);
  assert.match(shellIndex, /href="style\.css"/u);
  assert.match(shellIndex, /src="\.\.\/\.\.\/js\/hermes-webui-adapter\.js"/u);
  assert.match(shellIndex, /src="\.\.\/\.\.\/js\/hermes-chat\.js"/u);
  assert.doesNotMatch(shellIndex, /href="\/admin\/hermes-webui\/style\.css"/u);
  assert.doesNotMatch(shellIndex, /src="\/js\/hermes-webui-adapter\.js"/u);
});

test("admin entry pages use imported hermes-webui shell for Hermes and Brain", () => {
  assert.match(hermesPage, /src="\/admin\/hermes-webui\/index\.html\?surface=hermes"/u);
  assert.match(brainPage, /src="\/admin\/hermes-webui\/index\.html\?surface=brain"/u);
  assert.match(hermesPage, /id="hermesWebuiFrame"/u);
  assert.match(brainPage, /id="brainWebuiFrame"/u);
});

test("old custom OG and custom Brain panel UI text is removed", () => {
  const combined = `${hermesPage}\n${brainPage}`;
  assert.doesNotMatch(combined, /OPEN HERMES OG FULLSCREEN/u);
  assert.doesNotMatch(combined, /HERMES OG REPO CONTROL/u);
  assert.doesNotMatch(combined, /Owner Execution Pipeline/u);
  assert.doesNotMatch(combined, /Advisor Mode — Read Only/u);
  assert.doesNotMatch(combined, /Live-Write Boundary/u);
  assert.doesNotMatch(combined, /Create New NPC/u);
});

test("runtime uses adapter and Hermes chat endpoint wiring", () => {
  assert.match(runtimeJs, /new global\.HermesWebUiAdapter\(\)/u);
  assert.match(runtimeJs, /adapter\.hermesChat\(/u);
  assert.match(runtimeJs, /adapter\.hermesStatus\(/u);
  assert.match(runtimeJs, /adapter\.brainStatus\(/u);
  assert.match(runtimeJs, /adapter\.brainChat\(/u);
  assert.match(runtimeJs, /surface === "brain"/u);
});

test("compat adapter maps to existing Hermes and Brain backend routes", () => {
  assert.match(adapterJs, /\/api\/hermes\/chat/u);
  assert.match(adapterJs, /\/api\/hermes\/webui\/capabilities/u);
  assert.match(adapterJs, /\/api\/hermes\/sessions/u);
  assert.match(adapterJs, /\/api\/hermes\/files\/list/u);
  assert.match(adapterJs, /\/api\/hermes\/files\/read/u);
  assert.match(adapterJs, /\/api\/hermes\/memory/u);
  assert.match(adapterJs, /\/api\/hermes\/webcrawl\/search/u);
  assert.match(adapterJs, /\/api\/hermes\/swarm/u);
  assert.match(adapterJs, /\/api\/hermes\/approval\/list/u);
  assert.match(adapterJs, /\/api\/hermes\/command\/queue/u);
  assert.match(adapterJs, /\/api\/hermes\/repos/u);
  assert.match(adapterJs, /\/status/u);
  assert.match(adapterJs, /\/model/u);
  assert.match(adapterJs, /\/npcs/u);
  assert.match(adapterJs, /\/health/u);
  assert.match(adapterJs, /\/logs\?lines=80/u);
  assert.match(adapterJs, /\/chat/u);
});

test("adapter exposes parity capability map and honest missing statuses", () => {
  assert.match(adapterJs, /getCapabilityMap\(\)/u);
  assert.match(adapterJs, /skills:\s*\{\s*status:\s*"working"/u);
  assert.match(adapterJs, /streaming:\s*\{\s*status:\s*"missing"/u);
  assert.match(adapterJs, /sessions:\s*\{\s*status:\s*"partial"/u);
});

test("runtime renders toolResults cards and persists webui sessions", () => {
  assert.match(runtimeJs, /toolResults/u);
  assert.match(runtimeJs, /tool-card/u);
  assert.match(runtimeJs, /ensureSession\(/u);
  assert.match(runtimeJs, /appendSessionMessages\(/u);
  assert.match(runtimeJs, /\/websearch/u);
});

test("required Hermes backend routes remain wired", () => {
  const required = [
    '/api/hermes/chat',
    '/api/hermes/webui/capabilities',
    '/api/hermes/sessions',
    '/api/hermes/action',
    '/api/hermes/swarm',
    '/api/hermes/swarm/plan',
    '/api/hermes/patch/preview',
    '/api/hermes/patch/apply',
    '/api/hermes/patch/rollback',
    '/api/hermes/git/status',
    '/api/hermes/command/run',
    '/api/hermes/approval/list',
    '/api/hermes/webcrawl/search',
    '/api/hermes/skills',
    '/api/hermes/memory',
    '/api/hermes/repos'
  ];
  for (const route of required) {
    assert.match(hermesApi, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `missing route: ${route}`);
  }
});

test("Brain backend routes remain wired", () => {
  const required = [
    '/api/brain/status',
    '/api/brain/npcs',
    '/api/brain/chat',
    '/api/brain/model',
    '/api/brain/health',
    '/api/brain/logs'
  ];
  for (const route of required) {
    assert.match(brainApi, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `missing route: ${route}`);
  }
});

test("Hermes backend toolchain files are preserved", () => {
  const requiredFiles = [
    "server/hermes/approval-gate.js",
    "server/hermes/patch-engine.js",
    "server/hermes/command-runner.js",
    "server/hermes/git-operator.js",
    "server/hermes/execution-pipeline.js",
    "server/hermes/proposed-operations.js",
    "api/brain-api.js"
  ];
  for (const rel of requiredFiles) {
    const full = path.join(repoRoot, rel);
    assert.equal(fs.existsSync(full), true, `missing file: ${rel}`);
  }
});
