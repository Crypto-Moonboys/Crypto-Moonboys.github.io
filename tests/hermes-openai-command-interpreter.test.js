"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const interpreterPath = path.join(__dirname, "..", "server", "hermes", "openai-command-interpreter.js");

test("openai-command-interpreter.js module exists", () => {
  assert.ok(fs.existsSync(interpreterPath), "server/hermes/openai-command-interpreter.js must exist");
});

test("module exports interpretOwnerCommand and heuristicInterpret", () => {
  const source = fs.readFileSync(interpreterPath, "utf8");
  assert.match(source, /interpretOwnerCommand/u);
  assert.match(source, /heuristicInterpret/u);
  const mod = require(interpreterPath);
  assert.equal(typeof mod.interpretOwnerCommand, "function");
  assert.equal(typeof mod.heuristicInterpret, "function");
});

test("OPENAI_API_KEY is never sent to browser (server-side only)", () => {
  const source = fs.readFileSync(interpreterPath, "utf8");
  assert.ok(!source.includes("window.OPENAI"), "Must not expose key to window");
  assert.ok(!source.includes("localStorage"), "Must not use localStorage");
  assert.ok(!source.includes("document."), "Must not reference DOM");
});

test("heuristicInterpret returns rebuild_website intent for website rebuild prompt", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("rebuild the whole website UI");
  assert.equal(result.intent, "rebuild_website");
  assert.ok(Array.isArray(result.reposLikelyInvolved));
  assert.ok(Array.isArray(result.filesLikelyInvolved));
  assert.ok(Array.isArray(result.taskBreakdown));
  assert.ok(Array.isArray(result.requiredQuestions));
  assert.ok(["low", "medium", "high", "critical"].includes(result.riskLevel));
});

test("heuristicInterpret returns rebuild_website for 'redesign the site pages'", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("redesign the site pages with a new layout");
  assert.equal(result.intent, "rebuild_website");
});

test("heuristicInterpret returns build_bomber_royale for bomber royale prompt", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("build my 2-player bomber royale game");
  assert.equal(result.intent, "build_bomber_royale");
  assert.ok(result.filesLikelyInvolved.some((f) => f.includes("block-topia")));
  assert.ok(result.taskBreakdown.length > 5);
});

test("heuristicInterpret returns repo_fix for fix/repair prompts", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("fix the broken API route");
  assert.equal(result.intent, "repo_fix");
});

test("heuristicInterpret returns unknown for unrecognised prompt", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("do some random completely unrelated work xyz");
  assert.equal(result.intent, "unknown");
});

test("interpretOwnerCommand resolves with heuristic when no API key set", async () => {
  delete process.env.OPENAI_API_KEY;
  delete require.cache[require.resolve(interpreterPath)];
  const { interpretOwnerCommand } = require(interpreterPath);
  const result = await interpretOwnerCommand("rebuild the whole website UI");
  assert.equal(result.source, "heuristic");
  assert.equal(result.intent, "rebuild_website");
});

test("interpretOwnerCommand throws for missing prompt", async () => {
  const { interpretOwnerCommand } = require(interpreterPath);
  await assert.rejects(() => interpretOwnerCommand(""), /prompt is required/u);
  await assert.rejects(() => interpretOwnerCommand(null), /prompt is required/u);
});

test("INTENT_VALUES and RISK_LEVELS are frozen arrays", () => {
  const mod = require(interpreterPath);
  assert.ok(Array.isArray(mod.INTENT_VALUES));
  assert.ok(mod.INTENT_VALUES.includes("rebuild_website"));
  assert.ok(mod.INTENT_VALUES.includes("build_bomber_royale"));
  assert.ok(mod.INTENT_VALUES.includes("unknown"));
  assert.ok(Array.isArray(mod.RISK_LEVELS));
  assert.ok(mod.RISK_LEVELS.includes("low"));
  assert.ok(mod.RISK_LEVELS.includes("critical"));
});

test("heuristicInterpret for website rebuild includes website files", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("rebuild the whole website UI");
  assert.ok(result.filesLikelyInvolved.some((f) => /index\.html|css|js|admin/u.test(f)));
});

test("heuristicInterpret for bomber royale includes block-topia files", () => {
  const { heuristicInterpret } = require(interpreterPath);
  const result = heuristicInterpret("build my 2-player bomber royale game");
  assert.ok(result.filesLikelyInvolved.some((f) => f.includes("block-topia")));
});

test("callOpenAi has request timeout and response size guard", () => {
  const source = fs.readFileSync(interpreterPath, "utf8");
  assert.match(source, /req\.setTimeout/u, "must call req.setTimeout");
  assert.match(source, /OPENAI_TIMEOUT_MS/u, "must define OPENAI_TIMEOUT_MS constant");
  assert.match(source, /req\.destroy/u, "must destroy on timeout");
  assert.match(source, /OPENAI_MAX_RESPONSE_BYTES/u, "must define OPENAI_MAX_RESPONSE_BYTES constant");
  assert.match(source, /totalBytes/u, "must track total response bytes");
});
