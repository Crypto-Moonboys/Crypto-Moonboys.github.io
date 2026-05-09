"use strict";

const { callLocalOllama } = require("./chat-proxy.js");
const { routePromptToAction } = require("./tool-router.js");
const { executeAction, missingForPrivileged } = require("./tool-executor.js");
const { getAgents } = require("./swarm-registry.js");
const { requiresPrivilege } = require("./action-schema.js");
const { ACTIONS } = require("./action-schema.js");
const { getActiveRepoOrThrow } = require("./repo-registry.js");
const { createSwarmPlan, EXECUTION_MODES } = require("./swarm-manager.js");
const { buildExecutionPipeline } = require("./execution-pipeline.js");

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

  if (routing.operatorIntent) {
    const executionMode = String(input.swarmExecutionMode || input.executionMode || "").toLowerCase() === "owner_operator"
      ? EXECUTION_MODES.OWNER_OPERATOR
      : EXECUTION_MODES.SAFE_REVIEW;
    const likelyFiles = Array.isArray(routing.operatorIntent.likelyFiles) ? routing.operatorIntent.likelyFiles : [];
    const taskBrief = prompt;
    const swarmPlan = createSwarmPlan(taskBrief, {
      swarmExecutionMode: executionMode,
      ownerOperatorMode: executionMode === EXECUTION_MODES.OWNER_OPERATOR,
      mode,
      role
    });
    const proposedOperations = Array.isArray(input.proposedOperations) ? input.proposedOperations : [];
    const basePipeline = buildExecutionPipeline({
      executionMode,
      role,
      filesAffected: likelyFiles,
      missingRequirements: [],
      hasProposedOperations: proposedOperations.length > 0
    });

    if (executionMode === EXECUTION_MODES.SAFE_REVIEW) {
      return {
        reply:
          "This is an admin/repo UI operator task. Safe Review Mode created a swarm plan; no generic chat fallback was used.",
        actions: [],
        toolResults: [
          {
            action: "swarm/plan",
            ok: true,
            repoUsed: "",
            pathUsed: "",
            resultSummary: "Swarm plan created for admin/repo UI task.",
            entries: [swarmPlan, { classification: routing.operatorIntent.classification, likelyFiles }],
            totalCount: 2,
            shownCount: 2
          },
          {
            action: "execution/pipeline",
            ok: true,
            repoUsed: "",
            pathUsed: "",
            resultSummary: "Owner execution pipeline proposal generated.",
            entries: [basePipeline],
            totalCount: 1,
            shownCount: 1
          }
        ],
        missingRequirements: [],
        executionPipeline: basePipeline,
        swarmPlan,
        mode,
        role
      };
    }

    const missing = missingForPrivileged({
      mode,
      role,
      confirmEdit: input.confirmEdit === true,
      approvalId: input.approvalId,
      approvalToken: input.approvalToken
    });
    const executionMissing = [
      ...new Set([
        ...missing,
        ...(proposedOperations.length > 0 ? [] : ["needs proposedOperations for patch preview"])
      ])
    ];
    const pipeline = buildExecutionPipeline({
      executionMode,
      role,
      filesAffected: likelyFiles,
      missingRequirements: executionMissing.filter((item) => item !== "needs proposedOperations for patch preview"),
      hasProposedOperations: proposedOperations.length > 0
    });

    const toolResults = [
      {
        action: "swarm/plan",
        ok: true,
        repoUsed: "",
        pathUsed: "",
        resultSummary: "Swarm plan created for owner operator task.",
        entries: [swarmPlan, { classification: routing.operatorIntent.classification, likelyFiles }],
        totalCount: 2,
        shownCount: 2
      },
      {
        action: "execution/pipeline",
        ok: true,
        repoUsed: "",
        pathUsed: "",
        resultSummary: "Owner execution pipeline generated.",
        entries: [pipeline],
        totalCount: 1,
        shownCount: 1
      }
    ];

    if (executionMissing.length > 0) {
      toolResults.push({
        action: "plan/privileged",
        ok: false,
        repoUsed: "",
        pathUsed: "",
        resultSummary: "Approval-gated execution required.",
        entries: [
          {
            classification: routing.operatorIntent.classification,
            likelyFiles,
            nextStep: "Prepare patch preview via Hermes toolchain, then apply only after approval.",
            missingRequirements: executionMissing
          }
        ],
        missingRequirements: executionMissing,
        error: ""
      });
      return {
        reply:
          "This is an admin/repo UI feature request. Owner Operator Mode requires explicit approval inputs before apply/test/deploy.",
        actions: [],
        toolResults,
        missingRequirements: executionMissing,
        executionPipeline: pipeline,
        swarmPlan,
        mode,
        role
      };
    }

    let previewResult = null;
    if (proposedOperations.length > 0) {
      previewResult = await executeAction(
        { type: ACTIONS.PATCH_PREVIEW, payload: { operations: proposedOperations } },
        {
          mode,
          role,
          confirmEdit: input.confirmEdit === true,
          approvalId: input.approvalId,
          approvalToken: input.approvalToken,
          sessionId: input.sessionId,
          swarm: getAgents()
        }
      );
      toolResults.push(formatToolResult(previewResult));
    }

    return {
      reply:
        "This is an admin/repo UI feature request. Owner Operator Mode can proceed through Hermes patch-preview and approval-gated execution.",
      actions: [],
      toolResults,
      missingRequirements: [],
      executionPipeline: pipeline,
      swarmPlan,
      mode,
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
        executionPipeline: null,
        swarmPlan: null,
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
      executionPipeline: null,
      swarmPlan: null,
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
      executionPipeline: null,
      swarmPlan: null,
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
      executionPipeline: null,
      swarmPlan: null,
      mode,
      role
    };
  }

  return {
    reply: modelResult.body.reply,
    actions: [],
    toolResults: [],
    missingRequirements: [],
    executionPipeline: null,
    swarmPlan: null,
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
