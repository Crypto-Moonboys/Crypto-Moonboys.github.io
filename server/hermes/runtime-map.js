"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { HERMES_DATA_ROOT } = require("./config.js");

const RUNTIME_MAP_FILE = path.join(HERMES_DATA_ROOT, "runtime-map.json");
const REPOS_FILE = path.join(HERMES_DATA_ROOT, "repos.json");
const TOOL_POLICY_FILE = path.join(HERMES_DATA_ROOT, "tool-policy.json");

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_e) {
    return fallback;
  }
}

function loadRuntimeMap() {
  return readJson(RUNTIME_MAP_FILE, {});
}

function loadReposConfig() {
  return readJson(REPOS_FILE, { repos: [] });
}

function loadToolPolicy() {
  return readJson(TOOL_POLICY_FILE, {});
}

module.exports = {
  RUNTIME_MAP_FILE,
  REPOS_FILE,
  TOOL_POLICY_FILE,
  loadRuntimeMap,
  loadReposConfig,
  loadToolPolicy
};
