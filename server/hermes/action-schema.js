"use strict";

const ACTIONS = Object.freeze({
  FILE_LIST: "file/list",
  FILE_READ: "file/read",
  REPO_SEARCH: "repo/search",
  INDEX_REBUILD: "index/rebuild",
  GIT_STATUS: "git/status",
  GIT_DIFF: "git/diff",
  SWARM_VIEW: "swarm/view",
  MEMORY_VIEW: "memory/view",
  COMMAND_RUN: "command/run",
  PATCH_PREVIEW: "patch/preview",
  PATCH_APPLY: "patch/apply",
  PATCH_ROLLBACK: "patch/rollback",
  GIT_BRANCH: "git/branch",
  GIT_COMMIT: "git/commit",
  GIT_PUSH: "git/push",
  GIT_PR_METADATA: "git/pr-metadata",
  APPROVAL_CREATE: "approval/create"
});

const PRIVILEGED_ACTIONS = new Set([
  ACTIONS.COMMAND_RUN,
  ACTIONS.PATCH_APPLY,
  ACTIONS.PATCH_ROLLBACK,
  ACTIONS.GIT_BRANCH,
  ACTIONS.GIT_COMMIT,
  ACTIONS.GIT_PUSH
]);

function requiresPrivilege(action) {
  return PRIVILEGED_ACTIONS.has(action);
}

module.exports = {
  ACTIONS,
  requiresPrivilege
};
