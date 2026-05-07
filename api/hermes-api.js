"use strict";

const express = require("express");
const cors = require("cors");
const {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  callLocalOllama
} = require("../server/hermes/chat-proxy.js");
const orchestrator = require("../server/hermes/orchestrator.js");
const { getAgents } = require("../server/hermes/swarm-registry.js");
const { assertRoleCapability } = require("../server/hermes/agent-runtime.js");
const { consumeApproved } = require("../server/hermes/approval-gate.js");

const app = express();
app.disable("x-powered-by");

const ALLOWED_ORIGINS = (process.env.HERMES_ALLOWED_ORIGINS ||
  "https://cryptomoonboys.com,https://www.cryptomoonboys.com,https://space.cryptomoonboys.com,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173")
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
  return { role, mode, confirmEdit, approvalId };
}

function requirePrivilegedRequest(req, roleCapability) {
  const serverToken = String(process.env.HERMES_EDIT_TOKEN || "").trim();
  if (!serverToken) {
    throw new Error("HERMES_EDIT_TOKEN is not configured on server.");
  }
  const providedToken = String(req.headers["x-hermes-edit-token"] || "").trim();
  if (providedToken !== serverToken) {
    throw new Error("Missing or invalid Hermes edit token.");
  }
  const ctx = readOpContext(req);
  if (!["agent_edit", "admin"].includes(ctx.mode)) {
    throw new Error("Privileged operation requires agent_edit/admin mode.");
  }
  if (!ctx.confirmEdit) {
    throw new Error("Privileged operation requires confirmEdit=true.");
  }
  assertRoleCapability(ctx.role, roleCapability);
  return ctx;
}

function requireApprovalToken(ctx) {
  if (!ctx.approvalId) {
    throw new Error("Approval token is required.");
  }
  consumeApproved(ctx.approvalId);
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
  res.json({ agents: getAgents() });
});

app.post("/api/hermes/chat", async (req, res) => {
  const result = await callLocalOllama(req.body || {});
  res.status(result.status).json(result.body);
});

app.post("/api/hermes/task/plan", (req, res) => {
  handle(res, async () => ({ plan: await orchestrator.executeTask(req.body || {}) }));
});

app.post("/api/hermes/index/rebuild", (_req, res) => {
  handle(res, async () => ({ index: orchestrator.tools.buildIndex() }));
});

app.get("/api/hermes/index/search", (req, res) => {
  handle(res, async () => ({ results: orchestrator.tools.searchIndex(req.query.q || "", { limit: req.query.limit }) }));
});

app.get("/api/hermes/files/list", (req, res) => {
  handle(res, async () => orchestrator.tools.listDirectory(req.query.path || ""));
});

app.get("/api/hermes/files/read", (req, res) => {
  handle(res, async () => orchestrator.tools.readFile(req.query.path || ""));
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
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canEditRepo");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: orchestrator.tools.applyPatch(req.body?.operations || [], {
      ...ctx
    })
  }));
});

app.post("/api/hermes/patch/rollback", (req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canEditRepo");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: orchestrator.tools.rollbackPatch(req.body?.rollbackId || "", ctx)
  }));
});

app.get("/api/hermes/git/status", (_req, res) => {
  handle(res, async () => ({ status: await orchestrator.tools.git.status() }));
});

app.post("/api/hermes/git/branch", (req, res) => {
  handle(res, async () => ({ result: await orchestrator.tools.git.createBranch(req.body?.name || "") }));
});

app.get("/api/hermes/git/diff", (req, res) => {
  handle(res, async () => ({ result: await orchestrator.tools.git.diff(req.query.target || "") }));
});

app.post("/api/hermes/git/commit", (req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canUseGit");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  try {
    requireApprovalToken(ctx);
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: await orchestrator.tools.git.commit(req.body?.message || "Hermes commit", { mode: ctx.mode })
  }));
});

app.post("/api/hermes/git/stash", (_req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(_req, "canUseGit");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  try {
    requireApprovalToken(ctx);
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({ result: await orchestrator.tools.git.stash({ mode: ctx.mode, approved: true }) }));
});

app.post("/api/hermes/git/restore", (req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canUseGit");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  try {
    requireApprovalToken(ctx);
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: await orchestrator.tools.git.restore(req.body?.paths || [], { mode: ctx.mode, approved: true })
  }));
});

app.post("/api/hermes/git/push", (req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canUseGit");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  try {
    requireApprovalToken(ctx);
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: await orchestrator.tools.git.pushWithPolicy(
      req.body?.remote || "origin",
      req.body?.branch || "",
      {
        mode: ctx.mode,
        approved: true,
        dryRun: req.body?.dryRun === true
      }
    )
  }));
});

app.get("/api/hermes/git/pr-metadata", (req, res) => {
  handle(res, async () => ({ result: await orchestrator.tools.git.createPrMetadata(req.query.base || "main") }));
});

app.post("/api/hermes/command/run", (req, res) => {
  let ctx;
  try {
    ctx = requirePrivilegedRequest(req, "canRunCommands");
  } catch (error) {
    return res.status(403).json({ ok: false, error: String(error.message || error) });
  }
  handle(res, async () => ({
    result: await orchestrator.tools.enqueueCommand(req.body?.command, req.body?.args || [], {
      timeoutMs: req.body?.timeoutMs,
      ...ctx
    })
  }));
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
  handle(res, async () => ({ memory: orchestrator.tools.readMemory() }));
});

app.post("/api/hermes/memory/merge", (req, res) => {
  handle(res, async () => ({ memory: orchestrator.tools.mergeMemory(req.body?.patch || {}) }));
});

const PORT = Number(process.env.PORT || 3012);
if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Hermes API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app };
