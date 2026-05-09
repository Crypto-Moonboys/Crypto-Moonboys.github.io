"use strict";

const { execFile } = require("node:child_process");
const { getActiveRepoRoot } = require("./path-utils.js");

function runGit(args, timeoutMs = 15000) {
  const cwd = getActiveRepoRoot();
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function status() {
  const short = await runGit(["status", "--short"]);
  const branch = await runGit(["branch", "--show-current"]);
  return {
    branch,
    changes: short ? short.split("\n") : []
  };
}

async function createBranch(name) {
  const safe = String(name || "").trim();
  if (!safe || /\s/u.test(safe)) {
    throw new Error("Invalid branch name.");
  }
  await runGit(["checkout", "-b", safe]);
  return { branch: safe };
}

async function diff(target = "") {
  const args = target ? ["diff", target] : ["diff"];
  const output = await runGit(args, 30000);
  return { diff: output };
}

async function commit(message, options = {}) {
  const mode = String(options.mode || "chat");
  const branch = await runGit(["branch", "--show-current"]);
  if (mode !== "agent_edit") {
    throw new Error("Commit requires agent_edit mode.");
  }
  if (["main", "master"].includes(branch)) {
    throw new Error("Direct commits to main/master are blocked.");
  }
  await runGit(["add", "-A"]);
  await runGit(["commit", "-m", String(message || "Hermes commit")]);
  const head = await runGit(["rev-parse", "HEAD"]);
  return { branch, head };
}

async function stash(options = {}) {
  const mode = String(options.mode || "chat");
  if (!["agent_edit", "admin"].includes(mode) || !options.approved) {
    throw new Error("Stash requires approved agent_edit/admin mode.");
  }
  const output = await runGit(["stash", "push", "-u", "-m", "hermes-auto-stash"]);
  return { output };
}

async function restore(paths = [], options = {}) {
  const mode = String(options.mode || "chat");
  if (!["agent_edit", "admin"].includes(mode) || !options.approved) {
    throw new Error("Restore requires approved agent_edit/admin mode.");
  }
  const arr = Array.isArray(paths) ? paths.filter(Boolean) : [];
  const args = arr.length ? ["restore", ...arr] : ["restore", "."];
  const output = await runGit(args);
  return { output };
}

async function push(remote = "origin", branch = "") {
  return pushWithPolicy(remote, branch, {});
}

async function pushWithPolicy(remote = "origin", branch = "", options = {}) {
  const mode = String(options.mode || "chat");
  if (!["agent_edit", "admin"].includes(mode)) {
    throw new Error("Push requires agent_edit/admin mode.");
  }
  if (!options.approved) {
    throw new Error("Push requires approved action token.");
  }
  const currentBranch = branch || (await runGit(["branch", "--show-current"]));
  if (["main", "master"].includes(currentBranch)) {
    throw new Error("Push to main/master is blocked.");
  }
  if (options.dryRun) {
    const dry = await runGit(["push", "--dry-run", remote, currentBranch], 60000);
    return { remote, branch: currentBranch, dryRun: true, output: dry };
  }
  const output = await runGit(["push", remote, currentBranch], 60000);
  return { remote, branch: currentBranch, dryRun: false, output };
}

async function createPrMetadata(base = "main", options = {}) {
  // Use the job's sandboxPath or repoPath when provided — never rely on global process cwd.
  const cwd = String(options.cwd || "").trim() || getActiveRepoRoot();
  const branch = String(options.branch || "").trim() || await new Promise((resolve, reject) => {
    execFile("git", ["branch", "--show-current"], { cwd }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout || "").trim());
    });
  });
  const log = await new Promise((resolve, reject) => {
    execFile("git", ["log", "--oneline", `${base}..${branch}`], { cwd }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout || "").trim());
    });
  });
  return { base, branch, commits: log ? log.split("\n") : [] };
}

module.exports = {
  runGit,
  status,
  createBranch,
  diff,
  commit,
  stash,
  restore,
  push,
  pushWithPolicy,
  createPrMetadata
};
