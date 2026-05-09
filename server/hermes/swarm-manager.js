"use strict";

const { getAgents } = require("./swarm-registry.js");

const VALID_STATUSES = Object.freeze([
  "planned",
  "running",
  "blocked",
  "needs_approval",
  "done",
  "failed"
]);

const EXECUTION_MODES = Object.freeze({
  SAFE_REVIEW: "safe_review",
  OWNER_OPERATOR: "owner_operator"
});

const ROUTING_RULES = Object.freeze([
  {
    role: "ui_agent",
    label: "UI/page/layout/CSS/admin shell",
    pattern: /\b(ui|ux|page|layout|css|html|frontend|front-end|admin shell|cockpit|panel|button|modal|style|responsive)\b/iu,
    riskLevel: "medium",
    filesLikelyAffected: ["admin/**", "js/**", "css/**", "*.html"],
    requiredTests: ["node --check js/hermes-chat.js", "node tests/hermes-og-fullscreen.test.js"],
    nextAction: "Review UI scope, then execute approved page/script edits through the Hermes toolchain when Owner Operator Mode is selected."
  },
  {
    role: "runtime_agent",
    label: "backend/API/runtime/PM2/Nginx/debug",
    pattern: /\b(backend|api|server|runtime|pm2|nginx|debug|endpoint|route|express|proxy|worker|vps)\b/iu,
    riskLevel: "high",
    filesLikelyAffected: ["api/**", "server/hermes/**", "server/**"],
    requiredTests: ["node --check api/hermes-api.js", "npm test"],
    nextAction: "Inspect runtime/API scope, then execute approved backend edits, tests, or debug commands through the Hermes toolchain in Owner Operator Mode."
  },
  {
    role: "test_agent",
    label: "tests/smoke/regression/audit",
    pattern: /\b(test|tests|smoke|regression|audit|validation|verify|coverage|assert|lint|check)\b/iu,
    riskLevel: "low",
    filesLikelyAffected: ["tests/**", "package.json"],
    requiredTests: ["npm test"],
    nextAction: "Run or update validation work when instructed by the owner; report failures, fixes, and regression coverage."
  },
  {
    role: "deploy_agent",
    label: "deploy/VPS/restart/PM2/Nginx reload",
    pattern: /\b(deploy|deployment|restart|reload|release|ship|pm2 reload|nginx reload|vps|production)\b/iu,
    riskLevel: "critical",
    filesLikelyAffected: ["deploy/**", "server/**", "ecosystem.config.*", "nginx/**"],
    requiredTests: ["npm test", "deployment smoke check"],
    nextAction: "Prepare deployment steps and run approved PM2/Nginx/VPS actions only when the owner explicitly instructs deployment."
  },
  {
    role: "npc_agent",
    label: "NPC/brain/lore/config data",
    pattern: /\b(npc|brain|lore|character|dialogue|dialog|persona|config data|story)\b/iu,
    riskLevel: "medium",
    filesLikelyAffected: ["**/*npc*", "**/*lore*", "data/**", "config/**"],
    requiredTests: ["NPC data/config validation", "npm test"],
    nextAction: "Handle NPC/lore/config changes for the assigned task; route approved repo edits through the Hermes toolchain."
  },
  {
    role: "watcher_agent",
    label: "logs/failure monitoring/healing proposals",
    pattern: /\b(log|logs|failure|monitor|watch|healing|health|alert|incident|rollback proposal)\b/iu,
    riskLevel: "medium",
    filesLikelyAffected: ["logs/**", "server/**", "docs/**"],
    requiredTests: ["read-only log review", "npm test if code changes are later approved"],
    nextAction: "Inspect logs/failures, propose healing, and execute approved rollback/report work when owner operator execution is enabled."
  },
  {
    role: "main_hermes",
    label: "broad/repo-wide planning",
    pattern: /\b(repo-wide|architecture|plan|planning|orchestrate|swarm|multi-step|broad|full repo|system)\b/iu,
    riskLevel: "medium",
    filesLikelyAffected: ["TBD after repo scan"],
    requiredTests: ["task-specific tests after subtasks are approved"],
    nextAction: "Orchestrate full-repo work and dispatch specialist execution through the existing Hermes toolchain when instructed by the owner."
  }
]);

function normalizeExecutionMode(context = {}) {
  const requested = String(context.swarmExecutionMode || context.executionMode || "").trim().toLowerCase();
  if (requested === EXECUTION_MODES.OWNER_OPERATOR || context.ownerOperatorMode === true) {
    return EXECUTION_MODES.OWNER_OPERATOR;
  }
  return EXECUTION_MODES.SAFE_REVIEW;
}

function modeLabel(executionMode) {
  return executionMode === EXECUTION_MODES.OWNER_OPERATOR ? "OWNER OPERATOR MODE" : "SAFE REVIEW MODE";
}

function ownerOperatorActionsForRole(role) {
  const common = ["inspect", "create patch previews", "report results"];
  const roleActions = {
    ui_agent: ["edit UI/page/layout files", "run frontend checks"],
    runtime_agent: ["edit backend/API/runtime files", "run approved debug commands"],
    test_agent: ["run tests", "update regression/smoke tests"],
    deploy_agent: ["prepare deployment steps", "run approved PM2/Nginx/VPS actions"],
    npc_agent: ["edit NPC/brain/lore/config data for assigned tasks"],
    watcher_agent: ["inspect logs", "create rollback/healing reports"],
    main_hermes: ["orchestrate full-repo changes", "use git", "create rollback patches"]
  };
  return [...common, ...(roleActions[role] || [])];
}

function getKnownRoleIds() {
  return new Set(getAgents().map((agent) => agent.id));
}

function normalizeBrief(taskBrief) {
  return String(taskBrief || "").replace(/\s+/gu, " ").trim();
}

function titleFromBrief(taskBrief) {
  const normalized = normalizeBrief(taskBrief);
  if (!normalized) return "Untitled Hermes swarm task";
  const firstSentence = normalized.split(/[.!?]/u).find(Boolean) || normalized;
  return firstSentence.length > 84 ? `${firstSentence.slice(0, 81).trim()}...` : firstSentence;
}

function matchingRules(text) {
  const knownRoles = getKnownRoleIds();
  const matches = ROUTING_RULES.filter((rule) => rule.pattern.test(text) && knownRoles.has(rule.role));
  if (matches.length === 0) {
    return ROUTING_RULES.filter((rule) => rule.role === "main_hermes" && knownRoles.has(rule.role));
  }
  const needsTests = !matches.some((rule) => rule.role === "test_agent");
  if (needsTests) {
    const testRule = ROUTING_RULES.find((rule) => rule.role === "test_agent" && knownRoles.has(rule.role));
    if (testRule) matches.push(testRule);
  }
  return matches;
}

function statusForRule(rule) {
  if (rule.role === "deploy_agent") return "needs_approval";
  return "planned";
}

function makeSubtask(rule, index, taskBrief, executionMode) {
  const status = statusForRule(rule);
  const ownerMode = executionMode === EXECUTION_MODES.OWNER_OPERATOR;
  return {
    id: `swarm_task_${String(index + 1).padStart(2, "0")}`,
    title: `${rule.label} subtask`,
    taskTitle: `${rule.label} subtask`,
    assignedAgent: rule.role,
    status,
    riskLevel: rule.riskLevel,
    filesLikelyAffected: rule.filesLikelyAffected,
    requiredTests: rule.requiredTests,
    nextAction: ownerMode
      ? rule.nextAction
      : "Safe Review Mode: produce plans, reviews, risk notes, and required tests without repo changes.",
    modeCapability: ownerMode
      ? "Owner Operator Mode: this specialist can perform assigned real repo work through the Hermes toolchain when instructed by the owner."
      : "Safe Review Mode: planning only; no repo changes.",
    allowedOwnerOperatorActions: ownerOperatorActionsForRole(rule.role),
    rationale: `Matched conservative routing for: ${titleFromBrief(taskBrief)}`
  };
}

function createSwarmPlan(taskBrief, context = {}) {
  const brief = normalizeBrief(taskBrief);
  const text = `${brief} ${JSON.stringify(context || {})}`.toLowerCase();
  const rules = matchingRules(text);
  const executionMode = normalizeExecutionMode(context);
  const subtasks = rules.map((rule, index) => makeSubtask(rule, index, brief, executionMode));
  const statuses = Object.fromEntries(VALID_STATUSES.map((status) => [status, 0]));
  for (const subtask of subtasks) {
    statuses[subtask.status] += 1;
  }

  return {
    ok: true,
    type: "hermes_swarm_plan",
    planEndpointOnly: true,
    executionMode,
    modeLabel: modeLabel(executionMode),
    safety: {
      usesExistingRoles: true,
      planEndpointDoesNotMutateRepo: true,
      planEndpointDoesNotRunCommands: true,
      keepsExistingHermesToolchain: true,
      destructiveActionsStillNeedExplicitOwnerInstruction: true
    },
    authorityModel: {
      safeReviewMode: "Safe Review Mode: planning only; no repo changes.",
      ownerOperatorMode: "Owner Operator Mode is for self-hosted repo control. When enabled by the owner, Hermes swarm agents can perform real repo work through the Hermes toolchain, including edits, tests, git operations, rollback patches, and deployment steps according to their assigned task.",
      specialistAgents: "Specialist agents are scoped by role, but they are real work agents in Owner Operator Mode rather than decorative roles.",
      controller: "main_hermes remains the orchestrator and full-repo controller.",
      approvedExecution: "Owner-approved repo work executes through the existing Hermes toolchain according to the assigned task."
    },
    ownerOperatorMode: {
      available: true,
      enabled: executionMode === EXECUTION_MODES.OWNER_OPERATOR,
      label: "OWNER OPERATOR MODE",
      flow: "plan → execute → test → rollback/report",
      capabilities: ["inspect", "edit", "patch", "run tests", "use git", "create rollback patches", "deployment steps"]
    },
    safeReviewMode: {
      enabled: executionMode === EXECUTION_MODES.SAFE_REVIEW,
      label: "Safe Review Mode",
      planningOnly: true,
      repoChanges: false
    },
    taskTitle: titleFromBrief(brief),
    taskBrief: brief,
    context: context && typeof context === "object" && !Array.isArray(context) ? context : {},
    validStatuses: VALID_STATUSES,
    statusSummary: statuses,
    subtasks,
    nextAction: executionMode === EXECUTION_MODES.OWNER_OPERATOR
      ? "Execute assigned work through main_hermes and specialist agents, then test and produce rollback/report notes."
      : "Review the task board in Safe Review Mode, or switch to Owner Operator Mode when the owner wants real execution."
  };
}

module.exports = {
  VALID_STATUSES,
  EXECUTION_MODES,
  ROUTING_RULES,
  createSwarmPlan
};
