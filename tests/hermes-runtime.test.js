"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MODULES = [
  "../server/hermes/config.js",
  "../server/hermes/path-utils.js",
  "../server/hermes/repo-indexer.js",
  "../server/hermes/file-service.js",
  "../server/hermes/patch-engine.js",
  "../server/hermes/agent-runtime.js",
  "../server/hermes/approval-gate.js",
  "../server/hermes/memory-store.js",
  "../server/hermes/command-runner.js",
  "../server/hermes/repo-registry.js",
  "../server/hermes/tool-router.js",
  "../server/hermes/tool-executor.js",
  "../server/hermes/swarm-registry.js",
  "../server/hermes/swarm-manager.js",
  "../server/hermes/execution-pipeline.js",
  "../server/hermes/proposed-operations.js",
  "../server/hermes/conversation-runtime.js",
  "../server/hermes/capabilities.js",
  "../server/hermes/chat-proxy.js"
];

function clearHermesModules() {
  for (const mod of MODULES) {
    delete require.cache[require.resolve(mod)];
  }
}

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-runtime-"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "hello hermes\n");
  fs.writeFileSync(path.join(root, "src", "index.js"), "export const x = 1;\n");
  fs.writeFileSync(path.join(root, "scripts", "timeout.js"), "setTimeout(() => process.exit(0), 1000);\n");
  fs.writeFileSync(path.join(root, "secret.pem"), "PRIVATE");
  fs.writeFileSync(path.join(root, ".env"), "TOKEN=abc");
  return root;
}

function loadWithRoot(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "crypto-moonboys-site";
  process.env.HERMES_PRIMARY_REPO_NAME = "Crypto Moonboys Website";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  clearHermesModules();
  return {
    repoIndexer: require("../server/hermes/repo-indexer.js"),
    fileService: require("../server/hermes/file-service.js"),
    patchEngine: require("../server/hermes/patch-engine.js"),
    agentRuntime: require("../server/hermes/agent-runtime.js"),
    approvalGate: require("../server/hermes/approval-gate.js"),
    memoryStore: require("../server/hermes/memory-store.js"),
    commandRunner: require("../server/hermes/command-runner.js"),
    pathUtils: require("../server/hermes/path-utils.js"),
    conversationRuntime: require("../server/hermes/conversation-runtime.js"),
    capabilities: require("../server/hermes/capabilities.js")
  };
}

test("repo index search returns file hits", () => {
  const root = setupSandbox();
  const { repoIndexer } = loadWithRoot(root);
  const results = repoIndexer.searchIndex("readme", { limit: 10 });
  assert.ok(Array.isArray(results));
  assert.ok(results.some((r) => r.path.includes("README.md")));
});

test("path utils blocks traversal and absolute paths", () => {
  const root = setupSandbox();
  const { pathUtils } = loadWithRoot(root);
  assert.throws(() => pathUtils.normalizeRepoPath("../../etc/passwd"));
  assert.throws(() => pathUtils.normalizeRepoPath(path.join(root, "README.md")));
});

test("file service blocks .git and secret files", () => {
  const root = setupSandbox();
  const { fileService } = loadWithRoot(root);
  assert.throws(() => fileService.readFile(".git/config"));
  assert.throws(() => fileService.readFile("secret.pem"));
  assert.throws(() => fileService.readFile(".env"));
});

test("patch preview returns before/after metadata", () => {
  const root = setupSandbox();
  const { patchEngine } = loadWithRoot(root);
  const preview = patchEngine.previewPatch([{ type: "update", path: "README.md", content: "x" }]);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].path, "README.md");
});

test("npc agent has path restrictions and capability restrictions", () => {
  const root = setupSandbox();
  const { agentRuntime } = loadWithRoot(root);
  assert.throws(() => agentRuntime.assertRolePathAccess("npc_agent", "index.html"));
  assert.doesNotThrow(() => agentRuntime.assertRolePathAccess("npc_agent", "admin/brain-data/sample.json"));
  assert.throws(() => agentRuntime.assertRoleCapability("npc_agent", "canRunCommands"));
});

test("approval gate lifecycle removes decided from pending", () => {
  const root = setupSandbox();
  const { approvalGate } = loadWithRoot(root);
  const approval = approvalGate.createApproval({ title: "Test" });
  const decided = approvalGate.decideApproval(approval.id, true, "ok");
  assert.equal(decided.status, "approved");
  const snapshot = approvalGate.getApprovals();
  assert.equal(snapshot.pending.length, 0);
  assert.ok(snapshot.decided.some((a) => a.id === approval.id));
  const consumed = approvalGate.consumeApproved(approval.id);
  assert.equal(consumed.id, approval.id);
});

test("memory store persists merge patches in sandbox", () => {
  const root = setupSandbox();
  const { memoryStore } = loadWithRoot(root);
  const updated = memoryStore.mergeMemory({ domains: ["cryptomoonboys.com"] });
  assert.ok(Array.isArray(updated.domains));
  const latest = memoryStore.readMemory();
  assert.ok(latest.domains.includes("cryptomoonboys.com"));
});

test("command runner never reports spawn failure as success", async () => {
  const root = setupSandbox();
  const { commandRunner } = loadWithRoot(root);
  const result = await commandRunner.enqueueCommand("node", ["scripts/timeout.js"], { timeoutMs: 50 });
  assert.notEqual(result.code, 0);
  assert.equal(result.ok, false);
});

test("new runtime files exist", () => {
  const files = [
    "server/hermes/orchestrator.js",
    "server/hermes/task-planner.js",
    "server/hermes/agent-runtime.js",
    "server/hermes/repo-indexer.js",
    "server/hermes/patch-engine.js",
    "server/hermes/git-operator.js",
    "server/hermes/command-runner.js",
    "server/hermes/approval-gate.js",
    "server/hermes/memory-store.js",
    "server/hermes/capabilities.js"
  ];
  files.forEach((file) => assert.ok(fs.existsSync(file), `${file} missing`));
});

test("Hermes capability prompt answers with Hermes identity instead of base model identity", async () => {
  const root = setupSandbox();
  const { conversationRuntime } = loadWithRoot(root);
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    prompt: "DO YOU KNOW WHAT YOU ARE?",
    history: []
  });
  assert.match(String(response.reply || ""), /I am Hermes/i);
  assert.match(String(response.reply || ""), /repo operator|repo toolchain|backend toolchain/i);
  assert.doesNotMatch(String(response.reply || ""), /I am Qwen|Alibaba Cloud/i);
  assert.equal(response.toolResults[0]?.action, "hermes/capabilities");
});

test("Hermes website capability prompt says it can create and edit websites", async () => {
  const root = setupSandbox();
  const { conversationRuntime } = loadWithRoot(root);
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    prompt: "CAN YOU EDIT/CREATE WEBSITES",
    history: []
  });
  assert.match(String(response.reply || ""), /Yes\./i);
  assert.match(String(response.reply || ""), /create and edit websites/i);
  assert.match(String(response.reply || ""), /patch previews|owner\/operator workflow|repo toolchain/i);
  assert.doesNotMatch(String(response.reply || ""), /cannot edit websites|hire professionals/i);
});

test("Hermes websearch capability prompt says webcrawl tools are available", async () => {
  const root = setupSandbox();
  const { conversationRuntime } = loadWithRoot(root);
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    prompt: "CAN YOU WEBSEARCH",
    history: []
  });
  assert.match(String(response.reply || ""), /Yes\./i);
  assert.match(String(response.reply || ""), /webcrawl\/search tools available through the backend/i);
  assert.doesNotMatch(String(response.reply || ""), /lack internet|I am Qwen|Alibaba Cloud/i);
});

test("normal operator prompt still routes to swarm plan and execution pipeline", async () => {
  const root = setupSandbox();
  const { conversationRuntime } = loadWithRoot(root);
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });
  assert.equal(response.swarmPlan?.type, "hermes_swarm_plan");
  assert.equal(response.executionPipeline?.type, "hermes_execution_pipeline");
});
