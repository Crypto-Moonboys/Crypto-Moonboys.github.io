const express = require("express");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const NPC_BRAIN = "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.BRAIN_ADMIN_TOKEN || "CHANGE_ME_BRAIN_ADMIN_TOKEN";

function requireAdmin(req, res, next) {
  const token = req.headers["x-brain-admin-token"] || req.query.token;
  if (!ADMIN_TOKEN || ADMIN_TOKEN === "CHANGE_ME_BRAIN_ADMIN_TOKEN") {
    return res.status(500).json({ error: "BRAIN_ADMIN_TOKEN is not configured" });
  }
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function pm2(action, name) {
  return new Promise((resolve) => {
    execFile("pm2", [action, name], { timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || "",
        stderr: stderr || "",
        error: error ? error.message : null
      });
    });
  });
}

async function proxyJson(path, options = {}) {
  const r = await fetch(`${NPC_BRAIN}${path}`, options);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

app.get("/api/brain/status", requireAdmin, async (req, res) => {
  const npcHealth = await proxyJson("/health").catch(() => ({
    status: 503,
    data: { online: false }
  }));

  res.json({
    online: npcHealth.status === 200,
    service: "brain-api",
    npcBrain: npcHealth.data,
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: os.uptime(),
      load: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      }
    }
  });
});

app.get("/api/brain/npcs", requireAdmin, async (req, res) => {
  const r = await proxyJson("/npcs").catch(() => ({ status: 503, data: { npcs: [] } }));
  res.status(r.status).json(r.data);
});

app.get("/api/brain/npcs/:npcId", requireAdmin, async (req, res) => {
  const r = await proxyJson(`/npcs/${encodeURIComponent(req.params.npcId)}`).catch(() => ({
    status: 503,
    data: { error: "npc-brain unavailable" }
  }));
  res.status(r.status).json(r.data);
});

app.put("/api/brain/npcs/:npcId", requireAdmin, async (req, res) => {
  const r = await proxyJson(`/npcs/${encodeURIComponent(req.params.npcId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/chat", requireAdmin, async (req, res) => {
  const r = await proxyJson("/npc/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { reply: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.get("/api/brain/model", requireAdmin, async (req, res) => {
  const r = await proxyJson("/model").catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/model", requireAdmin, async (req, res) => {
  const r = await proxyJson("/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/control", requireAdmin, async (req, res) => {
  const action = String(req.body?.action || "").trim();

  if (!["restart", "stop", "start"].includes(action)) {
    return res.status(400).json({ success: false, error: "Invalid action" });
  }

  const result = await pm2(action, "npc-brain");
  res.json({
    success: result.ok,
    action,
    target: "npc-brain",
    result
  });
});

app.get("/api/brain/logs", requireAdmin, (req, res) => {
  const file = "/root/.pm2/logs/npc-brain-out.log";
  const lines = Math.max(10, Math.min(Number(req.query.lines || 120), 500));

  if (!fs.existsSync(file)) return res.json({ logs: [] });

  const text = fs.readFileSync(file, "utf8");
  res.json({
    logs: text.split("\n").slice(-lines).filter(Boolean)
  });
});


const REPO_ROOT = "/root/Crypto-Moonboys.github.io";

function runRepoGit(args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: REPO_ROOT, timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || "",
        stderr: stderr || "",
        error: error ? error.message : null
      });
    });
  });
}

app.get("/api/brain/repo/status", requireAdmin, async (req, res) => {
  const status = await runRepoGit(["status", "--short"]);
  const branch = await runRepoGit(["branch", "--show-current"]);
  const lastCommit = await runRepoGit(["log", "-1", "--oneline"]);
  const diffStat = await runRepoGit(["diff", "--stat"]);

  res.json({
    repo: REPO_ROOT,
    branch: branch.stdout.trim(),
    lastCommit: lastCommit.stdout.trim(),
    status: status.stdout.split("\n").filter(Boolean),
    diffStat: diffStat.stdout.split("\n").filter(Boolean)
  });
});


const BRAIN_BACKUP_DIR = `${REPO_ROOT}/admin/brain-data`;

function copyDirSafe(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSafe(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

app.post("/api/brain/backup", requireAdmin, async (req, res) => {
  const npcSource = "/root/npc-brain/npcs";
  const knowledgeSource = "/root/npc-brain/knowledge";

  fs.rmSync(BRAIN_BACKUP_DIR, { recursive: true, force: true });
  fs.mkdirSync(BRAIN_BACKUP_DIR, { recursive: true });

  copyDirSafe(npcSource, `${BRAIN_BACKUP_DIR}/npcs`);
  copyDirSafe(knowledgeSource, `${BRAIN_BACKUP_DIR}/knowledge`);

  const status = await runRepoGit(["status", "--short", "admin/brain-data"]);

  res.json({
    success: true,
    backupDir: BRAIN_BACKUP_DIR,
    changedFiles: status.stdout.split("\n").filter(Boolean)
  });
});


app.post("/api/brain/restore", requireAdmin, async (req, res) => {
  const npcTarget = "/root/npc-brain/npcs";
  const knowledgeTarget = "/root/npc-brain/knowledge";

  const npcBackup = `${BRAIN_BACKUP_DIR}/npcs`;
  const knowledgeBackup = `${BRAIN_BACKUP_DIR}/knowledge`;

  if (!fs.existsSync(npcBackup) || !fs.existsSync(knowledgeBackup)) {
    return res.status(404).json({
      success: false,
      error: "Brain backup data not found in admin/brain-data"
    });
  }

  fs.rmSync(npcTarget, { recursive: true, force: true });
  fs.rmSync(knowledgeTarget, { recursive: true, force: true });

  fs.mkdirSync(npcTarget, { recursive: true });
  fs.mkdirSync(knowledgeTarget, { recursive: true });

  copyDirSafe(npcBackup, npcTarget);
  copyDirSafe(knowledgeBackup, knowledgeTarget);

  const restart = await pm2("restart", "npc-brain");

  res.json({
    success: true,
    restored: {
      npcs: npcTarget,
      knowledge: knowledgeTarget
    },
    restart
  });
});


app.post("/api/brain/commit-backup", requireAdmin, async (req, res) => {
  const message = String(req.body?.message || "Update THE BRAIN data backup").trim().slice(0, 120);

  const status = await runRepoGit(["status", "--short", "admin/brain-data"]);
  const changed = status.stdout.split("\n").filter(Boolean);

  if (!changed.length) {
    return res.json({
      success: true,
      committed: false,
      message: "No Brain backup changes to commit.",
      changedFiles: []
    });
  }

  const add = await runRepoGit(["add", "admin/brain-data"]);
  if (!add.ok) {
    return res.status(500).json({ success: false, error: "git add failed", details: add });
  }

  const commit = await runRepoGit(["commit", "-m", message]);
  if (!commit.ok) {
    return res.status(500).json({ success: false, error: "git commit failed", details: commit });
  }

  const push = await runRepoGit(["push"]);
  if (!push.ok) {
    return res.status(500).json({ success: false, error: "git push failed", details: push });
  }

  res.json({
    success: true,
    committed: true,
    message,
    changedFiles: changed,
    commit: commit.stdout,
    push: push.stdout || push.stderr
  });
});


app.get("/api/brain/health-summary", requireAdmin, async (req, res) => {
  const checks = [];

  const npcHealth = await proxyJson("/health").catch(() => ({
    status: 503,
    data: { online: false }
  }));

  checks.push({
    name: "NPC Brain",
    ok: npcHealth.status === 200 && npcHealth.data?.online === true,
    detail: npcHealth.status === 200 ? "NPC brain is online." : "NPC brain is not responding."
  });

  checks.push({
    name: "NPC Count",
    ok: Number(npcHealth.data?.npcCount || 0) > 0,
    detail: `${npcHealth.data?.npcCount || 0} NPCs loaded.`
  });

  checks.push({
    name: "Model",
    ok: Boolean(npcHealth.data?.model),
    detail: npcHealth.data?.model ? `Using ${npcHealth.data.model}.` : "No model reported."
  });

  const repoStatus = await runRepoGit(["status", "--short"]);
  const repoLines = repoStatus.stdout.split("\n").filter(Boolean);
  checks.push({
    name: "Repo Status",
    ok: repoStatus.ok && repoLines.length === 0,
    detail: repoLines.length === 0 ? "Repo is clean." : `${repoLines.length} repo changes detected.`
  });

  const backupExists =
    fs.existsSync(`${BRAIN_BACKUP_DIR}/npcs`) &&
    fs.existsSync(`${BRAIN_BACKUP_DIR}/knowledge`);

  checks.push({
    name: "Brain Backup",
    ok: backupExists,
    detail: backupExists ? "Brain backup exists in the repo." : "Brain backup is missing."
  });

  const backupStatus = await runRepoGit(["status", "--short", "admin/brain-data"]);
  const backupChanges = backupStatus.stdout.split("\n").filter(Boolean);
  checks.push({
    name: "Backup Commit State",
    ok: backupChanges.length === 0,
    detail: backupChanges.length === 0 ? "No uncommitted Brain backup changes." : `${backupChanges.length} Brain backup changes need commit.`
  });

  checks.push({
    name: "Admin Protection",
    ok: ADMIN_TOKEN && ADMIN_TOKEN !== "CHANGE_ME_BRAIN_ADMIN_TOKEN",
    detail: ADMIN_TOKEN && ADMIN_TOKEN !== "CHANGE_ME_BRAIN_ADMIN_TOKEN"
      ? "Admin API token is configured."
      : "Admin API token is not configured."
  });

  const failed = checks.filter(c => !c.ok);
  const status = failed.length === 0 ? "HEALTHY" : failed.length <= 2 ? "WARNING" : "BROKEN";

  res.json({
    status,
    ok: failed.length === 0,
    checks
  });
});


app.post("/api/brain/advisor", requireAdmin, async (req, res) => {
  const task = String(req.body?.task || "").trim().slice(0, 2000);
  const scope = String(req.body?.scope || "Repo Health").trim();

  if (!task) {
    return res.status(400).json({
      success: false,
      error: "Missing advisor task"
    });
  }

  const repoStatus = await runRepoGit(["status", "--short"]);
  const branch = await runRepoGit(["branch", "--show-current"]);
  const lastCommit = await runRepoGit(["log", "-1", "--oneline"]);

  const statusLines = repoStatus.stdout.split("\n").filter(Boolean);
  const isClean = statusLines.length === 0;

  let likelyFiles = [];

  const lower = `${scope} ${task}`.toLowerCase();

  if (lower.includes("block topia") || lower.includes("multiplayer") || lower.includes("npc") || lower.includes("upgrade")) {
    likelyFiles.push(
      "games/block-topia/index.html",
      "games/block-topia/main.js",
      "games/block-topia/network.js",
      "server/block-topia/src/rooms/MinimalCityRoom.js"
    );
  }

  if (lower.includes("arcade") || lower.includes("xp") || lower.includes("leaderboard")) {
    likelyFiles.push(
      "games/index.html",
      "js/leaderboard-client.js",
      "js/arcade-meta-system.js",
      "js/arcade-meta-ui.js",
      "workers/moonboys-api/worker.js"
    );
  }

  if (lower.includes("website") || lower.includes("shell") || lower.includes("homepage") || lower.includes("layout")) {
    likelyFiles.push(
      "index.html",
      "css/retro-16bit-theme.css",
      "games/index.html",
      "community.html",
      "how-to-play.html"
    );
  }

  if (lower.includes("brain") || lower.includes("admin")) {
    likelyFiles.push(
      "admin/the-brain.html",
      "api/brain-api.js",
      "admin/brain-data/"
    );
  }

  likelyFiles = [...new Set(likelyFiles)];

  const risk =
    scope === "NPC Brain" ? "LOW for NPC edits only. HIGH if changing site/game files." :
    scope === "Repo Health" ? "LOW" :
    "MEDIUM — advisor is read-only; actual edits must be done by Codex/Copilot after review.";

  const codexMessage = [
    "READ FIRST: Do not drift from current repo truth. Do not make unrelated UI/shell changes.",
    "",
    `Task scope: ${scope}`,
    `User request: ${task}`,
    "",
    "Rules:",
    "- Do not directly change unrelated files.",
    "- Do not rewrite the site shell unless explicitly requested.",
    "- Do not touch NPC Brain live data unless the task is specifically NPC Brain.",
    "- Keep THE BRAIN as read-only advisor for website/game/repo work.",
    "- Only NPC Brain personality/rules/wiki context may be live-edited from THE BRAIN.",
    "",
    "Likely files to inspect:",
    ...(likelyFiles.length ? likelyFiles.map(f => `- ${f}`) : ["- Determine from repo search before editing."]),
    "",
    "Required output:",
    "- What you inspected",
    "- Root cause or likely cause",
    "- Exact files changed",
    "- Tests/checks run",
    "- Any risks or follow-up work",
    "",
    "Before final response, run relevant syntax/tests/smoke checks where possible."
  ].join("\n");

  res.json({
    success: true,
    mode: "READ_ONLY_ADVISOR",
    liveWriteAllowedOnlyFor: "NPC Brain personality/rules/wiki context",
    scope,
    task,
    repo: {
      branch: branch.stdout.trim(),
      lastCommit: lastCommit.stdout.trim(),
      clean: isClean,
      status: statusLines
    },
    risk,
    likelyFiles,
    findings: [
      "Advisor Mode does not edit files.",
      isClean ? "Repo is currently clean." : `${statusLines.length} repo change(s) are present.`,
      "Use Codex/Copilot for actual website, game, worker, or layout edits.",
      "Use THE BRAIN live controls only for NPC Brain data and process controls."
    ],
    suggestedFixPlan: [
      "Confirm scope.",
      "Inspect likely files.",
      "Identify root cause.",
      "Make the smallest safe change in Codex/Copilot.",
      "Run checks.",
      "Open or review PR before merge."
    ],
    codexMessage
  });
});


function slugifyNpcId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

app.post("/api/brain/create-npc", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const brand = String(req.body?.brand || "Crypto Moonboys").trim().slice(0, 80);
  const tone = String(req.body?.tone || "lore-aware, tactical, useful").trim().slice(0, 160);
  const role = String(req.body?.role || "NPC operator inside Block Topia").trim().slice(0, 160);
  const id = slugifyNpcId(req.body?.id || name);

  if (!id || !name) {
    return res.status(400).json({
      success: false,
      error: "NPC name is required"
    });
  }

  const npcFile = `/root/npc-brain/npcs/${id}.json`;
  const wikiFile = `/root/npc-brain/knowledge/wiki/npcs/${id}.md`;

  if (fs.existsSync(npcFile)) {
    return res.status(409).json({
      success: false,
      error: "NPC already exists",
      id
    });
  }

  fs.mkdirSync("/root/npc-brain/npcs", { recursive: true });
  fs.mkdirSync("/root/npc-brain/knowledge/wiki/npcs", { recursive: true });

  const npc = {
    id,
    name,
    brand,
    tone,
    role,
    wikiPage: `npcs/${id}.md`,
    rules: [
      "Stay in character",
      "Use the Crypto Moonboys / GK / Block Topia truth files",
      "Give useful tactical or lore-aware answers",
      "Do not invent fake links, commands, rewards, or lore",
      "Keep replies clear and short"
    ]
  };

  const wiki = `${name} is part of the Crypto Moonboys / GK / Block Topia universe.

Brand / faction:
${brand}

Role:
${role}

Tone:
${tone}

Core behaviour:
- Stay in character.
- Use the living Web3 wiki truth.
- Respect the route: Read -> Play -> Earn XP -> Link -> Battle Chamber -> Block Topia -> Build.
- Give tactical, lore-aware, short answers.
- Never invent fake commands, links, rewards, or live features.

Add deeper lore here as the character develops.
`;

  fs.writeFileSync(npcFile, JSON.stringify(npc, null, 2) + "\n");
  fs.writeFileSync(wikiFile, wiki);

  const restart = await pm2("restart", "npc-brain");

  res.json({
    success: true,
    npc,
    wikiFile,
    restart
  });
});

app.listen(PORT, () => console.log(`BRAIN API running on port ${PORT}`));
