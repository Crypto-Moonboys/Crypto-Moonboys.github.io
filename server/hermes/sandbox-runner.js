"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readJob, updateJob, assertJobNotOnMain } = require("./job-manager.js");
const { getActiveRepoOrThrow } = require("./repo-registry.js");

const BLOCKED_BRANCHES = new Set(["main", "master"]);

function slugFromBranch(branch) {
  return String(branch || "").replace(/[^a-zA-Z0-9_-]/gu, "-");
}

function runGitSync(args, cwd, timeoutMs = 30000) {
  const result = spawnSync("git", args, { cwd, timeout: timeoutMs, encoding: "utf8", stdio: "pipe" });
  if (result.error) throw new Error(`git error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
}

function getCurrentBranch(repoPath) {
  return runGitSync(["branch", "--show-current"], repoPath);
}

function branchExists(repoPath, branchName) {
  const result = spawnSync("git", ["branch", "--list", branchName], {
    cwd: repoPath,
    encoding: "utf8",
    stdio: "pipe"
  });
  return String(result.stdout || "").trim().includes(branchName);
}

function createSandboxBranch(jobId) {
  const job = readJob(jobId);
  assertJobNotOnMain(job);

  const repo = getActiveRepoOrThrow();
  const repoPath = repo.localPath;
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  const branch = job.branch;
  if (BLOCKED_BRANCHES.has(branch)) {
    throw new Error("Sandbox branch cannot be main or master.");
  }

  const currentBranch = getCurrentBranch(repoPath);

  if (branchExists(repoPath, branch)) {
    runGitSync(["checkout", branch], repoPath);
  } else {
    runGitSync(["checkout", "-b", branch], repoPath);
  }

  const sandboxPath = path.join(repoPath, ".hermes-sandboxes", slugFromBranch(branch));
  fs.mkdirSync(sandboxPath, { recursive: true });

  const rollbackRef = runGitSync(["rev-parse", "HEAD"], repoPath);

  const updated = updateJob(jobId, {
    status: "sandbox_created",
    repoId: repo.id,
    repoPath,
    sandboxPath,
    rollbackPlan: {
      type: "git_reset",
      rollbackBranch: currentBranch,
      rollbackRef
    }
  });

  return {
    jobId,
    branch,
    repoPath,
    sandboxPath,
    rollbackRef,
    previousBranch: currentBranch,
    job: updated
  };
}

function teardownSandboxBranch(jobId) {
  const job = readJob(jobId);
  const repoPath = job.repoPath;
  if (!repoPath || !fs.existsSync(repoPath)) {
    throw new Error("No repoPath set on job or path does not exist.");
  }

  const rollback = job.rollbackPlan || {};
  const targetBranch = String(rollback.rollbackBranch || "main");
  const sandboxBranch = job.branch;

  runGitSync(["checkout", targetBranch], repoPath);

  if (branchExists(repoPath, sandboxBranch) && sandboxBranch !== targetBranch) {
    runGitSync(["branch", "-D", sandboxBranch], repoPath);
  }

  if (job.sandboxPath && fs.existsSync(job.sandboxPath)) {
    fs.rmSync(job.sandboxPath, { recursive: true, force: true });
  }

  return updateJob(jobId, { status: "failed", sandboxPath: "" });
}

function getSandboxStatus(jobId) {
  const job = readJob(jobId);
  const repoPath = job.repoPath;
  let currentBranch = "";
  let onSandboxBranch = false;

  if (repoPath && fs.existsSync(repoPath)) {
    try {
      currentBranch = getCurrentBranch(repoPath);
      onSandboxBranch = currentBranch === job.branch;
    } catch (_e) {
      currentBranch = "";
    }
  }

  return {
    jobId,
    branch: job.branch,
    repoPath,
    sandboxPath: job.sandboxPath,
    currentBranch,
    onSandboxBranch,
    status: job.status
  };
}

module.exports = {
  createSandboxBranch,
  teardownSandboxBranch,
  getSandboxStatus,
  BLOCKED_BRANCHES
};
