"use strict";

const orchestrator = require("./orchestrator.js");
const { ACTIONS, capabilityForAction } = require("./action-schema.js");
const { assertRoleCapability } = require("./agent-runtime.js");
const { consumeApproved } = require("./approval-gate.js");
const {
  getRegistrySnapshot,
  getActiveRepoOrThrow,
  registerRepo,
  switchActiveRepo,
  cloneAndRegisterRepo
} = require("./repo-registry.js");
const { CLONE_PARENT_DIR } = require("./config.js");

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

function assertServerToken(ctx = {}) {
  const serverToken = String(process.env.HERMES_EDIT_TOKEN || "").trim();
  if (!serverToken) {
    throw new Error("HERMES_EDIT_TOKEN is not configured on server.");
  }
  const provided = String(ctx.approvalToken || "").trim();
  if (provided !== serverToken) {
    throw new Error("Missing or invalid Hermes edit token.");
  }
}

function consumeApprovalOrThrow(action, ctx = {}) {
  const approvalId = String(ctx.approvalId || "").trim();
  if (!approvalId) {
    throw new Error("Approval token is required.");
  }
  const record = consumeApproved(approvalId);
  if (record.actionType && record.actionType !== action.type) {
    throw new Error("Approval action type mismatch.");
  }
  if (ctx.sessionId && record.sessionId && ctx.sessionId !== record.sessionId) {
    throw new Error("Approval session mismatch.");
  }
  return record;
}

function executePrivilegedAction(action, ctx, handler) {
  const capability = capabilityForAction(action.type);
  if (capability) {
    assertRoleCapability(String(ctx.role || "main_hermes"), capability);
  }
  const missing = missingForPrivileged(ctx);
  if (missing.length) {
    return { ok: false, action: action.type, missingRequirements: missing };
  }
  assertServerToken(ctx);
  consumeApprovalOrThrow(action, ctx);
  return handler({
    ...ctx,
    approvalConsumed: true
  });
}

function ensureAdminMode(ctx = {}, actionType) {
  if (
    [ACTIONS.REPO_REGISTER, ACTIONS.REPO_SWITCH, ACTIONS.REPO_CLONE].includes(actionType) &&
    String(ctx.mode || "") !== "admin"
  ) {
    throw new Error("Repo register/switch/clone require admin mode.");
  }
}

async function executeAction(action, ctx = {}) {
  const type = action?.type;
  const payload = action?.payload || {};
  const role = String(ctx.role || "main_hermes");
  const normalizedAction = { type, payload };

  const mappedCapability = capabilityForAction(type);
  if (mappedCapability) {
    try {
      assertRoleCapability(role, mappedCapability);
    } catch (error) {
      return { ok: false, action: type, error: String(error?.message || error) };
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
      case ACTIONS.REPO_SHOW_ACTIVE:
        return { ok: true, action: type, result: getActiveRepoOrThrow() };
      case ACTIONS.REPO_LIST:
        return { ok: true, action: type, result: getRegistrySnapshot() };
      case ACTIONS.COMMAND_RUN:
        return await executePrivilegedAction(normalizedAction, ctx, async (privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.enqueueCommand(payload.command, payload.args || [], {
            mode: privCtx.mode,
            role,
            confirmEdit: privCtx.confirmEdit,
            approvalId: privCtx.approvalId,
            approvalConsumed: true,
            timeoutMs: payload.timeoutMs
          })
        }));
      case ACTIONS.PATCH_PREVIEW:
        return { ok: true, action: type, result: orchestrator.tools.previewPatch(payload.operations || []) };
      case ACTIONS.PATCH_APPLY:
        return executePrivilegedAction(normalizedAction, ctx, (privCtx) => ({
          ok: true,
          action: type,
          result: orchestrator.tools.applyPatch(payload.operations || [], {
            mode: privCtx.mode,
            role,
            confirmEdit: privCtx.confirmEdit,
            approvalId: privCtx.approvalId,
            approvalConsumed: true
          })
        }));
      case ACTIONS.PATCH_ROLLBACK:
        return executePrivilegedAction(normalizedAction, ctx, (privCtx) => ({
          ok: true,
          action: type,
          result: orchestrator.tools.rollbackPatch(payload.rollbackId || "", {
            mode: privCtx.mode,
            role,
            confirmEdit: privCtx.confirmEdit,
            approvalId: privCtx.approvalId,
            approvalConsumed: true
          })
        }));
      case ACTIONS.GIT_BRANCH:
        return await executePrivilegedAction(normalizedAction, ctx, async (_privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.git.createBranch(payload.name || "")
        }));
      case ACTIONS.GIT_COMMIT:
        return await executePrivilegedAction(normalizedAction, ctx, async (privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.git.commit(payload.message || "Hermes commit", { mode: privCtx.mode })
        }));
      case ACTIONS.GIT_PUSH:
        return await executePrivilegedAction(normalizedAction, ctx, async (privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.git.pushWithPolicy(payload.remote || "origin", payload.branch || "", {
            mode: privCtx.mode,
            approved: true,
            dryRun: payload.dryRun === true
          })
        }));
      case ACTIONS.GIT_STASH:
        return await executePrivilegedAction(normalizedAction, ctx, async (privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.git.stash({ mode: privCtx.mode, approved: true })
        }));
      case ACTIONS.GIT_RESTORE:
        return await executePrivilegedAction(normalizedAction, ctx, async (privCtx) => ({
          ok: true,
          action: type,
          result: await orchestrator.tools.git.restore(payload.paths || [], { mode: privCtx.mode, approved: true })
        }));
      case ACTIONS.GIT_PR_METADATA:
        return { ok: true, action: type, result: await orchestrator.tools.git.createPrMetadata(payload.base || "main") };
      case ACTIONS.MEMORY_MERGE:
        return executePrivilegedAction(normalizedAction, ctx, (_privCtx) => ({
          ok: true,
          action: type,
          result: orchestrator.tools.mergeMemory(payload.patch || {})
        }));
      case ACTIONS.REPO_REGISTER:
        ensureAdminMode(ctx, type);
        return executePrivilegedAction(normalizedAction, ctx, () => ({
          ok: true,
          action: type,
          result: registerRepo({
            id: payload.id,
            name: payload.name,
            remoteUrl: payload.remoteUrl,
            localPath: payload.localPath || getActiveRepoOrThrow().localPath,
            defaultBranch: payload.defaultBranch,
            status: payload.status || "inactive"
          })
        }));
      case ACTIONS.REPO_SWITCH:
        ensureAdminMode(ctx, type);
        return executePrivilegedAction(normalizedAction, ctx, () => ({
          ok: true,
          action: type,
          result: switchActiveRepo(payload.idOrName)
        }));
      case ACTIONS.REPO_CLONE:
        ensureAdminMode(ctx, type);
        return executePrivilegedAction(normalizedAction, ctx, () => ({
          ok: true,
          action: type,
          result: cloneAndRegisterRepo({
            id: payload.id,
            name: payload.name,
            remoteUrl: payload.remoteUrl,
            defaultBranch: payload.defaultBranch,
            cloneParentDir: CLONE_PARENT_DIR
          })
        }));
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
