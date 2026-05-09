"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MODULES = [
  "../server/hermes/config.js",
  "../server/hermes/job-manager.js"
];

function clearModules() {
  for (const mod of MODULES) {
    try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* ok */ }
  }
}

function setupSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-jobs-"));
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  return root;
}

function loadWithRoot(root) {
  process.env.HERMES_REPO_ROOT = root;
  process.env.HERMES_DATA_ROOT = path.join(root, "admin", "hermes-data");
  clearModules();
  return require("../server/hermes/job-manager.js");
}

const managerPath = path.join(__dirname, "..", "server", "hermes", "job-manager.js");

test("job-manager.js module exists and exports required functions", () => {
  assert.ok(fs.existsSync(managerPath), "server/hermes/job-manager.js must exist");
  const source = fs.readFileSync(managerPath, "utf8");
  assert.match(source, /function createJob/u, "must export createJob");
  assert.match(source, /function readJob/u, "must export readJob");
  assert.match(source, /function updateJob/u, "must export updateJob");
  assert.match(source, /function listJobs/u, "must export listJobs");
  assert.match(source, /assertJobNotOnMain/u, "must export assertJobNotOnMain");
  assert.match(source, /assertReadyForPr/u, "must export assertReadyForPr");
});

test("job creation requires ownerPrompt", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.throws(() => mgr.createJob({}), /ownerPrompt is required/u);
});

test("createJob persists job to disk with correct shape", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const job = mgr.createJob({ ownerPrompt: "rebuild the whole website UI" });
  assert.ok(job.jobId, "must have jobId");
  assert.equal(job.status, "planned");
  assert.ok(job.branch.startsWith("hermes/"), "branch must start with hermes/");
  assert.ok(job.createdAt, "must have createdAt");
  const jobsDir = path.join(root, "admin", "hermes-data", "jobs");
  const files = fs.readdirSync(jobsDir);
  assert.equal(files.length, 1);
});

test("readJob returns saved job", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const job = mgr.createJob({ ownerPrompt: "fix the API route" });
  const loaded = mgr.readJob(job.jobId);
  assert.equal(loaded.jobId, job.jobId);
  assert.equal(loaded.ownerPrompt, "fix the API route");
});

test("readJob throws for unknown id", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.throws(() => mgr.readJob("job_nonexistent"), /not found/iu);
});

test("updateJob changes status and updatedAt", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const job = mgr.createJob({ ownerPrompt: "fix something" });
  const updated = mgr.updateJob(job.jobId, { status: "sandbox_created" });
  assert.equal(updated.status, "sandbox_created");
  assert.ok(updated.updatedAt >= job.updatedAt);
});

test("updateJob rejects invalid status", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const job = mgr.createJob({ ownerPrompt: "do something" });
  assert.throws(() => mgr.updateJob(job.jobId, { status: "bogus_status" }), /Invalid job status/u);
});

test("listJobs returns all persisted jobs sorted newest first", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  mgr.createJob({ ownerPrompt: "job one" });
  mgr.createJob({ ownerPrompt: "job two" });
  const jobs = mgr.listJobs();
  assert.equal(jobs.length, 2);
  assert.ok(jobs[0].createdAt >= jobs[1].createdAt);
});

test("branch name starts with hermes/ and does not contain spaces", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const job = mgr.createJob({ ownerPrompt: "rebuild the whole website UI with new design" });
  assert.match(job.branch, /^hermes\//u, "branch must start with hermes/");
  assert.ok(!/\s/u.test(job.branch), "branch must not contain spaces");
});

test("makeBranchName generates hermes/ prefixed branch", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const branch = mgr.makeBranchName("job_123", "rebuild the website");
  assert.match(branch, /^hermes\//u);
});

test("assertJobNotOnMain throws for main branch job", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.throws(() => mgr.assertJobNotOnMain({ branch: "main" }), /main or master/iu);
  assert.throws(() => mgr.assertJobNotOnMain({ branch: "master" }), /main or master/iu);
});

test("assertJobNotOnMain passes for hermes/ branch", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.doesNotThrow(() => mgr.assertJobNotOnMain({ branch: "hermes/my-job" }));
});

test("assertReadyForPr throws if job is not ready_for_pr", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.throws(() => mgr.assertReadyForPr({ status: "planned" }), /ready_for_pr/u);
  assert.throws(() => mgr.assertReadyForPr({ status: "running" }), /ready_for_pr/u);
});

test("assertReadyForPr passes when status is ready_for_pr", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.doesNotThrow(() => mgr.assertReadyForPr({ status: "ready_for_pr" }));
});

test("job cannot be created with invalid jobId input to readJob", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  assert.throws(() => mgr.readJob(""), /Invalid jobId/u);
  assert.throws(() => mgr.readJob(null), /Invalid jobId/u);
});

test("JOB_STATUSES includes all required status values", () => {
  const root = setupSandbox();
  const mgr = loadWithRoot(root);
  const required = [
    "planned", "sandbox_created", "running", "tests_failed",
    "repairing", "tests_passed", "ready_for_pr", "failed"
  ];
  for (const s of required) {
    assert.ok(mgr.JOB_STATUSES.includes(s), `JOB_STATUSES must include: ${s}`);
  }
});
