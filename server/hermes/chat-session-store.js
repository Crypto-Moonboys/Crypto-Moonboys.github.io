"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { HERMES_DATA_ROOT } = require("./config.js");

const SESSIONS_FILE = path.join(HERMES_DATA_ROOT, "chat-sessions.json");
// Keep enough recent context for active operator workflows while bounding disk growth:
// ~120 sessions comfortably covers frequent admin usage without accumulating unbounded files.
const MAX_SESSIONS = 120;
// Preserve conversation continuity without allowing unbounded per-session history:
// 300 messages keeps long troubleshooting threads while preventing oversized session blobs.
const MAX_MESSAGES_PER_SESSION = 300;

function nowIso() {
  return new Date().toISOString();
}

function makeSessionId() {
  // Use cryptographically random UUIDs — no Date.now()/Math.random() guessable components.
  return `session_${crypto.randomUUID()}`;
}

function ensureStore() {
  fs.mkdirSync(HERMES_DATA_ROOT, { recursive: true });
  if (!fs.existsSync(SESSIONS_FILE)) {
    const initial = {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sessions: []
    };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(initial, null, 2) + "\n", "utf8");
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
    return {
      createdAt: String(raw?.createdAt || nowIso()),
      updatedAt: String(raw?.updatedAt || nowIso()),
      sessions
    };
  } catch (_error) {
    return { createdAt: nowIso(), updatedAt: nowIso(), sessions: [] };
  }
}

function writeStore(next) {
  const payload = {
    createdAt: String(next?.createdAt || nowIso()),
    updatedAt: nowIso(),
    sessions: Array.isArray(next?.sessions) ? next.sessions.slice(0, MAX_SESSIONS) : []
  };
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

function listSessions() {
  const store = readStore();
  return store.sessions.map((session) => ({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0
  }));
}

function createSession(input = {}) {
  const store = readStore();
  const now = nowIso();
  const session = {
    id: makeSessionId(),
    title: String(input.title || "Hermes session").trim() || "Hermes session",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  store.sessions.unshift(session);
  writeStore(store);
  return session;
}

function getSessionById(id) {
  const sessionId = String(id || "").trim();
  if (!sessionId) throw new Error("sessionId is required.");
  const store = readStore();
  const found = store.sessions.find((session) => session.id === sessionId);
  if (!found) throw new Error("Session not found.");
  return found;
}

function appendSessionMessages(id, messages = []) {
  const sessionId = String(id || "").trim();
  if (!sessionId) throw new Error("sessionId is required.");
  const nextMessages = (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      role: String(message?.role || "").trim().toLowerCase(),
      content: String(message?.content || ""),
      at: String(message?.at || nowIso())
    }))
    .filter((message) => ["user", "assistant", "system", "tool"].includes(message.role) && message.content.trim());

  if (!nextMessages.length) {
    return getSessionById(sessionId);
  }

  const store = readStore();
  const index = store.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error("Session not found.");
  const current = store.sessions[index];
  const mergedMessages = [...(Array.isArray(current.messages) ? current.messages : []), ...nextMessages]
    .slice(-MAX_MESSAGES_PER_SESSION);
  const updated = {
    ...current,
    updatedAt: nowIso(),
    messages: mergedMessages
  };
  store.sessions.splice(index, 1);
  store.sessions.unshift(updated);
  writeStore(store);
  return updated;
}

module.exports = {
  listSessions,
  createSession,
  getSessionById,
  appendSessionMessages
};
