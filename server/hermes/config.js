"use strict";

const path = require("node:path");

const REPO_ROOT = path.resolve(process.env.HERMES_REPO_ROOT || process.cwd());
const MEMORY_FILE = path.join(REPO_ROOT, "admin", "hermes-data", "memory-store.json");
const ROLLBACK_DIR = path.join(REPO_ROOT, "admin", "hermes-data", "rollbacks");
const INDEX_CACHE_FILE = path.join(REPO_ROOT, "admin", "hermes-data", "repo-index.json");

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
  REPO_ROOT,
  MEMORY_FILE,
  ROLLBACK_DIR,
  INDEX_CACHE_FILE,
  IGNORE_DIRS,
  DENY_PATTERNS,
  MAX_READ_BYTES,
  MAX_SEARCH_RESULTS,
  MAX_COMMAND_TIMEOUT_MS
};
