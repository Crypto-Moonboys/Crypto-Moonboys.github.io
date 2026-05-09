"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readJob, updateJob, assertJobNotOnMain } = require("./job-manager.js");
const { getActiveRepoOrThrow, getRegistrySnapshot } = require("./repo-registry.js");

const BLOCKED_BRANCHES = new Set(["main", "master"]);

// Timeout for git worktree/branch operations (seconds: 30).
const GIT_TIMEOUT_MS = 30000;

function slugFromBranch(branch) {
  return String(branch || "").replace(/[^a-zA-Z0-9_-]/gu, "-");
}

function runGitSync(args, cwd, timeoutMs = GIT_TIMEOUT_MS) {
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

function worktreeExists(repoPath, worktreePath) {
  try {
    const out = runGitSync(["worktree", "list", "--porcelain"], repoPath);
    return out.includes(worktreePath);
  } catch (_e) {
    return false;
  }
}

function resolveRepoForJob(job) {
  const jobRepoId = String(job.repoId || "").trim();
  if (jobRepoId) {
    const snapshot = getRegistrySnapshot();
    const match = (snapshot.repos || []).find((repo) => String(repo.id || "") === jobRepoId);
    if (match) return match;
  }
  // Fall back to active repo only when job has no specific repoId.
  return getActiveRepoOrThrow();
}

function createSandboxBranch(jobId) {
  const job = readJob(jobId);
  assertJobNotOnMain(job);

  // Resolve the repo the job is targeted at — not necessarily the active repo.
  const repo = resolveRepoForJob(job);
  const repoPath = repo.localPath;
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  const branch = job.branch;
  if (BLOCKED_BRANCHES.has(branch)) {
    throw new Error("Sandbox branch cannot be main or master.");
  }

  const currentBranch = getCurrentBranch(repoPath);
  const rollbackRef = runGitSync(["rev-parse", "HEAD"], repoPath);

  // Use a git worktree for real isolation so job operations never touch the shared working tree.
  const worktreePath = path.join(repoPath, ".hermes-worktrees", slugFromBranch(branch));

  if (worktreeExists(repoPath, worktreePath)) {
    // Worktree already exists — reuse it.
  } else if (branchExists(repoPath, branch)) {
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    runGitSync(["worktree", "add", worktreePath, branch], repoPath);
  } else {
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    runGitSync(["worktree", "add", "-b", branch, worktreePath], repoPath);
  }

  const updated = updateJob(jobId, {
    status: "sandbox_created",
    repoId: repo.id,
    repoPath,
    sandboxPath: worktreePath,
    rollbackPlan: {
      type: "git_worktree",
      rollbackBranch: currentBranch,
      rollbackRef
    }
  });

  return {
    jobId,
    branch,
    repoPath,
    sandboxPath: worktreePath,
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

  const sandboxBranch = job.branch;
  const worktreePath = job.sandboxPath;

  if (worktreePath && worktreeExists(repoPath, worktreePath)) {
    try {
      runGitSync(["worktree", "remove", "--force", worktreePath], repoPath);
    } catch (_e) {
      // Best-effort; remove dir manually if worktree remove failed.
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    }
  } else if (worktreePath && fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }

  // Prune stale worktree references.
  try { runGitSync(["worktree", "prune"], repoPath); } catch (_e) { /* ignore */ }

  // Delete the sandbox branch if it still exists.
  if (branchExists(repoPath, sandboxBranch)) {
    try { runGitSync(["branch", "-D", sandboxBranch], repoPath); } catch (_e) { /* ignore */ }
  }

  // Clear sandboxPath without overwriting the job's meaningful terminal status.
  return updateJob(jobId, { sandboxPath: "" });
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
