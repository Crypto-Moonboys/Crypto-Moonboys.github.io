"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { MEMORY_FILE } = require("./config.js");

function ensureStore() {
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    const initial = {
      createdAt: new Date().toISOString(),
      rules: {},
      architectureTruth: {},
      protectedSystems: [],
      approvalHistory: [],
      repoMap: {},
      runtimeMap: {},
      vpsTopology: {},
      services: [],
      domains: [],
      pm2Apps: [],
      workflows: []
    };
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(initial, null, 2));
  }
}

function readMemory() {
  ensureStore();
  return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
}

function writeMemory(nextState) {
  ensureStore();
  const payload = {
    ...nextState,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function mergeMemory(patch) {
  const current = readMemory();
  return writeMemory({ ...current, ...(patch || {}) });
}

module.exports = {
  readMemory,
  writeMemory,
  mergeMemory
};
