"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MODULES_TO_CLEAR = [
  "../server/hermes/config.js",
  "../server/hermes/job-manager.js",
  "../server/hermes/job-repair-loop.js",
  "../server/hermes/sandbox-runner.js",
  "../server/hermes/swarm-executor.js",
  "../server/hermes/repo-registry.js"
];

function clearModules() {
  for (const mod of MODULES_TO_CLEAR) {
    try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* ok */ }
  }
}

function setupGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-pr-flow-"));
  const { spawnSync } = require("node:child_process");
  spawnSync("git", ["init", root], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.email", "test@hermes.local"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "config", "user.name", "Hermes Test"], { encoding: "utf8", stdio: "pipe" });
  fs.writeFileSync(path.join(root, "README.md"), "test repo\n");
  spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8", stdio: "pipe" });
  spawnSync("git", ["-C", root, "commit", "-m", "init"], { encoding: "utf8", stdio: "pipe" });
  return root;
}

function loadModules(repoRoot) {
  process.env.HERMES_REPO_ROOT = repoRoot;
  process.env.HERMES_DATA_ROOT = path.join(repoRoot, "admin", "hermes-data");
  process.env.HERMES_PRIMARY_REPO_ID = "test-repo";
  process.env.HERMES_PRIMARY_REPO_NAME = "Test Repo";
  process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";
  clearModules();
  return {
    jobManager: require("../server/hermes/job-manager.js"),
    repairLoop: require("../server/hermes/job-repair-loop.js"),
    swarmExecutor: require("../server/hermes/swarm-executor.js"),
    sandboxRunner: require("../server/hermes/sandbox-runner.js")
  };
}

test("job-repair-loop.js module exists", () => {
  const p = path.join(__dirname, "..", "server", "hermes", "job-repair-loop.js");
  assert.ok(fs.existsSync(p), "server/hermes/job-repair-loop.js must exist");
});

test("job-repair-loop exports runTests, applyRepair, repairLoop, markReadyForPr", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "hermes", "job-repair-loop.js"), "utf8");
  assert.match(source, /runTests/u);
  assert.match(source, /applyRepair/u);
  assert.match(source, /repairLoop/u);
  assert.match(source, /markReadyForPr/u);
});

test("swarm-executor.js module exists", () => {
  const p = path.join(__dirname, "..", "server", "hermes", "swarm-executor.js");
  assert.ok(fs.existsSync(p), "server/hermes/swarm-executor.js must exist");
});

test("Create PR is only available after tests_passed status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something" });
  assert.throws(() => jobManager.assertReadyForPr(job), /ready_for_pr/u, "Should not allow PR from planned");

  jobManager.updateJob(job.jobId, { status: "running" });
  assert.throws(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)), /ready_for_pr/u);

  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  assert.throws(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)), /ready_for_pr/u);

  jobManager.updateJob(job.jobId, { status: "ready_for_pr" });
  assert.doesNotThrow(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)));
});

test("job cannot directly edit main branch", () => {
  const repoRoot = setupGitRepo();
  const { jobManager } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "some work" });
  assert.throws(() => jobManager.assertJobNotOnMain({ branch: "main" }), /main or master/iu);
  assert.throws(() => jobManager.assertJobNotOnMain({ branch: "master" }), /main or master/iu);
  assert.doesNotThrow(() => jobManager.assertJobNotOnMain({ branch: job.branch }));
});

test("applyRepair transitions job to repairing status", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix routing" });
  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  const result = repairLoop.applyRepair(job.jobId, { attempt: 1, failureReason: "npm test failed" });
  assert.equal(result.status, "repairing");
});

test("applyRepair fails job after max attempts exceeded", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something" });
  jobManager.updateJob(job.jobId, { status: "tests_failed" });
  const result = repairLoop.applyRepair(job.jobId, { attempt: 999 });
  assert.equal(result.status, "failed");
});

test("applyRepair throws if job is not in tests_failed or repairing", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "do something" });
  assert.throws(() => repairLoop.applyRepair(job.jobId, {}), /tests_failed or repairing/u);
});

test("markReadyForPr requires tests_passed status only (repairing is not sufficient)", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "ready check" });
  // planned should fail
  assert.throws(() => repairLoop.markReadyForPr(job.jobId), /tests_passed/u);

  // repairing must also be rejected — it cannot bypass tests_passed
  jobManager.updateJob(job.jobId, { status: "repairing" });
  assert.throws(() => repairLoop.markReadyForPr(job.jobId), /tests_passed/u);

  // tests_passed is the only valid predecessor
  jobManager.updateJob(job.jobId, { status: "tests_passed" });
  const updated = repairLoop.markReadyForPr(job.jobId);
  assert.equal(updated.status, "ready_for_pr");
});

test("initializeExecution sets status to running and builds swarmPlan", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, swarmExecutor, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "rebuild website UI" });
  sandboxRunner.createSandboxBranch(job.jobId);
  const updated = swarmExecutor.initializeExecution(job.jobId);
  assert.equal(updated.status, "running");
  assert.ok(updated.swarmPlan, "swarmPlan must be set");
  assert.ok(Array.isArray(updated.swarmPlan.agentRoster), "agentRoster must be array");
  assert.ok(updated.swarmPlan.agentRoster.length > 0);
});

test("AGENT_ROLES includes all required roles", () => {
  clearModules();
  const swarmExecutor = require("../server/hermes/swarm-executor.js");
  const required = ["planner_agent", "repo_reader_agent", "ui_agent", "runtime_agent",
    "game_agent", "test_agent", "repair_agent", "deploy_agent", "reviewer_agent"];
  for (const role of required) {
    assert.ok(swarmExecutor.AGENT_ROLES.includes(role), `AGENT_ROLES must include: ${role}`);
  }
});

test("PR flow: job created → sandbox → run → tests_passed → ready_for_pr", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner, swarmExecutor, repairLoop } = loadModules(repoRoot);

  const job = jobManager.createJob({ ownerPrompt: "rebuild the whole website UI" });
  assert.equal(job.status, "planned");

  sandboxRunner.createSandboxBranch(job.jobId);
  const afterSandbox = jobManager.readJob(job.jobId);
  if (afterSandbox.status === "failed") {
    assert.match(String(afterSandbox.lastError || ""), /git unavailable; real sandbox worktree cannot be created/i);
    return;
  }
  assert.equal(afterSandbox.status, "sandbox_created");

  swarmExecutor.initializeExecution(job.jobId);
  assert.equal(jobManager.readJob(job.jobId).status, "running");

  jobManager.updateJob(job.jobId, { status: "tests_passed" });
  repairLoop.markReadyForPr(job.jobId);
  assert.equal(jobManager.readJob(job.jobId).status, "ready_for_pr");

  assert.doesNotThrow(() => jobManager.assertReadyForPr(jobManager.readJob(job.jobId)));
});

test("jobs/test only accepts safe predefined aliases — arbitrary commands are rejected", () => {
  const repoRoot = setupGitRepo();
  loadModules(repoRoot);
  const repairLoop = require("../server/hermes/job-repair-loop.js");

  // resolveTestAlias should throw for any arbitrary command
  const arbitraryCommands = [
    "node -e require('child_process').execSync('id')",
    "npx arbitrary-package",
    "bash -c id",
    "rm -rf /",
    "curl http://evil.example.com"
  ];
  for (const cmd of arbitraryCommands) {
    assert.throws(
      () => {
        // Simulate what the server does: run with the alias
        const aliases = [cmd];
        // Try to use runTests with an invalid alias; it must throw before executing
        // To test the alias validation directly, use the exported SAFE_TEST_ALIASES
        if (!repairLoop.SAFE_TEST_ALIASES[cmd]) {
          throw new Error(`Test alias not allowed: "${cmd}"`);
        }
      },
      /not allowed/u,
      `"${cmd}" should be rejected as unsafe`
    );
  }
});

test("jobs/test only accepts npm test or approved safe aliases", () => {
  const repairLoop = require("../server/hermes/job-repair-loop.js");
  assert.ok(repairLoop.SAFE_TEST_ALIASES["npm test"], "npm test must be a safe alias");
  assert.ok(!repairLoop.SAFE_TEST_ALIASES["node -e require('child_process')"], "node -e must not be safe");
  assert.ok(!repairLoop.SAFE_TEST_ALIASES["npx arbitrary-package"], "npx arbitrary must not be safe");
  assert.ok(!repairLoop.SAFE_TEST_ALIASES["bash -c id"], "bash -c must not be safe");
});

test("repairLoop returns actual loop attempt count, not test command count", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, repairLoop } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix routing" });
  // Seed it so applyRepair is valid
  jobManager.updateJob(job.jobId, { status: "tests_failed", repoPath: repoRoot });
  // Use maxAttempts=2 — even if tests fail, attempts should be the loop count (2), not #commands
  const result = repairLoop.repairLoop(job.jobId, { maxAttempts: 2 });
  // attempts must be between 1 and 2 (loop iterations, not command count)
  assert.ok(result.attempts >= 1 && result.attempts <= 2, `attempts should be loop count, got: ${result.attempts}`);
});

test("advanceSubtask sets tests_passed when all done with no failures", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, swarmExecutor, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something" });
  sandboxRunner.createSandboxBranch(job.jobId);
  swarmExecutor.initializeExecution(job.jobId);
  const running = jobManager.readJob(job.jobId);
  const subtasks = running.swarmPlan.subtasks;

  // Advance all subtasks to done with no failures
  for (const subtask of subtasks) {
    swarmExecutor.advanceSubtask(job.jobId, subtask.id, { failed: false, output: "ok" });
  }

  const final = jobManager.readJob(job.jobId);
  assert.equal(final.status, "tests_passed", "all subtasks done → tests_passed");
});

test("advanceSubtask sets tests_failed when any subtask fails", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, swarmExecutor, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "fix something else" });
  sandboxRunner.createSandboxBranch(job.jobId);
  swarmExecutor.initializeExecution(job.jobId);
  const running = jobManager.readJob(job.jobId);
  const subtasks = running.swarmPlan.subtasks;

  // Fail the first subtask, pass the rest
  const [first, ...rest] = subtasks;
  swarmExecutor.advanceSubtask(job.jobId, first.id, { failed: true, output: "failed" });
  for (const subtask of rest) {
    swarmExecutor.advanceSubtask(job.jobId, subtask.id, { failed: false, output: "ok" });
  }

  const final = jobManager.readJob(job.jobId);
  assert.equal(final.status, "tests_failed", "any subtask failed → tests_failed");
});

test("createSandboxBranch resolves job repoId, not always active repo", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadModules(repoRoot);
  // Create a job with an explicit repoId matching the seeded primary repo
  const job = jobManager.createJob({ ownerPrompt: "targeted repo job", repoId: "test-repo" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  // The resolved repoId must be the job's repoId, not some other active repo
  assert.equal(result.job.repoId, "test-repo");
});

test("teardownSandboxBranch does not mark status as failed on success", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "teardown test" });
  sandboxRunner.createSandboxBranch(job.jobId);
  // Mark it tests_passed before teardown
  jobManager.updateJob(job.jobId, { status: "tests_passed" });
  // Teardown — must not revert the status to failed
  sandboxRunner.teardownSandboxBranch(job.jobId);
  const afterTeardown = jobManager.readJob(job.jobId);
  assert.notEqual(afterTeardown.status, "failed", "Successful teardown must not set status to failed");
  // sandboxPath should be cleared
  assert.equal(afterTeardown.sandboxPath, "");
});

test("sandbox uses git worktree for isolation, not direct checkout", () => {
  const repoRoot = setupGitRepo();
  const { jobManager, sandboxRunner } = loadModules(repoRoot);
  const job = jobManager.createJob({ ownerPrompt: "worktree isolation check" });
  const result = sandboxRunner.createSandboxBranch(job.jobId);
  if (result.job.status === "failed") {
    assert.match(String(result.job.lastError || ""), /git unavailable; real sandbox worktree cannot be created/i);
    return;
  }
  // sandboxPath must be different from repoPath — it is the worktree path
  assert.notEqual(result.sandboxPath, result.repoPath, "sandboxPath must not equal repoPath");
  assert.ok(result.sandboxPath.includes(".hermes-worktrees"), "sandboxPath must be a worktree path");
  // The worktree directory must exist on disk
  assert.ok(fs.existsSync(result.sandboxPath), "worktree path must exist on disk");
});

test("session IDs use crypto.randomUUID format", () => {
  const store = require("../server/hermes/chat-session-store.js");
  const repoRoot = setupGitRepo();
  process.env.HERMES_DATA_ROOT = path.join(repoRoot, "admin", "hermes-data");
  delete require.cache[require.resolve("../server/hermes/chat-session-store.js")];
  const freshStore = require("../server/hermes/chat-session-store.js");
  const session = freshStore.createSession({ title: "test" });
  // Must contain a UUID (8-4-4-4-12 hex pattern)
  assert.match(session.id, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu,
    "session ID must contain a cryptographic UUID");
  // Must not be guessable — no raw Date.now() decimal
  assert.doesNotMatch(session.id, /^\d{13}/u, "session ID must not start with raw millisecond timestamp");
  void store; // suppress unused warning
});

test("openai-command-interpreter has request timeout guard", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "hermes", "openai-command-interpreter.js"), "utf8");
  assert.match(source, /req\.setTimeout/u, "callOpenAi must call req.setTimeout");
  assert.match(source, /OPENAI_TIMEOUT_MS/u, "timeout constant must be defined");
  assert.match(source, /req\.destroy/u, "must destroy request on timeout");
});

test("openai-command-interpreter has response size guard", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "hermes", "openai-command-interpreter.js"), "utf8");
  assert.match(source, /OPENAI_MAX_RESPONSE_BYTES/u, "max response size constant must be defined");
  assert.match(source, /totalBytes.*>.*OPENAI_MAX_RESPONSE_BYTES|OPENAI_MAX_RESPONSE_BYTES.*totalBytes/u,
    "must check response size before parsing");
});

test("hermes-chat.js /websearch adds to state.history", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "hermes-chat.js"), "utf8");
  // After websearch, state.history.push must be called with user+assistant roles
  assert.match(source, /state\.history\.push.*role.*user.*content.*prompt/su,
    "websearch must push user message to state.history");
  assert.match(source, /state\.history\.push.*role.*assistant.*content.*summary/su,
    "websearch must push assistant summary to state.history");
  assert.match(source, /trimHistory\(\)/u, "websearch must trim history after adding");
});

test("hermes-chat.js tool card separator is ASCII-safe", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "hermes-chat.js"), "utf8");
  assert.doesNotMatch(source, /�/u, "tool card must not contain replacement characters");
});

test("hermes-chat.js has no UTF-8 BOM", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "js", "hermes-chat.js"));
  assert.notEqual(raw[0], 0xef, "file must not start with UTF-8 BOM");
});
