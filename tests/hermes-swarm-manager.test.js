"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const managerPath = path.join(__dirname, "..", "server", "hermes", "swarm-manager.js");
const registryPath = path.join(__dirname, "..", "server", "hermes", "swarm-registry.js");
const apiPath = path.join(__dirname, "..", "api", "hermes-api.js");
const htmlPath = path.join(__dirname, "..", "admin", "hermes-chat.html");
const jsPath = path.join(__dirname, "..", "js", "hermes-chat.js");

const managerSource = fs.readFileSync(managerPath, "utf8");
const apiSource = fs.readFileSync(apiPath, "utf8");
const htmlSource = fs.readFileSync(htmlPath, "utf8");
const jsSource = fs.readFileSync(jsPath, "utf8");

const { createSwarmPlan, EXECUTION_MODES, VALID_STATUSES } = require("../server/hermes/swarm-manager.js");
const { getAgents } = require("../server/hermes/swarm-registry.js");

const validRoleIds = new Set(getAgents().map((agent) => agent.id));

function rolesFor(brief) {
  return createSwarmPlan(brief).subtasks.map((task) => task.assignedAgent);
}

test("swarm planner module exists and exports createSwarmPlan", () => {
  assert.ok(fs.existsSync(managerPath), "server/hermes/swarm-manager.js should exist");
  assert.match(managerSource, /function createSwarmPlan/u);
  assert.equal(typeof createSwarmPlan, "function");
});

test("swarm planner uses existing swarm registry roles", () => {
  assert.match(managerSource, /require\("\.\/swarm-registry\.js"\)/u);
  const plan = createSwarmPlan("Upgrade admin UI and backend tests");
  assert.ok(plan.subtasks.length >= 1);
  for (const subtask of plan.subtasks) {
    assert.ok(validRoleIds.has(subtask.assignedAgent), `${subtask.assignedAgent} must be registered`);
  }
});

test("task classification follows conservative routing rules", () => {
  assert.ok(rolesFor("Fix CSS layout on admin page").includes("ui_agent"));
  assert.ok(rolesFor("Debug backend API runtime route").includes("runtime_agent"));
  assert.ok(rolesFor("Add smoke regression audit tests").includes("test_agent"));
  assert.ok(rolesFor("Deploy to VPS and restart PM2 Nginx").includes("deploy_agent"));
  assert.ok(rolesFor("Update NPC brain lore config data").includes("npc_agent"));
  assert.ok(rolesFor("Create broad repo-wide architecture planning").includes("main_hermes"));
  assert.ok(rolesFor("Review logs and propose healing for failures").includes("watcher_agent"));
});

test("statuses are valid and deploy work starts as needs_approval", () => {
  const plan = createSwarmPlan("Deploy release and reload nginx");
  assert.deepEqual(VALID_STATUSES, ["planned", "running", "blocked", "needs_approval", "done", "failed"]);
  for (const subtask of plan.subtasks) {
    assert.ok(VALID_STATUSES.includes(subtask.status), `${subtask.status} should be valid`);
  }
  assert.ok(plan.subtasks.some((task) => task.assignedAgent === "deploy_agent" && task.status === "needs_approval"));
});

test("plan output includes task-board fields", () => {
  const plan = createSwarmPlan("Upgrade Hermes OG task board UI tests", { mode: "chat" });
  assert.equal(plan.planEndpointOnly, true);
  assert.equal(plan.executionMode, EXECUTION_MODES.SAFE_REVIEW);
  assert.equal(plan.safety.planEndpointDoesNotMutateRepo, true);
  assert.equal(plan.safety.planEndpointDoesNotRunCommands, true);
  assert.equal(plan.ownerOperatorMode.available, true);
  assert.equal(plan.ownerOperatorMode.enabled, false);
  assert.equal(plan.safeReviewMode.planningOnly, true);
  assert.match(plan.authorityModel.ownerOperatorMode, /Owner Operator Mode is for self-hosted repo control/u);
  assert.equal(plan.ownerOperatorMode.flow, "plan → execute → test → rollback/report");
  for (const subtask of plan.subtasks) {
    assert.ok(subtask.taskTitle);
    assert.ok(subtask.assignedAgent);
    assert.ok(subtask.status);
    assert.ok(subtask.riskLevel);
    assert.ok(Array.isArray(subtask.filesLikelyAffected));
    assert.ok(Array.isArray(subtask.requiredTests));
    assert.ok(subtask.nextAction);
    assert.ok(Array.isArray(subtask.allowedOwnerOperatorActions));
    assert.match(subtask.modeCapability, /Safe Review Mode/u);
  }
});

test("owner operator mode enables real execution capabilities in the plan", () => {
  const plan = createSwarmPlan("Edit UI, run tests, use git rollback notes", { swarmExecutionMode: "owner_operator" });
  assert.equal(plan.executionMode, EXECUTION_MODES.OWNER_OPERATOR);
  assert.equal(plan.modeLabel, "OWNER OPERATOR MODE");
  assert.equal(plan.ownerOperatorMode.enabled, true);
  assert.match(plan.authorityModel.specialistAgents, /real work agents/u);
  assert.ok(plan.ownerOperatorMode.capabilities.includes("edit"));
  assert.ok(plan.ownerOperatorMode.capabilities.includes("use git"));
  assert.ok(plan.ownerOperatorMode.capabilities.includes("create rollback patches"));
  assert.ok(plan.subtasks.some((task) => /Owner Operator Mode/u.test(task.modeCapability)));
});

test("CREATE SWARM PLAN controls and task-board containers exist", () => {
  assert.match(htmlSource, /CREATE SWARM PLAN/u);
  assert.match(htmlSource, /id="createSwarmPlan"/u);
  assert.match(htmlSource, /id="ogCreateSwarmPlan"/u);
  assert.match(htmlSource, /id="swarmTaskBoard"/u);
  assert.match(htmlSource, /id="ogSwarmTaskBoard"/u);
});

test("planner UI calls plan endpoint and describes approved execution authority", () => {
  assert.match(jsSource, /function createSwarmPlanFromPrompt/u);
  assert.match(jsSource, /\/api\/hermes\/swarm\/plan/u);
  assert.match(jsSource, /getSwarmExecutionMode/u);
  assert.match(jsSource, /ownerOperatorMode: swarmExecutionMode === "owner_operator"/u);
  assert.match(htmlSource, /AUTHORITY MODEL/u);
  assert.match(htmlSource, /OWNER OPERATOR MODE/u);
  assert.match(htmlSource, /Safe Review Mode/u);
  assert.match(htmlSource, /Owner Operator Mode is for self-hosted repo control/u);
});

test("owner pipeline repair discipline exists without adding a new runtime", () => {
  const repairPolicyPath = path.join(__dirname, "..", "server", "hermes", "repair-policy.js");
  const executionPipelinePath = path.join(__dirname, "..", "server", "hermes", "execution-pipeline.js");
  const repairPolicySource = fs.readFileSync(repairPolicyPath, "utf8");
  const executionPipelineSource = fs.readFileSync(executionPipelinePath, "utf8");
  assert.match(repairPolicySource, /small bounded patches/u);
  assert.match(repairPolicySource, /rollback on failure/u);
  assert.match(repairPolicySource, /avoid deadlock\/no-op cycles/u);
  assert.match(executionPipelineSource, /repairPolicy/u);
  assert.doesNotMatch(executionPipelineSource, /Hermes2/u);
});

test("planner does not call patch application or command execution directly", () => {
  assert.doesNotMatch(managerSource, /applyPatch|runCommand|executeAction|require\(.*orchestrator/u);
  const routeStart = apiSource.indexOf('app.post("/api/hermes/swarm/plan"');
  assert.notEqual(routeStart, -1, "swarm plan endpoint should exist");
  const routeSection = apiSource.slice(routeStart, apiSource.indexOf('app.get("/api/hermes/runtime/root"'));
  assert.match(routeSection, /createSwarmPlan/u);
  assert.doesNotMatch(routeSection, /executeAction|applyPatch|runCommand|orchestrator/u);
});

test("no unsafe Hermes2 or safety bypass strings were added", () => {
  const combined = [managerSource, apiSource, htmlSource, jsSource].join("\n");
  assert.doesNotMatch(combined, /Hermes2/u);
  assert.doesNotMatch(combined, /confirmEdit\s*bypass/iu);
  assert.doesNotMatch(combined, /approval-gate\s*bypass/iu);
  assert.doesNotMatch(combined, /direct browser repo-write endpoint/iu);
});

test("approval warning still exists", () => {
  assert.match(
    htmlSource,
    /Repo edit mode requires explicit approval\. Hermes will preview before applying changes\./u
  );
});

test("swarm registry source remains present", () => {
  assert.ok(fs.existsSync(registryPath));
  assert.ok(validRoleIds.has("main_hermes"));
  assert.ok(validRoleIds.has("ui_agent"));
  assert.ok(validRoleIds.has("runtime_agent"));
  assert.ok(validRoleIds.has("test_agent"));
  assert.ok(validRoleIds.has("deploy_agent"));
  assert.ok(validRoleIds.has("npc_agent"));
  assert.ok(validRoleIds.has("watcher_agent"));
});

test("swarm plan API rejects empty task briefs and trims valid briefs", async () => {
  const { app } = require("../api/hermes-api.js");
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const empty = await fetch(`${base}/api/hermes/swarm/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskBrief: "   " })
    });
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { ok: false, error: "taskBrief is required" });

    const valid = await fetch(`${base}/api/hermes/swarm/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskBrief: "  Fix UI task board  ", context: { swarmExecutionMode: "owner_operator" } })
    });
    assert.equal(valid.status, 200);
    const data = await valid.json();
    assert.equal(data.plan.taskBrief, "Fix UI task board");
    assert.equal(data.plan.executionMode, EXECUTION_MODES.OWNER_OPERATOR);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
