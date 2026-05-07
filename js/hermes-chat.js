(() => {
  const endpoint = "/api/hermes/chat";
  const modelsEndpoint = "/api/hermes/models";
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
    item.innerHTML = `<b>${role}</b><div>${String(content || "").replace(/</g, "&lt;")}</div>`;
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
      history: history.slice(-maxHistory)
    };

    history.push({ role: "user", content: message });

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
