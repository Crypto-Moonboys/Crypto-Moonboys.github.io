"use strict";

const crypto = require("node:crypto");

const pending = new Map();
const decided = new Map();

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
  pending.delete(id);
  record.status = approved ? "approved" : "rejected";
  record.decidedAt = new Date().toISOString();
  record.note = String(note || "");
  decided.set(id, record);
  return record;
}

function getApprovals() {
  return {
    pending: [...pending.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    decided: [...decided.values()].sort((a, b) => String(b.decidedAt || "").localeCompare(String(a.decidedAt || "")))
  };
}

function consumeApproved(id) {
  const record = decided.get(String(id || ""));
  if (!record || record.status !== "approved") {
    throw new Error("Approved token not found.");
  }
  decided.delete(record.id);
  return record;
}

module.exports = {
  createApproval,
  decideApproval,
  getApprovals,
  consumeApproved
};
