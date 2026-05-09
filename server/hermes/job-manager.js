"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { HERMES_DATA_ROOT } = require("./config.js");

const JOBS_DIR = path.join(HERMES_DATA_ROOT, "jobs");

const JOB_STATUSES = Object.freeze([
  "planned",
  "sandbox_created",
  "running",
  "tests_failed",
  "repairing",
  "tests_passed",
  "ready_for_pr",
  "failed"
]);

function nowIso() {
  return new Date().toISOString();
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

function makeJobId() {
  return `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

function makeBranchName(jobId, prompt) {
  const slug = slugify(prompt) || jobId.replace(/[^a-z0-9-]/gu, "-");
  return `hermes/${slug.slice(0, 40) || jobId}`;
}

function ensureJobsDir() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function jobFilePath(jobId) {
  const safe = String(jobId || "").replace(/[^a-zA-Z0-9_-]/gu, "");
  if (!safe) throw new Error("Invalid jobId.");
  return path.join(JOBS_DIR, `${safe}.json`);
}

function createJob(input = {}) {
  ensureJobsDir();
  const ownerPrompt = String(input.ownerPrompt || "").trim();
  if (!ownerPrompt) throw new Error("ownerPrompt is required.");
  const jobId = makeJobId();
  const branch = makeBranchName(jobId, ownerPrompt);
  const job = {
    jobId,
    ownerPrompt,
    status: "planned",
    repoId: String(input.repoId || ""),
    repoPath: String(input.repoPath || ""),
    branch,
    sandboxPath: "",
    swarmPlan: {},
    executionPipeline: {},
    filesChanged: [],
    testsRun: [],
    lastError: "",
    rollbackPlan: {},
    prUrl: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  fs.writeFileSync(jobFilePath(jobId), JSON.stringify(job, null, 2));
  return job;
}

function readJob(jobId) {
  const file = jobFilePath(jobId);
  if (!fs.existsSync(file)) throw new Error(`Job not found: ${jobId}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function updateJob(jobId, patch = {}) {
  const job = readJob(jobId);
  const updated = { ...job, ...patch, jobId: job.jobId, updatedAt: nowIso() };
  if (!JOB_STATUSES.includes(updated.status)) {
    throw new Error(`Invalid job status: ${updated.status}`);
  }
  fs.writeFileSync(jobFilePath(jobId), JSON.stringify(updated, null, 2));
  return updated;
}

function listJobs() {
  ensureJobsDir();
  const files = fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8"));
      } catch (_e) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function deleteJob(jobId) {
  const file = jobFilePath(jobId);
  if (!fs.existsSync(file)) throw new Error(`Job not found: ${jobId}`);
  fs.unlinkSync(file);
  return { deleted: true, jobId };
}

function assertJobNotOnMain(job) {
  const branch = String(job.branch || "");
  if (branch === "main" || branch === "master") {
    throw new Error("Job branch must not be main or master.");
  }
  if (!branch.startsWith("hermes/")) {
    throw new Error("Job branch must start with hermes/.");
  }
}

function assertReadyForPr(job) {
  if (job.status !== "ready_for_pr") {
    throw new Error(`Job must be in ready_for_pr status to create PR. Current: ${job.status}`);
  }
}

module.exports = {
  JOBS_DIR,
  JOB_STATUSES,
  makeBranchName,
  createJob,
  readJob,
  updateJob,
  listJobs,
  deleteJob,
  assertJobNotOnMain,
  assertReadyForPr
};
