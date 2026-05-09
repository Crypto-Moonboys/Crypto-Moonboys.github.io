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
    "../server/hermes/execution-pipeline.js",
    "../server/hermes/orchestrator.js"
  ];
  for (const mod of targets) {
    delete require.cache[require.resolve(mod)];
  }
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
  assert.match(String(res.body.reply || ""), /tool returned \d+ entries \(showing first \d+\)/i);
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
  assert.match(String(res.body.toolResults[0].entries?.[0]?.snippet || ""), /route placeholder/);
});

test("file/read failure formatting never uses success wording", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt: "Read .git/config",
    history: []
  });

  assert.equal(res.status, 200);
  const item = res.body.toolResults[0];
  assert.equal(item.ok, false);
  assert.match(String(item.resultSummary || ""), /failed|denied/i);
  assert.doesNotMatch(String(item.resultSummary || ""), /read file \(/i);
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
  assert.doesNotMatch(String(res.body.reply || ""), /blog\.md|about\.md|contact\.md|privacy\.md/i);
  assert.match(String(res.body.reply || ""), /showing first/i);
});

test("natural admin UI feature request routes to operator task plan and avoids generic fallback", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const prompt = "can you create a popup canvas here in admin page showing BTC chart";
  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt,
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.body.actions), true);
  assert.equal(res.body.actions.length, 0);
  assert.equal(res.body.swarmPlan?.type, "hermes_swarm_plan");
  assert.equal(res.body.executionPipeline?.type, "hermes_execution_pipeline");
  assert.ok(Array.isArray(res.body.toolResults));
  assert.equal(res.body.toolResults[0].action, "swarm/plan");
  assert.equal(res.body.toolResults[0].ok, true);
  assert.equal(res.body.toolResults[1].action, "execution/pipeline");
  assert.equal(res.body.toolResults[1].ok, true);
  assert.match(JSON.stringify(res.body.toolResults[0]), /repo_admin_ui_operator_task/i);
  assert.match(JSON.stringify(res.body.executionPipeline), /patch_preview|approve|apply|deploy/i);
  assert.match(String(res.body.reply || ""), /admin\/repo ui operator task|swarm plan/i);
  // Guard against legacy fallback hallucinations: Django/PyNaCl are irrelevant Python-stack terms here,
  // and "messenger of gods" was previously hallucinated instead of returning Hermes operator data.
  assert.doesNotMatch(JSON.stringify(res.body), /django|pynacl|messenger of gods/i);
});

test("safe review mode operator flow returns proposal stages and does not apply changes", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    swarmExecutionMode: "safe_review",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.equal(res.status, 200);
  const stages = res.body.executionPipeline?.stages || [];
  assert.ok(stages.some((stage) => stage.stage === "plan"));
  assert.ok(stages.some((stage) => stage.stage === "inspect"));
  assert.ok(stages.some((stage) => stage.stage === "patch_preview"));
  const applyStage = stages.find((stage) => stage.stage === "apply");
  assert.equal(applyStage?.status, "blocked");
  const actions = (res.body.toolResults || []).map((item) => item.action);
  assert.ok(!actions.includes("patch/apply"));
  assert.ok(!actions.includes("command/run"));
});

test("owner operator mode returns explicit missing requirements for approval-gated execution", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    swarmExecutionMode: "owner_operator",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.equal(res.status, 200);
  assert.ok((res.body.missingRequirements || []).length > 0);
  const approveStage = (res.body.executionPipeline?.stages || []).find((stage) => stage.stage === "approve");
  assert.ok(Array.isArray(approveStage?.missingRequirements));
  assert.ok(approveStage.missingRequirements.length > 0);
  assert.match(JSON.stringify(res.body.toolResults), /plan\/privileged|missingRequirements/i);
});

test("owner operator mode with requirements and proposed operations generates patch preview path", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "admin",
    role: "main_hermes",
    swarmExecutionMode: "owner_operator",
    confirmEdit: true,
    approvalId: "approval_ready",
    approvalToken: "test-token",
    proposedOperations: [{ type: "update", path: "README.md", content: "Hermes owner execution pipeline\n" }],
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.missingRequirements.length, 0);
  const actions = (res.body.toolResults || []).map((item) => item.action);
  assert.ok(actions.includes("patch/preview"));
  assert.ok(!actions.includes("patch/apply"));
});

test("file/list failure formatting never says returned 0 entries", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt: "Read ../../../../etc/passwd",
    history: []
  });

  assert.equal(res.status, 200);
  const item = res.body.toolResults[0];
  assert.equal(item.ok, false);
  assert.doesNotMatch(String(item.resultSummary || ""), /returned 0 entries/i);
});

test("denied privileged action formatting is explicit and non-success-like", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "agent_edit",
    role: "main_hermes",
    confirmEdit: false,
    prompt: "Run npm test",
    history: []
  });

  assert.equal(res.status, 200);
  const item = res.body.toolResults[0];
  assert.equal(item.ok, false);
  assert.match(String(item.resultSummary || ""), /approval|requires|denied/i);
  assert.doesNotMatch(String(item.resultSummary || ""), /tool returned|read file|succeeded/i);
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
  assert.equal(res.body.toolResults[0].action, "plan/privileged");
  assert.ok((res.body.missingRequirements || []).length > 0);
  assert.match(String(res.body.toolResults[0].resultSummary || ""), /approval|requires/i);
});

test("edit request produces plan and not patch apply", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt: "edit README.md",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.actions[0].type, "patch/preview");
  assert.match(String(res.body.reply || ""), /executed|tool returned/i);
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

  assert.equal(res.status, 403);
  assert.equal(res.body.toolResult.ok, false);
});

test("chat privileged action without approval is denied", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "agent_edit",
    role: "main_hermes",
    confirmEdit: true,
    approvalToken: "test-token",
    prompt: "Run npm test",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.toolResults[0].ok, false);
  assert.match(JSON.stringify(res.body.toolResults[0]), /approval/i);
});

test("fake approval id is denied", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId: "approval_fake_id",
    approvalToken: "test-token",
    action: {
      type: "command/run",
      payload: { command: "npm", args: ["test"] }
    }
  });

  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /approved token not found/i);
});

test("approval consumption is one-time-use", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approval = await post(base, "/api/hermes/approval/create", { title: "push once" });
  await post(base, "/api/hermes/approval/decide", { id: approval.body.approval.id, approved: true });

  const first = await post(base, "/api/hermes/action", {
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

  const second = await post(base, "/api/hermes/action", {
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

  assert.equal(first.status, 403);
  assert.equal(second.status, 403);
  assert.match(JSON.stringify(second.body), /approved token not found/i);
});

test("git push without approved token is denied", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId: "",
    approvalToken: "test-token",
    action: {
      type: "git/push",
      payload: { remote: "origin" }
    }
  });

  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /approval/i);
});

test("memory merge without edit permissions is denied", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/memory/merge", {
    mode: "chat",
    role: "main_hermes",
    confirmEdit: false,
    patch: { test: true }
  });

  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /agent_edit|confirmEdit|token|approval/i);
});

test("git branch without privileged mode is denied", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/git/branch", {
    mode: "chat",
    role: "main_hermes",
    confirmEdit: false,
    name: "codex/test-branch"
  });

  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /agent_edit|confirmEdit|token|approval/i);
});

test("git capability mapping requires canUseGit and not canEditRepo", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approval = await post(base, "/api/hermes/approval/create", { title: "branch test" });
  await post(base, "/api/hermes/approval/decide", { id: approval.body.approval.id, approved: true });

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "test_agent",
    confirmEdit: true,
    approvalId: approval.body.approval.id,
    approvalToken: "test-token",
    action: {
      type: "git/branch",
      payload: { name: "codex/capability-test" }
    }
  });

  assert.equal(res.status, 403);
  assert.match(JSON.stringify(res.body), /canUseGit/i);
});

test("chat privileged action stays plan-only and does not execute", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId: "approval_any",
    approvalToken: "test-token",
    sessionId: "session-a",
    prompt: "Run npm test",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.toolResults[0].ok, false);
  assert.equal(res.body.toolResults[0].action, "plan/privileged");
  assert.match(String(res.body.reply || ""), /planned only/i);
});

test("failed command returns failure summary and never fake success", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const approval = await post(base, "/api/hermes/approval/create", { title: "run bad cmd" });
  await post(base, "/api/hermes/approval/decide", { id: approval.body.approval.id, approved: true });

  const res = await post(base, "/api/hermes/action", {
    mode: "admin",
    role: "main_hermes",
    confirmEdit: true,
    approvalId: approval.body.approval.id,
    approvalToken: "test-token",
    action: {
      type: "command/run",
      payload: { command: "npm", args: ["definitely-not-a-real-script"] }
    }
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.toolResult.ok, false);
  assert.match(JSON.stringify(res.body.toolResult), /failed|not allowed|exit code/i);
});

test("swarm endpoint exposes sanitized capabilities only", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await fetch(`${base}/api/hermes/swarm`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.capabilities));
  assert.doesNotMatch(JSON.stringify(body), /canEditRepo|pathPrefixes|ROLE_RULES/i);
});

test("chat webcrawl request uses real webcrawl action and reports unavailable without tools", async (t) => {
  const root = setupSandbox();
  const { server, base } = await startServer(root);
  t.after(() => server.close());

  const res = await post(base, "/api/hermes/chat", {
    mode: "chat",
    role: "main_hermes",
    prompt: "Find new updates on anything",
    history: []
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.actions[0].type, "webcrawl/find-updates");
  assert.equal(res.body.toolResults[0].ok, false);
  assert.match(JSON.stringify(res.body.toolResults[0]), /webcrawl tools unavailable/i);
});
