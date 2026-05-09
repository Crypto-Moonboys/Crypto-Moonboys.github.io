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
const jobManager = require("../server/hermes/job-manager.js");
const { interpretOwnerCommand } = require("../server/hermes/openai-command-interpreter.js");
const sandboxRunner = require("../server/hermes/sandbox-runner.js");
const swarmExecutor = require("../server/hermes/swarm-executor.js");
const { runTests, applyRepair, markReadyForPr, SAFE_TEST_ALIASES } = require("../server/hermes/job-repair-loop.js");
const { getSkillLoaderStatus } = require("../server/hermes/skill-loader.js");
const { loadRuntimeMap, loadReposConfig, loadToolPolicy } = require("../server/hermes/runtime-map.js");
const { getToolRegistry } = require("../server/hermes/tool-registry.js");
const { generateImage } = require("../server/hermes/image-generator.js");
const githubConnector = require("../server/hermes/github-connector.js");
const { missingForPrivileged } = require("../server/hermes/tool-executor.js");
const { consumeApproved } = require("../server/hermes/approval-gate.js");
const {
  listSessions,
  createSession,
  getSessionById,
  appendSessionMessages
} = require("../server/hermes/chat-session-store.js");

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
    executionPipeline: null,
    swarmPlan: null,
    mode: fallback.mode,
    role: fallback.role
  };
}

function assertPrivilegedGate(req) {
  const ctx = readOpContext(req);
  const missing = missingForPrivileged(ctx);
  if (missing.length > 0) {
    const err = new Error(`Privileged route denied: ${missing.join("; ")}`);
    err.statusCode = 403;
    throw err;
  }
  const serverToken = String(process.env.HERMES_EDIT_TOKEN || "").trim();
  if (!serverToken) {
    const err = new Error("HERMES_EDIT_TOKEN is not configured on server.");
    err.statusCode = 403;
    throw err;
  }
  if (String(ctx.approvalToken || "").trim() !== serverToken) {
    const err = new Error("Missing or invalid Hermes edit token.");
    err.statusCode = 403;
    throw err;
  }
  consumeApproved(String(ctx.approvalId || "").trim());
  return ctx;
}

function redactRuntimeMap(runtimeMap = {}) {
  return {
    runtimeRoots: [],
    webOrigin: String(runtimeMap.webOrigin || ""),
    pm2Apps: Array.isArray(runtimeMap.pm2Apps) ? runtimeMap.pm2Apps.map((v) => String(v)) : [],
    ports: {},
    adminPages: Array.isArray(runtimeMap.adminPages) ? runtimeMap.adminPages.map((v) => String(v)) : [],
    nginxNotes: String(runtimeMap.nginxNotes || ""),
    apiNotes: String(runtimeMap.apiNotes || "")
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

app.get("/api/hermes/webui/capabilities", (_req, res) => {
  res.json({
    ok: true,
    features: [
      { key: "chat", status: "working", endpoint: "/api/hermes/chat" },
      { key: "streaming", status: "missing", endpoint: "" },
      { key: "sessions", status: "partial", endpoint: "/api/hermes/sessions/*" },
      { key: "workspace_browser", status: "working", endpoint: "/api/hermes/files/list" },
      { key: "file_preview", status: "working", endpoint: "/api/hermes/files/read" },
      { key: "file_editing", status: "partial", endpoint: "/api/hermes/patch/preview,/api/hermes/patch/apply,/api/hermes/patch/rollback" },
      { key: "tool_cards", status: "partial", endpoint: "/api/hermes/chat (toolResults)" },
      { key: "memory", status: "working", endpoint: "/api/hermes/memory" },
      { key: "skills", status: "working", endpoint: "/api/hermes/skills" },
      { key: "tasks_cron", status: "partial", endpoint: "/api/hermes/task/plan,/api/hermes/jobs/*" },
      { key: "profiles", status: "working", endpoint: "/api/hermes/profile" },
      { key: "model_selector", status: "working", endpoint: "/api/hermes/models" },
      { key: "attachments", status: "missing", endpoint: "" },
      { key: "voice_input", status: "missing", endpoint: "" },
      { key: "settings_control_center", status: "partial", endpoint: "/api/hermes/models,/api/hermes/policy,/api/hermes/swarm" },
      { key: "websearch", status: "working", endpoint: "/api/hermes/webcrawl/search" },
      { key: "job_dashboard", status: "working", endpoint: "/api/hermes/jobs" },
      { key: "create_pr_button", status: "working", endpoint: "/api/hermes/jobs/:id/create-pr" }
    ],
    honestyNote: "Vendored Hermes WebUI shell is not full product parity. Unsupported features are explicitly marked missing or partial."
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
  const normalizedTaskBrief = taskBrief.trim();

  if (!normalizedTaskBrief) {
    return res.status(400).json({ ok: false, error: "taskBrief is required" });
  }

  const context = readObjectBody(req, "context");
  return res.json({ plan: createSwarmPlan(normalizedTaskBrief, context) });
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
      executionPipeline: response.executionPipeline || null,
      swarmPlan: response.swarmPlan || null,
      proposedOperations: response.proposedOperations || [],
      mode: response.mode,
      role: response.role
    });
  } catch (error) {
    res.status(400).json(conversationErrorPayload(req, error));
  }
});

app.get("/api/hermes/skills", (_req, res) => {
  return res.json(getSkillLoaderStatus());
});

app.get("/api/hermes/runtime/map", (_req, res) => {
  return res.json({
    ok: true,
    runtimeMap: redactRuntimeMap(loadRuntimeMap()),
    repos: { repos: [] },
    toolPolicy: { ownerFlow: ["sandbox-first", "owner-controlled", "repo-aware", "test-gated", "pr-before-merge"] }
  });
});

app.get("/api/hermes/profile", (_req, res) => {
  return res.json({
    ok: true,
    profile: { name: "Hermes", role: "Owner-controlled Crypto Moonboys repo operator" },
    settings: { surface: "hermes-webui" },
    personality: { identity: "Hermes is the owner-controlled Crypto Moonboys repo operator." },
    toolPolicy: { ownerFlow: ["sandbox-first", "owner-controlled", "repo-aware", "test-gated", "pr-before-merge"] }
  });
});

app.post("/api/hermes/images/generate", async (req, res) => {
  try {
    assertPrivilegedGate(req);
    const prompt = readStringBody(req, "prompt");
    if (!prompt) return res.status(400).json({ ok: false, error: "prompt is required." });
    const image = await generateImage(prompt, { size: readStringBody(req, "size", "1024x1024") });
    return res.json({ ok: true, image });
  } catch (error) {
    return res.status(Number(error?.statusCode || 400)).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/github/repos", async (_req, res) => {
  try {
    const repos = await githubConnector.listRepos();
    return res.json({ ok: true, repos });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/github/clone-register", (req, res) => {
  return executePrivilegedActionRoute(req, res, toAction(ACTIONS.REPO_CLONE, {
    id: readStringBody(req, "id"),
    name: readStringBody(req, "name"),
    remoteUrl: readStringBody(req, "remoteUrl"),
    defaultBranch: readStringBody(req, "defaultBranch", "main")
  }));
});

app.post("/api/hermes/github/branch", (req, res) => {
  return executePrivilegedActionRoute(req, res, toAction(ACTIONS.GIT_BRANCH, { name: readStringBody(req, "name") }));
});

app.post("/api/hermes/github/commit", (req, res) => {
  return executePrivilegedActionRoute(req, res, toAction(ACTIONS.GIT_COMMIT, { message: readStringBody(req, "message", "Hermes commit") }));
});

app.post("/api/hermes/github/push", (req, res) => {
  return executePrivilegedActionRoute(req, res, toAction(ACTIONS.GIT_PUSH, {
    remote: readStringBody(req, "remote", "origin"),
    branch: readStringBody(req, "branch"),
    dryRun: readBooleanBody(req, "dryRun")
  }));
});

app.post("/api/hermes/github/pr", async (req, res) => {
  try {
    assertPrivilegedGate(req);
    const pr = await githubConnector.createPullRequest(
      readStringBody(req, "owner"),
      readStringBody(req, "repo"),
      readStringBody(req, "head"),
      readStringBody(req, "base", "main"),
      readStringBody(req, "title"),
      readStringBody(req, "body")
    );
    return res.json({ ok: true, pr });
  } catch (error) {
    return res.status(Number(error?.statusCode || 400)).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/github/pr/comment", async (req, res) => {
  try {
    assertPrivilegedGate(req);
    const comment = await githubConnector.commentOnPr(
      readStringBody(req, "owner"),
      readStringBody(req, "repo"),
      Number(req.body?.issueNumber || 0),
      readStringBody(req, "body")
    );
    return res.json({ ok: true, comment });
  } catch (error) {
    return res.status(Number(error?.statusCode || 400)).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/github/pr/request-review", async (req, res) => {
  try {
    assertPrivilegedGate(req);
    const review = await githubConnector.requestReview(
      readStringBody(req, "owner"),
      readStringBody(req, "repo"),
      Number(req.body?.pullNumber || 0),
      Array.isArray(req.body?.reviewers) ? req.body.reviewers.map(String) : []
    );
    return res.json({ ok: true, review });
  } catch (error) {
    return res.status(Number(error?.statusCode || 400)).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/github/pr/comments", async (req, res) => {
  try {
    const comments = await githubConnector.readReviewComments(
      readTextQuery(req, "owner"),
      readTextQuery(req, "repo"),
      Number(req.query?.pullNumber || 0)
    );
    return res.json({ ok: true, comments });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/tools", (_req, res) => {
  return res.json({ ok: true, tools: getToolRegistry() });
});

app.get("/api/hermes/sessions", (_req, res) => {
  try {
    return res.json({ ok: true, sessions: listSessions() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/sessions", (req, res) => {
  try {
    const title = readStringBody(req, "title", "Hermes session");
    return res.json({ ok: true, session: createSession({ title }) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/sessions/:id", (req, res) => {
  try {
    return res.json({ ok: true, session: getSessionById(req.params.id) });
  } catch (error) {
    return res.status(404).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/sessions/:id/messages", (req, res) => {
  try {
    return res.json({ ok: true, session: appendSessionMessages(req.params.id, readArrayBody(req, "messages")) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
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

// ── Hermes Job Manager routes ──────────────────────────────────────────────

app.post("/api/hermes/jobs/create", async (req, res) => {
  try {
    const ownerPrompt = String(req.body?.ownerPrompt || req.body?.prompt || "").trim();
    if (!ownerPrompt) return res.status(400).json({ ok: false, error: "ownerPrompt is required." });
    const repoContext = req.body?.repoContext || {};
    const job = jobManager.createJob({ ownerPrompt, repoId: String(req.body?.repoId || "") });
    let interpretation = null;
    try {
      interpretation = await interpretOwnerCommand(ownerPrompt, repoContext);
    } catch (_e) {
      interpretation = null;
    }
    if (interpretation) {
      jobManager.updateJob(job.jobId, { interpretation });
    }
    return res.json({ ok: true, job: jobManager.readJob(job.jobId), interpretation });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/jobs", (_req, res) => {
  try {
    return res.json({ ok: true, jobs: jobManager.listJobs() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/hermes/jobs/:id", (req, res) => {
  try {
    const job = jobManager.readJob(req.params.id);
    return res.json({ ok: true, job });
  } catch (error) {
    return res.status(404).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/jobs/:id/run", async (req, res) => {
  try {
    const job = jobManager.readJob(req.params.id);
    if (job.status === "planned") {
      sandboxRunner.createSandboxBranch(job.jobId);
    }
    const updated = swarmExecutor.initializeExecution(job.jobId);
    return res.json({ ok: true, job: updated });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/jobs/:id/test", (req, res) => {
  try {
    // Only predefined safe test aliases are accepted — no arbitrary raw commands from callers.
    const requestedAliases = Array.isArray(req.body?.testAliases)
      ? req.body.testAliases.map(String)
      : [];
    // Validate each alias against the allow-list before running anything.
    for (const alias of requestedAliases) {
      if (!SAFE_TEST_ALIASES[alias]) {
        return res.status(400).json({
          ok: false,
          error: `Test alias not allowed: "${alias}". Allowed: ${Object.keys(SAFE_TEST_ALIASES).join(", ")}`
        });
      }
    }
    const result = runTests(req.params.id, requestedAliases);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/jobs/:id/repair", (req, res) => {
  try {
    const result = applyRepair(req.params.id, req.body || {});
    return res.json({ ok: true, job: result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/hermes/jobs/:id/create-pr", async (req, res) => {
  try {
    const job = jobManager.readJob(req.params.id);
    jobManager.assertReadyForPr(job);
    let baseBranch = String(job.rollbackPlan?.rollbackBranch || "");
    if (!baseBranch) {
      try {
        const activeRepo = getActiveRepoOrThrow();
        baseBranch = String(activeRepo.defaultBranch || "main");
      } catch (_e) {
        baseBranch = "main";
      }
    }
    // Generate PR metadata from the job's own branch and sandboxPath/repoPath,
    // never from whatever branch the server process happens to be on globally.
    const gitCwd = String(job.sandboxPath || job.repoPath || "").trim();
    if (!gitCwd) {
      return res.status(400).json({ ok: false, error: "Job has no sandboxPath or repoPath set — cannot generate PR metadata." });
    }
    const prMeta = await git.createPrMetadata(baseBranch, { cwd: gitCwd, branch: job.branch });
    const prUrl = String(req.body?.prUrl || "");
    const updated = jobManager.updateJob(job.jobId, {
      prUrl,
      status: "ready_for_pr"
    });
    return res.json({ ok: true, job: updated, prMeta, prUrl, baseBranch });
  } catch (error) {
    return res.status(400).json({ ok: false, error: String(error?.message || error) });
  }
});

const PORT = Number(process.env.PORT || 3012);
if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Hermes API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app };
