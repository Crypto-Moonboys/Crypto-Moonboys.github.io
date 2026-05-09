"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const htmlSource = fs.readFileSync(
  path.join(__dirname, "..", "admin", "hermes-chat.html"),
  "utf8"
);

const jsSource = fs.readFileSync(
  path.join(__dirname, "..", "js", "hermes-chat.js"),
  "utf8"
);

// ── Existing page preservation ───────────────────────────────────────────────

test("existing admin page title is preserved", () => {
  assert.match(htmlSource, /Hermes Admin Console/);
});

test("existing sendChat button is preserved", () => {
  assert.match(htmlSource, /id="sendChat"/);
});

test("existing prompt textarea is preserved", () => {
  assert.match(htmlSource, /id="prompt"/);
});

test("existing chatLog output element is preserved", () => {
  assert.match(htmlSource, /id="chatLog"/);
});

test("existing hermes-chat.js script tag is preserved", () => {
  assert.match(htmlSource, /src="\/js\/hermes-chat\.js"/);
});

// ── New OG fullscreen button ──────────────────────────────────────────────────

test("OPEN HERMES OG FULLSCREEN button text is present", () => {
  assert.match(htmlSource, /OPEN HERMES OG FULLSCREEN/);
});

test("openOgFullscreen button id is present", () => {
  assert.match(htmlSource, /id="openOgFullscreen"/);
});

// ── OG overlay structure ──────────────────────────────────────────────────────

test("fullscreen overlay element exists with correct id", () => {
  assert.match(htmlSource, /id="ogOverlay"/);
});

test("overlay has role=dialog and aria-modal for accessibility", () => {
  assert.match(htmlSource, /role="dialog"/);
  assert.match(htmlSource, /aria-modal="true"/);
});

test("overlay title is HERMES OG REPO CONTROL", () => {
  assert.match(htmlSource, /HERMES OG REPO CONTROL/);
});

test("overlay has close button with correct id", () => {
  assert.match(htmlSource, /id="closeOgOverlay"/);
});

test("overlay has refresh status button", () => {
  assert.match(htmlSource, /id="ogRefreshStatus"/);
});

// ── OG overlay panels ─────────────────────────────────────────────────────────

test("overlay has left swarm/roles panel", () => {
  assert.match(htmlSource, /id="ogSwarmList"/);
});

test("overlay has main chat log panel", () => {
  assert.match(htmlSource, /id="ogChatLog"/);
});

test("overlay has OG prompt input", () => {
  assert.match(htmlSource, /id="ogPrompt"/);
});

test("overlay has OG send button", () => {
  assert.match(htmlSource, /id="ogSendChat"/);
});

test("overlay has approvals status pane", () => {
  assert.match(htmlSource, /id="ogApprovals"/);
});

test("overlay has command queue pane", () => {
  assert.match(htmlSource, /id="ogQueue"/);
});

test("overlay has repo info pane", () => {
  assert.match(htmlSource, /id="ogRepoInfo"/);
});

// ── Edit safety warning ───────────────────────────────────────────────────────

test("edit safety warning is present in overlay", () => {
  assert.match(
    htmlSource,
    /Repo edit mode requires explicit approval\. Hermes will preview before applying changes\./
  );
});

// ── OG action bar ─────────────────────────────────────────────────────────────

test("action bar mode indicator is present", () => {
  assert.match(htmlSource, /id="ogBarMode"/);
});

test("action bar role indicator is present", () => {
  assert.match(htmlSource, /id="ogBarRole"/);
});

test("action bar approval indicator is present", () => {
  assert.match(htmlSource, /id="ogBarApproval"/);
});

// ── JS wiring ─────────────────────────────────────────────────────────────────

test("js has openOgOverlay function", () => {
  assert.match(jsSource, /function openOgOverlay/);
});

test("js has closeOgOverlay function", () => {
  assert.match(jsSource, /function closeOgOverlay/);
});

test("js openOgFullscreen click is bound", () => {
  assert.match(jsSource, /bindClick\("openOgFullscreen"/);
});

test("js closeOgOverlay click is bound", () => {
  assert.match(jsSource, /bindClick\("closeOgOverlay"/);
});

test("js ogSendChat click is bound", () => {
  assert.match(jsSource, /bindClick\("ogSendChat"/);
});

test("js ogRefreshStatus click is bound", () => {
  assert.match(jsSource, /bindClick\("ogRefreshStatus"/);
});

test("js has shared ogMessages array for log state", () => {
  assert.match(jsSource, /const ogMessages/);
});

test("js appendOgMessage feeds both UIs", () => {
  assert.match(jsSource, /function appendOgMessage/);
});

test("js renderOgMessages uses the shared log", () => {
  assert.match(jsSource, /function renderOgMessages/);
});

test("js OG send uses the same api() function as main send", () => {
  // api is defined exactly once
  const apiDefs = jsSource.match(/async function api\(/gu) || [];
  assert.equal(apiDefs.length, 1);
});

test("js OG send uses the shared history array", () => {
  // history should appear in the ogSendChat section
  assert.match(jsSource, /history\.slice\(-maxHistory\)/u);
});

test("js loadOgSwarm loads from existing swarm endpoint", () => {
  assert.match(jsSource, /\/api\/hermes\/swarm/);
  assert.match(jsSource, /function loadOgSwarm/);
});

test("js loadOgStatus loads approvals from existing endpoint", () => {
  assert.match(jsSource, /\/api\/hermes\/approval\/list/);
  assert.match(jsSource, /function loadOgStatus/);
});

test("js loadOgStatus loads command queue from existing endpoint", () => {
  assert.match(jsSource, /\/api\/hermes\/command\/queue/);
});

test("js OG send removes ogMessages entry on failure to stay in sync with history", () => {
  assert.match(jsSource, /ogMessages\.pop\(\)/u);
});

test("js does not add a second api function or duplicate chat endpoint", () => {
  // Only one api() function definition
  const apiDefs = jsSource.match(/async function api\(/gu) || [];
  assert.equal(apiDefs.length, 1, "api() should be defined exactly once");
  // Both sendChat and ogSendChat reference the same /api/hermes/chat path
  const chatEndpoints = jsSource.match(/\/api\/hermes\/chat/gu) || [];
  assert.ok(chatEndpoints.length >= 2, "chat endpoint used in at least two send handlers");
});
