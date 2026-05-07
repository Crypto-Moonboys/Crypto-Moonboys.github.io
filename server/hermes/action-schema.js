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
  MEMORY_MERGE: "memory/merge",
  REPO_SHOW_ACTIVE: "repo/show-active",
  REPO_LIST: "repo/list",
  REPO_SWITCH: "repo/switch",
  REPO_REGISTER: "repo/register",
  REPO_CLONE: "repo/clone",
  WEBCRAWL_FIND_UPDATES: "webcrawl/find-updates",
  WEBCRAWL_SEARCH: "webcrawl/search",
  WEBCRAWL_FETCH_URL: "webcrawl/fetch-url",
  WEBCRAWL_CRAWL_SITE: "webcrawl/crawl-site",
  WEBCRAWL_RSS_CHECK: "webcrawl/rss-check",
  WEBCRAWL_COMPARE_SNAPSHOT: "webcrawl/compare-snapshot",
  WEBCRAWL_SAVE_TOPIC: "webcrawl/save-topic",
  WEBCRAWL_LIST_TOPICS: "webcrawl/list-topics",
  WEBCRAWL_SUMMARIZE: "webcrawl/summarize",
  WEBCRAWL_CLEAR_SESSION: "webcrawl/clear-session",
  COMMAND_RUN: "command/run",
  PATCH_PREVIEW: "patch/preview",
  PATCH_APPLY: "patch/apply",
  PATCH_ROLLBACK: "patch/rollback",
  GIT_BRANCH: "git/branch",
  GIT_COMMIT: "git/commit",
  GIT_PUSH: "git/push",
  GIT_STASH: "git/stash",
  GIT_RESTORE: "git/restore",
  GIT_PR_METADATA: "git/pr-metadata",
  APPROVAL_CREATE: "approval/create"
});

const PRIVILEGED_ACTIONS = new Set([
  ACTIONS.COMMAND_RUN,
  ACTIONS.PATCH_APPLY,
  ACTIONS.PATCH_ROLLBACK,
  ACTIONS.GIT_BRANCH,
  ACTIONS.GIT_COMMIT,
  ACTIONS.GIT_PUSH,
  ACTIONS.GIT_STASH,
  ACTIONS.GIT_RESTORE,
  ACTIONS.MEMORY_MERGE,
  ACTIONS.REPO_SWITCH,
  ACTIONS.REPO_REGISTER,
  ACTIONS.REPO_CLONE
]);

function requiresPrivilege(action) {
  return PRIVILEGED_ACTIONS.has(action);
}

function capabilityForAction(action) {
  if (!action) return null;
  if (action.startsWith("git/")) return "canUseGit";
  if (action.startsWith("patch/")) return "canEditRepo";
  if (action.startsWith("command/")) return "canRunCommands";
  if (action === ACTIONS.MEMORY_MERGE) return "canEditRepo";
  if (action.startsWith("repo/clone")) return "canEditRepo";
  if (action.startsWith("repo/register")) return "canEditRepo";
  if (action.startsWith("repo/switch")) return "canEditRepo";
  return null;
}

module.exports = {
  ACTIONS,
  requiresPrivilege,
  capabilityForAction
};
