"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { searchIndex } = require("../server/hermes/repo-indexer.js");
const { listDirectory } = require("../server/hermes/file-service.js");
const { previewPatch } = require("../server/hermes/patch-engine.js");
const { getRolePolicy, assertRolePathAccess } = require("../server/hermes/agent-runtime.js");
const { createApproval, decideApproval } = require("../server/hermes/approval-gate.js");
const { mergeMemory, readMemory } = require("../server/hermes/memory-store.js");
const { ALLOWED_COMMANDS } = require("../server/hermes/command-runner.js");

test("repo index search returns file hits", () => {
  const results = searchIndex("hermes", { limit: 10 });
  assert.ok(Array.isArray(results));
});

test("file service can list repository root", () => {
  const result = listDirectory(".");
  assert.equal(result.path, ".");
  assert.ok(Array.isArray(result.entries));
});

test("patch preview returns before/after metadata", () => {
  const preview = previewPatch([{ type: "update", path: "README.md", content: "x" }]);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].path, "README.md");
});

test("npc agent has path restrictions", () => {
  assert.throws(() => assertRolePathAccess("npc_agent", "index.html"));
  assert.doesNotThrow(() => assertRolePathAccess("npc_agent", "admin/brain-data/sample.json"));
  const policy = getRolePolicy("npc_agent");
  assert.equal(policy.canRunCommands, false);
});

test("approval gate lifecycle works", () => {
  const approval = createApproval({ title: "Test" });
  const decided = decideApproval(approval.id, true, "ok");
  assert.equal(decided.status, "approved");
});

test("memory store persists merge patches", () => {
  const updated = mergeMemory({ domains: ["cryptomoonboys.com"] });
  assert.ok(Array.isArray(updated.domains));
  const latest = readMemory();
  assert.ok(latest.domains.includes("cryptomoonboys.com"));
});

test("command runner allow list is defined", () => {
  assert.ok(ALLOWED_COMMANDS.length > 0);
});

test("new runtime files exist", () => {
  const files = [
    "server/hermes/orchestrator.js",
    "server/hermes/task-planner.js",
    "server/hermes/agent-runtime.js",
    "server/hermes/repo-indexer.js",
    "server/hermes/patch-engine.js",
    "server/hermes/git-operator.js",
    "server/hermes/command-runner.js",
    "server/hermes/approval-gate.js",
    "server/hermes/memory-store.js"
  ];
  files.forEach((file) => assert.ok(fs.existsSync(file), `${file} missing`));
});
