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
    repo: el("repoStatus"),
    ops: el("opsStatus"),
    webcrawl: el("webcrawlOutput")
  };

  function setOut(node, value) {
    if (!node) return;
    node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function bindClick(id, handler) {
    const node = el(id);
    if (!node) return;
    node.addEventListener("click", handler);
  }

  function summarizeToolResults(toolResults) {
    const arr = Array.isArray(toolResults) ? toolResults : [];
    return arr.map((item) => ({
      action: item.action,
      repo: item.repoUsed || "",
      path: item.pathUsed || "",
      ok: item.ok === true,
      summary: item.resultSummary || "",
      entries: Array.isArray(item.entries) ? item.entries.slice(0, 8) : [],
      error: item.error || "",
      missingRequirements: item.missingRequirements || []
    }));
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
    return data;
  }

  bindClick("sendChat", async () => {
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

      setOut(out.chat, {
        reply: data.reply,
        mode: data.mode,
        role: data.role,
        lastActionCount: Array.isArray(data.actions) ? data.actions.length : 0
      });
      setOut(out.plan, data.actions || []);
      setOut(out.tools, summarizeToolResults(data.toolResults || []));
      setOut(out.missing, data.missingRequirements || []);
    } catch (error) {
      setOut(out.chat, { error: String(error?.message || error) });
    }
  });

  bindClick("runAction", async () => {
    try {
      const action = JSON.parse(String(el("actionJson").value || "{}").trim());
      const payload = { ...basePayload(), action };
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

  bindClick("showRuntimeRoot", async () => {
    try {
      await showRuntimeRoot();
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  bindClick("listRepos", async () => {
    try {
      setOut(out.repo, await api("/api/hermes/repos"));
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  bindClick("switchRepo", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: { type: "repo/switch", payload: { idOrName: String(el("switchRepoId").value || "").trim() } }
      };
      const data = await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) });
      setOut(out.repo, data);
      await showRuntimeRoot();
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  bindClick("registerRepo", async () => {
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
      setOut(out.repo, await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) }));
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  bindClick("cloneRepo", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: { type: "repo/clone", payload: { remoteUrl: String(el("cloneRepoUrl").value || "").trim() } }
      };
      setOut(out.repo, await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) }));
    } catch (error) {
      setOut(out.repo, { error: String(error?.message || error) });
    }
  });

  bindClick("showPm2Status", async () => {
    try {
      const payload = {
        ...basePayload(),
        action: { type: "command/run", payload: { command: "pm2", args: ["status"] } }
      };
      setOut(out.ops, await api("/api/hermes/action", { method: "POST", body: JSON.stringify(payload) }));
    } catch (error) {
      setOut(out.ops, { error: String(error?.message || error) });
    }
  });

  bindClick("showApprovals", async () => {
    try {
      setOut(out.ops, await api("/api/hermes/approval/list"));
    } catch (error) {
      setOut(out.ops, { error: String(error?.message || error) });
    }
  });

  bindClick("showSwarm", async () => {
    try {
      setOut(out.ops, await api("/api/hermes/swarm"));
    } catch (error) {
      setOut(out.ops, { error: String(error?.message || error) });
    }
  });

  bindClick("showModels", async () => {
    try {
      setOut(out.ops, await api("/api/hermes/models"));
    } catch (error) {
      setOut(out.ops, { error: String(error?.message || error) });
    }
  });

  function currentTopic() {
    return String(el("webcrawlTopic")?.value || "").trim();
  }

  function currentUrl() {
    return String(el("webcrawlUrl")?.value || "").trim();
  }

  function setPrompt(value) {
    const node = el("prompt");
    if (!node) return;
    node.value = String(value || "").trim();
  }

  async function runWebcrawl(pathName, body, generatedPrompt) {
    try {
      if (generatedPrompt) {
        setPrompt(generatedPrompt);
      }
      const payload = { ...basePayload(), ...body };
      const data = await api(pathName, { method: "POST", body: JSON.stringify(payload) });
      setOut(out.webcrawl, data);
      return data;
    } catch (error) {
      setOut(out.webcrawl, { error: String(error?.message || error) });
      return null;
    }
  }

  bindClick("webcrawlFindUpdates", async () => {
    const topic = currentTopic() || "anything";
    await runWebcrawl(
      "/api/hermes/webcrawl/find-updates",
      { topic },
      `Find new updates on ${topic}. Include checked sources, timestamp, what changed, confidence, and failures.`
    );
  });

  bindClick("webcrawlSearch", async () => {
    const topic = currentTopic();
    await runWebcrawl(
      "/api/hermes/webcrawl/search",
      { topic },
      `Search web for ${topic}. Return real sources and no guesses.`
    );
  });

  bindClick("webcrawlFetchUrl", async () => {
    const url = currentUrl();
    await runWebcrawl(
      "/api/hermes/webcrawl/fetch",
      { url },
      `Fetch URL ${url}. Summarize factual findings with source citation.`
    );
  });

  bindClick("webcrawlCrawlSite", async () => {
    const url = currentUrl();
    await runWebcrawl(
      "/api/hermes/webcrawl/crawl",
      { url, maxDepth: 2, maxPages: 12 },
      `Crawl website ${url} with safe limits and summarize new updates.`
    );
  });

  bindClick("webcrawlCheckRss", async () => {
    const url = currentUrl();
    await runWebcrawl(
      "/api/hermes/webcrawl/rss",
      { url },
      `Check RSS feed ${url} and list new items with links and timestamps.`
    );
  });

  bindClick("webcrawlCompare", async () => {
    const topic = currentTopic();
    await runWebcrawl(
      "/api/hermes/webcrawl/compare",
      { topic },
      `Compare ${topic} with last snapshot and report what changed.`
    );
  });

  bindClick("webcrawlSaveTopic", async () => {
    const topic = currentTopic();
    const url = currentUrl();
    await runWebcrawl(
      "/api/hermes/webcrawl/save-topic",
      { topic, url },
      `Save watch topic ${topic} for recurring update checks.`
    );
  });

  bindClick("webcrawlListTopics", async () => {
    try {
      setPrompt("List watch topics for webcrawl agent.");
      const data = await api("/api/hermes/webcrawl/topics");
      setOut(out.webcrawl, data);
    } catch (error) {
      setOut(out.webcrawl, { error: String(error?.message || error) });
    }
  });

  bindClick("webcrawlSummarize", async () => {
    const topic = currentTopic();
    await runWebcrawl(
      "/api/hermes/webcrawl/summarize",
      { topic },
      `Summarize findings for ${topic || "all watch topics"} including latest checks and failures.`
    );
  });

  bindClick("webcrawlClearSession", async () => {
    await runWebcrawl(
      "/api/hermes/webcrawl/clear-session",
      {},
      "Clear webcrawl session history only. Do not delete production or repo files."
    );
  });

  loadModels()
    .then(() => showRuntimeRoot().catch(() => null))
    .catch((error) => setOut(out.chat, { error: String(error?.message || error) }));
})();

