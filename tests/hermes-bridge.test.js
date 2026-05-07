"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-bridge-"));
  fs.mkdirSync(path.join(root, "api"), { recursive: true });
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "admin"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "Hermes bridge sandbox\n");
  fs.writeFileSync(path.join(root, "api", "hermes-api.js"), "route placeholder\n");
  fs.writeFileSync(path.join(root, "server", "app.js"), "runtime\n");
  return root;
}

function clearCache() {
  const targets = [
    "../api/hermes-api.js",
    "../server/hermes/config.js",
    "../server/hermes/path-utils.js",
    "../server/hermes/repo-indexer.js",
    "../server/hermes/file-service.js",
    "../server/hermes/patch-engine.js",
    "../server/hermes/git-operator.js",
    "../server/hermes/command-runner.js",
    "../server/hermes/approval-gate.js",
    "../server/hermes/memory-store.js",
    "../server/hermes/agent-runtime.js",
    "../server/hermes/tool-router.js",
    "../server/hermes/tool-executor.js",
    "../server/hermes/conversation-runtime.js",
    "../server/hermes/orchestrator.js"
  ];
  for (const mod of targets) {
    delete require.cache[require.resolve(mod)];
  }
}

async function startServer(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_EDIT_TOKEN = "test-token";
  clearCache();
  const { app } = require("../api/hermes-api.js");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function post(base, pathName, body, headers = {}) {
  const response = await fetch(`${base}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

test("chat route invokes file/list for directory request", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    model: "qwen2.5:1.5b",
    mode: "chat",
    role: "main_hermes",
    prompt: "List the top-level repo directories. Do not modify anything.",
    history: []
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.actions));
  assert.equal(res.body.actions[0].type, "file/list");
  assert.equal(res.body.toolResults[0].ok, true);
});

test("chat read file uses real file service", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    model: "qwen2.5:1.5b",
    mode: "chat",
    role: "main_hermes",
    prompt: "Read api/hermes-api.js",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.actions[0].type, "file/read");
  assert.equal(res.body.toolResults[0].ok, true);
  assert.match(String(res.body.toolResults[0].result.content || ""), /route placeholder/);
});

test("chat search request uses index/search", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    model: "qwen2.5:1.5b",
    mode: "chat",
    role: "main_hermes",
    prompt: "Search the repo for Hermes API routes.",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.actions[0].type, "repo/search");
});

test("privileged command request returns missing requirements without approvals", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    model: "qwen2.5:1.5b",
    mode: "chat",
    role: "main_hermes",
    prompt: "Run npm test",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.toolResults[0].ok, false);
  assert.ok((res.body.missingRequirements || []).length > 0);
});

test("patch apply blocked without confirm/token/approval", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/action", {
    mode: "agent_edit",
    role: "main_hermes",
    confirmEdit: false,
    approvalId: "",
    approvalToken: "",
    action: {
      type: "patch/apply",
      payload: { operations: [{ type: "update", path: "README.md", content: "x" }] }
    }
  });

  assert.ok(res.status >= 400 || res.body.toolResult?.ok === false);
  const joined = JSON.stringify(res.body);
  assert.match(joined, /(confirmEdit|approval|token|mode)/i);
});

test("npc role denied for website file edit", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approval = await post(base, "/api/hermes/approval/create", { title: "test" });
  const approve = await post(base, "/api/hermes/approval/decide", { id: approval.body.approval.id, approved: true });
  assert.equal(approve.status, 200);

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "npc_agent",
    confirmEdit: true,
    approvalId: approval.body.approval.id,
    approvalToken: "test-token",
    action: {
      type: "patch/apply",
      payload: { operations: [{ type: "update", path: "index.html", content: "x" }] }
    }
  });

  assert.ok(res.status >= 400 || res.body.toolResult?.ok === false);
  assert.match(JSON.stringify(res.body), /lacks capability|restriction|permission/i);
});

test("git push blocked on main/master", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approval = await post(base, "/api/hermes/approval/create", { title: "push" });
  await post(base, "/api/hermes/approval/decide", { id: approval.body.approval.id, approved: true });

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId: approval.body.approval.id,
    approvalToken: "test-token",
    action: {
      type: "git/push",
      payload: { remote: "origin" }
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.toolResult.ok, false);
});
