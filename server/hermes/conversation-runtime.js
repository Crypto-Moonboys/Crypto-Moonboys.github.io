"use strict";

const { callLocalOllama } = require("./chat-proxy.js");
const { routePromptToAction } = require("./tool-router.js");
const { executeAction, missingForPrivileged } = require("./tool-executor.js");
const { getAgents } = require("./swarm-registry.js");
const { requiresPrivilege } = require("./action-schema.js");
const { getActiveRepoOrThrow } = require("./repo-registry.js");

function formatToolResult(result, debug = false) {
  const action = String(result?.action || "");
  const ok = result?.ok === true;
  const repoUsed = result?.repo?.id || "";
  let summary = ok ? "Action succeeded." : "Action failed.";
  let pathUsed = result?.path || "";
  let entries = [];
  if (action === "file/list") {
    entries = Array.isArray(result?.result?.entries) ? result.result.entries.slice(0, 20) : [];
    summary = `Tool returned ${entries.length} entries.`;
  } else if (action === "repo/search") {
    entries = Array.isArray(result?.result) ? result.result.slice(0, 20) : [];
    summary = `Tool returned ${entries.length} search matches.`;
  } else if (action === "file/read") {
    const size = Number(result?.result?.size || 0);
    summary = `Read file (${size} bytes).`;
    pathUsed = result?.result?.path || pathUsed;
    entries = [{ snippet: String(result?.result?.content || "").slice(0, 300) }];
  } else if (action === "command/run") {
    summary = String(result?.result?.summary || summary);
    entries = [{
      exitCode: result?.result?.code,
      likelySource: result?.result?.likelySource || "",
      firstStderrLine: result?.result?.firstStderrLine || "",
      nextSafeAction: result?.result?.nextSafeAction || ""
    }];
  } else if (action === "memory/view") {
    summary = "Loaded memory snapshot.";
    entries = [result?.result || {}];
  } else if (action === "memory/merge") {
    summary = "Memory write completed.";
    entries = [{ savedPatch: result?.result?.savedPatch || {} }];
  }

  const view = {
    action,
    ok,
    repoUsed,
    pathUsed,
    resultSummary: summary,
    entries,
    missingRequirements: result?.missingRequirements || [],
    error: result?.error || ""
  };
  if (debug) {
    view.raw = result;
  }
  return view;
}

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
    const debug = input.debug === true;
    const activeRepo = (() => {
      try {
        return getActiveRepoOrThrow();
      } catch (_error) {
        return null;
      }
    })();
    const ctx = {
      mode,
      role,
      confirmEdit: input.confirmEdit === true,
      approvalId: input.approvalId,
      approvalToken: input.approvalToken,
      sessionId: input.sessionId,
      swarm: getAgents()
    };

    const privilegedActions = routing.actions.filter((a) => requiresPrivilege(a.type));
    if (privilegedActions.length > 0) {
      const missing = missingForPrivileged(ctx);
      const plan = privilegedActions.map((a) => ({
        action: a.type,
        filesAffected: Array.isArray(a.payload?.operations)
          ? a.payload.operations.map((op) => op.path).filter(Boolean)
          : [],
        required: ["mode=agent_edit/admin", "confirmEdit=true", "approvalId", "HERMES_EDIT_TOKEN"]
      }));
      return {
        reply: "Privileged request planned only. No changes were applied automatically.",
        actions: routing.actions,
        toolResults: [{
          action: "plan/privileged",
          ok: false,
          repoUsed: activeRepo?.id || "",
          pathUsed: "",
          resultSummary: "Approval-gated execution required.",
          entries: plan,
          missingRequirements: missing,
          error: ""
        }],
        missingRequirements: [...new Set(missing)],
        mode,
        role
      };
    }

    const results = [];
    const missing = [];
    for (const action of routing.actions) {
      const result = await executeAction(action, ctx);
      const formatted = formatToolResult(result, debug);
      results.push(formatted);
      if (Array.isArray(formatted.missingRequirements)) {
        missing.push(...formatted.missingRequirements);
      }
    }

    const failed = results.filter((r) => r.ok !== true);
    let summary = failed.length
      ? `Action completed with ${failed.length} error(s).`
      : `Executed ${results.length} action(s) successfully.`;

    for (const result of results) {
      if (!result?.ok) continue;
      if (result.action === "file/list" || result.action === "repo/search") {
        const count = Array.isArray(result.entries) ? result.entries.length : 0;
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
