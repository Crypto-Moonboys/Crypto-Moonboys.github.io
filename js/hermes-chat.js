(() => {
  // For VPS/server deployments, leave this empty to use same-origin backend routes.
  // GitHub Pages is static and cannot run Express API routes, so set window.HERMES_API_BASE_URL
  // to a deployed backend origin (for example: "https://api.cryptomoonboys.com").
  const apiBaseUrl = String(window.HERMES_API_BASE_URL || "").trim().replace(/\/+$/u, "");
  const endpoint = `${apiBaseUrl}/api/hermes/chat`;
  const modelsEndpoint = `${apiBaseUrl}/api/hermes/models`;
  const maxHistory = 20;
  const history = [];

  const modelSelect = document.getElementById("model");
  const systemPrompt = document.getElementById("systemPrompt");
  const prompt = document.getElementById("prompt");
  const send = document.getElementById("send");
  const log = document.getElementById("log");
  const errorNode = document.getElementById("error");

  function addMessage(role, content) {
    const item = document.createElement("div");
    item.className = "msg";
    const title = document.createElement("b");
    title.textContent = role;
    const body = document.createElement("div");
    body.textContent = String(content || "");
    item.appendChild(title);
    item.appendChild(body);
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  function setError(message) {
    errorNode.textContent = message ? String(message) : "";
  }

  async function loadModels() {
    const response = await fetch(modelsEndpoint);
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];

    modelSelect.innerHTML = "";
    models.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === data.defaultModel) {
        option.selected = true;
      }
      modelSelect.appendChild(option);
    });
  }

  async function sendPrompt() {
    const message = String(prompt.value || "").trim();
    if (!message) {
      setError("Prompt is required.");
      return;
    }

    setError("");
    send.disabled = true;

    addMessage("You", message);

    const payload = {
      model: modelSelect.value,
      systemPrompt: String(systemPrompt.value || ""),
      prompt: message,
      history: history.slice(-maxHistory),
      mode: "chat"
    };

    history.push({ role: "user", content: message });
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Chat request failed.");
        return;
      }

      const reply = String(data.reply || "").trim();
      history.push({ role: "assistant", content: reply });
      if (history.length > maxHistory) {
        history.splice(0, history.length - maxHistory);
      }
      addMessage("Hermes", reply);
      prompt.value = "";
    } catch (error) {
      setError(`Network error: ${String(error?.message || "Unknown error")}`);
    } finally {
      send.disabled = false;
      prompt.focus();
    }
  }

  send.addEventListener("click", sendPrompt);
  prompt.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      sendPrompt();
    }
  });

  loadModels().catch((error) => {
    setError(`Failed to load models: ${String(error?.message || "Unknown error")}`);
  });
})();
