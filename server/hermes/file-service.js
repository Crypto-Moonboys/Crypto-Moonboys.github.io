"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { MAX_READ_BYTES, MAX_SEARCH_RESULTS } = require("./config.js");
const { assertAllowedPath, shouldIgnoreDir } = require("./path-utils.js");

function listDirectory(inputPath = "") {
  const { absPath, relPath } = assertAllowedPath(inputPath || ".");
  const entries = fs.readdirSync(absPath, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() || !shouldIgnoreDir(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: path.posix.join(relPath || ".", entry.name).replace(/^\.\//u, ""),
      type: entry.isDirectory() ? "dir" : "file"
    }));
  return { path: relPath || ".", entries };
}

function readFile(inputPath) {
  const { absPath, relPath } = assertAllowedPath(inputPath);
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    throw new Error("Path is not a file.");
  }
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`File exceeds read limit (${MAX_READ_BYTES} bytes).`);
  }
  return {
    path: relPath,
    size: stat.size,
    content: fs.readFileSync(absPath, "utf8")
  };
}

function searchContents(query, paths = []) {
  const q = String(query || "").trim();
  if (!q) {
    throw new Error("Search query is required.");
  }
  const needle = q.toLowerCase();

  const candidateFiles = [];
  if (Array.isArray(paths) && paths.length) {
    for (const p of paths) {
      const { absPath, relPath } = assertAllowedPath(p);
      const stat = fs.statSync(absPath);
      if (stat.isFile() && stat.size <= MAX_READ_BYTES) {
        candidateFiles.push({ absPath, relPath });
      }
    }
  }

  const results = [];
  for (const file of candidateFiles) {
    const lines = fs.readFileSync(file.absPath, "utf8").split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].toLowerCase().includes(needle)) {
        results.push({
          path: file.relPath,
          line: i + 1,
          snippet: lines[i].slice(0, 280)
        });
        if (results.length >= MAX_SEARCH_RESULTS) {
          return results;
        }
      }
    }
  }
  return results;
}

module.exports = {
  listDirectory,
  readFile,
  searchContents
};
