"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROLLBACK_DIR } = require("./config.js");
const { assertAllowedPath, ensureParentDir } = require("./path-utils.js");

function nextRollbackId() {
  return `rb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function snapshotFile(relPath) {
  const { absPath } = assertAllowedPath(relPath);
  if (!fs.existsSync(absPath)) {
    return { exists: false, content: "" };
  }
  return { exists: true, content: fs.readFileSync(absPath, "utf8") };
}

function writeRollback(rollbackId, payload) {
  fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
  const file = path.join(ROLLBACK_DIR, `${rollbackId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function computePreview(op) {
  const target = snapshotFile(op.path);
  const before = target.content;
  const after = op.type === "delete" ? "" : String(op.content || "");
  return {
    path: op.path,
    type: op.type,
    beforeBytes: Buffer.byteLength(before, "utf8"),
    afterBytes: Buffer.byteLength(after, "utf8"),
    beforePreview: before.slice(0, 600),
    afterPreview: after.slice(0, 600)
  };
}

function previewPatch(operations = []) {
  const normalized = Array.isArray(operations) ? operations : [];
  return normalized.map((op) => computePreview(op));
}

function applyPatch(operations = [], options = {}) {
  const mode = String(options.mode || "chat");
  if (mode !== "agent_edit") {
    throw new Error("Patch apply requires agent_edit mode.");
  }
  const normalized = Array.isArray(operations) ? operations : [];
  if (!normalized.length) {
    throw new Error("No patch operations provided.");
  }

  const rollbackId = nextRollbackId();
  const snapshots = [];

  for (const op of normalized) {
    if (!["create", "update", "delete"].includes(op.type)) {
      throw new Error(`Unsupported operation type: ${op.type}`);
    }

    const { absPath, relPath } = assertAllowedPath(op.path);
    const snap = snapshotFile(relPath);
    snapshots.push({ path: relPath, ...snap });

    if (op.type === "delete") {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
      continue;
    }

    ensureParentDir(absPath);
    fs.writeFileSync(absPath, String(op.content || ""), "utf8");
  }

  writeRollback(rollbackId, {
    rollbackId,
    createdAt: new Date().toISOString(),
    snapshots
  });

  return {
    rollbackId,
    changed: normalized.map((op) => ({ type: op.type, path: op.path }))
  };
}

function rollbackPatch(rollbackId, options = {}) {
  const mode = String(options.mode || "chat");
  if (mode !== "agent_edit") {
    throw new Error("Rollback requires agent_edit mode.");
  }
  const file = path.join(ROLLBACK_DIR, `${rollbackId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error("Rollback id not found.");
  }
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const restored = [];
  for (const snapshot of payload.snapshots || []) {
    const { absPath } = assertAllowedPath(snapshot.path);
    if (!snapshot.exists) {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
      restored.push({ path: snapshot.path, action: "deleted" });
      continue;
    }
    ensureParentDir(absPath);
    fs.writeFileSync(absPath, snapshot.content || "", "utf8");
    restored.push({ path: snapshot.path, action: "restored" });
  }
  return { rollbackId, restored };
}

module.exports = {
  previewPatch,
  applyPatch,
  rollbackPatch
};
