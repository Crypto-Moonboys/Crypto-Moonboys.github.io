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

function setupPlainRepoDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-sandbox-plain-"));
  fs.writeFileSync(path.join(root, "README.md"), "plain dir\n");
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
  assert.ok(["sandbox_created", "failed"].includes(result.job.status));
  if (result.job.status === "sandbox_created") {
    assert.ok(result.sandboxPath, "sandboxPath must be set");
  } else {
    assert.equal(result.sandboxPath, "");
    assert.match(String(result.job.lastError || ""), /git unavailable; real sandbox worktree cannot be created/i);
  }
  assert.ok(result.rollbackRef, "rollbackRef must be set");
  // sandboxPath must be a worktree path
  if (result.sandboxPath) {
    assert.ok(result.sandboxPath.includes(".hermes-worktrees"), "sandboxPath must be a worktree");
  }
});

test("createSandboxBranch creates worktree directory on disk", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "build bomber royale" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  if (result.job.status === "sandbox_created") {
    assert.ok(fs.existsSync(result.sandboxPath), "worktree path must exist on disk");
  } else {
    assert.equal(result.sandboxPath, "");
  }
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
  // Now uses git_worktree strategy, not git_reset
  assert.equal(updated.rollbackPlan.type, "git_worktree");
  assert.ok(updated.rollbackPlan.rollbackRef, "rollbackRef must be a commit SHA");
});

test("BLOCKED_BRANCHES contains main and master", () => {
  clearModules();
  const sandboxRunner = require("../server/hermes/sandbox-runner.js");
  assert.ok(sandboxRunner.BLOCKED_BRANCHES.has("main"));
  assert.ok(sandboxRunner.BLOCKED_BRANCHES.has("master"));
});

test("sandbox uses git worktree add for isolation — sandboxPath is a worktree, not a subdirectory checkout", () => {
  const source = fs.readFileSync(sandboxRunnerPath, "utf8");
  // git worktree add is passed as spawnSync args: ["worktree", "add", ...]
  assert.match(source, /"worktree",\s*"add"/u, "sandbox-runner must use git worktree add");
  assert.match(source, /\.hermes-worktrees/u, "worktree path must use .hermes-worktrees");
});

test("teardownSandboxBranch does not set status to failed in source", () => {
  const source = fs.readFileSync(sandboxRunnerPath, "utf8");
  // teardownSandboxBranch must never call updateJob with status "failed"
  // (applyRepair in a different file can use status:failed — this check is scoped to teardown)
  const teardownSection = source.slice(source.indexOf("function teardownSandboxBranch"));
  const nextFn = teardownSection.indexOf("\nfunction ", 1);
  const teardownBody = nextFn > 0 ? teardownSection.slice(0, nextFn) : teardownSection;
  assert.doesNotMatch(teardownBody, /status.*"failed"|"failed".*status/su,
    "teardownSandboxBranch must not set status to failed");
});

test("createSandboxBranch resolves job repoId from registry before falling back to active repo", () => {
  const source = fs.readFileSync(sandboxRunnerPath, "utf8");
  assert.match(source, /resolveRepoForJob/u, "must have resolveRepoForJob function");
  assert.match(source, /job\.repoId/u, "must check job.repoId");
  assert.match(source, /getRegistrySnapshot/u, "must use getRegistrySnapshot to look up job repo");
});

test("sandbox fallback does not create empty sandbox when git is unavailable", () => {
  const repoRoot = setupPlainRepoDir();
  const { jobManager, sandboxRunner } = loadWithRepo(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fallback guard" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  assert.equal(result.job.status, "failed");
  assert.equal(result.sandboxPath, "");
  assert.match(String(result.job.lastError || ""), /git unavailable; real sandbox worktree cannot be created/i);
});
