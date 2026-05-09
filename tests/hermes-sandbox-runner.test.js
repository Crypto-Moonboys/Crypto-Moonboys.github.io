"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sandboxRunnerPath = path.join(__dirname, "..", "server", "hermes", "sandbox-runner.js");

const MODULES_TO_CLEAR = [
  "../server/hermes/config.js",
  "../server/hermes/job-manager.js",
  "../server/hermes/sandbox-runner.js",
  "../server/hermes/repo-registry.js"
];

function clearModules() {
  for (const mod of MODULES_TO_CLEAR) {
    try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* ok */ }
  }
}

function setupGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-sandbox-"));
  const { spawnSync } = require("node:child_process");
  spawnSync("git", ["init", root], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.email", "test@hermes.local"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.name", "Hermes Test"], { encoding: "utf8", stdio: "pipe" });
  fs.writeFileSync(path.join(root, "README.md"), "sandbox test\n");
  spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "commit", "-m", "init"], { encoding: "utf8", stdio: "pipe" });
  return root;
}

function loadWithRepo(repoRoot) {
  process.env.HERMES_REPO_ROOT = repoRoot;
  process.env.HERMES_DATA_ROOT = path.join(repoRoot, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "test-repo";
  process.env.HERMES_PRIMARY_REPO_NAME = "Test Repo";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  clearModules();
  const jobManager = require("../server/hermes/job-manager.js");
  const sandboxRunner = require("../server/hermes/sandbox-runner.js");
  return { jobManager, sandboxRunner };
}

test("sandbox-runner.js module exists", () => {
  assert.ok(fs.existsSync(sandboxRunnerPath), "server/hermes/sandbox-runner.js must exist");
});

test("sandbox-runner exports createSandboxBranch, teardownSandboxBranch, getSandboxStatus", () => {
  const source = fs.readFileSync(sandboxRunnerPath, "utf8");
  assert.match(source, /createSandboxBranch/u);
  assert.match(source, /teardownSandboxBranch/u);
  assert.match(source, /getSandboxStatus/u);
});

test("sandbox branch name must not be main or master", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "test job" });
  // verify the branch generated does not hit main/master
  assert.ok(!sandboxRunner.BLOCKED_BRANCHES.has(job.branch), "Job branch must not be in BLOCKED_BRANCHES");
});

test("createSandboxBranch creates the branch and updates job status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "rebuild website UI" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  assert.equal(result.branch, job.branch);
  assert.equal(result.job.status, "sandbox_created");
  assert.ok(result.sandboxPath, "sandboxPath must be set");
  assert.ok(result.rollbackRef, "rollbackRef must be set");
});

test("createSandboxBranch creates sandbox directory on disk", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "build bomber royale" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  assert.ok(fs.existsSync(result.sandboxPath), "sandboxPath directory must exist on disk");
});

test("getSandboxStatus returns current branch info", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "admin ui task" });
  sandboxRunner.createSandboxBranch(job.jobId);
  const status = sandboxRunner.getSandboxStatus(job.jobId);
  assert.equal(status.jobId, job.jobId);
  assert.ok(status.branch, "must have branch");
  assert.ok(typeof status.onSandboxBranch === "boolean");
});

test("rollbackPlan is set after sandbox creation", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix the routing" });
  sandboxRunner.createSandboxBranch(job.jobId);
  const updated = jobManager.readJob(job.jobId);
  assert.ok(updated.rollbackPlan, "rollbackPlan must be set");
  assert.equal(updated.rollbackPlan.type, "git_reset");
  assert.ok(updated.rollbackPlan.rollbackRef, "rollbackRef must be a commit SHA");
});

test("BLOCKED_BRANCHES contains main and master", () => {
  clearModules();
  const sandboxRunner = require("../server/hermes/sandbox-runner.js");
  assert.ok(sandboxRunner.BLOCKED_BRANCHES.has("main"));
  assert.ok(sandboxRunner.BLOCKED_BRANCHES.has("master"));
});
