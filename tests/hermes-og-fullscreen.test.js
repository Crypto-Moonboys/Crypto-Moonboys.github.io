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

const apiSource = fs.readFileSync(
  path.join(__dirname, "..", "api", "hermes-api.js"),
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

// Slice window used when searching within a specific function body
const FUNCTION_SEARCH_WINDOW = 500;

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
  // api() is defined exactly once; both handlers delegate to runHermesSend which calls /api/hermes/chat
  const apiDefs = jsSource.match(/async function api\(/gu) || [];
  assert.equal(apiDefs.length, 1, "api() should be defined exactly once");
  const chatEndpoints = jsSource.match(/\/api\/hermes\/chat/gu) || [];
  assert.ok(chatEndpoints.length >= 1, "chat endpoint used in shared runHermesSend");
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

test("js sends are serialized by hermesSendInFlight guard", () => {
  assert.match(jsSource, /hermesSendInFlight/u, "hermesSendInFlight flag must exist");
  assert.match(jsSource, /async function runHermesSend/u, "runHermesSend shared function must exist");
  assert.match(jsSource, /setSendButtonsDisabled/u, "send buttons must be disabled while in-flight");
});

test("js shared in-flight guard rejects concurrent prompts with operator warning", () => {
  const start = jsSource.indexOf("async function runHermesSend");
  assert.ok(start !== -1, "runHermesSend not found");
  const section = jsSource.slice(start, jsSource.indexOf('bindClick("ogSendChat"'));
  assert.match(section, /if \(hermesSendInFlight\)/u);
  assert.match(section, /Hermes request already in progress\. Wait for the current reply before sending another prompt\./u);
  assert.match(section, /finally \{[\s\S]*hermesSendInFlight = false/u);
});

test("js ogPrompt is guarded before clearing", () => {
  const start = jsSource.indexOf('bindClick("ogSendChat"');
  const end = jsSource.indexOf('bindClick("sendChat"');
  assert.ok(start !== -1 && end !== -1);
  const section = jsSource.slice(start, end);
  assert.match(section, /const promptEl = el\("ogPrompt"\)/u);
  assert.match(section, /const prompt = String\(promptEl\?\.value \|\| ""\)\.trim\(\)/u);
  assert.match(section, /if \(!prompt\) return/u);
  assert.match(section, /if \(promptEl\) promptEl\.value = ""/u);
  assert.doesNotMatch(section, /el\("ogPrompt"\)\.value = ""/u);
});

test("js runHermesSend avoids unsafe pop rollback under shared sends", () => {
  const start = jsSource.indexOf("async function runHermesSend");
  assert.ok(start !== -1, "runHermesSend not found");
  const section = jsSource.slice(start, jsSource.indexOf('bindClick("ogSendChat"'));
  assert.doesNotMatch(section, /history\.pop\(\)/u, "runHermesSend must not use unsafe history.pop rollback");
  assert.doesNotMatch(section, /ogMessages\.pop\(\)/u, "runHermesSend must not use unsafe ogMessages.pop rollback");
  assert.match(section, /history\.splice\(userEntryIndex, 1\)/u, "failed user history entry should be removed by identity/index");
});

test("js ogSendChat delegates to runHermesSend", () => {
  const start = jsSource.indexOf('bindClick("ogSendChat"');
  const end = jsSource.indexOf('bindClick("sendChat"');
  assert.ok(start !== -1 && end !== -1);
  const section = jsSource.slice(start, end);
  assert.match(section, /runHermesSend/u, "ogSendChat handler must call runHermesSend");
});

test("js sendChat delegates to runHermesSend", () => {
  const start = jsSource.indexOf('bindClick("sendChat"');
  const end = jsSource.indexOf('bindClick("runAction"');
  assert.ok(start !== -1 && end !== -1);
  const section = jsSource.slice(start, end);
  assert.match(section, /runHermesSend/u, "sendChat handler must call runHermesSend");
});

test("js openOgOverlay guards against double-open and saves previous overflow", () => {
  const start = jsSource.indexOf("function openOgOverlay");
  assert.ok(start !== -1, "openOgOverlay not found");
  const section = jsSource.slice(start, start + FUNCTION_SEARCH_WINDOW);
  assert.match(section, /previousBodyOverflow/u, "must save previous overflow before setting hidden");
  assert.match(section, /classList\.contains\("open"\)/u, "must guard against double-open");
});

test("js closeOgOverlay restores saved overflow and only runs when overlay is open", () => {
  const start = jsSource.indexOf("function closeOgOverlay");
  assert.ok(start !== -1, "closeOgOverlay not found");
  const section = jsSource.slice(start, start + FUNCTION_SEARCH_WINDOW);
  assert.match(section, /previousBodyOverflow/u, "must restore previously saved overflow");
  assert.match(section, /classList\.contains\("open"\)/u, "must guard against closing an already-closed overlay");
});

test("js ogMessages is capped to prevent unbounded log growth", () => {
  assert.match(jsSource, /const maxOgMessages = 100/u, "maxOgMessages constant must be 100");
  assert.match(jsSource, /ogMessages\.splice/u, "ogMessages must be trimmed on overflow");
});

test("js body overflow restore uses tracked previous value", () => {
  const openStart = jsSource.indexOf("function openOgOverlay");
  const closeStart = jsSource.indexOf("function closeOgOverlay");
  assert.ok(openStart !== -1 && closeStart !== -1);
  const openSection = jsSource.slice(openStart, closeStart);
  const closeSection = jsSource.slice(closeStart, closeStart + FUNCTION_SEARCH_WINDOW);
  assert.match(openSection, /previousBodyOverflow = document\.body\.style\.overflow \|\| ""/u);
  assert.match(closeSection, /document\.body\.style\.overflow = previousBodyOverflow/u);
  assert.doesNotMatch(closeSection, /removeProperty\("overflow"\)/u);
});

test("api does not add unsafe Hermes2 or direct browser repo-write endpoints", () => {
  assert.doesNotMatch(apiSource, /Hermes2|hermes2/u);
  assert.doesNotMatch(apiSource, /browser.*(write|edit)|repo.*write.*browser|direct.*repo.*write/u);
  assert.match(apiSource, /app\.post\("\/api\/hermes\/chat"/u, "same Hermes chat runtime endpoint must remain");
});

test("js Escape key closes overlay", () => {
  assert.match(jsSource, /key === "Escape"/);
});
