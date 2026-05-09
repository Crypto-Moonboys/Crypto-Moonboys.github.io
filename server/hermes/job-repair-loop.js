"use strict";

const { spawnSync } = require("node:child_process");
const { readJob, updateJob } = require("./job-manager.js");

const MAX_REPAIR_ATTEMPTS = 5;

const ALLOWED_TEST_EXECUTABLES = new Set([
  "npm", "node", "npx", "jest", "mocha", "vitest", "tap"
]);

function parseTestCommand(cmd) {
  const parts = String(cmd || "").trim().split(/\s+/u);
  const exe = parts[0];
  if (!ALLOWED_TEST_EXECUTABLES.has(exe)) {
    throw new Error(`Test executable not allowed: ${exe}. Allowed: ${[...ALLOWED_TEST_EXECUTABLES].join(", ")}`);
  }
  return { exe, args: parts.slice(1) };
}

function runCommand(exe, args, cwd, timeoutMs = 60000) {
  const result = spawnSync(exe, args, { cwd, timeout: timeoutMs, encoding: "utf8", stdio: "pipe" });
  return {
    ok: result.status === 0 && !result.error,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    code: result.status,
    error: result.error ? String(result.error.message) : null
  };
}

function runTests(jobId, testCommands = []) {
  const job = readJob(jobId);
  const cwd = job.repoPath || process.cwd();
  const commands = testCommands.length > 0 ? testCommands : ["npm test"];
  const results = [];

  for (const cmd of commands) {
    const { exe, args } = parseTestCommand(cmd);
    const result = runCommand(exe, args, cwd, 120000);
    results.push({ command: cmd, ...result });
  }

  const allPassed = results.every((r) => r.ok);
  const testsRun = (job.testsRun || []).concat(
    results.map((r) => ({
      command: r.command,
      passed: r.ok,
      stdout: r.stdout.slice(0, 2000),
      stderr: r.stderr.slice(0, 2000),
      ranAt: new Date().toISOString()
    }))
  );

  const updated = updateJob(jobId, {
    testsRun,
    status: allPassed ? "tests_passed" : "tests_failed",
    lastError: allPassed ? "" : results.find((r) => !r.ok)?.stderr || "Tests failed"
  });

  return { allPassed, results, job: updated };
}

function applyRepair(jobId, repairPatch = {}) {
  const job = readJob(jobId);
  if (job.status !== "tests_failed" && job.status !== "repairing") {
    throw new Error(`Job must be in tests_failed or repairing status to repair. Current: ${job.status}`);
  }

  const attempts = Number(repairPatch.attempt || 1);
  if (attempts > MAX_REPAIR_ATTEMPTS) {
    return updateJob(jobId, {
      status: "failed",
      lastError: `Exceeded max repair attempts (${MAX_REPAIR_ATTEMPTS}).`
    });
  }

  return updateJob(jobId, {
    status: "repairing",
    lastError: String(repairPatch.failureReason || job.lastError || "")
  });
}

function repairLoop(jobId, options = {}) {
  const maxAttempts = Math.min(Number(options.maxAttempts || 3), MAX_REPAIR_ATTEMPTS);
  const testCommands = Array.isArray(options.testCommands) ? options.testCommands : [];
  const job = readJob(jobId);

  if (!["tests_failed", "repairing", "running"].includes(job.status)) {
    throw new Error(`Job cannot enter repair loop from status: ${job.status}`);
  }

  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    applyRepair(jobId, { attempt, failureReason: lastResult?.results?.find((r) => !r.ok)?.stderr || "" });
    const testResult = runTests(jobId, testCommands);
    lastResult = testResult;
    if (testResult.allPassed) {
      break;
    }
  }

  const finalJob = readJob(jobId);
  if (finalJob.status === "tests_passed") {
    updateJob(jobId, { status: "ready_for_pr" });
  }

  return {
    jobId,
    finalStatus: readJob(jobId).status,
    attempts: lastResult ? lastResult.results.length : 0,
    allPassed: lastResult ? lastResult.allPassed : false,
    testsRun: readJob(jobId).testsRun
  };
}

function markReadyForPr(jobId) {
  const job = readJob(jobId);
  if (!["tests_passed", "repairing"].includes(job.status)) {
    throw new Error(`Job must be in tests_passed or repairing status to mark ready_for_pr. Current: ${job.status}`);
  }
  return updateJob(jobId, { status: "ready_for_pr" });
}

module.exports = {
  MAX_REPAIR_ATTEMPTS,
  runTests,
  applyRepair,
  repairLoop,
  markReadyForPr
};
