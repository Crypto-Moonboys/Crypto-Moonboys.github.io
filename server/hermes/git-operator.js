"use strict";

const { execFile } = require("node:child_process");
const { REPO_ROOT } = require("./config.js");

function runGit(args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: REPO_ROOT, timeout: timeoutMs }, (error, stdout, stderr) => {
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

async function stash() {
  const output = await runGit(["stash", "push", "-u", "-m", "hermes-auto-stash"]);
  return { output };
}

async function restore(paths = []) {
  const arr = Array.isArray(paths) ? paths.filter(Boolean) : [];
  const args = arr.length ? ["restore", ...arr] : ["restore", "."];
  const output = await runGit(args);
  return { output };
}

async function push(remote = "origin", branch = "") {
  const currentBranch = branch || (await runGit(["branch", "--show-current"]));
  const output = await runGit(["push", remote, currentBranch], 60000);
  return { remote, branch: currentBranch, output };
}

async function createPrMetadata(base = "main") {
  const branch = await runGit(["branch", "--show-current"]);
  const log = await runGit(["log", "--oneline", `${base}..HEAD`]);
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
  createPrMetadata
};
