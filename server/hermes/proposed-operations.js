"use strict";

const SUPPORTED_TASKS = Object.freeze({
  ADMIN_BTC_CHART_POPUP_WEBUI: "admin_btc_chart_popup_webui"
});

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function detectTaskProfile(prompt, likelyFiles) {
  const lower = String(prompt || "").toLowerCase();
  const files = asList(likelyFiles);

  const mentionsBtcPopup = /\b(btc|bitcoin)\b/u.test(lower)
    && /\b(chart|canvas)\b/u.test(lower)
    && /\b(popup|modal|admin\s+page|hermes\s+page)\b/u.test(lower);

  const targetsModernShell = files.includes("admin/hermes-webui/index.html")
    || files.includes("js/hermes-chat.js")
    || files.includes("js/hermes-webui-adapter.js");

  if (mentionsBtcPopup && targetsModernShell) {
    return SUPPORTED_TASKS.ADMIN_BTC_CHART_POPUP_WEBUI;
  }

  if (mentionsBtcPopup && files.some((file) => file === "admin/hermes-chat.html")) {
    return "legacy_admin_shell_target";
  }

  if (files.length > 0 && files.every((file) => file.endsWith(".css"))) {
    return "css_only_admin_ui";
  }

  return "unsupported_admin_ui_feature";
}

function createProposedOperationsPlan({ classification, prompt, likelyFiles } = {}) {
  if (classification !== "repo_admin_ui_operator_task") {
    return { operations: [], missingRequirements: [], taskType: "non_operator" };
  }

  const files = asList(likelyFiles);
  if (files.length === 0) {
    return {
      operations: [],
      missingRequirements: [
        "No likely files were identified for this admin UI task.",
        "BTC chart auto-generation requires explicit modern shell targets (admin/hermes-webui/index.html and js/hermes-chat.js)."
      ],
      taskType: "no_likely_files"
    };
  }

  const taskType = detectTaskProfile(prompt, files);

  if (taskType === "css_only_admin_ui") {
    return {
      operations: [],
      missingRequirements: ["No concrete proposed operations generated for CSS-only admin UI requests yet."],
      taskType
    };
  }

  if (taskType === "legacy_admin_shell_target") {
    return {
      operations: [],
      missingRequirements: [
        "Legacy admin shell target detected (admin/hermes-chat.html).",
        "Use modern shell targets: admin/hermes-webui/index.html, js/hermes-chat.js, js/hermes-webui-adapter.js.",
        "Unsafe legacy operation templates were intentionally disabled for the imported hermes-webui runtime."
      ],
      taskType
    };
  }

  if (taskType === SUPPORTED_TASKS.ADMIN_BTC_CHART_POPUP_WEBUI) {
    return {
      operations: [],
      missingRequirements: [
        "BTC chart auto-generation for imported hermes-webui is not enabled yet.",
        "Proposals must be adapter/runtime-safe and target admin/hermes-webui/index.html + js/hermes-chat.js without legacy el()/bindClick() helpers."
      ],
      taskType
    };
  }

  return {
    operations: [],
    missingRequirements: ["No concrete proposed operations generated for this admin UI request yet."],
    taskType
  };
}

function generateProposedOperations(input = {}) {
  return createProposedOperationsPlan(input).operations;
}

module.exports = {
  createProposedOperationsPlan,
  generateProposedOperations
};
