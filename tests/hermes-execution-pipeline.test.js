"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pipelinePath = path.join(__dirname, "..", "server", "hermes", "execution-pipeline.js");
const apiPath = path.join(__dirname, "..", "api", "hermes-api.js");

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-execution-pipeline-"));
  fs.mkdirSync(path.join(root, "admin"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "Hermes pipeline sandbox\n");
  return root;
}

function clearCache() {
  const targets = [
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
    "../server/hermes/swarm-manager.js",
    "../server/hermes/execution-pipeline.js",
    "../server/hermes/conversation-runtime.js"
  ];
  for (const mod of targets) {
    delete require.cache[require.resolve(mod)];
  }
}

function loadRuntime(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "crypto-moonboys-site";
  process.env.HERMES_PRIMARY_REPO_NAME = "Crypto Moonboys Website";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  process.env.HERMES_EDIT_TOKEN = "test-token";
  clearCache();
  return {
    pipeline: require("../server/hermes/execution-pipeline.js"),
    conversationRuntime: require("../server/hermes/conversation-runtime.js")
  };
}

test("pipeline module exists with required stage definitions", () => {
  assert.ok(fs.existsSync(pipelinePath), "server/hermes/execution-pipeline.js should exist");
  const { VALID_STAGES } = require("../server/hermes/execution-pipeline.js");
  assert.deepEqual(VALID_STAGES, [
    "plan",
    "inspect",
    "patch_preview",
    "approve",
    "apply",
    "test",
    "deploy",
    "verify",
    "rollback",
    "report"
  ]);
});

test("buildExecutionPipeline stage shape includes required fields", () => {
  const { pipeline } = loadRuntime(setupSandbox());
  const built = pipeline.buildExecutionPipeline({
    executionMode: "safe_review",
    role: "main_hermes",
    filesAffected: ["admin/hermes-chat.html"],
    hasProposedOperations: false
  });
  assert.equal(built.type, "hermes_execution_pipeline");
  for (const stage of built.stages) {
    assert.ok(stage.stage);
    assert.ok(stage.status);
    assert.ok(Object.hasOwn(stage, "summary"));
    assert.ok(Object.hasOwn(stage, "agentRole"));
    assert.ok(Array.isArray(stage.filesAffected));
    assert.ok(Array.isArray(stage.requiredInputs));
    assert.ok(Object.hasOwn(stage, "toolAction"));
    assert.ok(Object.hasOwn(stage, "nextAction"));
    assert.ok(Object.hasOwn(stage, "riskLevel"));
  }
});

test("natural operator prompt returns pipeline and swarm plan in safe review mode", async () => {
  const { conversationRuntime } = loadRuntime(setupSandbox());
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    swarmExecutionMode: "safe_review",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.equal(response.swarmPlan?.type, "hermes_swarm_plan");
  assert.equal(response.executionPipeline?.type, "hermes_execution_pipeline");
  assert.doesNotMatch(JSON.stringify(response), /django|pynacl|messenger of gods/i);
  const applyStage = (response.executionPipeline.stages || []).find((stage) => stage.stage === "apply");
  assert.equal(applyStage?.status, "blocked");
});

test("owner operator mode exposes explicit missing requirements when approval data is absent", async () => {
  const { conversationRuntime } = loadRuntime(setupSandbox());
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    swarmExecutionMode: "owner_operator",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.ok((response.missingRequirements || []).length > 0);
  const approveStage = (response.executionPipeline?.stages || []).find((stage) => stage.stage === "approve");
  assert.ok(Array.isArray(approveStage?.missingRequirements));
  assert.ok(approveStage.missingRequirements.length > 0);
  assert.match(JSON.stringify(response.toolResults), /plan\/privileged/i);
});

test("owner operator mode with requirements creates approval-gated patch preview path", async () => {
  const { conversationRuntime } = loadRuntime(setupSandbox());
  const response = await conversationRuntime.runConversation({
    mode: "admin",
    role: "main_hermes",
    swarmExecutionMode: "owner_operator",
    confirmEdit: true,
    approvalId: "approval_ready",
    approvalToken: "test-token",
    proposedOperations: [{ type: "update", path: "README.md", content: "patched\n" }],
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.equal(response.missingRequirements.length, 0);
  const actions = (response.toolResults || []).map((item) => item.action);
  assert.ok(actions.includes("patch/preview"));
  assert.ok(!actions.includes("patch/apply"));
});

test("repo keeps same Hermes runtime and does not add Hermes2/direct browser writes", () => {
  const apiSource = fs.readFileSync(apiPath, "utf8");
  assert.match(apiSource, /app\.post\("\/api\/hermes\/chat"/u);
  assert.doesNotMatch(apiSource, /Hermes2|hermes2/u);
  assert.doesNotMatch(apiSource, /browser.*(write|edit)|repo.*write.*browser|direct.*repo.*write/u);
});
