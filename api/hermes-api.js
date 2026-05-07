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
app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/api/hermes/models", (_req, res) => {
  res.json({
    defaultModel: DEFAULT_MODEL,
    models: ALLOWED_MODELS
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
