"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { HERMES_DATA_ROOT, DEFAULT_REPO_ROOT, CLONE_PARENT_DIR } = require("./config.js");

const REGISTRY_FILE = path.join(HERMES_DATA_ROOT, "repo-registry.json");

function nowIso() {
  return new Date().toISOString();
}

function normalizeRepoId(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function defaultSeedRepo() {
  return {
    id: String(process.env.HERMES_PRIMARY_REPO_ID || "crypto-moonboys-site"),
    name: String(process.env.HERMES_PRIMARY_REPO_NAME || "Crypto Moonboys Website"),
    remoteUrl: String(
      process.env.HERMES_PRIMARY_REPO_REMOTE ||
      "https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io"
    ),
    localPath: String(DEFAULT_REPO_ROOT),
    defaultBranch: String(process.env.HERMES_PRIMARY_REPO_BRANCH || "main"),
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function ensureRegistryFile() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
    const seed = defaultSeedRepo();
    fs.writeFileSync(
      REGISTRY_FILE,
      JSON.stringify(
        {
          activeRepoId: seed.id,
          repos: [seed]
        },
        null,
        2
      )
    );
  }
}

function readRegistry() {
  ensureRegistryFile();
  const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.repos)) {
    throw new Error("Repo registry file is invalid.");
  }
  if (!raw.activeRepoId) {
    raw.activeRepoId = raw.repos[0]?.id || defaultSeedRepo().id;
  }
  return raw;
}

function writeRegistry(nextState) {
  ensureRegistryFile();
  const payload = {
    activeRepoId: String(nextState.activeRepoId || ""),
    repos: Array.isArray(nextState.repos) ? nextState.repos : []
  };
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function getRepoByIdOrName(state, idOrName) {
  const needle = String(idOrName || "").trim().toLowerCase();
  if (!needle) return null;
  return state.repos.find((repo) =>
    String(repo.id || "").toLowerCase() === needle ||
    String(repo.name || "").toLowerCase() === needle
  ) || null;
}

function getRegistrySnapshot() {
  const state = readRegistry();
  const activeRepo = getRepoByIdOrName(state, state.activeRepoId);
  return {
    activeRepoId: state.activeRepoId,
    activeRepo: activeRepo || null,
    repos: state.repos
  };
}

function getActiveRepoOrThrow() {
  const snapshot = getRegistrySnapshot();
  if (!snapshot.activeRepo) {
    throw new Error("No active repo configured. Register a repo first.");
  }
  return snapshot.activeRepo;
}

function ensureRepoShape(input) {
  const id = normalizeRepoId(input.id || input.name || input.remoteUrl);
  if (!id) throw new Error("Repo id/name is required.");
  const localPath = String(input.localPath || "").trim();
  if (!localPath) throw new Error("Repo localPath is required.");
  return {
    id,
    name: String(input.name || id),
    remoteUrl: String(input.remoteUrl || ""),
    localPath,
    defaultBranch: String(input.defaultBranch || "main"),
    status: String(input.status || "inactive"),
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function registerRepo(input = {}) {
  const state = readRegistry();
  const next = ensureRepoShape(input);
  const idx = state.repos.findIndex((repo) => repo.id === next.id);
  if (idx >= 0) {
    const current = state.repos[idx];
    state.repos[idx] = {
      ...current,
      ...next,
      createdAt: current.createdAt || next.createdAt,
      updatedAt: nowIso()
    };
  } else {
    state.repos.push(next);
  }
  writeRegistry(state);
  return state.repos.find((repo) => repo.id === next.id);
}

function switchActiveRepo(idOrName) {
  const state = readRegistry();
  const repo = getRepoByIdOrName(state, idOrName);
  if (!repo) {
    throw new Error("Requested repo is not registered.");
  }
  state.activeRepoId = repo.id;
  state.repos = state.repos.map((entry) => ({
    ...entry,
    status: entry.id === repo.id ? "active" : entry.status === "active" ? "inactive" : entry.status,
    updatedAt: nowIso()
  }));
  writeRegistry(state);
  return getRepoByIdOrName(state, state.activeRepoId);
}

function listRegisteredRepos() {
  return getRegistrySnapshot();
}

function safeRepoFolderName(remoteUrl, explicitId) {
  if (explicitId) return normalizeRepoId(explicitId);
  const fromRemote = String(remoteUrl || "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean)
    .slice(-1)[0];
  return normalizeRepoId(fromRemote || "repo");
}

function cloneAndRegisterRepo(input = {}) {
  const remoteUrl = String(input.remoteUrl || "").trim();
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/iu.test(remoteUrl)) {
    throw new Error("Only GitHub HTTPS remotes are supported for clone.");
  }
  const repoId = normalizeRepoId(input.id || safeRepoFolderName(remoteUrl));
  const cloneRoot = path.resolve(String(input.cloneParentDir || CLONE_PARENT_DIR));
  const localPath = path.join(cloneRoot, repoId);
  if (fs.existsSync(localPath)) {
    throw new Error("Target clone directory already exists.");
  }
  fs.mkdirSync(cloneRoot, { recursive: true });
  execFileSync("git", ["clone", remoteUrl, localPath], { stdio: "pipe" });
  const repo = registerRepo({
    id: repoId,
    name: String(input.name || repoId),
    remoteUrl,
    localPath,
    defaultBranch: String(input.defaultBranch || "main"),
    status: "inactive"
  });
  return { repo, cloneRoot, localPath };
}

module.exports = {
  REGISTRY_FILE,
  getRegistrySnapshot,
  getActiveRepoOrThrow,
  registerRepo,
  switchActiveRepo,
  listRegisteredRepos,
  cloneAndRegisterRepo
};

