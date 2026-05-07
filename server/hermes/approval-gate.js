"use strict";

const crypto = require("node:crypto");

const pending = new Map();

function createApproval(action = {}) {
  const id = `approval_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const record = {
    id,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...action
  };
  pending.set(id, record);
  return record;
}

function decideApproval(id, approved, note = "") {
  const record = pending.get(id);
  if (!record) {
    throw new Error("Approval id not found.");
  }
  record.status = approved ? "approved" : "rejected";
  record.decidedAt = new Date().toISOString();
  record.note = String(note || "");
  return record;
}

function getApprovals() {
  return [...pending.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = {
  createApproval,
  decideApproval,
  getApprovals
};
