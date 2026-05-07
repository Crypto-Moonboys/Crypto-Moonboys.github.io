"use strict";

const { planTask } = require("./task-planner.js");
const { buildIndex, searchIndex } = require("./repo-indexer.js");
const { listDirectory, readFile, searchContents } = require("./file-service.js");
const { previewPatch, applyPatch, rollbackPatch } = require("./patch-engine.js");
const git = require("./git-operator.js");
const { enqueueCommand, getQueueState } = require("./command-runner.js");
const { createApproval, decideApproval, getApprovals } = require("./approval-gate.js");
const { readMemory, mergeMemory } = require("./memory-store.js");
const { assertRolePathAccess } = require("./agent-runtime.js");

async function executeTask(input = {}) {
  const task = String(input.task || "");
  const mode = String(input.mode || "chat");
  return planTask(task, { mode });
}

function guardRolePaths(role, operations = []) {
  for (const op of operations) {
    assertRolePathAccess(role, op.path);
  }
}

module.exports = {
  executeTask,
  tools: {
    buildIndex,
    searchIndex,
    listDirectory,
    readFile,
    searchContents,
    previewPatch,
    applyPatch: (ops, opts = {}) => {
      guardRolePaths(opts.role || "main_hermes", ops || []);
      return applyPatch(ops, opts);
    },
    rollbackPatch,
    git,
    enqueueCommand,
    getQueueState,
    createApproval,
    decideApproval,
    getApprovals,
    readMemory,
    mergeMemory
  }
};
