"use strict";

const REPAIR_RULES = Object.freeze([
  "small bounded patches",
  "test before completion",
  "rollback on failure",
  "record failure reason",
  "prefer targeted repair on failing files",
  "avoid deadlock/no-op cycles"
]);

function dedupe(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildRepairPolicy(input = {}) {
  const filesAffected = dedupe(input.filesAffected);
  const preferredTargets = filesAffected.length > 0 ? filesAffected : ["target failing files first"];
  return {
    label: "DADDY-style repair discipline",
    rules: [...REPAIR_RULES],
    preferredTargets,
    boundedPatchPolicy: "Keep repairs small, scoped, and reversible.",
    failureHandling: "If apply/test/verify fails, rollback, record the failure reason, and retry only targeted repairs.",
    loopGuard: "Do not repeat no-op or deadlock cycles; change scope or stop with a report."
  };
}

module.exports = {
  REPAIR_RULES,
  buildRepairPolicy
};
