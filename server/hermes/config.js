"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

function detectDefaultRepoRoot() {
  const envRoot = String(process.env.HERMES_REPO_ROOT || "").trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }

  try {
    const gitRoot = String(
      execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })
    ).trim();
    if (gitRoot) {
      return path.resolve(gitRoot);
    }
  } catch (_error) {
    // Fallback below.
  }

  const cwd = path.resolve(process.cwd());
  if (fs.existsSync(path.join(cwd, ".git"))) {
    return cwd;
  }
  throw new Error("Unable to determine repo root. Set HERMES_REPO_ROOT.");
}

const DEFAULT_REPO_ROOT = detectDefaultRepoRoot();
const HERMES_DATA_ROOT = path.resolve(
  process.env.HERMES_DATA_ROOT ||
  path.join(process.cwd(), "admin", "hermes-data")
);
const MEMORY_FILE = path.join(HERMES_DATA_ROOT, "memory-store.json");
const ROLLBACK_DIR = path.join(HERMES_DATA_ROOT, "rollbacks");
const INDEX_CACHE_DIR = path.join(HERMES_DATA_ROOT, "indexes");
const CLONE_PARENT_DIR = path.resolve(
  process.env.HERMES_REPO_CLONE_PARENT ||
  path.join(path.dirname(DEFAULT_REPO_ROOT), "hermes-repos")
);

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  "_codex_context"
]);

const DENY_PATTERNS = [
  /(^|\\|\/)\.git(\\|\/|$)/iu,
  /(^|\\|\/)\.env(\.|$)/iu,
  /(^|\\|\/)id_rsa(\.|$)/iu,
  /(^|\\|\/)id_ed25519(\.|$)/iu,
  /(^|\\|\/)[^\\\/]+\.pem$/iu,
  /(^|\\|\/)[^\\\/]+\.p12$/iu,
  /(^|\\|\/)[^\\\/]+\.key$/iu,
  /(^|\\|\/)secrets?(\\|\/|$)/iu
];

const MAX_READ_BYTES = 512 * 1024;
const MAX_SEARCH_RESULTS = 120;
const MAX_COMMAND_TIMEOUT_MS = 120000;

module.exports = {
  DEFAULT_REPO_ROOT,
  HERMES_DATA_ROOT,
  MEMORY_FILE,
  ROLLBACK_DIR,
  INDEX_CACHE_DIR,
  CLONE_PARENT_DIR,
  IGNORE_DIRS,
  DENY_PATTERNS,
  MAX_READ_BYTES,
  MAX_SEARCH_RESULTS,
  MAX_COMMAND_TIMEOUT_MS
};

