"use strict";

const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/v1/chat/completions";
const ALLOWED_MODELS = Object.freeze([
  "qwen2.5:0.5b",
  "qwen2.5:1.5b",
  "qwen2.5-coder:7b",
  "phi3:mini",
  "tinyllama:latest"
]);
const DEFAULT_MODEL = "qwen2.5:1.5b";
const MAX_SYSTEM_PROMPT_LENGTH = 1200;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 20;
const OLLAMA_TIMEOUT_MS = 45000;

function clampString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validateModel(model) {
  const normalizedModel = clampString(model || DEFAULT_MODEL, 128);
  if (!ALLOWED_MODELS.includes(normalizedModel)) {
    return { ok: false, error: `Unsupported model. Allowed: ${ALLOWED_MODELS.join(", ")}` };
  }
  return { ok: true, value: normalizedModel };
}

function normalizeHistory(history) {
  const rawHistory = Array.isArray(history) ? history : [];
  const bounded = rawHistory.slice(-MAX_HISTORY_MESSAGES);
  const output = [];

  for (const entry of bounded) {
    const role = String(entry?.role || "").trim();
    if (!["user", "assistant", "system"].includes(role)) {
      continue;
    }

    const content = clampString(entry?.content, MAX_MESSAGE_LENGTH);
    if (!content) {
      continue;
    }

    output.push({ role, content });
  }

  return output;
}

function buildMessages(payload) {
  const systemPrompt = clampString(payload?.systemPrompt || "", MAX_SYSTEM_PROMPT_LENGTH);
  const prompt = clampString(payload?.prompt || "", MAX_MESSAGE_LENGTH);

  if (!prompt) {
    return { ok: false, error: "Prompt is required." };
  }

  const history = normalizeHistory(payload?.history);
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push(...history, { role: "user", content: prompt });
  return { ok: true, value: messages };
}

async function callLocalOllama(payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation is unavailable.");
  }

  const modelCheck = validateModel(payload?.model);
  if (!modelCheck.ok) {
    return { status: 400, body: { error: modelCheck.error } };
  }

  const messagesCheck = buildMessages(payload);
  if (!messagesCheck.ok) {
    return { status: 400, body: { error: messagesCheck.error } };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetchImpl(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelCheck.value,
        messages: messagesCheck.value,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: response.status,
        body: {
          error: "Ollama request failed.",
          detail: String(data?.error || response.statusText || "Unknown upstream error")
        }
      };
    }

    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!content) {
      return {
        status: 502,
        body: { error: "Ollama returned an empty reply." }
      };
    }

    return {
      status: 200,
      body: {
        model: modelCheck.value,
        reply: content
      }
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { status: 504, body: { error: "Ollama request timed out." } };
    }

    return {
      status: 503,
      body: {
        error: "Ollama is offline or unreachable at localhost.",
        detail: String(error?.message || "Unknown connection error")
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  OLLAMA_CHAT_URL,
  callLocalOllama
};
