"use strict";

const ROLE_RULES = {
  main_hermes: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: true,
    canUseGit: true
  },
  ui_agent: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: false,
    canUseGit: true
  },
  runtime_agent: {
    canEditRepo: true,
    canRunCommands: true,
    canManageNpc: false,
    canUseGit: true
  },
  test_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false,
    canUseGit: false
  },
  deploy_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false,
    canUseGit: true
  },
  watcher_agent: {
    canEditRepo: false,
    canRunCommands: true,
    canManageNpc: false,
    canUseGit: false
  },
  npc_agent: {
    canEditRepo: false,
    canRunCommands: false,
    canManageNpc: true,
    canUseGit: false,
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

function assertRoleCapability(role, capability) {
  const policy = getRolePolicy(role);
  if (!policy || !policy[capability]) {
    throw new Error(`Role "${role}" lacks capability "${capability}".`);
  }
  return true;
}

module.exports = {
  ROLE_RULES,
  getRolePolicy,
  assertRolePathAccess,
  assertRoleCapability
};
