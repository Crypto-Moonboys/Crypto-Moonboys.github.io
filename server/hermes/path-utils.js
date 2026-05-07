"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DENY_PATTERNS, IGNORE_DIRS } = require("./config.js");
const { getActiveRepoOrThrow } = require("./repo-registry.js");

function getActiveRepoRoot() {
  return path.resolve(getActiveRepoOrThrow().localPath);
}

function normalizeRepoPath(inputPath) {
  const repoRoot = getActiveRepoRoot();
  const raw = String(inputPath || "").trim();
  if (!raw) {
    return { relPath: ".", absPath: repoRoot, repoRoot };
  }

  if (path.isAbsolute(raw)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const rel = raw.replace(/\\/gu, "/").replace(/^\/+/, "");
  const resolved = path.resolve(repoRoot, rel);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path escapes repository root.");
  }
  return { relPath: relative.replace(/\\/gu, "/") || ".", absPath: resolved, repoRoot };
}

function isDeniedPath(inputPath) {
  const normalized = String(inputPath || "").replace(/\\/gu, "/");
  return DENY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function assertAllowedPath(inputPath) {
  if (isDeniedPath(inputPath)) {
    throw new Error("Path is protected and cannot be accessed.");
  }
  return normalizeRepoPath(inputPath);
}

function shouldIgnoreDir(name) {
  return IGNORE_DIRS.has(String(name || ""));
}

function ensureParentDir(absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
}

module.exports = {
  getActiveRepoRoot,
  normalizeRepoPath,
  isDeniedPath,
  assertAllowedPath,
  shouldIgnoreDir,
  ensureParentDir
};
