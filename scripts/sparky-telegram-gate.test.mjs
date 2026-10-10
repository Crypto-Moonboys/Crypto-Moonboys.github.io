import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
test("legacy SPARKY public chat is retired without Telegram gate", () => {
  const html = read("sparky.html");
  assert.match(html, /http-equiv="refresh" content="0; url=\/gpt-users\.html"/);
  assert.match(html, /window\.location\.replace\('\/gpt-users\.html'\)/);
  assert.doesNotMatch(html, /sparky-chat\.js|data-sparky-chat|data-sparky-telegram-login|\/public\/npc-chat/);
});
test("SWARMSY PC app is retained, with public GPT Creator Studio action", () => {
  const html = read("swarmsy.html");
  assert.match(html, /https:\/\/github\.com\/Crypto-Moonboys\/SWARMSY-Ai/);
  assert.match(html, /<a\\b(?=[^>]*href="\\/gpt-users\\.html")[^>]*>\\s*<strong>CREATE WITH CHATGPT<\\/strong>/);
  assert.doesNotMatch(html, /href="\/sparky\.html"/);
  assert.doesNotMatch(html, /Telegram-gated public AI bridge/);
});
