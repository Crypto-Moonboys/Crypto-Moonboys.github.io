"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-webcrawl-"));
  fs.mkdirSync(path.join(root, "admin"), { recursive: true });
  return root;
}

function clearCache() {
  const targets = [
    "../server/hermes/config.js",
    "../server/hermes/webcrawl-agent.js",
    "../server/hermes/action-schema.js",
    "../server/hermes/tool-executor.js",
    "../server/hermes/orchestrator.js",
    "../server/hermes/path-utils.js",
    "../server/hermes/repo-registry.js"
  ];
  for (const mod of targets) {
    delete require.cache[require.resolve(mod)];
  }
}

function loadExecutor(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  delete process.env.OPENAI_API_KEY;
  clearCache();
  return require("../server/hermes/tool-executor.js");
}

test("webcrawl search reports unavailable when OpenAI key is missing", async () => {
  const root = setupSandbox();
  const { executeAction } = loadExecutor(root);
  const result = await executeAction({
    type: "webcrawl/search",
    payload: { topic: "bitcoin ETF updates" }
  }, { mode: "chat", role: "main_hermes" });
  assert.equal(result.ok, false);
  assert.equal(result.result.message, "Webcrawl tools unavailable");
  assert.equal(result.result.action, "webcrawl/search");
});

test("webcrawl find-updates reports unavailable when OpenAI key is missing", async () => {
  const root = setupSandbox();
  const { executeAction } = loadExecutor(root);
  const result = await executeAction({
    type: "webcrawl/find-updates",
    payload: { topic: "crypto moonboys" }
  }, { mode: "chat", role: "main_hermes" });
  assert.equal(result.ok, false);
  assert.equal(result.result.message, "Webcrawl tools unavailable");
  assert.equal(result.result.action, "webcrawl/find-updates");
});

test("webcrawl fetch blocks localhost/private targets", async () => {
  const root = setupSandbox();
  const { executeAction } = loadExecutor(root);
  const blocked = await executeAction({
    type: "webcrawl/fetch-url",
    payload: { url: "http://127.0.0.1:11434/v1/models" }
  }, { mode: "chat", role: "main_hermes" });
  assert.equal(blocked.ok, false);
  assert.match(String(blocked.error || ""), /Blocked private or local network target/i);
});

test("webcrawl can save and list watch topics", async () => {
  const root = setupSandbox();
  const { executeAction } = loadExecutor(root);
  const save = await executeAction({
    type: "webcrawl/save-topic",
    payload: { topic: "hermes runtime", url: "https://example.com/feed.xml" }
  }, { mode: "chat", role: "main_hermes" });
  assert.equal(save.ok, true);
  const list = await executeAction({
    type: "webcrawl/list-topics",
    payload: {}
  }, { mode: "chat", role: "main_hermes" });
  assert.equal(list.ok, true);
  assert.ok(Array.isArray(list.result.topics));
  assert.ok(list.result.topics.some((item) => String(item.topic || "").includes("hermes runtime")));
});
