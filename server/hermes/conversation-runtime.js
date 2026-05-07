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
  let totalCount = 0;
  let shownCount = 0;

  if (!ok) {
    const missing = Array.isArray(result?.missingRequirements) ? result.missingRequirements : [];
    const err = String(result?.error || "").trim();
    const toolMessage = String(result?.result?.message || "").trim();
    if (missing.length) {
      summary = `Action denied: ${missing.join("; ")}.`;
    } else if (err) {
      const reason = /denied|requires|missing|blocked|mismatch|not allowed|not found/iu.test(err)
        ? err
        : `operation failed (${err})`;
      summary = `Action failed: ${reason}.`;
    } else if (toolMessage) {
      summary = `Action failed: ${toolMessage}.`;
    } else {
      summary = "Action failed: no details returned.";
    }
    const failedView = {
      action,
      ok,
      repoUsed,
      pathUsed,
      resultSummary: summary,
      entries: [],
      totalCount: 0,
      shownCount: 0,
      missingRequirements: missing,
      error: err
    };
    if (debug) {
      failedView.raw = result;
    }
    return failedView;
  }

  if (action === "file/list") {
    const source = Array.isArray(result?.result?.entries) ? result.result.entries : [];
    totalCount = Number(result?.result?.totalCount || source.length || 0);
    entries = source.slice(0, 20);
    shownCount = entries.length;
    summary = `Tool returned ${totalCount} entries (showing first ${shownCount}).`;
  } else if (action === "repo/search") {
    const source = Array.isArray(result?.result?.items) ? result.result.items : [];
    totalCount = Number(result?.result?.totalCount || source.length || 0);
    entries = source.slice(0, 20);
    shownCount = entries.length;
    summary = `Tool returned ${totalCount} search matches (showing first ${shownCount}).`;
  } else if (action === "file/read") {
    const size = Number(result?.result?.size || 0);
    summary = `Read file (${size} bytes).`;
    pathUsed = result?.result?.path || pathUsed;
    entries = [{ snippet: String(result?.result?.content || "").slice(0, 300) }];
    totalCount = 1;
    shownCount = 1;
  } else if (action === "command/run") {
    summary = String(result?.result?.summary || summary);
    entries = [{
      exitCode: result?.result?.code,
      likelySource: result?.result?.likelySource || "",
      firstStderrLine: result?.result?.firstStderrLine || "",
      nextSafeAction: result?.result?.nextSafeAction || ""
    }];
    totalCount = 1;
    shownCount = 1;
  } else if (action === "memory/view") {
    summary = "Loaded memory snapshot.";
    entries = [result?.result || {}];
    totalCount = 1;
    shownCount = 1;
  } else if (action === "memory/merge") {
    summary = "Memory write completed.";
    entries = [{ savedPatch: result?.result?.savedPatch || {} }];
    totalCount = 1;
    shownCount = 1;
  } else if (action.startsWith("webcrawl/")) {
    const wc = result?.result || {};
    summary = String(wc.message || wc.whatChanged || wc.summary || "Webcrawl action completed.");
    pathUsed = String(wc.url || wc.sourceRoot || "");
    const sourceEntries = Array.isArray(wc.sources) ? wc.sources : [];
    const topic = String(wc.topic || "");
    const checkedAt = String(wc.checkedAt || "");
    const confidence = String(wc.confidence || "");
    entries = [{
      topic,
      checkedAt,
      confidence,
      whatChanged: wc.whatChanged || "",
      sources: sourceEntries.slice(0, 10),
      failures: Array.isArray(wc.failures) ? wc.failures.slice(0, 10) : []
    }];
    totalCount = sourceEntries.length;
    shownCount = Math.min(sourceEntries.length, 10);
    if (wc.unavailable === true) {
      summary = "Webcrawl tools unavailable";
    }
  }

  const view = {
    action,
    ok,
    repoUsed,
    pathUsed,
    resultSummary: summary,
    entries,
    totalCount,
    shownCount,
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
        const total = Number(result.totalCount || 0);
        const shown = Number(result.shownCount || 0);
        summary = `Tool returned ${total} entries (showing first ${shown}).`;
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
