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
  ["git", "diff"],
  ["pm2", "status"],
  ["pm2", "list"]
];

const queue = [];
let active = null;

function isAllowed(cmd, args = []) {
  if (args.some((arg) => /(^|[\\/])\.\.([\\/]|$)/u.test(String(arg)))) {
    return false;
  }
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
    let child;
    try {
      child = spawn(task.command, task.args, {
        cwd: REPO_ROOT,
        shell: false,
        env: process.env
      });
    } catch (error) {
      resolve({
        code: 126,
        stdout: "",
        stderr: String(error?.message || error),
        timedOut: false,
        signal: null,
        ok: false
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
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

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: 126,
        stdout,
        stderr: `${stderr}${String(error?.message || error)}`,
        timedOut: false,
        signal: null,
        ok: false
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let normalizedCode = Number.isInteger(code) ? code : 1;
      if (timedOut || signal) {
        normalizedCode = normalizedCode === 0 ? 124 : normalizedCode;
      }
      resolve({
        code: normalizedCode,
        stdout,
        stderr,
        timedOut,
        signal: signal || null,
        ok: normalizedCode === 0 && !timedOut && !signal
      });
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
