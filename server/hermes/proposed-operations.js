"use strict";

// Maps admin-page HTML files to their associated OG fullscreen test files.
const HTML_TO_TEST_MAP = Object.freeze({
  "admin/hermes-chat.html": "tests/hermes-og-fullscreen.test.js",
  "admin/brain.html": "tests/hermes-brain.test.js"
});

function detectFeatureType(prompt) {
  const lower = String(prompt || "").toLowerCase();
  if (/\b(popup|modal|canvas|chart|overlay|dialog)\b/u.test(lower)) {
    return "popup_canvas_feature";
  }
  if (/\b(button|control|toggle|switch|dropdown|select)\b/u.test(lower)) {
    return "button_control_feature";
  }
  return "general_ui_feature";
}

function makeHtmlStub(featureType) {
  if (featureType === "popup_canvas_feature") {
    return [
      "<!-- [HERMES PROPOSED PATCH]",
      "Add popup/modal with canvas element for visual feature.",
      "- Add open button control (<button id=\"openFeaturePopup\" type=\"button\">Show Feature</button>)",
      "- Add modal wrapper with close button and hidden attribute",
      "- Add <canvas id=\"featureCanvas\" width=\"600\" height=\"300\"> for rendering",
      "- Preserve all existing Hermes OG/admin UI elements unchanged",
      "-->"
    ].join("\n");
  }
  if (featureType === "button_control_feature") {
    return [
      "<!-- [HERMES PROPOSED PATCH]",
      "Add button/control UI element.",
      "- Add <button id=\"newFeatureBtn\" type=\"button\">Feature</button>",
      "- Preserve all existing Hermes OG/admin UI elements unchanged",
      "-->"
    ].join("\n");
  }
  return "<!-- [HERMES PROPOSED PATCH] Add UI feature element. -->";
}

function makeJsStub(featureType) {
  if (featureType === "popup_canvas_feature") {
    return [
      "// [HERMES PROPOSED PATCH]",
      "// Add popup/canvas feature handlers:",
      "// - bindClick(\"openFeaturePopup\", openFeaturePopup)",
      "// - bindClick(\"closeFeaturePopup\", closeFeaturePopup)",
      "// - function openFeaturePopup() { el(\"featurePopupModal\").hidden = false; }",
      "// - function closeFeaturePopup() { el(\"featurePopupModal\").hidden = true; }",
      "// - function renderFeatureChart(canvas) { /* offline-safe; no new external deps */ }",
      "// Preserve all existing Hermes send/swarm/pipeline/OG handlers."
    ].join("\n");
  }
  if (featureType === "button_control_feature") {
    return [
      "// [HERMES PROPOSED PATCH]",
      "// Add button/control handler:",
      "// - bindClick(\"newFeatureBtn\", handleFeatureBtn)",
      "// Preserve all existing Hermes handlers."
    ].join("\n");
  }
  return "// [HERMES PROPOSED PATCH] Add UI feature handler.";
}

function makeTestStub(featureType) {
  if (featureType === "popup_canvas_feature") {
    return [
      "// [HERMES PROPOSED TEST ASSERTIONS]",
      "// test(\"popup canvas feature elements exist\", () => {",
      "//   assert.match(htmlSource, /id=\"openFeaturePopup\"/);",
      "//   assert.match(htmlSource, /id=\"featurePopupModal\"/);",
      "//   assert.match(htmlSource, /id=\"featureCanvas\"/);",
      "//   assert.match(jsSource, /openFeaturePopup|closeFeaturePopup|renderFeatureChart/);",
      "// });"
    ].join("\n");
  }
  return [
    "// [HERMES PROPOSED TEST ASSERTIONS]",
    "// test(\"feature elements exist\", () => {",
    "//   assert.match(htmlSource, /featureElement/);",
    "// });"
  ].join("\n");
}

/**
 * Generate a bounded list of proposed patch operations for an admin UI feature
 * request. Safe to preview (not to apply automatically).
 *
 * @param {object} input
 * @param {string} input.classification - From tool-router operatorIntent.
 * @param {string} input.prompt - The original operator prompt.
 * @param {string[]} input.likelyFiles - Files identified by tool-router.
 * @returns {Array<{type: string, path: string, summary: string, content: string}>}
 */
function generateProposedOperations({ classification, prompt, likelyFiles } = {}) {
  if (classification !== "repo_admin_ui_operator_task") return [];
  const files = Array.isArray(likelyFiles) ? likelyFiles : [];
  if (files.length === 0) return [];

  const featureType = detectFeatureType(prompt);
  const operations = [];
  const addedTestFiles = new Set();

  for (const file of files) {
    if (file.endsWith(".html")) {
      operations.push({
        type: "update",
        path: file,
        summary: `Add ${featureType} markup to ${file}`,
        content: makeHtmlStub(featureType)
      });
      // Attach associated test file update.
      const testFile = HTML_TO_TEST_MAP[file];
      if (testFile && !addedTestFiles.has(testFile)) {
        addedTestFiles.add(testFile);
        operations.push({
          type: "update",
          path: testFile,
          summary: `Add ${featureType} test assertions to ${testFile}`,
          content: makeTestStub(featureType)
        });
      }
    } else if (file.endsWith(".js") && !file.startsWith("tests/")) {
      operations.push({
        type: "update",
        path: file,
        summary: `Add ${featureType} handlers to ${file}`,
        content: makeJsStub(featureType)
      });
    }
  }

  return operations;
}

module.exports = {
  generateProposedOperations
};
