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

  if (/switch\s+active\s+repo\s+to\s+/iu.test(lower)) {
    const value = prompt.replace(/.*switch\s+active\s+repo\s+to\s*/iu, "").trim();
    actions.push({ type: ACTIONS.REPO_SWITCH, payload: { idOrName: value } });
    return { actions, unmatched: false };
  }

  if (/show\s+active\s+repo$/iu.test(lower) || /^active\s+repo$/iu.test(lower)) {
    actions.push({ type: ACTIONS.REPO_SHOW_ACTIVE, payload: {} });
    return { actions, unmatched: false };
  }

  if (/list\s+registered\s+repos|show\s+registered\s+repos/iu.test(lower)) {
    actions.push({ type: ACTIONS.REPO_LIST, payload: {} });
    return { actions, unmatched: false };
  }

  if (/find\s+new\s+updates\s+on\s+anything|find\s+new\s+updates/iu.test(lower)) {
    const topic = prompt.replace(/.*find\s+new\s+updates(\s+on)?/iu, "").trim() || "anything";
    actions.push({ type: ACTIONS.WEBCRAWL_FIND_UPDATES, payload: { topic } });
    return { actions, unmatched: false };
  }

  if (/search\s+web\s+for|search\s+the\s+web\s+for|webcrawl\s+search/iu.test(lower)) {
    const topic = prompt.replace(/.*(search\s+web\s+for|search\s+the\s+web\s+for|webcrawl\s+search)\s*/iu, "").trim();
    actions.push({ type: ACTIONS.WEBCRAWL_SEARCH, payload: { topic: topic || prompt } });
    return { actions, unmatched: false };
  }

  if (/fetch\s+url\s+/iu.test(lower)) {
    const url = (prompt.match(/https?:\/\/\S+/iu) || [])[0] || "";
    actions.push({ type: ACTIONS.WEBCRAWL_FETCH_URL, payload: { url } });
    return { actions, unmatched: false };
  }

  if (/crawl\s+website\s+/iu.test(lower)) {
    const url = (prompt.match(/https?:\/\/\S+/iu) || [])[0] || "";
    actions.push({ type: ACTIONS.WEBCRAWL_CRAWL_SITE, payload: { url } });
    return { actions, unmatched: false };
  }

  if (/check\s+rss\s+feed/iu.test(lower)) {
    const url = (prompt.match(/https?:\/\/\S+/iu) || [])[0] || "";
    actions.push({ type: ACTIONS.WEBCRAWL_RSS_CHECK, payload: { url } });
    return { actions, unmatched: false };
  }

  if (/compare\s+with\s+last\s+snapshot/iu.test(lower)) {
    const topic = prompt.replace(/.*compare\s+with\s+last\s+snapshot\s*/iu, "").trim();
    actions.push({ type: ACTIONS.WEBCRAWL_COMPARE_SNAPSHOT, payload: { topic } });
    return { actions, unmatched: false };
  }

  if (/save\s+watch\s+topic/iu.test(lower)) {
    const topic = prompt.replace(/.*save\s+watch\s+topic\s*/iu, "").trim();
    actions.push({ type: ACTIONS.WEBCRAWL_SAVE_TOPIC, payload: { topic } });
    return { actions, unmatched: false };
  }

  if (/list\s+watch\s+topics/iu.test(lower)) {
    actions.push({ type: ACTIONS.WEBCRAWL_LIST_TOPICS, payload: {} });
    return { actions, unmatched: false };
  }

  if (/summarize\s+findings/iu.test(lower)) {
    const topic = prompt.replace(/.*summarize\s+findings\s*/iu, "").trim();
    actions.push({ type: ACTIONS.WEBCRAWL_SUMMARIZE, payload: { topic } });
    return { actions, unmatched: false };
  }

  if (/clear\s+webcrawl\s+session/iu.test(lower)) {
    actions.push({ type: ACTIONS.WEBCRAWL_CLEAR_SESSION, payload: {} });
    return { actions, unmatched: false };
  }

  if (/register\s+this\s+repo\s*:/iu.test(lower)) {
    const remoteUrl = (prompt.match(/https?:\/\/\S+/iu) || [])[0] || "";
    const localPathMatch = prompt.match(/\bat\s+([^\n]+)$/iu);
    const localPath = localPathMatch ? String(localPathMatch[1] || "").trim() : "";
    actions.push({ type: ACTIONS.REPO_REGISTER, payload: { remoteUrl, localPath } });
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
      type: ACTIONS.PATCH_PREVIEW,
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
