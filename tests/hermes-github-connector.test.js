"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const connectorPath = path.join(__dirname, "..", "server", "hermes", "github-connector.js");

test("github-connector has timeout and response size guard", () => {
  const source = fs.readFileSync(connectorPath, "utf8");
  assert.match(source, /GITHUB_TIMEOUT_MS/u);
  assert.match(source, /GITHUB_MAX_RESPONSE_BYTES/u);
  assert.match(source, /req\.setTimeout/u);
  assert.match(source, /totalBytes/u);
});

test("github-connector parse is guarded for non-JSON responses", () => {
  const source = fs.readFileSync(connectorPath, "utf8");
  assert.match(source, /try\s*\{\s*json\s*=\s*raw\s*\?/su);
  assert.match(source, /catch\s*\(_e\)/u);
});
