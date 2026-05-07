"use strict";

const ROLE_RULES = {
  main_hermes: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: true
  },
  ui_agent: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: false
  },
  runtime_agent: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: false
  },
  test_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false
  },
  deploy_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false
  },
  watcher_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false
  },
  npc_agent: {
    canEditRepo: true,
    canRunCommands: false,
    canManageNpc: true,
    pathPrefixes: ["admin/brain-data", "admin/the-brain", "api/brain-api.js"]
  }
};

function getRolePolicy(role) {
  return ROLE_RULES[String(role || "main_hermes")] || ROLE_RULES.main_hermes;
}

function assertRolePathAccess(role, relPath) {
  const policy = getRolePolicy(role);
  if (role !== "npc_agent") {
    return true;
  }
  const p = String(relPath || "");
  if (!policy.pathPrefixes.some((prefix) => p.startsWith(prefix))) {
    throw new Error("NPC Agent path restriction violation.");
  }
  return true;
}

module.exports = {
  ROLE_RULES,
  getRolePolicy,
  assertRolePathAccess
};
