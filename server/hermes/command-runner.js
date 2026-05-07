"use strict";

const { spawn } = require("node:child_process");
const { MAX_COMMAND_TIMEOUT_MS, REPO_ROOT } = require("./config.js");

const ALLOWED_COMMANDS = [
  ["npm", "install"],
  ["npm", "test"],
  ["node", "--check"],
  ["node", "scripts/"],
  ["npx", "wrangler", "check"],
  ["npx", "wrangler", "deploy", "--dry-run"],
  ["git", "status"],
  ["git", "diff"]
];

const queue = [];
let active = null;

function isAllowed(cmd, args = []) {
  return ALLOWED_COMMANDS.some((rule) => {
    if (rule[0] !== cmd) return false;
    for (let i = 1; i < rule.length; i += 1) {
      if (!String(args[i - 1] || "").startsWith(rule[i])) return false;
    }
    return true;
  });
}

function runProcess(task) {
  return new Promise((resolve) => {
    const child = spawn(task.command, task.args, {
      cwd: REPO_ROOT,
      shell: false,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, Math.min(task.timeoutMs || MAX_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS));

    child.stdout.on("data", (buf) => {
      const chunk = String(buf);
      stdout += chunk;
      task.onOutput?.({ stream: "stdout", chunk });
    });

    child.stderr.on("data", (buf) => {
      const chunk = String(buf);
      stderr += chunk;
      task.onOutput?.({ stream: "stderr", chunk });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: Number(code || 0), stdout, stderr });
    });
  });
}

async function pumpQueue() {
  if (active || queue.length === 0) return;
  active = queue.shift();
  const result = await runProcess(active);
  active.resolve(result);
  active = null;
  pumpQueue();
}

function enqueueCommand(command, args = [], options = {}) {
  const cmd = String(command || "").trim();
  const argv = Array.isArray(args) ? args.map((v) => String(v)) : [];
  if (!isAllowed(cmd, argv)) {
    throw new Error("Command is not allowed by Hermes sandbox.");
  }

  return new Promise((resolve) => {
    queue.push({
      command: cmd,
      args: argv,
      timeoutMs: options.timeoutMs,
      onOutput: options.onOutput,
      resolve
    });
    pumpQueue();
  });
}

function getQueueState() {
  return {
    active: active ? { command: active.command, args: active.args } : null,
    pending: queue.map((item) => ({ command: item.command, args: item.args }))
  };
}

module.exports = {
  enqueueCommand,
  getQueueState,
  ALLOWED_COMMANDS
};
