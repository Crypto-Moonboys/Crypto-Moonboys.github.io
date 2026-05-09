"use strict";

const { spawnSync } = require("node:child_process");
const { readJob, updateJob } = require("./job-manager.js");

const MAX_REPAIR_ATTEMPTS = 5;

// Only these safe, predefined test aliases may be requested by a caller.
// Arbitrary commands from the request body are not permitted.
const SAFE_TEST_ALIASES = Object.freeze({
  "npm test": { exe: "npm", args: ["test"] },
  "npm run test:hermes-readiness": { exe: "npm", args: ["run", "test:hermes-readiness"] }
});

const DEFAULT_TEST_ALIAS = "npm test";

function resolveTestAlias(alias) {
  const key = String(alias || DEFAULT_TEST_ALIAS).trim();
  const resolved = SAFE_TEST_ALIASES[key];
  if (!resolved) {
    throw new Error(
      `Test alias not allowed: "${key}". Allowed aliases: ${Object.keys(SAFE_TEST_ALIASES).join(", ")}`
    );
  }
  return { command: key, ...resolved };
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

// MAX_OUTPUT_LENGTH caps per-result stdout/stderr stored on disk.
const MAX_OUTPUT_LENGTH = 2000;

function runTests(jobId, testAliases = []) {
  const job = readJob(jobId);
  const cwd = job.sandboxPath || job.repoPath || process.cwd();
  // Use provided safe aliases, or fall back to the default.
  const aliases = testAliases.length > 0 ? testAliases : [DEFAULT_TEST_ALIAS];
  const results = [];

  for (const alias of aliases) {
    const { command, exe, args } = resolveTestAlias(alias);
    const result = runCommand(exe, args, cwd, 120000);
    results.push({ command, ...result });
  }

  const allPassed = results.every((r) => r.ok);
  const testsRun = (job.testsRun || []).concat(
    results.map((r) => ({
      command: r.command,
      passed: r.ok,
      stdout: r.stdout.slice(0, MAX_OUTPUT_LENGTH),
      stderr: r.stderr.slice(0, MAX_OUTPUT_LENGTH),
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
  const testAliases = Array.isArray(options.testAliases) ? options.testAliases : [];
  const job = readJob(jobId);

  if (!["tests_failed", "repairing", "running"].includes(job.status)) {
    throw new Error(`Job cannot enter repair loop from status: ${job.status}`);
  }

  let lastResult = null;
  let attemptCount = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt;
    applyRepair(jobId, { attempt, failureReason: lastResult?.results?.find((r) => !r.ok)?.stderr || "" });
    const testResult = runTests(jobId, testAliases);
    lastResult = testResult;
    if (testResult.allPassed) {
      break;
    }
  }

  const finalJob = readJob(jobId);
  if (finalJob.status === "tests_passed") {
    markReadyForPr(jobId);
  }

  return {
    jobId,
    finalStatus: readJob(jobId).status,
    attempts: attemptCount,
    allPassed: lastResult ? lastResult.allPassed : false,
    testsRun: readJob(jobId).testsRun
  };
}

function markReadyForPr(jobId) {
  const job = readJob(jobId);
  if (job.status !== "tests_passed") {
    throw new Error(`Job must be in tests_passed status to mark ready_for_pr. Current: ${job.status}`);
  }
  return updateJob(jobId, { status: "ready_for_pr" });
}

module.exports = {
  MAX_REPAIR_ATTEMPTS,
  SAFE_TEST_ALIASES,
  runTests,
  applyRepair,
  repairLoop,
  markReadyForPr
};
