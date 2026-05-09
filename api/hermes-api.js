"use strict";

const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const {
  ALLOWED_MODELS,
  DEFAULT_MODEL
} = require("../server/hermes/chat-proxy.js");
const orchestrator = require("../server/hermes/orchestrator.js");
const { getAgents } = require("../server/hermes/swarm-registry.js");
const { createSwarmPlan } = require("../server/hermes/swarm-manager.js");
const { runConversation } = require("../server/hermes/conversation-runtime.js");
const { executeAction } = require("../server/hermes/tool-executor.js");
const { ACTIONS } = require("../server/hermes/action-schema.js");
const { getRegistrySnapshot, getActiveRepoOrThrow } = require("../server/hermes/repo-registry.js");
const git = require("../server/hermes/git-operator.js");
const { ROLE_RULES } = require("../server/hermes/agent-runtime.js");

const app = express();
app.disable("x-powered-by");

const ALLOWED_ORIGINS = (process.env.HERMES_ALLOWED_ORIGINS ||
  "https://cryptomoonboys.com,https://www.cryptomoonboys.com,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(ALLOWED_ORIGINS);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOriginSet.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS policy."));
    }
  })
);
app.use(express.json({ limit: "128kb" }));

function handle(res, fn) {
  Promise.resolve()
    .then(fn)
    .then((data) => res.json({ ok: true, ...data }))
    .catch((error) => res.status(400).json({ ok: false, error: String(error?.message || error) }));
}

function readOpContext(req) {
  const role = String(req.body?.role || "main_hermes");
  const mode = String(req.body?.mode || "chat");
  const confirmEdit = req.body?.confirmEdit === true;
  const approvalId = String(req.body?.approvalId || "");
  const approvalToken = String(req.headers["x-hermes-edit-token"] || req.body?.approvalToken || "");
  const sessionId = String(req.body?.sessionId || req.headers["x-hermes-session-id"] || "");
  const swarm = getAgents();
  return { role, mode, confirmEdit, approvalId, approvalToken, sessionId, swarm };
}

function buildActionContext(req, overrides = {}) {
  return {
    ...readOpContext(req),
    ...overrides
  };
}

async function executeActionRoute(req, res, action) {
  try {
    const result = await executeAction(action, buildActionContext(req));
    const status = result.ok ? 200 : 403;
    return res.status(status).json({
      ok: result.ok,
      action,
      toolResult: result
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
}

async function executePrivilegedActionRoute(req, res, action) {
  return executeActionRoute(req, res, action);
}

function readTextQuery(req, key, fallback = "") {
  return String(req.query?.[key] || fallback);
}

function readArrayBody(req, key) {
  return Array.isArray(req.body?.[key]) ? req.body[key] : [];
}

function readObjectBody(req, key) {
  const value = req.body?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readStringBody(req, key, fallback = "") {
  return String(req.body?.[key] || fallback);
}

function readBooleanBody(req, key) {
  return req.body?.[key] === true;
}

function readNumberBody(req, key) {
  const value = req.body?.[key];
  return Number.isFinite(value) ? value : undefined;
}

function toAction(type, payload) {
  return { type, payload };
}

function parseCommandAction(req) {
  return toAction(ACTIONS.COMMAND_RUN, {
    command: readStringBody(req, "command"),
    args: readArrayBody(req, "args"),
    timeoutMs: readNumberBody(req, "timeoutMs")
  });
}

function parsePatchApplyAction(req) {
  return toAction(ACTIONS.PATCH_APPLY, { operations: readArrayBody(req, "operations") });
}

function parsePatchRollbackAction(req) {
  return toAction(ACTIONS.PATCH_ROLLBACK, { rollbackId: readStringBody(req, "rollbackId") });
}

function parseGitBranchAction(req) {
  return toAction(ACTIONS.GIT_BRANCH, { name: readStringBody(req, "name") });
}

function parseGitCommitAction(req) {
  return toAction(ACTIONS.GIT_COMMIT, { message: readStringBody(req, "message", "Hermes commit") });
}

function parseGitPushAction(req) {
  return toAction(ACTIONS.GIT_PUSH, {
    remote: readStringBody(req, "remote", "origin"),
    branch: readStringBody(req, "branch"),
    dryRun: readBooleanBody(req, "dryRun")
  });
}

function parseMemoryMergeAction(req) {
  return toAction(ACTIONS.MEMORY_MERGE, { patch: readObjectBody(req, "patch") });
}

function parseRepoShowActiveAction() {
  return toAction(ACTIONS.REPO_SHOW_ACTIVE, {});
}

function parseRepoListAction() {
  return toAction(ACTIONS.REPO_LIST, {});
}

function parseRepoSwitchAction(req) {
  return toAction(ACTIONS.REPO_SWITCH, { idOrName: readStringBody(req, "idOrName") });
}

function parseRepoRegisterAction(req) {
  return toAction(ACTIONS.REPO_REGISTER, {
    id: readStringBody(req, "id"),
    name: readStringBody(req, "name"),
    remoteUrl: readStringBody(req, "remoteUrl"),
    localPath: readStringBody(req, "localPath"),
    defaultBranch: readStringBody(req, "defaultBranch", "main"),
    status: readStringBody(req, "status", "inactive")
  });
}

function parseRepoCloneAction(req) {
  return toAction(ACTIONS.REPO_CLONE, {
    id: readStringBody(req, "id"),
    name: readStringBody(req, "name"),
    remoteUrl: readStringBody(req, "remoteUrl"),
    defaultBranch: readStringBody(req, "defaultBranch", "main")
  });
}

function parseFileListAction(req) {
  return toAction(ACTIONS.FILE_LIST, { path: readTextQuery(req, "path", ".") });
}

function parseWebcrawlFindUpdatesAction(req) {
  return toAction(ACTIONS.WEBCRAWL_FIND_UPDATES, { topic: readStringBody(req, "topic") });
}

function parseWebcrawlSearchAction(req) {
  return toAction(ACTIONS.WEBCRAWL_SEARCH, { topic: readStringBody(req, "topic"), model: readStringBody(req, "model") });
}

function parseWebcrawlFetchAction(req) {
  return toAction(ACTIONS.WEBCRAWL_FETCH_URL, { url: readStringBody(req, "url") });
}

function parseWebcrawlCrawlAction(req) {
  return toAction(ACTIONS.WEBCRAWL_CRAWL_SITE, {
    url: readStringBody(req, "url"),
    maxDepth: readNumberBody(req, "maxDepth"),
    maxPages: readNumberBody(req, "maxPages")
  });
}

function parseWebcrawlRssAction(req) {
  return toAction(ACTIONS.WEBCRAWL_RSS_CHECK, { url: readStringBody(req, "url") });
}

function parseWebcrawlCompareAction(req) {
  return toAction(ACTIONS.WEBCRAWL_COMPARE_SNAPSHOT, { topic: readStringBody(req, "topic") });
}

function parseWebcrawlSaveTopicAction(req) {
  return toAction(ACTIONS.WEBCRAWL_SAVE_TOPIC, { topic: readStringBody(req, "topic"), url: readStringBody(req, "url") });
}

function parseWebcrawlListTopicsAction() {
  return toAction(ACTIONS.WEBCRAWL_LIST_TOPICS, {});
}

function parseWebcrawlSummarizeAction(req) {
  return toAction(ACTIONS.WEBCRAWL_SUMMARIZE, { topic: readStringBody(req, "topic") });
}

function parseWebcrawlClearAction() {
  return toAction(ACTIONS.WEBCRAWL_CLEAR_SESSION, {});
}

function parseFileReadAction(req) {
  return toAction(ACTIONS.FILE_READ, { path: readTextQuery(req, "path", "") });
}

function parseRepoSearchAction(req) {
  return toAction(ACTIONS.REPO_SEARCH, { query: readTextQuery(req, "q", ""), limit: req.query.limit });
}

function parseGitDiffAction(req) {
  return toAction(ACTIONS.GIT_DIFF, { target: readTextQuery(req, "target", "") });
}

function parseGitPrMetadataAction(req) {
  return toAction(ACTIONS.GIT_PR_METADATA, { base: readTextQuery(req, "base", "main") });
}

function parseGitStatusAction() {
  return toAction(ACTIONS.GIT_STATUS, {});
}

function parseMemoryViewAction() {
  return toAction(ACTIONS.MEMORY_VIEW, {});
}

function parseIndexRebuildAction() {
  return toAction(ACTIONS.INDEX_REBUILD, {});
}

function parseFilesSearchBody(req) {
  return {
    query: readStringBody(req, "query"),
    paths: readArrayBody(req, "paths")
  };
}

function parseApprovalCreateBody(req) {
  return req.body || {};
}

function parseApprovalDecideBody(req) {
  return {
    id: readStringBody(req, "id"),
    approved: Boolean(req.body?.approved),
    note: readStringBody(req, "note")
  };
}

function readTaskBody(req) {
  return req.body || {};
}

function parseChatBody(req) {
  return req.body || {};
}

function readModeFromBody(req) {
  return readStringBody(req, "mode", "chat");
}

function readRoleFromBody(req) {
  return readStringBody(req, "role", "main_hermes");
}

function readPromptFromBody(req) {
  return readStringBody(req, "prompt");
}

function readHistoryFromBody(req) {
  return Array.isArray(req.body?.history) ? req.body.history : [];
}

function readSystemPromptFromBody(req) {
  return readStringBody(req, "systemPrompt");
}

function readModelFromBody(req) {
  return readStringBody(req, "model");
}

function readProposedOperationsFromBody(req) {
  return readArrayBody(req, "proposedOperations");
}

function readRollbackIdFromBody(req) {
  return readStringBody(req, "rollbackId");
}

function parseConversationInput(req) {
  const body = parseChatBody(req);
  return {
    model: readModelFromBody(req),
    systemPrompt: readSystemPromptFromBody(req),
    prompt: readPromptFromBody(req),
    history: readHistoryFromBody(req),
    mode: readModeFromBody(req),
    role: readRoleFromBody(req),
    confirmEdit: req.body?.confirmEdit === true,
    approvalId: readStringBody(req, "approvalId"),
    approvalToken: String(req.headers["x-hermes-edit-token"] || req.body?.approvalToken || ""),
    sessionId: String(req.body?.sessionId || req.headers["x-hermes-session-id"] || ""),
    proposedOperations: readProposedOperationsFromBody(req),
    rollbackId: readRollbackIdFromBody(req),
    ...body
  };
}

function parseActionBody(req) {
  return req.body?.action || {};
}

function parseModeRoleFallback(req) {
  return {
    mode: readModeFromBody(req),
    role: readRoleFromBody(req)
  };
}

function conversationErrorPayload(req, error) {
  const fallback = parseModeRoleFallback(req);
  return {
    reply: "Hermes failed to process request.",
    actions: [],
    toolResults: [],
    missingRequirements: [String(error?.message || error)],
    mode: fallback.mode,
    role: fallback.role
  };
}

app.get("/api/hermes/models", (_req, res) => {
  res.json({
    defaultModel: DEFAULT_MODEL,
    models: ALLOWED_MODELS,
    modePolicy: {
      chat: "No file/repo writes.",
      agent_edit: "Reserved for explicit future workflows; requires explicit confirmation before edit actions.",
      npc_agent: "NPC Agent is restricted to NPC data/config workflows and cannot edit website/repo runtime directly."
    },
    authority: {
      mainHermes: "Can manage/update NPC Agent systems and rules when explicitly instructed in agent edit mode.",
      npcAgent: "Cannot perform direct website/repo edits outside approved NPC-related data/config paths."
    },
    webcrawl: {
      available: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
      note: "Webcrawl runs server-side only. API keys are never exposed to browser clients."
    }
  });
});

app.get("/api/hermes/policy", (_req, res) => {
  res.json({
    modes: {
      chat: {
        writesAllowed: false,
        commandsAllowed: false,
        description: "Read/answer only. No repo or file mutation."
      },
      agent_edit: {
        writesAllowed: "explicit_only",
        commandsAllowed: "approved_only",
        requires: ["explicit user instruction", "confirmEdit=true"],
        description: "Main Hermes can edit/manage systems only in explicit edit mode."
      },
      admin: {
        writesAllowed: "explicit_only",
        commandsAllowed: "approved_only",
        description: "Deployment/runtime operations require explicit confirmation."
      }
    },
    npcAgent: {
      allowed: ["NPC data updates", "NPC creation", "NPC profile/behavior/config updates"],
      denied: [
        "Website shell/page edits",
        "Repo-wide refactors",
        "Global runtime edits",
        "Workers/Arcade/Block Topia runtime edits (unless file is NPC data/config)"
      ]
    }
  });
});

app.get("/api/hermes/swarm", (_req, res) => {
  const sanitizeRoleCapabilities = () =>
    Object.entries(ROLE_RULES).map(([role, rules]) => {
      const allow = [];
      if (rules.canEditRepo) allow.push("repo edits");
      if (rules.canRunCommands) allow.push("commands");
      if (rules.canUseGit) allow.push("git");
      if (rules.canManageNpc) allow.push("npc management");
      const restrict = [];
      if (!rules.canEditRepo) restrict.push("no repo edits");
      if (!rules.canRunCommands) restrict.push("no commands");
      if (!rules.canUseGit) restrict.push("no git");
      if (role === "npc_agent") {
        restrict.push("npc paths only");
      }
      return { role, allowed: allow, restricted: restrict };
    });

  res.json({
    agents: getAgents(),
    capabilities: sanitizeRoleCapabilities(),
    npcRestrictions: {
      denied: [
        "website/repo runtime edits",
        "shell/runtime command execution",
        "global worker/arcade/block-topia changes"
      ]
    }
  });
});

app.post("/api/hermes/swarm/plan", (req, res) => {
  const taskBrief = readStringBody(req, "taskBrief") || readStringBody(req, "prompt") || readStringBody(req, "task");
  const context = readObjectBody(req, "context");
  res.json({ plan: createSwarmPlan(taskBrief, context) });
});

app.get("/api/hermes/runtime/root", async (_req, res) => {
  try {
    const activeRepo = getActiveRepoOrThrow();
    const cwd = process.cwd();
    let gitRoot = "";
    try {
      gitRoot = await git.runGit(["rev-parse", "--show-toplevel"]);
    } catch (_error) {
      gitRoot = "";
    }
    const topLevelEntries = fs.existsSync(activeRepo.localPath)
      ? fs.readdirSync(activeRepo.localPath).slice(0, 120)
      : [];
    return res.json({
      ok: true,
      activeRepoId: activeRepo.id,
      activeRepoName: activeRepo.name,
      remoteUrl: activeRepo.remoteUrl,
      localPath: activeRepo.localPath,
      cwd,
      gitRoot,
      packageJsonExists: fs.existsSync(path.join(activeRepo.localPath, "package.json")),
      indexHtmlExists: fs.existsSync(path.join(activeRepo.localPath, "index.html")),
      apiHermesExists: fs.existsSync(path.join(activeRepo.localPath, "api", "hermes-api.js")),
      topLevelEntries
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/chat", async (req, res) => {
  try {
    const payload = parseConversationInput(req);
    const response = await runConversation(payload);
    res.json({
      reply: response.reply,
      actions: response.actions || [],
      toolResults: response.toolResults || [],
      missingRequirements: response.missingRequirements || [],
      mode: response.mode,
      role: response.role
    });
  } catch (error) {
    res.status(400).json(conversationErrorPayload(req, error));
  }
});

app.post("/api/hermes/action", async (req, res) => {
  return executeActionRoute(req, res, parseActionBody(req));
});

app.post("/api/hermes/task/plan", (req, res) => {
  handle(res, async () => ({ plan: await orchestrator.executeTask(readTaskBody(req)) }));
});

app.post("/api/hermes/index/rebuild", (_req, res) => {
  void _req;
  return executeActionRoute({ ..._req, body: _req.body || {}, query: _req.query || {} }, res, parseIndexRebuildAction());
});

app.get("/api/hermes/index/search", (req, res) => {
  return executeActionRoute(req, res, parseRepoSearchAction(req));
});

app.get("/api/hermes/files/list", (req, res) => {
  return executeActionRoute(req, res, parseFileListAction(req));
});

app.get("/api/hermes/files/read", (req, res) => {
  return executeActionRoute(req, res, parseFileReadAction(req));
});

app.post("/api/hermes/webcrawl/find-updates", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlFindUpdatesAction(req));
});

app.post("/api/hermes/webcrawl/search", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlSearchAction(req));
});

app.post("/api/hermes/webcrawl/fetch", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlFetchAction(req));
});

app.post("/api/hermes/webcrawl/crawl", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlCrawlAction(req));
});

app.post("/api/hermes/webcrawl/rss", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlRssAction(req));
});

app.post("/api/hermes/webcrawl/compare", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlCompareAction(req));
});

app.post("/api/hermes/webcrawl/save-topic", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlSaveTopicAction(req));
});

app.get("/api/hermes/webcrawl/topics", (_req, res) => {
  return executeActionRoute(_req, res, parseWebcrawlListTopicsAction());
});

app.post("/api/hermes/webcrawl/summarize", (req, res) => {
  return executeActionRoute(req, res, parseWebcrawlSummarizeAction(req));
});

app.post("/api/hermes/webcrawl/clear-session", (_req, res) => {
  return executeActionRoute(_req, res, parseWebcrawlClearAction());
});

app.post("/api/hermes/files/search", (req, res) => {
  handle(res, async () => ({
    results: orchestrator.tools.searchContents(req.body?.query || "", req.body?.paths || [])
  }));
});

app.post("/api/hermes/patch/preview", (req, res) => {
  handle(res, async () => ({ preview: orchestrator.tools.previewPatch(req.body?.operations || []) }));
});

app.post("/api/hermes/patch/apply", (req, res) => {
  return executePrivilegedActionRoute(req, res, parsePatchApplyAction(req));
});

app.post("/api/hermes/patch/rollback", (req, res) => {
  return executePrivilegedActionRoute(req, res, parsePatchRollbackAction(req));
});

app.get("/api/hermes/git/status", (_req, res) => {
  return executeActionRoute(_req, res, parseGitStatusAction());
});

app.post("/api/hermes/git/branch", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseGitBranchAction(req));
});

app.get("/api/hermes/git/diff", (req, res) => {
  return executeActionRoute(req, res, parseGitDiffAction(req));
});

app.post("/api/hermes/git/commit", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseGitCommitAction(req));
});

app.post("/api/hermes/git/stash", (_req, res) => {
  return executePrivilegedActionRoute(_req, res, toAction(ACTIONS.GIT_STASH, {}));
});

app.post("/api/hermes/git/restore", (req, res) => {
  return executePrivilegedActionRoute(req, res, toAction(ACTIONS.GIT_RESTORE, { paths: readArrayBody(req, "paths") }));
});

app.post("/api/hermes/git/push", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseGitPushAction(req));
});

app.get("/api/hermes/git/pr-metadata", (req, res) => {
  return executeActionRoute(req, res, parseGitPrMetadataAction(req));
});

app.post("/api/hermes/command/run", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseCommandAction(req));
});

app.get("/api/hermes/command/queue", (_req, res) => {
  res.json({ ok: true, queue: orchestrator.tools.getQueueState() });
});

app.post("/api/hermes/approval/create", (req, res) => {
  handle(res, async () => ({ approval: orchestrator.tools.createApproval(req.body || {}) }));
});

app.post("/api/hermes/approval/decide", (req, res) => {
  handle(res, async () => ({
    approval: orchestrator.tools.decideApproval(req.body?.id || "", Boolean(req.body?.approved), req.body?.note || "")
  }));
});

app.get("/api/hermes/approval/list", (_req, res) => {
  res.json({ ok: true, approvals: orchestrator.tools.getApprovals() });
});

app.get("/api/hermes/memory", (_req, res) => {
  return executeActionRoute(_req, res, parseMemoryViewAction());
});

app.post("/api/hermes/memory/merge", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseMemoryMergeAction(req));
});

app.get("/api/hermes/repos", (_req, res) => {
  try {
    return res.json({ ok: true, ...getRegistrySnapshot() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/repos/active", (_req, res) => {
  return executeActionRoute(_req, res, parseRepoShowActiveAction());
});

app.post("/api/hermes/repos/switch", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseRepoSwitchAction(req));
});

app.post("/api/hermes/repos/register", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseRepoRegisterAction(req));
});

app.post("/api/hermes/repos/clone", (req, res) => {
  return executePrivilegedActionRoute(req, res, parseRepoCloneAction(req));
});

const PORT = Number(process.env.PORT || 3012);
if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Hermes API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app };
