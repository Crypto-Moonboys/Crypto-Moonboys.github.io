"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MODULES_TO_CLEAR = [
  "../server/hermes/config.js",
  "../server/hermes/job-manager.js",
  "../server/hermes/job-repair-loop.js",
  "../server/hermes/sandbox-runner.js",
  "../server/hermes/swarm-executor.js",
  "../server/hermes/repo-registry.js"
];

function clearModules() {
  for (const mod of MODULES_TO_CLEAR) {
    try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* ok */ }
  }
}

function setupGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-pr-flow-"));
  const { spawnSync } = require("node:child_process");
  spawnSync("git", ["init", root], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.email", "test@hermes.local"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.name", "Hermes Test"], { encoding: "utf8", stdio: "pipe" });
  fs.writeFileSync(path.join(root, "README.md"), "test repo\n");
  spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "commit", "-m", "init"], { encoding: "utf8", stdio: "pipe" });
  return root;
}

function loadModules(repoRoot) {
  process.env.HERMES_REPO_ROOT = repoRoot;
  process.env.HERMES_DATA_ROOT = path.join(repoRoot, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "test-repo";
  process.env.HERMES_PRIMARY_REPO_NAME = "Test Repo";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  clearModules();
  return {
    jobManager: require("../server/hermes/job-manager.js"),
    repairLoop: require("../server/hermes/job-repair-loop.js"),
    swarmExecutor: require("../server/hermes/swarm-executor.js"),
    sandboxRunner: require("../server/hermes/sandbox-runner.js")
  };
}

test("job-repair-loop.js module exists", () => {
  const p = path.join(__dirname, "..", "server", "hermes", "job-repair-loop.js");
  assert.ok(fs.existsSync(p), "server/hermes/job-repair-loop.js must exist");
});

test("job-repair-loop exports runTests, applyRepair, repairLoop, markReadyForPr", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "hermes", "job-repair-loop.js"), "utf8");
  assert.match(source, /runTests/u);
  assert.match(source, /applyRepair/u);
  assert.match(source, /repairLoop/u);
  assert.match(source, /markReadyForPr/u);
});

test("swarm-executor.js module exists", () => {
  const p = path.join(__dirname, "..", "server", "hermes", "swarm-executor.js");
  assert.ok(fs.existsSync(p), "server/hermes/swarm-executor.js must exist");
});

test("Create PR is only available after tests_passed status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something" });
  assert.throws(() => jobManager.assertReadyForPr(job), /ready_for_pr/u, "Should not allow PR from planned");

  jobManager.updateJob(job.jobId, { status: "running" });
  assert.throws(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)), /ready_for_pr/u);

  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  assert.throws(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)), /ready_for_pr/u);

  jobManager.updateJob(job.jobId, { status: "ready_for_pr" });
  assert.doesNotThrow(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)));
});

test("job cannot directly edit main branch", () => {
  const repoRoot = setupGitRepo();
  const { jobManager } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "some work" });
  assert.throws(() => jobManager.assertJobNotOnMain({ branch: "main" }), /main or master/iu);
  assert.throws(() => jobManager.assertJobNotOnMain({ branch: "master" }), /main or master/iu);
  assert.doesNotThrow(() => jobManager.assertJobNotOnMain({ branch: job.branch }));
});

test("applyRepair transitions job to repairing status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix routing" });
  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  const result = repairLoop.applyRepair(job.jobId, { attempt: 1, failureReason: "npm test failed" });
  assert.equal(result.status, "repairing");
});

test("applyRepair fails job after max attempts exceeded", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something" });
  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  const result = repairLoop.applyRepair(job.jobId, { attempt: 999 });
  assert.equal(result.status, "failed");
});

test("applyRepair throws if job is not in tests_failed or repairing", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "do something" });
  assert.throws(() => repairLoop.applyRepair(job.jobId, {}), /tests_failed or repairing/u);
});

test("markReadyForPr requires tests_passed status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "ready check" });
  assert.throws(() => repairLoop.markReadyForPr(job.jobId), /tests_passed or repairing/u);

  jobManager.updateJob(job.jobId, { status: "tests_passed" });
  const updated = repairLoop.markReadyForPr(job.jobId);
  assert.equal(updated.status, "ready_for_pr");
});

test("initializeExecution sets status to running and builds swarmPlan", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, swarmExecutor, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "rebuild website UI" });
  sandboxRunner.createSandboxBranch(job.jobId);
  const updated = swarmExecutor.initializeExecution(job.jobId);
  assert.equal(updated.status, "running");
  assert.ok(updated.swarmPlan, "swarmPlan must be set");
  assert.ok(Array.isArray(updated.swarmPlan.agentRoster), "agentRoster must be array");
  assert.ok(updated.swarmPlan.agentRoster.length > 0);
});

test("AGENT_ROLES includes all required roles", () => {
  clearModules();
  const swarmExecutor = require("../server/hermes/swarm-executor.js");
  const required = ["planner_agent", "repo_reader_agent", "ui_agent", "runtime_agent",
    "game_agent", "test_agent", "repair_agent", "deploy_agent", "reviewer_agent"];
  for (const role of required) {
    assert.ok(swarmExecutor.AGENT_ROLES.includes(role), `AGENT_ROLES must include: ${role}`);
  }
});

test("PR flow: job created → sandbox → run → tests_passed → ready_for_pr", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner, swarmExecutor, repairLoop } = loadModules(repoRoot);

  const job = jobManager.createJob({ ownerPrompt: "rebuild the whole website UI" });
  assert.equal(job.status, "planned");

  sandboxRunner.createSandboxBranch(job.jobId);
  assert.equal(jobManager.readJob(job.jobId).status, "sandbox_created");

  swarmExecutor.initializeExecution(job.jobId);
  assert.equal(jobManager.readJob(job.jobId).status, "running");

  jobManager.updateJob(job.jobId, { status: "tests_passed" });
  repairLoop.markReadyForPr(job.jobId);
  assert.equal(jobManager.readJob(job.jobId).status, "ready_for_pr");

  assert.doesNotThrow(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)));
});
