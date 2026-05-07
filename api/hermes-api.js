"use strict";

const express = require("express");
const cors = require("cors");
const {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  callLocalOllama
} = require("../server/hermes/chat-proxy.js");

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
        description: "Read/answer only. No repo or file mutation."
      },
      agent_edit: {
        writesAllowed: "explicit_only",
        requires: ["explicit user instruction", "confirmEdit=true"],
        description: "Main Hermes can edit/manage systems only in explicit edit mode."
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

app.post("/api/hermes/chat", async (req, res) => {
  const result = await callLocalOllama(req.body || {});
  res.status(result.status).json(result.body);
});

const PORT = Number(process.env.PORT || 3012);
if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Hermes API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app };
