"use strict";

(function bootstrapImportedHermesWebUi(global) {
  const adapter = new global.HermesWebUiAdapter();
  const params = new URLSearchParams(global.location.search || "");
  const surface = String(params.get("surface") || "hermes").toLowerCase() === "brain" ? "brain" : "hermes";

  const maxHistory = 24;
  const state = {
    history: [],
    sending: false,
    brainRefreshTimer: null,
  };

  function trimHistory() {
    if (state.history.length <= maxHistory) return;
    state.history = state.history.slice(-maxHistory);
  }

  const $ = (id) => global.document.getElementById(id);

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function setSendDisabled(disabled) {
    const send = $("btnSend");
    if (send) send.disabled = !!disabled;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>\"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function appendMessage(role, text) {
    const empty = $("emptyState");
    if (empty) empty.style.display = "none";
    const container = $("msgInner");
    if (!container) return;
    const row = global.document.createElement("div");
    row.className = "msg-row";
    row.setAttribute("data-role", role);
    row.innerHTML = `
      <div class="msg-head"><span class="msg-role ${role === "user" ? "user" : "assistant"}">${role === "user" ? "You" : (surface === "brain" ? "THE BRAIN" : "Hermes")}</span></div>
      <div class="msg-body">${escapeHtml(text)}</div>
    `;
    container.appendChild(row);
    const messages = $("messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function prepareLayout() {
    setText("appTitlebarTitle", surface === "brain" ? "THE BRAIN" : "Hermes Admin");
    setText("workspacePanelHeading", surface === "brain" ? "Brain Ops" : "Hermes Ops");

    const sidebar = global.document.querySelector(".sidebar");
    if (sidebar) {
      sidebar.innerHTML = `
        <div class="panel-head"><span>${surface === "brain" ? "THE BRAIN" : "HERMES"}</span></div>
        <div class="session-list" id="sessionList"></div>
      `;
    }

    const right = global.document.querySelector(".rightpanel");
    if (right) {
      right.innerHTML = `
        <div class="rightpanel-head">
          <span id="workspacePanelHeading" class="workspace-panel-heading">${surface === "brain" ? "Brain Ops" : "Hermes Ops"}</span>
        </div>
        <div class="file-tree" id="adapterStatusPanel" style="padding:12px;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.45"></div>
        <div id="brainAdvisorBox" style="display:${surface === "brain" ? "grid" : "none"};gap:8px;padding:12px;border-top:1px solid var(--border)">
          <input id="brainAdvisorPrompt" placeholder="Ask THE BRAIN advisor" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text)">
          <button id="brainAdvisorSend" class="send-btn" type="button" style="width:auto;padding:8px 12px">Send Advisor Prompt</button>
        </div>
      `;
    }

    const msg = $("msg");
    if (msg) {
      msg.placeholder = surface === "brain"
        ? "Message Hermes (with THE BRAIN context)…"
        : "Message Hermes…";
    }

    global.document.querySelectorAll(".rail .nav-tab, .sidebar-nav, #panelTasks, #panelKanban, #panelSkills, #panelMemory, #panelWorkspaces, #panelProfiles, #panelTodos, #panelInsights, #panelLogs, #panelSettings").forEach((node) => {
      if (node) node.style.display = "none";
    });
  }

  function formatSettled(label, settled) {
    if (!settled) return `${label}: unavailable`;
    if (settled.status === "fulfilled") {
      return `${label}: ok`;
    }
    return `${label}: ${settled.reason?.message || "failed"}`;
  }

  async function refreshHermesStatus() {
    const panel = $("adapterStatusPanel");
    if (!panel) return;
    panel.textContent = "Loading Hermes status…";
    try {
      const status = await adapter.hermesStatus();
      const swarmCount = status.swarm.status === "fulfilled"
        ? (status.swarm.value?.swarm?.length || status.swarm.value?.agents?.length || 0)
        : "n/a";
      const approvalCount = status.approvals.status === "fulfilled"
        ? (status.approvals.value?.items?.length || status.approvals.value?.approvals?.length || 0)
        : "n/a";
      const queueCount = status.queue.status === "fulfilled"
        ? (status.queue.value?.queue?.length || 0)
        : "n/a";
      panel.textContent = [
        `Hermes swarm agents: ${swarmCount}`,
        `Pending approvals: ${approvalCount}`,
        `Command queue: ${queueCount}`,
        formatSettled("Swarm", status.swarm),
        formatSettled("Approvals", status.approvals),
        formatSettled("Queue", status.queue),
        formatSettled("Repos", status.repos)
      ].join("\n");
    } catch (error) {
      panel.textContent = `Hermes status failed: ${error.message}`;
    }
  }

  async function refreshBrainStatus() {
    const panel = $("adapterStatusPanel");
    if (!panel) return;
    panel.textContent = "Loading THE BRAIN status…";
    try {
      const status = await adapter.brainStatus();
      const online = status.status.status === "fulfilled" ? status.status.value.online : false;
      const model = status.model.status === "fulfilled"
        ? (status.model.value?.model || status.model.value?.activeModel || "unknown")
        : "unknown";
      const npcCount = status.npcs.status === "fulfilled"
        ? (Array.isArray(status.npcs.value?.npcs) ? status.npcs.value.npcs.length : 0)
        : 0;
      const healthSummary = status.health.status === "fulfilled"
        ? JSON.stringify(status.health.value)
        : "health unavailable";
      const logs = status.logs.status === "fulfilled"
        ? (status.logs.value?.logs || []).slice(-8).join("\n")
        : "logs unavailable";
      panel.textContent = [
        `Brain online: ${online ? "yes" : "no"}`,
        `Model: ${model}`,
        `NPC count: ${npcCount}`,
        `Health: ${healthSummary}`,
        "",
        "Logs:",
        logs || "(no logs)"
      ].join("\n");
    } catch (error) {
      panel.textContent = `THE BRAIN status failed: ${error.message}`;
    }
  }

  async function sendChat() {
    if (state.sending) return;
    const input = $("msg");
    const prompt = String(input?.value || "").trim();
    if (!prompt) return;

    state.sending = true;
    setSendDisabled(true);
    if (input) input.value = "";
    appendMessage("user", prompt);

    try {
      trimHistory();
      const payload = await adapter.hermesChat(prompt, state.history);
      const reply = String(payload.reply || payload.response || "No response returned.");
      appendMessage("assistant", reply);
      state.history.push({ role: "user", content: prompt });
      state.history.push({ role: "assistant", content: reply });
      trimHistory();
      if (surface === "hermes") {
        await refreshHermesStatus();
      }
    } catch (error) {
      appendMessage("assistant", `Request failed: ${error.message}`);
    } finally {
      state.sending = false;
      setSendDisabled(false);
      if (input) input.focus();
    }
  }

  async function sendBrainAdvisor() {
    const input = $("brainAdvisorPrompt");
    const prompt = String(input?.value || "").trim();
    if (!prompt) return;
    if (input) input.value = "";
    appendMessage("user", `[Advisor] ${prompt}`);
    try {
      const response = await adapter.brainChat(prompt, "advisor");
      appendMessage("assistant", String(response.reply || response.message || JSON.stringify(response)));
      await refreshBrainStatus();
    } catch (error) {
      appendMessage("assistant", `Brain advisor failed: ${error.message}`);
    }
  }

  function bindEvents() {
    const send = $("btnSend");
    const msg = $("msg");
    const advisor = $("brainAdvisorSend");

    if (send) {
      send.addEventListener("click", sendChat);
    }
    if (msg) {
      setSendDisabled(false);
      msg.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendChat();
        }
      });
      msg.focus();
    }
    if (advisor) {
      advisor.addEventListener("click", sendBrainAdvisor);
    }
  }

  function installNoopHandlers() {
    const noops = [
      "toggleMobileSidebar", "switchPanel", "loadSessions", "loadLogs", "copyLogsAll", "dismissUpdate",
      "applyUpdates", "forceUpdate", "dismissReconnect", "refreshSession", "checkOfflineRecoveryNow",
      "dismissAgentHealthAlert", "respondApproval", "toggleYoloFromApproval", "respondClarify"
    ];
    for (const name of noops) {
      if (typeof global[name] !== "function") {
        global[name] = () => {};
      }
    }
  }

  async function init() {
    installNoopHandlers();
    prepareLayout();
    bindEvents();
    if (surface === "brain") {
      await refreshBrainStatus();
      state.brainRefreshTimer = global.setInterval(refreshBrainStatus, 15000);
    } else {
      await refreshHermesStatus();
    }
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    void init();
  }
})(window);
