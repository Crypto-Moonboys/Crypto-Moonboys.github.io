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

const identity = await runConversation({ mode: "chat", role: "main_hermes", prompt: "who are you", history: [] });
assert.match(String(identity.reply || ""), /I am Hermes/i);
assert.doesNotMatch(String(identity.reply || ""), /I am Qwen|Alibaba Cloud/i);

const tools = await runConversation({ mode: "chat", role: "main_hermes", prompt: "what tools do you have", history: [] });
assert.match(String(tools.reply || ""), /github|image generation|webcrawl|patch|jobs/i);

const websites = await runConversation({ mode: "chat", role: "main_hermes", prompt: "can you edit/create websites", history: [] });
assert.match(String(websites.reply || ""), /Yes\./i);
assert.doesNotMatch(String(websites.reply || ""), /I cannot edit websites/i);

const websearch = await runConversation({ mode: "chat", role: "main_hermes", prompt: "can you websearch", history: [] });
assert.match(String(websearch.reply || ""), /Yes\./i);
assert.doesNotMatch(String(websearch.reply || ""), /I lack internet/i);

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
assert.equal(sandbox.job.status, "sandbox_created");

console.log("Hermes readiness audit passed");
