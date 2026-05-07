"use strict";

function classifyTask(task = "") {
  const text = String(task || "").toLowerCase();
  if (/(ui|css|html|layout|page|frontend)/u.test(text)) return "ui_agent";
  if (/(test|smoke|validation|regression|audit)/u.test(text)) return "test_agent";
  if (/(deploy|pm2|nginx|vps|restart)/u.test(text)) return "deploy_agent";
  if (/(npc|brain|character|lore)/u.test(text)) return "npc_agent";
  if (/(runtime|server|api|backend|debug)/u.test(text)) return "runtime_agent";
  return "main_hermes";
}

function planTask(task, context = {}) {
  const role = classifyTask(task);
  const mode = String(context.mode || "chat");
  return {
    role,
    mode,
    requiresApproval: mode !== "chat",
    summary: `Route task to ${role} in ${mode} mode.`
  };
}

module.exports = {
  classifyTask,
  planTask
};
