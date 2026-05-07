"use strict";

const { callLocalOllama } = require("./chat-proxy.js");
const { routePromptToAction } = require("./tool-router.js");
const { executeAction, missingForPrivileged } = require("./tool-executor.js");
const { getAgents } = require("./swarm-registry.js");

async function runConversation(input = {}) {
  const role = String(input.role || "main_hermes");
  const mode = String(input.mode || "chat");
  const prompt = String(input.prompt || "").trim();
  const routing = routePromptToAction(input);

  if (routing.modeSwitch) {
    return {
      reply: `Mode switch requested: ${routing.modeSwitch}.`,
      actions: [],
      toolResults: [],
      missingRequirements: [],
      mode: routing.modeSwitch,
      role
    };
  }

  if (routing.actions.length > 0) {
    const ctx = {
      mode,
      role,
      confirmEdit: input.confirmEdit === true,
      approvalId: input.approvalId,
      approvalToken: input.approvalToken,
      swarm: getAgents()
    };

    const results = [];
    const missing = [];
    for (const action of routing.actions) {
      const result = await executeAction(action, ctx);
      results.push(result);
      if (Array.isArray(result.missingRequirements)) {
        missing.push(...result.missingRequirements);
      }
    }

    const failed = results.filter((r) => !r.ok);
    let summary = failed.length
      ? `Action completed with ${failed.length} error(s).`
      : `Executed ${results.length} action(s) successfully.`;

    for (const result of results) {
      if (!result?.ok) continue;
      if (result.action === "file/list") {
        const count = Array.isArray(result.result?.entries) ? result.result.entries.length : 0;
        summary = `Tool returned only ${count} entries.`;
      }
      if (result.action === "repo/search") {
        const count = Array.isArray(result.result) ? result.result.length : 0;
        summary = `Tool returned only ${count} entries.`;
      }
    }

    return {
      reply: summary,
      actions: routing.actions,
      toolResults: results,
      missingRequirements: [...new Set(missing)],
      mode,
      role
    };
  }

  if (/(repo|directory|directories|file|files|package\.json|index\.html|read\s+)/iu.test(prompt)) {
    return {
      reply: "No matching tool action was found for that repo/file request. Tool result is required; Hermes will not invent files.",
      actions: [],
      toolResults: [],
      missingRequirements: [],
      mode,
      role
    };
  }

  const modelResult = await callLocalOllama({
    model: input.model,
    systemPrompt: input.systemPrompt,
    prompt,
    history: input.history,
    mode: "chat",
    confirmEdit: true
  });

  if (modelResult.status !== 200) {
    return {
      reply: modelResult.body?.error || "Hermes model request failed.",
      actions: [],
      toolResults: [],
      missingRequirements: [],
      mode,
      role
    };
  }

  return {
    reply: modelResult.body.reply,
    actions: [],
    toolResults: [],
    missingRequirements: [],
    mode,
    role
  };
}

function missingRequirementsForAction(action, ctx = {}) {
  const missing = missingForPrivileged({
    mode: ctx.mode,
    confirmEdit: ctx.confirmEdit,
    approvalId: ctx.approvalId,
    approvalToken: ctx.approvalToken
  });
  return { action, missingRequirements: missing };
}

module.exports = {
  runConversation,
  missingRequirementsForAction
};
