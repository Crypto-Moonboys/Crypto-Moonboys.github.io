"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
    "../server/hermes/repo-registry.js",
    "../server/hermes/orchestrator.js"
  ];
  for (const mod of targets) {
    delete require.cache[require.resolve(mod)];
  }
}

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-repo-target-"));
  fs.mkdirSync(path.join(root, "admin"), { recursive: true });
  fs.mkdirSync(path.join(root, "api"), { recursive: true });
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<html></html>\n");
  fs.writeFileSync(path.join(root, "package.json"), "{\"name\":\"sandbox\"}\n");
  fs.writeFileSync(path.join(root, "api", "hermes-api.js"), "sandbox\n");
  return root;
}

async function startServer(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "crypto-moonboys-site";
  process.env.HERMES_PRIMARY_REPO_NAME = "Crypto Moonboys Website";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  process.env.HERMES_EDIT_TOKEN = "test-token";
  clearCache();
  const { app } = require("../api/hermes-api.js");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function post(base, pathName, body, headers = {}) {
  const response = await fetch(`${base}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function get(base, pathName) {
  const response = await fetch(`${base}${pathName}`);
  return { status: response.status, body: await response.json() };
}

async function createApproved(base, title) {
  const create = await post(base, "/api/hermes/approval/create", { title });
  await post(base, "/api/hermes/approval/decide", { id: create.body.approval.id, approved: true });
  return create.body.approval.id;
}

test("default active repo resolves to configured root path", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await get(base, "/api/hermes/repos/active");
  assert.equal(res.status, 200);
  assert.equal(res.body.toolResult.result.id, "crypto-moonboys-site");
  assert.equal(res.body.toolResult.result.localPath, root);
});

test("file list uses active repo root and not process cwd", async (t) => {
  const root = setupSandbox();
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await get(base, "/api/hermes/files/list?path=.");
  assert.equal(res.status, 200);
  const names = res.body.toolResult.result.entries.map((e) => e.name);
  assert.ok(names.includes("admin"));
  assert.ok(names.includes("api"));
});

test("runtime root endpoint returns active repo metadata", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await get(base, "/api/hermes/runtime/root");
  assert.equal(res.status, 200);
  assert.equal(res.body.activeRepoId, "crypto-moonboys-site");
  assert.equal(res.body.localPath, root);
  assert.equal(res.body.packageJsonExists, true);
  assert.equal(res.body.indexHtmlExists, true);
});

test("chat tool response is grounded and does not invent files", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt: "List the top-level repo directories. Do not modify anything.",
    history: []
  });
  assert.equal(res.status, 200);
  assert.match(String(res.body.reply || ""), /Tool returned only \d+ entries/);
  assert.doesNotMatch(String(res.body.reply || ""), /blog\.md|about\.md|contact\.md|privacy\.md/i);
});

test("switching active repo changes root", async (t) => {
  const root = setupSandbox();
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-repo-target-second-"));
  fs.mkdirSync(path.join(second, "games"), { recursive: true });
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  let approvalId = await createApproved(base, "register repo");
  await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId,
    approvalToken: "test-token",
    action: {
      type: "repo/register",
      payload: {
        id: "second-repo",
        name: "Second Repo",
        remoteUrl: "https://github.com/example/second",
        localPath: second,
        defaultBranch: "main"
      }
    }
  });

  approvalId = await createApproved(base, "switch repo");
  const switched = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId,
    approvalToken: "test-token",
    action: {
      type: "repo/switch",
      payload: { idOrName: "second-repo" }
    }
  });
  assert.equal(switched.status, 200);

  const rootRes = await get(base, "/api/hermes/runtime/root");
  assert.equal(rootRes.status, 200);
  assert.equal(rootRes.body.localPath, second);
});

test("clone/register requires admin token and approval", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const denied = await post(base, "/api/hermes/action", {
    mode: "chat",
    role: "main_hermes",
    confirmEdit: false,
    action: {
      type: "repo/clone",
      payload: { remoteUrl: "https://github.com/example/example" }
    }
  });
  assert.equal(denied.status, 403);
  assert.match(JSON.stringify(denied.body), /admin|agent_edit|confirmEdit|token|approval/i);
});

test("unregistered repo switch returns missing repo registration message", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approvalId = await createApproved(base, "switch unknown");
  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId,
    approvalToken: "test-token",
    action: {
      type: "repo/switch",
      payload: { idOrName: "not-registered" }
    }
  });
  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /not registered/i);
});

