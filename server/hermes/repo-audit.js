"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadIndex } = require("./repo-indexer.js");
const { getActiveRepoRoot } = require("./path-utils.js");

const MAX_SCAN_FILES = 180;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FINDINGS = 60;

const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".css", ".yml", ".yaml", ".sh"
]);

const AUDIT_RULES = Object.freeze([
  { id: "unsafe_eval", severity: "high", pattern: /\beval\s*\(/u, reason: "Dynamic eval can execute untrusted code." },
  { id: "shell_exec", severity: "high", pattern: /\b(exec|spawn)\s*\(/u, reason: "Process execution needs strict input controls." },
  { id: "hardcoded_secret", severity: "high", pattern: /(api[_-]?key|secret|token)\s*[:=]\s*['"`][^'"`\n]{10,}/iu, reason: "Looks like a hardcoded secret/token." },
  { id: "todo_fixme", severity: "medium", pattern: /\b(TODO|FIXME|HACK)\b/u, reason: "Open implementation debt marker." },
  { id: "empty_catch", severity: "medium", pattern: /catch\s*\([^)]*\)\s*\{\s*\}/u, reason: "Empty catch block can hide failures." },
  { id: "console_error", severity: "low", pattern: /\bconsole\.(error|warn)\s*\(/u, reason: "Runtime warning/error path present; verify handling." }
]);

function isTextCandidate(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(String(filePath || "")).toLowerCase());
}

function isPathInsideRepo(repoRootResolved, candidateAbsPath) {
  const normalizedRoot = String(repoRootResolved || "");
  const normalizedCandidate = String(candidateAbsPath || "");
  if (!normalizedRoot || !normalizedCandidate) return false;
  const rel = path.relative(normalizedRoot, normalizedCandidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function runRepoAudit(options = {}) {
  const index = options.index || loadIndex();
  const repoRoot = options.repoRoot || getActiveRepoRoot();
  const repoRootResolved = path.resolve(repoRoot);
  const candidates = (Array.isArray(index.files) ? index.files : [])
    .filter((f) => isTextCandidate(f.path))
    .slice(0, MAX_SCAN_FILES);

  const findings = [];
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let scannedFiles = 0;
  let findingsCapped = false;

  for (const file of candidates) {
    const relPath = String(file.path || "");
    if (!relPath) continue;
    const absPath = path.resolve(repoRootResolved, relPath);
    if (!isPathInsideRepo(repoRootResolved, absPath)) continue;
    if (!fs.existsSync(absPath)) continue;
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink()) continue;
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    scannedFiles += 1;

    const content = fs.readFileSync(absPath, "utf8");
    const lines = content.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const rule of AUDIT_RULES) {
        if (!rule.pattern.test(line)) continue;
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          path: relPath,
          line: i + 1,
          snippet: line.trim().slice(0, 220),
          reason: rule.reason
        });
        bySeverity[rule.severity] += 1;
        if (findings.length >= MAX_FINDINGS) {
          findingsCapped = true;
          break;
        }
      }
      if (findings.length >= MAX_FINDINGS) {
        findingsCapped = true;
        break;
      }
    }
    if (findings.length >= MAX_FINDINGS) {
      findingsCapped = true;
      break;
    }
  }

  findings.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });

  const topFindings = findings.slice(0, 20);
  const nextActions = [];
  if (bySeverity.high > 0) nextActions.push("Create sandbox repair job for high-severity findings first.");
  if (bySeverity.medium > 0) nextActions.push("Address medium-severity TODO/FIXME and silent-failure patterns.");
  if (topFindings.length === 0) nextActions.push("No heuristic findings detected; run full tests and lint for deeper verification.");

  return {
    scannedFiles,
    maxScanFiles: MAX_SCAN_FILES,
    findings: topFindings,
    bySeverity,
    findingsCollected: findings.length,
    maxFindings: MAX_FINDINGS,
    findingsCapped,
    capped: findingsCapped || candidates.length >= MAX_SCAN_FILES,
    nextActions
  };
}

module.exports = {
  runRepoAudit
};
