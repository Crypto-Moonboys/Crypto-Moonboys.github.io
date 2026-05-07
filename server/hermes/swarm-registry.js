"use strict";

const AGENTS = [
  { id: "main_hermes", label: "Main Hermes", capabilities: ["orchestration", "repo_reasoning"] },
  { id: "ui_agent", label: "UI Agent", capabilities: ["frontend", "shell_ui"] },
  { id: "runtime_agent", label: "Runtime Agent", capabilities: ["backend", "debugging"] },
  { id: "test_agent", label: "Test Agent", capabilities: ["validation", "regression"] },
  { id: "deploy_agent", label: "Deploy Agent", capabilities: ["pm2", "nginx", "verification"] },
  { id: "npc_agent", label: "NPC Agent", capabilities: ["npc_data", "npc_config"], restricted: true },
  { id: "watcher_agent", label: "Watcher Agent", capabilities: ["logs", "failures", "healing_proposals"] }
];

function getAgents() {
  return AGENTS;
}

module.exports = { getAgents };
