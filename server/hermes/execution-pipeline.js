"use strict";

const VALID_STAGES = Object.freeze([
  "plan",
  "inspect",
  "patch_preview",
  "approve",
  "apply",
  "test",
  "deploy",
  "verify",
  "rollback",
  "report"
]);

const EXECUTION_MODES = Object.freeze({
  SAFE_REVIEW: "safe_review",
  OWNER_OPERATOR: "owner_operator"
});

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeMode(value) {
  return String(value || "").toLowerCase() === EXECUTION_MODES.OWNER_OPERATOR
    ? EXECUTION_MODES.OWNER_OPERATOR
    : EXECUTION_MODES.SAFE_REVIEW;
}

function dedupe(list) {
  return [...new Set(asList(list))];
}

function makeStage(stage, input = {}) {
  return {
    stage,
    status: String(input.status || "planned"),
    summary: String(input.summary || ""),
    agentRole: String(input.agentRole || "main_hermes"),
    filesAffected: dedupe(input.filesAffected),
    requiredInputs: dedupe(input.requiredInputs),
    toolAction: String(input.toolAction || ""),
    nextAction: String(input.nextAction || ""),
    riskLevel: String(input.riskLevel || "medium"),
    missingRequirements: dedupe(input.missingRequirements)
  };
}

function buildExecutionPipeline(input = {}) {
  const executionMode = normalizeMode(input.executionMode);
  const role = String(input.role || "main_hermes");
  const filesAffected = dedupe(input.filesAffected);
  const missingRequirements = dedupe(input.missingRequirements);
  const hasProposedOperations = input.hasProposedOperations === true;
  const hasPrivilegedRequirements = missingRequirements.length === 0;
  const modeLabel = executionMode === EXECUTION_MODES.OWNER_OPERATOR ? "OWNER OPERATOR MODE" : "Safe Review Mode";

  const inspectSummary = executionMode === EXECUTION_MODES.SAFE_REVIEW
    ? "Inspect existing repo/admin implementation and collect exact edit targets without changing files."
    : "Inspect active repo/admin implementation and prepare actionable edit/test/deploy scope.";
  const patchSummary = hasProposedOperations
    ? "Patch preview can be generated through Hermes patch preview tools."
    : "Patch preview requires proposedOperations from owner/operator instruction.";
  const approvalSummary = executionMode === EXECUTION_MODES.SAFE_REVIEW
    ? "Safe Review Mode is planning-only; approval is not consumed."
    : hasPrivilegedRequirements
      ? "Approval-gated execution path is ready; owner approval is required before apply/test/deploy."
      : `Approval requirements missing: ${missingRequirements.join("; ")}.`;

  const approveMissing = executionMode === EXECUTION_MODES.SAFE_REVIEW
    ? []
    : missingRequirements;

  const stages = [
    makeStage("plan", {
      status: "done",
      summary: `${modeLabel} classified this as owner-controlled repo/admin operator work.`,
      agentRole: role,
      filesAffected,
      requiredInputs: ["owner prompt"],
      toolAction: "tool-router.js intent classification",
      nextAction: "Inspect scope and produce patch preview stage data.",
      riskLevel: "medium"
    }),
    makeStage("inspect", {
      status: "ready",
      summary: inspectSummary,
      agentRole: role,
      filesAffected,
      requiredInputs: ["active repo context"],
      toolAction: "repo-registry.js + tool-executor.js read/search actions",
      nextAction: "Confirm exact files and prepare patch preview payload.",
      riskLevel: "medium"
    }),
    makeStage("patch_preview", {
      status: hasProposedOperations ? "ready" : "blocked",
      summary: patchSummary,
      agentRole: role,
      filesAffected,
      requiredInputs: ["proposedOperations"],
      toolAction: "patch-engine.js previewPatch via patch/preview",
      nextAction: hasProposedOperations
        ? "Generate preview diff and request owner approval."
        : "Provide proposedOperations to generate preview.",
      riskLevel: "medium",
      missingRequirements: hasProposedOperations ? [] : ["needs proposedOperations for patch preview"]
    }),
    makeStage("approve", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "proposal_only" : "needs_approval",
      summary: approvalSummary,
      agentRole: role,
      filesAffected,
      requiredInputs: executionMode === EXECUTION_MODES.SAFE_REVIEW
        ? []
        : ["mode=agent_edit/admin", "confirmEdit=true", "approvalId", "HERMES_EDIT_TOKEN"],
      toolAction: "approval-gate.js",
      nextAction: executionMode === EXECUTION_MODES.SAFE_REVIEW
        ? "Switch to Owner Operator Mode for approval-gated execution."
        : "Submit/decide approval, then apply approved patch.",
      riskLevel: "high",
      missingRequirements: approveMissing
    }),
    makeStage("apply", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "blocked" : "pending_approval",
      summary: executionMode === EXECUTION_MODES.SAFE_REVIEW
        ? "Safe Review Mode does not apply patches."
        : "Apply stage uses Hermes patch/apply only after approval is satisfied.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["approved patch preview", "approvalId/token"],
      toolAction: "patch-engine.js applyPatch via patch/apply",
      nextAction: executionMode === EXECUTION_MODES.SAFE_REVIEW
        ? "Review plan output only."
        : "Apply patch after approval requirements are met.",
      riskLevel: "high"
    }),
    makeStage("test", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "blocked" : "pending_approval",
      summary: "Run targeted tests/validation through command-runner after approved apply stage.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["test command list", "approvalId/token for privileged command runs"],
      toolAction: "command-runner.js via command/run",
      nextAction: "Execute required checks and capture results.",
      riskLevel: "medium"
    }),
    makeStage("deploy", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "blocked" : "pending_approval",
      summary: "Deploy/restart actions are owner-instructed and approval-gated.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["owner deployment instruction", "approvalId/token"],
      toolAction: "command-runner.js + git-operator.js",
      nextAction: "Run approved deploy/restart commands only when explicitly instructed.",
      riskLevel: "critical"
    }),
    makeStage("verify", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "blocked" : "pending_approval",
      summary: "Verify live/service status after deploy or restart.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["verification command/check list"],
      toolAction: "command-runner.js",
      nextAction: "Confirm expected live behavior and collect evidence.",
      riskLevel: "medium"
    }),
    makeStage("rollback", {
      status: executionMode === EXECUTION_MODES.SAFE_REVIEW ? "planned" : "ready",
      summary: "Rollback path is available through Hermes patch rollback and git safeguards.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["rollback id or rollback patch plan"],
      toolAction: "patch-engine.js rollbackPatch + git-operator.js",
      nextAction: "Trigger rollback if verification fails.",
      riskLevel: "high"
    }),
    makeStage("report", {
      status: "ready",
      summary: "Report plan, approvals, apply/test/deploy results, verification, and rollback status.",
      agentRole: role,
      filesAffected,
      requiredInputs: ["stage outputs"],
      toolAction: "conversation runtime report summary",
      nextAction: "Return structured owner execution report.",
      riskLevel: "low"
    })
  ];

  return {
    ok: true,
    type: "hermes_execution_pipeline",
    modeLabel,
    executionMode,
    validStages: VALID_STAGES,
    stages,
    missingRequirements: dedupe([
      ...(hasProposedOperations ? [] : ["needs proposedOperations for patch preview"]),
      ...missingRequirements
    ]),
    nextAction: executionMode === EXECUTION_MODES.SAFE_REVIEW
      ? "Review inspect + patch preview proposal stages, then switch to Owner Operator Mode for execution."
      : hasPrivilegedRequirements
        ? "Generate patch preview and move through approval-gated apply/test/deploy/verify."
        : `Provide missing approval requirements: ${missingRequirements.join("; ")}.`
  };
}

module.exports = {
  VALID_STAGES,
  EXECUTION_MODES,
  buildExecutionPipeline
};
