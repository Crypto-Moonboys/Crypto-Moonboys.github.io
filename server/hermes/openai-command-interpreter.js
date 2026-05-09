"use strict";

const https = require("node:https");

const INTENT_VALUES = Object.freeze([
  "rebuild_website",
  "build_bomber_royale",
  "admin_ui_task",
  "repo_fix",
  "unknown"
]);

const RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);

function getApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  return key;
}

function buildSystemPrompt(repoContext) {
  const ctx = repoContext && typeof repoContext === "object" ? repoContext : {};
  const repoList = Array.isArray(ctx.repos) ? ctx.repos.join(", ") : "crypto-moonboys-site";
  return [
    "You are Hermes, an expert repository operator AI for the Crypto Moonboys project.",
    `Known repos: ${repoList}.`,
    "Analyse the owner command and respond ONLY with a valid JSON object matching this schema:",
    JSON.stringify({
      intent: "rebuild_website|build_bomber_royale|admin_ui_task|repo_fix|unknown",
      reposLikelyInvolved: ["array of repo ids"],
      filesLikelyInvolved: ["array of file paths"],
      taskBreakdown: ["array of task step strings"],
      requiredQuestions: ["array of clarifying questions if any"],
      riskLevel: "low|medium|high|critical"
    }),
    "Return ONLY the JSON object. No markdown, no extra text."
  ].join("\n");
}

function parseOpenAiResponse(raw) {
  const text = String(raw || "").trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON object in OpenAI response.");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const intent = INTENT_VALUES.includes(parsed.intent) ? parsed.intent : "unknown";
  const riskLevel = RISK_LEVELS.includes(parsed.riskLevel) ? parsed.riskLevel : "medium";
  return {
    intent,
    reposLikelyInvolved: Array.isArray(parsed.reposLikelyInvolved) ? parsed.reposLikelyInvolved.map(String) : [],
    filesLikelyInvolved: Array.isArray(parsed.filesLikelyInvolved) ? parsed.filesLikelyInvolved.map(String) : [],
    taskBreakdown: Array.isArray(parsed.taskBreakdown) ? parsed.taskBreakdown.map(String) : [],
    requiredQuestions: Array.isArray(parsed.requiredQuestions) ? parsed.requiredQuestions.map(String) : [],
    riskLevel
  };
}

function callOpenAi(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(
      JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.2
      })
    );
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          Authorization: `Bearer ${getApiKey()}`
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (data.error) {
              reject(new Error(`OpenAI error: ${data.error.message || JSON.stringify(data.error)}`));
              return;
            }
            const content = data?.choices?.[0]?.message?.content || "";
            resolve(content);
          } catch (err) {
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function heuristicInterpret(prompt) {
  const lower = String(prompt || "").toLowerCase();
  let intent = "unknown";
  if (/\b(rebuild|rewrite|redesign|overhaul)\b.*(website|site|ui|frontend|pages)/u.test(lower) ||
      /\b(website|site|ui|frontend|pages)\b.*(rebuild|rewrite|redesign|overhaul)/u.test(lower)) {
    intent = "rebuild_website";
  } else if (/\b(bomber.?royale|bomb|arena|blast|powerup|destructible|round|colyseus)\b/u.test(lower)) {
    intent = "build_bomber_royale";
  } else if (/\b(admin|cockpit|panel|dashboard|shell)\b.*(ui|page|layout|button)/u.test(lower)) {
    intent = "admin_ui_task";
  } else if (/\b(fix|repair|patch|bug|error|broken|fail)\b/u.test(lower)) {
    intent = "repo_fix";
  }

  const reposLikelyInvolved = ["crypto-moonboys-site"];
  const filesLikelyInvolved = [];
  const taskBreakdown = ["Inspect relevant files", "Plan changes", "Execute in sandbox", "Run tests", "Report"];
  const riskLevel = intent === "rebuild_website" ? "high" : intent === "build_bomber_royale" ? "high" : "medium";

  if (intent === "build_bomber_royale") {
    filesLikelyInvolved.push(
      "games/block-topia/",
      "server/block-topia/",
      "workers/moonboys-api/blocktopia/"
    );
    taskBreakdown.push(
      "Design arena grid",
      "Implement bomb placement",
      "Implement blast propagation",
      "Add destructible tiles",
      "Add powerups",
      "Separate player/NPC",
      "Implement round start/end",
      "Add Colyseus messages",
      "Client rendering",
      "Add tests"
    );
  } else if (intent === "rebuild_website") {
    filesLikelyInvolved.push("index.html", "css/", "js/", "admin/");
    taskBreakdown.push(
      "Inspect shell files",
      "Inspect routing/pages/assets",
      "Create replacement plan",
      "Edit in sandbox",
      "Run static/tests",
      "Report changes"
    );
  }

  return {
    intent,
    reposLikelyInvolved,
    filesLikelyInvolved,
    taskBreakdown,
    requiredQuestions: [],
    riskLevel
  };
}

async function interpretOwnerCommand(prompt, repoContext = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required.");
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ...heuristicInterpret(prompt), source: "heuristic" };
  }
  try {
    const systemPrompt = buildSystemPrompt(repoContext);
    const raw = await callOpenAi(prompt.trim(), systemPrompt);
    const result = parseOpenAiResponse(raw);
    return { ...result, source: "openai" };
  } catch (err) {
    return { ...heuristicInterpret(prompt), source: "heuristic", openaiError: String(err.message) };
  }
}

module.exports = {
  INTENT_VALUES,
  RISK_LEVELS,
  interpretOwnerCommand,
  heuristicInterpret
};
