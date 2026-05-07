(() => {
  const apiBaseUrl = String(window.HERMES_API_BASE_URL || "").trim().replace(/\/+$/u, "");
  const maxHistory = 20;
  const history = [];

  const el = (id) => document.getElementById(id);
  const out = {
    chat: el("chatLog"),
    repo: el("repoOutput"),
    patch: el("patchOutput"),
    cmd: el("cmdOutput"),
    memory: el("memoryOutput"),
    git: el("gitOutput")
  };

  function setOut(node, value) {
    node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
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
      const mode = String(el("mode").value || "chat");
      const payload = {
        model: el("model").value,
        systemPrompt: el("systemPrompt").value,
        prompt,
        history: history.slice(-maxHistory),
        mode,
        confirmEdit: mode !== "chat"
      };
      history.push({ role: "user", content: prompt });
      clampHistory();
      const data = await api("/api/hermes/chat", { method: "POST", body: JSON.stringify(payload) });
      history.push({ role: "assistant", content: data.reply || "" });
      clampHistory();
      setOut(out.chat, { prompt, reply: data.reply, model: data.model, mode });
      el("prompt").value = "";
    } catch (error) {
      setOut(out.chat, { error: String(error.message || error) });
    }
  });

  el("planTask").addEventListener("click", async () => {
    try {
      const data = await api("/api/hermes/task/plan", {
        method: "POST",
        body: JSON.stringify({ task: el("taskInput").value, mode: el("mode").value })
      });
      setOut(out.chat, data);
    } catch (error) {
      setOut(out.chat, { error: String(error.message || error) });
    }
  });

  el("rebuildIndex").addEventListener("click", async () => {
    try { setOut(out.repo, await api("/api/hermes/index/rebuild", { method: "POST" })); }
    catch (error) { setOut(out.repo, { error: String(error.message || error) }); }
  });

  el("runSearch").addEventListener("click", async () => {
    try { setOut(out.repo, await api(`/api/hermes/index/search?q=${encodeURIComponent(el("searchQuery").value)}`)); }
    catch (error) { setOut(out.repo, { error: String(error.message || error) }); }
  });

  el("listDir").addEventListener("click", async () => {
    try { setOut(out.repo, await api(`/api/hermes/files/list?path=${encodeURIComponent(el("dirPath").value)}`)); }
    catch (error) { setOut(out.repo, { error: String(error.message || error) }); }
  });

  el("readFileBtn").addEventListener("click", async () => {
    try { setOut(out.repo, await api(`/api/hermes/files/read?path=${encodeURIComponent(el("readPath").value)}`)); }
    catch (error) { setOut(out.repo, { error: String(error.message || error) }); }
  });

  el("gitStatus").addEventListener("click", async () => {
    try { setOut(out.repo, await api("/api/hermes/git/status")); }
    catch (error) { setOut(out.repo, { error: String(error.message || error) }); }
  });

  function parseJsonInput(id) {
    return JSON.parse(String(el(id).value || "").trim() || "null");
  }

  el("previewPatch").addEventListener("click", async () => {
    try {
      const operations = parseJsonInput("patchJson") || [];
      setOut(out.patch, await api("/api/hermes/patch/preview", { method: "POST", body: JSON.stringify({ operations }) }));
    } catch (error) { setOut(out.patch, { error: String(error.message || error) }); }
  });

  el("applyPatch").addEventListener("click", async () => {
    try {
      const operations = parseJsonInput("patchJson") || [];
      const payload = { operations, mode: el("mode").value, role: "main_hermes" };
      const data = await api("/api/hermes/patch/apply", { method: "POST", body: JSON.stringify(payload) });
      if (data.result?.rollbackId) {
        el("rollbackId").value = data.result.rollbackId;
      }
      setOut(out.patch, data);
    } catch (error) { setOut(out.patch, { error: String(error.message || error) }); }
  });

  el("rollbackPatch").addEventListener("click", async () => {
    try {
      setOut(out.patch, await api("/api/hermes/patch/rollback", {
        method: "POST",
        body: JSON.stringify({ rollbackId: el("rollbackId").value, mode: el("mode").value })
      }));
    } catch (error) { setOut(out.patch, { error: String(error.message || error) }); }
  });

  el("createApproval").addEventListener("click", async () => {
    try {
      setOut(out.patch, await api("/api/hermes/approval/create", {
        method: "POST",
        body: JSON.stringify({ title: "Manual approval", details: "Review proposed operations" })
      }));
    } catch (error) { setOut(out.patch, { error: String(error.message || error) }); }
  });

  el("listApprovals").addEventListener("click", async () => {
    try { setOut(out.patch, await api("/api/hermes/approval/list")); }
    catch (error) { setOut(out.patch, { error: String(error.message || error) }); }
  });

  el("runCmd").addEventListener("click", async () => {
    try {
      const args = parseJsonInput("cmdArgs") || [];
      setOut(out.cmd, await api("/api/hermes/command/run", {
        method: "POST",
        body: JSON.stringify({ command: el("cmd").value, args })
      }));
    } catch (error) { setOut(out.cmd, { error: String(error.message || error) }); }
  });

  el("queueState").addEventListener("click", async () => {
    try { setOut(out.cmd, await api("/api/hermes/command/queue")); }
    catch (error) { setOut(out.cmd, { error: String(error.message || error) }); }
  });

  el("swarmView").addEventListener("click", async () => {
    try { setOut(out.memory, await api("/api/hermes/swarm")); }
    catch (error) { setOut(out.memory, { error: String(error.message || error) }); }
  });

  el("loadMemory").addEventListener("click", async () => {
    try { setOut(out.memory, await api("/api/hermes/memory")); }
    catch (error) { setOut(out.memory, { error: String(error.message || error) }); }
  });

  el("mergeMemory").addEventListener("click", async () => {
    try {
      const patch = parseJsonInput("memoryPatch") || {};
      setOut(out.memory, await api("/api/hermes/memory/merge", { method: "POST", body: JSON.stringify({ patch }) }));
    } catch (error) { setOut(out.memory, { error: String(error.message || error) }); }
  });

  el("createBranch").addEventListener("click", async () => {
    try { setOut(out.git, await api("/api/hermes/git/branch", { method: "POST", body: JSON.stringify({ name: el("branchName").value }) })); }
    catch (error) { setOut(out.git, { error: String(error.message || error) }); }
  });

  el("gitDiff").addEventListener("click", async () => {
    try { setOut(out.git, await api("/api/hermes/git/diff")); }
    catch (error) { setOut(out.git, { error: String(error.message || error) }); }
  });

  el("gitPrMeta").addEventListener("click", async () => {
    try { setOut(out.git, await api("/api/hermes/git/pr-metadata")); }
    catch (error) { setOut(out.git, { error: String(error.message || error) }); }
  });

  el("gitCommit").addEventListener("click", async () => {
    try {
      setOut(out.git, await api("/api/hermes/git/commit", {
        method: "POST",
        body: JSON.stringify({ message: el("commitMsg").value, mode: el("mode").value })
      }));
    } catch (error) { setOut(out.git, { error: String(error.message || error) }); }
  });

  el("gitPush").addEventListener("click", async () => {
    try { setOut(out.git, await api("/api/hermes/git/push", { method: "POST", body: JSON.stringify({}) })); }
    catch (error) { setOut(out.git, { error: String(error.message || error) }); }
  });

  loadModels().catch((error) => setOut(out.chat, { error: String(error.message || error) }));
})();
