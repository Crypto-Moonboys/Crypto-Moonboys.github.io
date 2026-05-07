"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OLLAMA_CHAT_URL,
  callLocalOllama
} = require("../server/hermes/chat-proxy.js");

test("rejects unknown model", async () => {
  const result = await callLocalOllama(
    { model: "bad-model", prompt: "hello" },
    { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Unsupported model/);
});

test("rejects missing prompt", async () => {
  const result = await callLocalOllama(
    { model: "qwen2.5:1.5b", prompt: "   " },
    { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "Prompt is required.");
});

test("targets localhost ollama only", async () => {
  let capturedUrl = "";
  const result = await callLocalOllama(
    {
      model: "qwen2.5:1.5b",
      prompt: "hello",
      ollamaUrl: "https://evil.example.com"
    },
    {
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "ok" } }]
          })
        };
      }
    }
  );

  assert.equal(result.status, 200);
  assert.equal(capturedUrl, OLLAMA_CHAT_URL);
  assert.equal(result.body.reply, "ok");
});

test("returns offline error when ollama is unreachable", async () => {
  const result = await callLocalOllama(
    { model: "qwen2.5:1.5b", prompt: "ping" },
    {
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      }
    }
  );

  assert.equal(result.status, 503);
  assert.match(result.body.error, /offline or unreachable/i);
});
