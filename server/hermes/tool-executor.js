"use strict";

const orchestrator = require("./orchestrator.js");
const { ACTIONS, requiresPrivilege } = require("./action-schema.js");
const { assertRoleCapability } = require("./agent-runtime.js");

function missingForPrivileged(ctx = {}) {
  const missing = [];
  if (!["agent_edit", "admin"].includes(String(ctx.mode || "chat"))) {
    missing.push("needs agent_edit/admin mode");
  }
  if (ctx.confirmEdit !== true) {
    missing.push("needs confirmEdit=true");
  }
  const token = String(ctx.approvalToken || "").trim();
  if (!token) {
    missing.push("needs HERMES_EDIT_TOKEN");
  }
  if (!String(ctx.approvalId || "").trim()) {
    missing.push("needs approval id/token");
  }
  return missing;
}

async function executeAction(action, ctx = {}) {
  const type = action?.type;
  const payload = action?.payload || {};
  const role = String(ctx.role || "main_hermes");

  if ([ACTIONS.PATCH_APPLY, ACTIONS.PATCH_ROLLBACK].includes(type)) {
    try {
      assertRoleCapability(role, "canEditRepo");
    } catch (error) {
      return { ok: false, action: type, error: String(error?.message || error) };
    }
  }
  if ([ACTIONS.COMMAND_RUN].includes(type)) {
    try {
      assertRoleCapability(role, "canRunCommands");
    } catch (error) {
      return { ok: false, action: type, error: String(error?.message || error) };
    }
  }
  if ([ACTIONS.GIT_BRANCH, ACTIONS.GIT_COMMIT, ACTIONS.GIT_PUSH].includes(type)) {
    try {
      assertRoleCapability(role, "canUseGit");
    } catch (error) {
      return { ok: false, action: type, error: String(error?.message || error) };
    }
  }

  if (requiresPrivilege(type)) {
    const missing = missingForPrivileged(ctx);
    if (missing.length) {
      return { ok: false, action: type, missingRequirements: missing };
    }
  }

  try {
    switch (type) {
      case ACTIONS.FILE_LIST:
        return { ok: true, action: type, result: orchestrator.tools.listDirectory(payload.path || ".") };
      case ACTIONS.FILE_READ:
        return { ok: true, action: type, result: orchestrator.tools.readFile(payload.path || "") };
      case ACTIONS.REPO_SEARCH:
        return {
          ok: true,
          action: type,
          result: orchestrator.tools.searchIndex(payload.query || "", { limit: payload.limit || 20 })
        };
      case ACTIONS.INDEX_REBUILD:
        return { ok: true, action: type, result: orchestrator.tools.buildIndex() };
      case ACTIONS.GIT_STATUS:
        return { ok: true, action: type, result: await orchestrator.tools.git.status() };
      case ACTIONS.GIT_DIFF:
        return { ok: true, action: type, result: await orchestrator.tools.git.diff(payload.target || "") };
      case ACTIONS.SWARM_VIEW:
        return { ok: true, action: type, result: ctx.swarm || [] };
      case ACTIONS.MEMORY_VIEW:
        return { ok: true, action: type, result: orchestrator.tools.readMemory() };
      case ACTIONS.COMMAND_RUN:
        return {
          ok: true,
          action: type,
          result: await orchestrator.tools.enqueueCommand(payload.command, payload.args || [], {
            mode: ctx.mode,
            role,
            confirmEdit: ctx.confirmEdit,
            approvalId: ctx.approvalId,
            timeoutMs: payload.timeoutMs
          })
        };
      case ACTIONS.PATCH_PREVIEW:
        return { ok: true, action: type, result: orchestrator.tools.previewPatch(payload.operations || []) };
      case ACTIONS.PATCH_APPLY:
        return {
          ok: true,
          action: type,
          result: orchestrator.tools.applyPatch(payload.operations || [], {
            mode: ctx.mode,
            role,
            confirmEdit: ctx.confirmEdit,
            approvalId: ctx.approvalId
          })
        };
      case ACTIONS.PATCH_ROLLBACK:
        return {
          ok: true,
          action: type,
          result: orchestrator.tools.rollbackPatch(payload.rollbackId || "", {
            mode: ctx.mode,
            role,
            confirmEdit: ctx.confirmEdit,
            approvalId: ctx.approvalId
          })
        };
      case ACTIONS.GIT_BRANCH:
        return { ok: true, action: type, result: await orchestrator.tools.git.createBranch(payload.name || "") };
      case ACTIONS.GIT_COMMIT:
        return {
          ok: true,
          action: type,
          result: await orchestrator.tools.git.commit(payload.message || "Hermes commit", { mode: ctx.mode })
        };
      case ACTIONS.GIT_PUSH:
        return {
          ok: true,
          action: type,
          result: await orchestrator.tools.git.pushWithPolicy(payload.remote || "origin", payload.branch || "", {
            mode: ctx.mode,
            approved: true,
            dryRun: payload.dryRun === true
          })
        };
      case ACTIONS.GIT_PR_METADATA:
        return { ok: true, action: type, result: await orchestrator.tools.git.createPrMetadata(payload.base || "main") };
      case ACTIONS.APPROVAL_CREATE:
        return { ok: true, action: type, result: orchestrator.tools.createApproval(payload) };
      default:
        return { ok: false, action: type, error: "Unknown action" };
    }
  } catch (error) {
    return { ok: false, action: type, error: String(error?.message || error) };
  }
}

module.exports = {
  executeAction,
  missingForPrivileged
};
