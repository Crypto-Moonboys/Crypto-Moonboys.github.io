(() => {
  const apiBaseUrl = String(window.HERMES_API_BASE_URL || "").trim().replace(/\/+$/u, "");
  const maxHistory = 20;
  const history = [];

  const el = (id) => document.getElementById(id);
  const out = {
    chat: el("chatLog"),
    plan: el("actionPlan"),
    tools: el("toolResults"),
    missing: el("missingRequirements"),
    action: el("actionOutput"),
    repo: el("repoStatus")
  };

  function setOut(node, value) {
    node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function basePayload() {
    return {
      mode: String(el("mode").value || "chat"),
      role: String(el("role").value || "main_hermes"),
      confirmEdit: el("confirmEdit").checked === true,
      approvalId: String(el("approvalId").value || "").trim(),
      approvalToken: String(el("approvalToken").value || "").trim()
    };
  }

  async function api(path, options = {}) {
    const payload = options.body ? JSON.parse(String(options.body)) : null;
    const token = String(payload?.approvalToken || "").trim();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) {
      headers["x-hermes-edit-token"] = token;
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      body: payload ? JSON.stringify(payload) : undefined
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.reply || `Request failed (${response.status})`);
    }
    return data;
  }

  function clampHistory() {
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
  }

  async function loadModels() {
    const data = await api("/api/hermes/models");
    const modelSelect = el("model");
    modelSelect.innerHTML = "";
    (data.models || []).forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      if (m === data.defaultModel) o.selected = true;
      modelSelect.appendChild(o);
    });
  }

  el("sendChat").addEventListener("click", async () => {
    try {
      const prompt = String(el("prompt").value || "").trim();
      if (!prompt) throw new Error("Prompt is required.");
      const payload = {
        ...basePayload(),
        model: el("model").value,
        systemPrompt: el("systemPrompt").value,
        prompt,
        history: history.slice(-maxHistory)
      };

      history.push({ role: "user", content: prompt });
      clampHistory();

      const data = await api("/api/hermes/chat", { method: "POST", body: JSON.stringify(payload) });

      history.push({ role: "assistant", content: String(data.reply || "") });
      clampHistory();

      setOut(out.chat, { reply: data.reply, mode: data.mode, role: data.role });
      setOut(out.plan, data.actions || []);
      setOut(out.tools, data.toolResults || []);
      setOut(out.missing, data.missingRequirements || []);
    } catch (error) {
      setOut(out.chat, { error: String(error?.message || error) });
    }
  });

  el("runAction").addEventListener("click", async () => {
    try {
      const action = JSON.parse(String(el("actionJson").value || "{}").trim());
      const payload = {
        ...basePayload(),
        action
      };
      const data = await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) });
      setOut(out.action, data);
    } catch (error) {
      setOut(out.action, { error: String(error?.message || error) });
    }
  });

  async function showRuntimeRoot() {
    const data = await api("/api/hermes/runtime/root");
    setOut(out.repo, data);
  }

  el("showRuntimeRoot").addEventListener("click", async () => {
    try {
      await showRuntimeRoot();
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  el("listRepos").addEventListener("click", async () => {
    try {
      const data = await api("/api/hermes/repos");
      setOut(out.repo, data);
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  el("switchRepo").addEventListener("click", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: {
          type: "repo/switch",
          payload: { idOrName: String(el("switchRepoId").value || "").trim() }
        }
      };
      const data = await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) });
      setOut(out.repo, data);
      await showRuntimeRoot();
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  el("registerRepo").addEventListener("click", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: {
          type: "repo/register",
          payload: {
            remoteUrl: String(el("registerRepoUrl").value || "").trim(),
            localPath: String(el("registerRepoPath").value || "").trim(),
            name: "Registered Repo"
          }
        }
      };
      const data = await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) });
      setOut(out.repo, data);
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  el("cloneRepo").addEventListener("click", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: {
          type: "repo/clone",
          payload: {
            remoteUrl: String(el("cloneRepoUrl").value || "").trim()
          }
        }
      };
      const data = await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) });
      setOut(out.repo, data);
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  loadModels()
    .then(() => showRuntimeRoot().catch(() => null))
    .catch((error) => setOut(out.chat, { error: String(error?.message || error) }));
})();
