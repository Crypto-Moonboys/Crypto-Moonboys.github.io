"use strict";

const { readJob, updateJob } = require("./job-manager.js");
const { createSwarmPlan } = require("./swarm-manager.js");
const { buildExecutionPipeline } = require("./execution-pipeline.js");

const AGENT_ROLES = Object.freeze([
  "planner_agent",
  "repo_reader_agent",
  "ui_agent",
  "runtime_agent",
  "game_agent",
  "test_agent",
  "repair_agent",
  "deploy_agent",
  "reviewer_agent"
]);

const ROLE_TO_SWARM = Object.freeze({
  planner_agent: "main_hermes",
  repo_reader_agent: "main_hermes",
  ui_agent: "ui_agent",
  runtime_agent: "runtime_agent",
  game_agent: "runtime_agent",
  test_agent: "test_agent",
  repair_agent: "watcher_agent",
  deploy_agent: "deploy_agent",
  reviewer_agent: "main_hermes"
});

function mapRoleToSwarm(role) {
  return String(ROLE_TO_SWARM[role] || "main_hermes");
}

function buildAgentRoster(intent, taskBreakdown) {
  const base = ["planner_agent", "repo_reader_agent", "test_agent", "reviewer_agent"];
  if (intent === "rebuild_website") {
    base.push("ui_agent", "runtime_agent");
  } else if (intent === "build_bomber_royale") {
    base.push("game_agent", "ui_agent", "deploy_agent");
  } else {
    base.push("runtime_agent");
  }
  if (taskBreakdown && taskBreakdown.length > 3) {
    base.push("repair_agent");
  }
  return [...new Set(base)].filter((role) => AGENT_ROLES.includes(role));
}

function buildSubtasks(roles, taskBreakdown) {
  return roles.map((role, index) => ({
    id: `executor_task_${String(index + 1).padStart(2, "0")}`,
    role,
    swarmRole: mapRoleToSwarm(role),
    status: "planned",
    steps: role === "planner_agent"
      ? taskBreakdown.slice(0, 3)
      : role === "test_agent"
        ? ["Run tests", "Collect results", "Report failures"]
        : role === "repair_agent"
          ? ["Detect failures", "Apply fixes", "Re-run tests"]
          : taskBreakdown.slice(0, 2),
    result: null,
    startedAt: null,
    completedAt: null
  }));
}

function initializeExecution(jobId) {
  const job = readJob(jobId);
  const interpretation = job.interpretation || {};
  const intent = String(interpretation.intent || "unknown");
  const taskBreakdown = Array.isArray(interpretation.taskBreakdown) ? interpretation.taskBreakdown : [];

  const roles = buildAgentRoster(intent, taskBreakdown);
  const subtasks = buildSubtasks(roles, taskBreakdown);

  const swarmPlan = createSwarmPlan(job.ownerPrompt, {
    swarmExecutionMode: "owner_operator",
    intent
  });

  const executionPipeline = buildExecutionPipeline({
    executionMode: "owner_operator",
    role: "main_hermes",
    filesAffected: Array.isArray(interpretation.filesLikelyInvolved) ? interpretation.filesLikelyInvolved : [],
    hasProposedOperations: false
  });

  return updateJob(jobId, {
    status: "running",
    swarmPlan: {
      ...swarmPlan,
      agentRoster: roles,
      subtasks
    },
    executionPipeline
  });
}

function advanceSubtask(jobId, taskId, result = {}) {
  const job = readJob(jobId);
  const swarmPlan = job.swarmPlan || {};
  const subtasks = Array.isArray(swarmPlan.subtasks) ? swarmPlan.subtasks : [];
  const now = new Date().toISOString();

  const updated = subtasks.map((subtask) => {
    if (subtask.id !== taskId) return subtask;
    return {
      ...subtask,
      status: result.failed ? "failed" : "done",
      result: result.output || null,
      completedAt: now,
      startedAt: subtask.startedAt || now
    };
  });

  const allDone = updated.every((t) => t.status === "done" || t.status === "failed");
  const anyFailed = updated.some((t) => t.status === "failed");

  let nextStatus = job.status;
  if (allDone) {
    nextStatus = anyFailed ? "tests_failed" : "tests_passed";
  }

  return updateJob(jobId, {
    swarmPlan: { ...swarmPlan, subtasks: updated },
    status: nextStatus
  });
}

function getExecutionStatus(jobId) {
  const job = readJob(jobId);
  const swarmPlan = job.swarmPlan || {};
  const subtasks = Array.isArray(swarmPlan.subtasks) ? swarmPlan.subtasks : [];
  const total = subtasks.length;
  const done = subtasks.filter((t) => t.status === "done").length;
  const failed = subtasks.filter((t) => t.status === "failed").length;
  const running = subtasks.filter((t) => t.status === "running").length;
  return {
    jobId,
    jobStatus: job.status,
    total,
    done,
    failed,
    running,
    pending: total - done - failed - running,
    subtasks
  };
}

module.exports = {
  AGENT_ROLES,
  ROLE_TO_SWARM,
  mapRoleToSwarm,
  buildAgentRoster,
  initializeExecution,
  advanceSubtask,
  getExecutionStatus
};
