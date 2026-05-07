"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { INDEX_CACHE_DIR, MAX_SEARCH_RESULTS } = require("./config.js");
const { shouldIgnoreDir, isDeniedPath, getActiveRepoRoot } = require("./path-utils.js");
const { getActiveRepoOrThrow } = require("./repo-registry.js");

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
    ".json": "json", ".html": "html", ".css": "css", ".md": "markdown",
    ".py": "python", ".sh": "shell", ".yml": "yaml", ".yaml": "yaml"
  };
  return map[ext] || "text";
}

function walk(repoRoot, dirAbs, acc = []) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const nextAbs = path.join(dirAbs, entry.name);
    const rel = path.relative(repoRoot, nextAbs).replace(/\\/gu, "/");
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) {
        continue;
      }
      walk(repoRoot, nextAbs, acc);
      continue;
    }
    if (isDeniedPath(rel)) {
      continue;
    }
    acc.push({
      path: rel,
      size: fs.statSync(nextAbs).size,
      language: detectLanguage(rel)
    });
  }
  return acc;
}

function buildIndex() {
  const activeRepo = getActiveRepoOrThrow();
  const repoRoot = getActiveRepoRoot();
  const files = walk(repoRoot, repoRoot);
  const index = {
    generatedAt: new Date().toISOString(),
    repoId: activeRepo.id,
    root: repoRoot,
    files
  };

  fs.mkdirSync(INDEX_CACHE_DIR, { recursive: true });
  const indexPath = path.join(INDEX_CACHE_DIR, `${activeRepo.id}.json`);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return index;
}

function loadIndex() {
  const activeRepo = getActiveRepoOrThrow();
  const indexPath = path.join(INDEX_CACHE_DIR, `${activeRepo.id}.json`);
  if (!fs.existsSync(indexPath)) {
    return buildIndex();
  }
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

function searchIndex(query, options = {}) {
  const q = String(query || "").toLowerCase().trim();
  const limit = Math.max(1, Math.min(Number(options.limit || 40), MAX_SEARCH_RESULTS));
  const index = loadIndex();
  if (!q) {
    return index.files.slice(0, limit);
  }

  return index.files
    .map((file) => {
      const lowerPath = file.path.toLowerCase();
      let score = 0;
      if (lowerPath.includes(q)) {
        score += 20;
      }
      const fileName = path.basename(lowerPath);
      if (fileName === q) {
        score += 40;
      }
      if (fileName.includes(q)) {
        score += 12;
      }
      return { ...file, score };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  buildIndex,
  loadIndex,
  searchIndex
};
