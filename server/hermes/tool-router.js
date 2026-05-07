"use strict";

const { ACTIONS } = require("./action-schema.js");

function parsePathAfterKeyword(prompt, keyword) {
  const idx = prompt.toLowerCase().indexOf(keyword);
  if (idx < 0) return "";
  return prompt.slice(idx + keyword.length).trim().replace(/^['"]|['"]$/gu, "");
}

function routePromptToAction(input = {}) {
  const prompt = String(input.prompt || "").trim();
  const lower = prompt.toLowerCase();
  const actions = [];

  if (!prompt) {
    return { actions, unmatched: true };
  }

  if (/^enter\s+(agent_edit|admin)\s+mode/iu.test(lower)) {
    return {
      actions: [],
      modeSwitch: lower.includes("admin") ? "admin" : "agent_edit",
      unmatched: false
    };
  }

  if (/list\s+(the\s+)?top-?level\s+repo\s+directories|list\s+repo\s+(directories|files)/iu.test(lower)) {
    actions.push({ type: ACTIONS.FILE_LIST, payload: { path: "." } });
    return { actions, unmatched: false };
  }

  if (/search\s+the\s+repo|repo\s+search|find\s+in\s+repo/iu.test(lower)) {
    const query = prompt.replace(/.*?(search\s+the\s+repo\s+for|search\s+repo\s+for|find\s+in\s+repo)\s*/iu, "").trim();
    actions.push({ type: ACTIONS.REPO_SEARCH, payload: { query: query || prompt } });
    return { actions, unmatched: false };
  }

  if (/read\s+[^\n]+/iu.test(lower)) {
    const filePath = parsePathAfterKeyword(prompt, "read");
    actions.push({ type: ACTIONS.FILE_READ, payload: { path: filePath } });
    return { actions, unmatched: false };
  }

  if (/rebuild\s+index|refresh\s+index/iu.test(lower)) {
    actions.push({ type: ACTIONS.INDEX_REBUILD, payload: {} });
    return { actions, unmatched: false };
  }

  if (/swarm\s+status|show\s+swarm/iu.test(lower)) {
    actions.push({ type: ACTIONS.SWARM_VIEW, payload: {} });
    return { actions, unmatched: false };
  }

  if (/view\s+memory|show\s+memory/iu.test(lower)) {
    actions.push({ type: ACTIONS.MEMORY_VIEW, payload: {} });
    return { actions, unmatched: false };
  }

  if (/show\s+active\s+repo|active\s+repo/iu.test(lower)) {
    actions.push({ type: ACTIONS.REPO_SHOW_ACTIVE, payload: {} });
    return { actions, unmatched: false };
  }

  if (/list\s+registered\s+repos|show\s+registered\s+repos/iu.test(lower)) {
    actions.push({ type: ACTIONS.REPO_LIST, payload: {} });
    return { actions, unmatched: false };
  }

  if (/switch\s+active\s+repo\s+to\s+/iu.test(lower)) {
    const value = prompt.replace(/.*switch\s+active\s+repo\s+to\s*/iu, "").trim();
    actions.push({ type: ACTIONS.REPO_SWITCH, payload: { idOrName: value } });
    return { actions, unmatched: false };
  }

  if (/register\s+this\s+repo\s*:/iu.test(lower)) {
    const remoteUrl = prompt.replace(/.*register\s+this\s+repo\s*:\s*/iu, "").trim();
    actions.push({ type: ACTIONS.REPO_REGISTER, payload: { remoteUrl } });
    return { actions, unmatched: false };
  }

  if (/register\s+and\s+clone\s+https?:\/\//iu.test(lower) || /^clone\s+https?:\/\//iu.test(lower)) {
    const remoteUrl = (prompt.match(/https?:\/\/\S+/iu) || [])[0] || "";
    actions.push({ type: ACTIONS.REPO_CLONE, payload: { remoteUrl } });
    return { actions, unmatched: false };
  }

  if (/git\s+status/iu.test(lower)) {
    actions.push({ type: ACTIONS.GIT_STATUS, payload: {} });
    return { actions, unmatched: false };
  }

  if (/git\s+diff/iu.test(lower)) {
    actions.push({ type: ACTIONS.GIT_DIFF, payload: {} });
    return { actions, unmatched: false };
  }

  if (/run\s+npm\s+test|npm\s+test/iu.test(lower)) {
    actions.push({ type: ACTIONS.COMMAND_RUN, payload: { command: "npm", args: ["test"] } });
    return { actions, unmatched: false };
  }

  if (/show\s+pm2\s+status|pm2\s+status/iu.test(lower)) {
    actions.push({ type: ACTIONS.COMMAND_RUN, payload: { command: "pm2", args: ["status"] } });
    return { actions, unmatched: false };
  }

  if (/preview\s+.*patch|create\s+.*patch/iu.test(lower)) {
    actions.push({ type: ACTIONS.PATCH_PREVIEW, payload: { operations: input.proposedOperations || [] } });
    return { actions, unmatched: false };
  }

  if (/^edit\s+/iu.test(lower)) {
    const target = prompt.replace(/^edit\s+/iu, "").trim() || "README.md";
    actions.push({
      type: ACTIONS.PATCH_APPLY,
      payload: {
        operations: [{ type: "update", path: target, content: "" }]
      }
    });
    return { actions, unmatched: false };
  }

  if (/apply\s+the\s+patch|apply\s+patch/iu.test(lower)) {
    actions.push({ type: ACTIONS.PATCH_APPLY, payload: { operations: input.proposedOperations || [] } });
    return { actions, unmatched: false };
  }

  if (/rollback\s+patch/iu.test(lower)) {
    actions.push({ type: ACTIONS.PATCH_ROLLBACK, payload: { rollbackId: input.rollbackId || "" } });
    return { actions, unmatched: false };
  }

  if (/create\s+branch/iu.test(lower)) {
    const name = prompt.replace(/.*create\s+branch\s*/iu, "").trim() || "codex/hermes-task";
    actions.push({ type: ACTIONS.GIT_BRANCH, payload: { name } });
    return { actions, unmatched: false };
  }

  if (/commit/iu.test(lower)) {
    actions.push({ type: ACTIONS.GIT_COMMIT, payload: { message: "Hermes commit" } });
    return { actions, unmatched: false };
  }

  if (/push/iu.test(lower)) {
    actions.push({ type: ACTIONS.GIT_PUSH, payload: { remote: "origin" } });
    return { actions, unmatched: false };
  }

  if (/pr\s+metadata/iu.test(lower)) {
    actions.push({ type: ACTIONS.GIT_PR_METADATA, payload: {} });
    return { actions, unmatched: false };
  }

  return { actions: [], unmatched: true };
}

module.exports = {
  routePromptToAction
};
