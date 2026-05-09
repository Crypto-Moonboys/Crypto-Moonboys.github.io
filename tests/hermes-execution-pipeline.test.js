"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pipelinePath = path.join(__dirname, "..", "server", "hermes", "execution-pipeline.js");
const repairPolicyPath = path.join(__dirname, "..", "server", "hermes", "repair-policy.js");
const proposedOpsPath = path.join(__dirname, "..", "server", "hermes", "proposed-operations.js");
const apiPath = path.join(__dirname, "..", "api", "hermes-api.js");
const STUB_MARKER_PATTERN = /HERMES PROPOSED PATCH|HERMES PROPOSED TEST ASSERTIONS|openFeaturePopup|featureCanvas|renderFeatureChart|Show Feature/u;

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-execution-pipeline-"));
  fs.mkdirSync(path.join(root, "admin"), { recursive: true });
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "Hermes pipeline sandbox\n");
  fs.copyFileSync(path.join(__dirname, "..", "admin", "hermes-chat.html"), path.join(root, "admin", "hermes-chat.html"));
  fs.copyFileSync(path.join(__dirname, "..", "js", "hermes-chat.js"), path.join(root, "js", "hermes-chat.js"));
  fs.copyFileSync(
    path.join(__dirname, "..", "tests", "hermes-og-fullscreen.test.js"),
    path.join(root, "tests", "hermes-og-fullscreen.test.js")
  );
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
    "../server/hermes/repair-policy.js",
    "../server/hermes/proposed-operations.js",
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
  assert.ok(fs.existsSync(repairPolicyPath), "server/hermes/repair-policy.js should exist");
  assert.ok(fs.existsSync(proposedOpsPath), "server/hermes/proposed-operations.js should exist");
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
  assert.equal(built.repairPolicy?.label, "DADDY-style repair discipline");
  assert.ok(Array.isArray(built.repairPolicy?.rules));
  assert.match(JSON.stringify(built.repairPolicy), /small bounded patches|rollback on failure|avoid deadlock\/no-op cycles/i);
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
  // Guard against legacy fallback hallucinations: Django/PyNaCl are irrelevant Python-stack terms here,
  // and "messenger of gods" was previously hallucinated instead of returning Hermes operator data.
  assert.doesNotMatch(JSON.stringify(response), /django|pynacl|messenger of gods/i);
  const applyStage = (response.executionPipeline.stages || []).find((stage) => stage.stage === "apply");
  assert.equal(applyStage?.status, "blocked");
  assert.ok(Array.isArray(response.proposedOperations), "Safe Review Mode should return proposedOperations array");
  const patchPreviewStage = (response.executionPipeline.stages || []).find((stage) => stage.stage === "patch_preview");
  if (response.proposedOperations.length > 0) {
    assert.equal(patchPreviewStage?.status, "ready", "patch_preview stage must be ready when proposedOperations exist");
  } else {
    assert.ok(["blocked", "ready"].includes(String(patchPreviewStage?.status || "")));
    const missingRequirements = [
      ...(Array.isArray(response.missingRequirements) ? response.missingRequirements : []),
      ...(Array.isArray(response.executionPipeline?.missingRequirements) ? response.executionPipeline.missingRequirements : [])
    ];
    assert.ok(missingRequirements.length > 0, "empty proposedOperations must include explicit missing requirements");
  }
  // Confirm no patch/apply was invoked.
  const toolActions = (response.toolResults || []).map((item) => item.action);
  assert.ok(!toolActions.includes("patch/apply"), "Safe Review Mode must not invoke patch/apply");
  assert.ok(toolActions.includes("proposed/operations"), "Response must include proposed/operations tool result");
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
  const rollbackStage = (response.executionPipeline?.stages || []).find((stage) => stage.stage === "rollback");
  assert.match(String(rollbackStage?.nextAction || ""), /rollback on failure|targeted repair/i);
  assert.match(JSON.stringify(response.toolResults), /plan\/privileged/i);
  assert.match(JSON.stringify(response.toolResults), /proposed\/operations/i);
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

test("proposed-operations module blocks unsafe legacy BTC auto-patches and returns explicit requirements", () => {
  const { createProposedOperationsPlan, generateProposedOperations } = require("../server/hermes/proposed-operations.js");
  const plan = createProposedOperationsPlan({
    classification: "repo_admin_ui_operator_task",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    likelyFiles: ["admin/hermes-webui/index.html", "js/hermes-chat.js", "js/hermes-webui-adapter.js"],
    activeRepoContext: { localPath: path.join(__dirname, "..") }
  });
  const ops = plan.operations;
  assert.deepEqual(ops, [], "Unsafe legacy BTC patch templates must not be emitted");
  assert.ok(Array.isArray(plan.missingRequirements) && plan.missingRequirements.length > 0);
  assert.match(JSON.stringify(plan.missingRequirements), /hermes-webui|adapter|legacy|unsafe/i);
  assert.equal(generateProposedOperations({
    classification: "repo_admin_ui_operator_task",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    likelyFiles: ["admin/hermes-webui/index.html", "js/hermes-chat.js", "js/hermes-webui-adapter.js"],
    activeRepoContext: { localPath: path.join(__dirname, "..") }
  }).length, ops.length);
});

test("proposed-operations module returns empty for non-operator classifications", () => {
  const { createProposedOperationsPlan, generateProposedOperations } = require("../server/hermes/proposed-operations.js");
  const ops = generateProposedOperations({
    classification: "generic_chat",
    prompt: "hello world",
    likelyFiles: []
  });
  assert.deepEqual(ops, []);
  assert.deepEqual(createProposedOperationsPlan({
    classification: "repo_admin_ui_operator_task",
    prompt: "adjust the css only for this admin ui card",
    likelyFiles: ["css/wiki.css"],
    activeRepoContext: { localPath: path.join(__dirname, "..") }
  }).missingRequirements, ["No concrete proposed operations generated for CSS-only admin UI requests yet."]);
});

test("safe review mode returns explicit requirements when proposed operations are unavailable", async () => {
  const { conversationRuntime } = loadRuntime(setupSandbox());
  const response = await conversationRuntime.runConversation({
    mode: "chat",
    role: "main_hermes",
    swarmExecutionMode: "safe_review",
    prompt: "can you create a popup canvas here in admin page showing BTC chart",
    history: []
  });

  assert.ok(Array.isArray(response.proposedOperations));
  const patchPreviewStage = (response.executionPipeline?.stages || []).find((stage) => stage.stage === "patch_preview");
  if (response.proposedOperations.length > 0) {
    assert.equal(patchPreviewStage?.status, "ready");
  } else {
    assert.ok(["blocked", "ready"].includes(String(patchPreviewStage?.status || "")));
    const missingRequirements = [
      ...(Array.isArray(response.missingRequirements) ? response.missingRequirements : []),
      ...(Array.isArray(response.executionPipeline?.missingRequirements) ? response.executionPipeline.missingRequirements : [])
    ];
    assert.ok(missingRequirements.length > 0);
  }
  // Do not apply in Safe Review Mode.
  const toolActions = (response.toolResults || []).map((item) => item.action);
  assert.ok(!toolActions.includes("patch/apply"));
  if (response.proposedOperations.length > 0) {
    assert.ok(toolActions.includes("proposed/operations"));
  }
  assert.doesNotMatch(JSON.stringify(response.proposedOperations), STUB_MARKER_PATTERN);
});
