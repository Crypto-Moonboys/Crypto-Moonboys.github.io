import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-readiness-"));
const dataRoot = path.join(root, "admin", "hermes-data");
fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(path.join(dataRoot, "skills"), { recursive: true });
fs.writeFileSync(path.join(root, "README.md"), "hermes readiness\n");
fs.writeFileSync(path.join(dataRoot, "repos.json"), JSON.stringify({ repos: [{ id: "crypto-moonboys-site" }] }));
process.env.HERMES_REPO_ROOT = root;
process.env.HERMES_DATA_ROOT = dataRoot;
process.env.HERMES_PRIMARY_REPO_ID = "crypto-moonboys-site";
process.env.HERMES_PRIMARY_REPO_NAME = "Crypto Moonboys Website";
process.env.HERMES_PRIMARY_REPO_REMOTE = "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io";

const { runConversation } = await import("../server/hermes/conversation-runtime.js");
const { createJob } = await import("../server/hermes/job-manager.js");
const { createSandboxBranch } = await import("../server/hermes/sandbox-runner.js");

const identity = await runConversation({ mode: "chat", role: "main_hermes", prompt: "DO YOU KNOW WHAT YOU ARE?", history: [] });
assert.match(String(identity.reply || ""), /I am Hermes/i);
assert.doesNotMatch(String(identity.reply || ""), /I am Qwen|created by Alibaba/i);

const tools = await runConversation({ mode: "chat", role: "main_hermes", prompt: "WHAT TOOLS DO YOU HAVE?", history: [] });
assert.match(String(tools.reply || ""), /github|image generation|webcrawl|patch|jobs/i);

const websites = await runConversation({ mode: "chat", role: "main_hermes", prompt: "CAN YOU EDIT/CREATE WEBSITES?", history: [] });
assert.match(String(websites.reply || ""), /Yes\./i);
assert.doesNotMatch(String(websites.reply || ""), /I cannot edit websites|I don't have the capability/i);

const websearch = await runConversation({ mode: "chat", role: "main_hermes", prompt: "CAN YOU WEBSEARCH?", history: [] });
assert.match(String(websearch.reply || ""), /Yes\./i);
assert.doesNotMatch(String(websearch.reply || ""), /I lack internet|I cannot websearch/i);

const readiness = await runConversation({
  mode: "chat",
  role: "main_hermes",
  prompt: "READ ALL YOUR FILES, UNDERSTAND THE POWER YOU HAVE TO SOLVE, FIX AND CREATE, AND HOW, AND WHY.",
  history: []
});
assert.doesNotMatch(String(readiness.reply || ""), /Safe Review Mode created a swarm plan|Action completed with 1 error\(s\)\./i);
assert.match(String(readiness.reply || ""), /I am Hermes|repo operator|toolchain|sandbox|skills|webcrawl|jobs/i);
assert.equal(Array.isArray(readiness.actions) ? readiness.actions.some((a) => a.type === "file/read") : false, false);
assert.equal(Boolean(readiness.swarmPlan), false);

const image = await runConversation({ mode: "chat", role: "main_hermes", prompt: "create an image of a neon moonboy", history: [] });
const imageSummary = String(image.reply || "") + "\n" + JSON.stringify(image.toolResults || []);
assert.ok(/images\/generate|Missing required server secret: OPENAI_API_KEY|Image generation completed/i.test(imageSummary));

const animated = await runConversation({ mode: "chat", role: "main_hermes", prompt: "create animated canvas code for sprite tile animation", history: [] });
assert.equal(animated.swarmPlan?.type, "hermes_swarm_plan");
assert.equal(animated.executionPipeline?.type, "hermes_execution_pipeline");

const bomber = await runConversation({ mode: "chat", role: "main_hermes", prompt: "build my 2-player Bomber Royale game", history: [] });
assert.equal(bomber.swarmPlan?.type, "hermes_swarm_plan");

const job = createJob({ ownerPrompt: "build my 2-player Bomber Royale game" });
const sandbox = createSandboxBranch(job.jobId);
assert.ok(["sandbox_created", "failed"].includes(String(sandbox.job.status || "")));
if (sandbox.job.status === "failed") {
  assert.match(String(sandbox.job.lastError || ""), /git unavailable; real sandbox worktree cannot be created/i);
}

console.log("Hermes readiness audit passed");
