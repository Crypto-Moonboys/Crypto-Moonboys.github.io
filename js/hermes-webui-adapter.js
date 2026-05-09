"use strict";

(function initHermesWebUiAdapter(global) {
  const BRAIN_TOKEN_KEY = "moonboys_brain_admin_token";

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function jsonOrText(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text().then((text) => ({ text }));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await jsonOrText(response);
    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? (payload.error || payload.message || JSON.stringify(payload))
        : String(payload || `HTTP ${response.status}`);
      throw new Error(message);
    }
    return payload;
  }

  function getBrainApiBase() {
    const params = new URLSearchParams(global.location.search || "");
    const query = normalizeBase(params.get("brainApi"));
    const stored = normalizeBase(global.localStorage.getItem("moonboys_brain_api_base"));
    if (query) return query;
    if (stored) return stored;
    if (global.location.origin && global.location.origin !== "null") {
      return `${global.location.origin}/api/brain`;
    }
    return "";
  }

  function ensureBrainToken() {
    let token = String(global.localStorage.getItem(BRAIN_TOKEN_KEY) || "").trim();
    if (!token) {
      token = String(global.prompt("Enter THE BRAIN admin token") || "").trim();
      if (token) {
        global.localStorage.setItem(BRAIN_TOKEN_KEY, token);
      }
    }
    if (!token) throw new Error("Missing THE BRAIN admin token.");
    return token;
  }

  class HermesWebUiAdapter {
    getHermesModel() {
      const params = new URLSearchParams(global.location.search || "");
      const queryModel = String(params.get("model") || "").trim();
      if (queryModel) return queryModel;
      const storedModel = String(global.localStorage.getItem("moonboys_hermes_model") || "").trim();
      if (storedModel) return storedModel;
      return "qwen2.5:1.5b";
    }

    async hermesChat(prompt, history = []) {
      const payload = await request("/api/hermes/chat", {
        method: "POST",
        body: JSON.stringify({
          model: this.getHermesModel(),
          mode: "chat",
          role: "main_hermes",
          prompt,
          history
        })
      });
      return payload;
    }

    async hermesStatus() {
      const [swarm, approvals, queue, repos] = await Promise.allSettled([
        request("/api/hermes/swarm"),
        request("/api/hermes/approval/list"),
        request("/api/hermes/command/queue"),
        request("/api/hermes/repos"),
      ]);
      return { swarm, approvals, queue, repos };
    }

    async brainStatus() {
      const base = getBrainApiBase();
      if (!base) throw new Error("Brain API base not configured.");
      const token = ensureBrainToken();
      const headers = { "x-brain-admin-token": token };
      const [status, model, npcs, health, logs] = await Promise.allSettled([
        request(`${base}/status`, { headers }),
        request(`${base}/model`, { headers }),
        request(`${base}/npcs`, { headers }),
        request(`${base}/health`, { headers }),
        request(`${base}/logs?lines=80`, { headers }),
      ]);
      return { status, model, npcs, health, logs };
    }

    async brainChat(message, npcId = "advisor") {
      const base = getBrainApiBase();
      if (!base) throw new Error("Brain API base not configured.");
      const token = ensureBrainToken();
      return request(`${base}/chat`, {
        method: "POST",
        headers: { "x-brain-admin-token": token },
        body: JSON.stringify({ npcId, message })
      });
    }
  }

  global.HermesWebUiAdapter = HermesWebUiAdapter;
})(window);
