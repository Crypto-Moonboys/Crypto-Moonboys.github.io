"use strict";
const { listToolLabels } = require("./tool-registry.js");

const HERMES_IDENTITY = "Hermes";
const HERMES_OPERATOR_TITLE = "your self-hosted Crypto Moonboys repo operator";

const HERMES_CAPABILITY_GROUPS = Object.freeze([
  Object.freeze({
    key: "repo",
    label: "repo read/search/list",
    actions: ["repo/list", "repo/show-active", "repo/search", "repo/register", "repo/clone", "repo/switch"]
  }),
  Object.freeze({
    key: "files",
    label: "file read/search/list",
    actions: ["file/list", "file/read", "repo/search"]
  }),
  Object.freeze({
    key: "patch",
    label: "patch preview/apply/rollback",
    actions: ["patch/preview", "patch/apply", "patch/rollback", "proposed/operations"]
  }),
  Object.freeze({
    key: "git",
    label: "git status/diff/branch/commit/push",
    actions: ["git/status", "git/diff", "git/branch", "git/commit", "git/push", "git/pr-metadata"]
  }),
  Object.freeze({
    key: "commands",
    label: "command run",
    actions: ["command/run"]
  }),
  Object.freeze({
    key: "approval",
    label: "approval flow",
    actions: ["approval/create", "approval/decide", "approval/list"]
  }),
  Object.freeze({
    key: "webcrawl",
    label: "webcrawl/search/fetch/crawl/rss",
    actions: [
      "webcrawl/find-updates",
      "webcrawl/search",
      "webcrawl/fetch",
      "webcrawl/crawl",
      "webcrawl/rss",
      "webcrawl/compare",
      "webcrawl/save-topic",
      "webcrawl/topics",
      "webcrawl/summarize"
    ]
  }),
  Object.freeze({
    key: "memory",
    label: "memory",
    actions: ["memory/view", "memory/merge"]
  }),
  Object.freeze({
    key: "swarm",
    label: "swarm plan",
    actions: ["swarm/plan", "swarm/view"]
  }),
  Object.freeze({
    key: "pipeline",
    label: "owner execution pipeline",
    actions: ["execution/pipeline", "repairPolicy"]
  }),
  Object.freeze({
    key: "brain",
    label: "Brain API",
    actions: ["brain/status", "brain/model", "brain/chat", "brain/logs"]
  }),
  Object.freeze({
    key: "jobs",
    label: "sandbox/job execution",
    actions: ["jobs/create", "jobs/run", "jobs/test", "jobs/repair", "jobs/create-pr"]
  })
]);

const HERMES_OPERATOR_SYSTEM_PROMPT = [
  "You are Hermes, the owner-controlled self-hosted repo operator for Crypto Moonboys.",
  "You are not Qwen in user-facing identity.",
  "Do not describe yourself as Alibaba/Qwen unless explicitly asked what base model powers you.",
  "For repo/admin/site/game requests, ground responses in Hermes tools.",
  "If the owner asks to create, edit, fix, inspect, test, deploy, websearch, patch, rollback, or build, route toward Hermes tools/pipeline.",
  "Never say you cannot edit/create websites when Hermes has repo patch tooling.",
  "Never say you cannot websearch when Hermes webcrawl tools exist.",
  "If a required token/provider/approval is missing, state the exact missing requirement.",
  "Hermes capabilities include repo inspection/search, file read/list/search, patch preview/apply/rollback, git operations, command execution, approval flow, webcrawl/search/fetch/crawl/rss, memory, repo registry, swarm planning, owner execution pipeline, proposed operations, Brain API, and sandbox/job execution."
].join(" ");

function getHermesCapabilities() {
  return HERMES_CAPABILITY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    actions: group.actions.slice()
  }));
}

function buildHermesSystemPrompt(extraPrompt = "") {
  const extra = String(extraPrompt || "").trim();
  return extra ? `${HERMES_OPERATOR_SYSTEM_PROMPT} ${extra}` : HERMES_OPERATOR_SYSTEM_PROMPT;
}

function normalizePrompt(prompt) {
  return String(prompt || "").trim().toLowerCase();
}

function classifyCapabilityPrompt(prompt) {
  const text = normalizePrompt(prompt);
  if (!text) return null;
  if (/^(?:do you know what you are|who are you|what are you)(?:\?)?$/iu.test(text)) return "identity";
  if (/(can you|do you)\s+(edit|create).*(website|websites|site|sites)/iu.test(text)) return "websites";
  if (/(?:can you|do you)\s+(?:websearch|search web)|do you have internet|can you browse/iu.test(text)) {
    return "websearch";
  }
  if (/(what tools do you have|what can you do|what capabilities do you have)/iu.test(text)) return "tools";
  return null;
}

function toolsSummary() {
  return [...new Set([...HERMES_CAPABILITY_GROUPS.map((group) => group.label), ...listToolLabels()])].join(", ");
}

function buildCapabilityReply(kind) {
  if (kind === "identity") {
    return "I am Hermes, your self-hosted Crypto Moonboys repo operator. I can inspect repos, read files, search code, create patch previews, run tests, use git/command tools, create swarm plans, use webcrawl tools, and operate through the Hermes backend toolchain.";
  }
  if (kind === "websites") {
    return "Yes. I can create and edit websites through the Hermes repo toolchain. I can inspect files, generate concrete patch previews, run tests, and prepare approved changes through the owner/operator workflow.";
  }
  if (kind === "websearch") {
    return "Yes. I have Hermes webcrawl/search tools available through the backend. Tell me what to search, or use /websearch.";
  }
  if (kind === "tools") {
    return `I am Hermes, ${HERMES_OPERATOR_TITLE}. My tools include ${toolsSummary()}, plus repo/admin operator routing, proposed operations, approval-gated execution, and Brain integration through the Hermes backend.`;
  }
  return "";
}

module.exports = {
  HERMES_IDENTITY,
  HERMES_OPERATOR_TITLE,
  HERMES_CAPABILITY_GROUPS,
  HERMES_OPERATOR_SYSTEM_PROMPT,
  getHermesCapabilities,
  buildHermesSystemPrompt,
  classifyCapabilityPrompt,
  buildCapabilityReply
};
