const express = require("express");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const NPC_BRAIN = "http://127.0.0.1:3000";

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

app.get("/api/brain/status", async (req, res) => {
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

app.get("/api/brain/npcs", async (req, res) => {
  const r = await proxyJson("/npcs").catch(() => ({ status: 503, data: { npcs: [] } }));
  res.status(r.status).json(r.data);
});

app.get("/api/brain/npcs/:npcId", async (req, res) => {
  const r = await proxyJson(`/npcs/${encodeURIComponent(req.params.npcId)}`).catch(() => ({
    status: 503,
    data: { error: "npc-brain unavailable" }
  }));
  res.status(r.status).json(r.data);
});

app.put("/api/brain/npcs/:npcId", async (req, res) => {
  const r = await proxyJson(`/npcs/${encodeURIComponent(req.params.npcId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/chat", async (req, res) => {
  const r = await proxyJson("/npc/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { reply: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.get("/api/brain/model", async (req, res) => {
  const r = await proxyJson("/model").catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/model", async (req, res) => {
  const r = await proxyJson("/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  }).catch(() => ({ status: 503, data: { error: "npc-brain unavailable" } }));
  res.status(r.status).json(r.data);
});

app.post("/api/brain/control", async (req, res) => {
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

app.get("/api/brain/logs", (req, res) => {
  const file = "/root/.pm2/logs/npc-brain-out.log";
  const lines = Math.max(10, Math.min(Number(req.query.lines || 120), 500));

  if (!fs.existsSync(file)) return res.json({ logs: [] });

  const text = fs.readFileSync(file, "utf8");
  res.json({
    logs: text.split("\n").slice(-lines).filter(Boolean)
  });
});

app.listen(PORT, () => console.log(`BRAIN API running on port ${PORT}`));
