"use strict";

const { planTask } = require("./task-planner.js");
const { buildIndex, searchIndex } = require("./repo-indexer.js");
const { listDirectory, readFile, searchContents } = require("./file-service.js");
const { previewPatch, applyPatch, rollbackPatch } = require("./patch-engine.js");
const git = require("./git-operator.js");
const { enqueueCommand, getQueueState } = require("./command-runner.js");
const { createApproval, decideApproval, getApprovals, consumeApproved } = require("./approval-gate.js");
const { readMemory, mergeMemory } = require("./memory-store.js");
const { assertRolePathAccess, assertRoleCapability } = require("./agent-runtime.js");

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

function requirePrivileged(options = {}) {
  const mode = String(options.mode || "chat");
  if (!["agent_edit", "admin"].includes(mode)) {
    throw new Error("Operation requires agent_edit/admin mode.");
  }
  if (!options.confirmEdit) {
    throw new Error("Operation requires explicit confirmEdit.");
  }
  if (!options.approvalId) {
    throw new Error("Operation requires approval token.");
  }
  consumeApproved(options.approvalId);
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
      assertRoleCapability(opts.role || "main_hermes", "canEditRepo");
      guardRolePaths(opts.role || "main_hermes", ops || []);
      requirePrivileged(opts);
      return applyPatch(ops, opts);
    },
    rollbackPatch: (rollbackId, opts = {}) => {
      assertRoleCapability(opts.role || "main_hermes", "canEditRepo");
      requirePrivileged(opts);
      return rollbackPatch(rollbackId, opts);
    },
    git,
    enqueueCommand: (command, args = [], opts = {}) => {
      assertRoleCapability(opts.role || "main_hermes", "canRunCommands");
      requirePrivileged(opts);
      return enqueueCommand(command, args, opts);
    },
    getQueueState,
    createApproval,
    decideApproval,
    getApprovals,
    readMemory,
    mergeMemory
  }
};
