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
      ...options,
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json"
      }
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
    getCapabilityMap() {
      return {
        chat: { status: "working", endpoint: "/api/hermes/chat" },
        streaming: { status: "missing", endpoint: "" },
        sessions: { status: "partial", endpoint: "/api/hermes/sessions" },
        workspace: { status: "working", list: "/api/hermes/files/list", read: "/api/hermes/files/read" },
        memory: { status: "working", endpoint: "/api/hermes/memory" },
        skills: { status: "working", endpoint: "/api/hermes/skills" },
        websearch: { status: "working", endpoint: "/api/hermes/webcrawl/search" },
        patchFlow: { status: "working", preview: "/api/hermes/patch/preview", apply: "/api/hermes/patch/apply", rollback: "/api/hermes/patch/rollback" },
        images: { status: "working", endpoint: "/api/hermes/images/generate" },
        jobs: { status: "working", endpoint: "/api/hermes/jobs" },
        tools: { status: "working", endpoint: "/api/hermes/tools" },
        github: { status: "working", endpoint: "/api/hermes/github/repos" }
      };
    }

    getHermesModel() {
      const params = new URLSearchParams(global.location.search || "");
      const queryModel = String(params.get("model") || "").trim();
      if (queryModel) return queryModel;
      const storedModel = String(global.localStorage.getItem("moonboys_hermes_model") || "").trim();
      if (storedModel) return storedModel;
      return "qwen2.5:1.5b";
    }

    async hermesChat(prompt, history = [], options = {}) {
      const payload = await request("/api/hermes/chat", {
        method: "POST",
        body: JSON.stringify({
          model: this.getHermesModel(),
          mode: "chat",
          role: "main_hermes",
          prompt,
          history,
          sessionId: String(options.sessionId || "")
        })
      });
      return payload;
    }

    async listSessions() {
      return request("/api/hermes/sessions");
    }

    async createSession(title = "Hermes session") {
      return request("/api/hermes/sessions", {
        method: "POST",
        body: JSON.stringify({ title })
      });
    }

    async readSession(sessionId) {
      return request(`/api/hermes/sessions/${encodeURIComponent(String(sessionId || ""))}`);
    }

    async appendSessionMessages(sessionId, messages = []) {
      return request(`/api/hermes/sessions/${encodeURIComponent(String(sessionId || ""))}/messages`, {
        method: "POST",
        body: JSON.stringify({ messages })
      });
    }

    async getWebUiCapabilities() {
      return request("/api/hermes/webui/capabilities");
    }

    async listWorkspace(pathValue = ".") {
      return request(`/api/hermes/files/list?path=${encodeURIComponent(String(pathValue || "."))}`);
    }

    async readWorkspaceFile(pathValue) {
      return request(`/api/hermes/files/read?path=${encodeURIComponent(String(pathValue || ""))}`);
    }

    async readMemory() {
      return request("/api/hermes/memory");
    }

    async webSearch(topic) {
      return request("/api/hermes/webcrawl/search", {
        method: "POST",
        body: JSON.stringify({ topic: String(topic || "").trim() })
      });
    }

    async getSkillsStatus() {
      try {
        return await request("/api/hermes/skills");
      } catch (error) {
        return {
          ok: false,
          status: "missing",
          message: String(error?.message || "Hermes skills loader is not implemented on this backend yet.")
        };
      }
    }

    async getTools() {
      return request("/api/hermes/tools");
    }

    async getProfile() {
      return request("/api/hermes/profile");
    }

    async generateImage(prompt, size = "1024x1024") {
      return request("/api/hermes/images/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, size })
      });
    }

    async listJobs() {
      return request("/api/hermes/jobs");
    }

    async listGithubRepos() {
      return request("/api/hermes/github/repos");
    }

    async previewPatch(operations = []) {
      return request("/api/hermes/patch/preview", {
        method: "POST",
        body: JSON.stringify({ operations })
      });
    }

    async hermesStatus() {
      const [swarm, approvals, queue, repos, memory, capabilities] = await Promise.allSettled([
        request("/api/hermes/swarm"),
        request("/api/hermes/approval/list"),
        request("/api/hermes/command/queue"),
        request("/api/hermes/repos"),
        this.readMemory(),
        this.getWebUiCapabilities()
      ]);
      return { swarm, approvals, queue, repos, memory, capabilities };
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
