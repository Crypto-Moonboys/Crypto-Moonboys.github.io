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

function loadWebcrawlModule(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  delete process.env.OPENAI_API_KEY;
  clearCache();
  return require("../server/hermes/webcrawl-agent.js");
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

test("webcrawl blocks redirect to localhost/private target", async () => {
  const root = setupSandbox();
  const webcrawl = loadWebcrawlModule(root);
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response("", {
      status: 302,
      headers: { location: "http://127.0.0.1:11434/v1/models" }
    });
  };
  try {
    await assert.rejects(
      () => webcrawl.__test.fetchWithTimeout("https://example.com"),
      /Blocked private or local network target/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("find updates preserves previous good snapshot on failure", async () => {
  const root = setupSandbox();
  const webcrawl = loadWebcrawlModule(root);
  const historyDir = path.join(root, "admin", "hermes-data");
  fs.mkdirSync(historyDir, { recursive: true });
  const file = path.join(historyDir, "webcrawl-history.json");
  fs.writeFileSync(file, JSON.stringify({
    topics: {
      "crypto moonboys": {
        topic: "crypto moonboys",
        sources: [{ url: "https://example.com/old", title: "old" }],
        summary: "old summary",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    },
    sessions: []
  }, null, 2));

  const result = await webcrawl.__test.findNewUpdates("crypto moonboys");
  assert.equal(result.ok, false);
  const history = webcrawl.readHistory();
  const saved = history.topics["crypto moonboys"];
  assert.equal(saved.lastResultOk, false);
  assert.equal(saved.summary, "old summary");
  assert.equal(saved.sources[0].url, "https://example.com/old");
  assert.ok(saved.checkedAt);
});

test("rss parser reads full safe body and returns multiple items", async () => {
  const root = setupSandbox();
  const webcrawl = loadWebcrawlModule(root);
  const originalFetch = global.fetch;
  const padding = "x".repeat(1400);
  const rss = `<?xml version="1.0"?><rss><channel>${padding}<item><title>Item One</title><link>https://example.com/1</link><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate></item><item><title>Item Two</title><link>https://example.com/2</link><pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  global.fetch = async () => {
    return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  try {
    const result = await webcrawl.__test.checkRssFeed("https://example.com/feed.xml");
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.items));
    assert.ok(result.items.length >= 2);
    assert.equal(result.items[1].url, "https://example.com/2");
  } finally {
    global.fetch = originalFetch;
  }
});
