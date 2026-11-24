import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
test("legacy SPARKY public chat is retired without Telegram gate", () => {
  const html = read("sparky.html");
  assert.match(html, /http-equiv="refresh" content="0; url=\/ai-user\.html"/);
  assert.match(html, /window\.location\.replace\('\/ai-user\.html'\)/);
  assert.doesNotMatch(html, /sparky-chat\.js|data-sparky-chat|data-sparky-telegram-login|\/public\/npc-chat/);
});
test("SWARMSY PC app is retained, with a public AI Creator Studio action", () => {
  const html = read("swarmsy.html");
  assert.match(html, /https:\/\/github\.com\/Crypto-Moonboys\/SWARMSY-Ai/);
  assert.match(html, /<a\b(?=[^>]*href="\/ai-user\.html")[^>]*>\s*<strong>Open AI Creator Studio<\/strong>/);
  assert.doesNotMatch(html, /href="\/sparky\.html"/);
  assert.doesNotMatch(html, /Telegram-gated public AI bridge/);
});


test("site entry points offer Creator Studio and the optional SWARMSY PC app", () => {
  const home = read("index.html");
  const shell = read("js/site-shell.js");
  const swarmsy = read("swarmsy.html");
  const readme = read("README.md");
  // The redesigned homepage exposes Creator Studio as a structured card.
  assert.match(home, /<a\b[^>]*href="\/ai-user\.html"[^>]*>\s*<strong>AI Creator Studio<\/strong>/);
  assert.match(home, /No Moonboy or SWARMSY installation required/);
  assert.doesNotMatch(home, /SWARMSY Ai WILL BLOW YOU UP|SWARMSY helps you name it, shape it, create it and keep YOU moving 24\/7/);
  assert.match(shell, /sparkyAgent\.href = '\/ai-user\.html'/);
  assert.match(shell, /Start a campaign with the SPARKY AI Creator Studio/);
  assert.match(swarmsy, /optional SWARMSY PC beta/);
  assert.match(swarmsy, /Copy a starter prompt into your browser AI\./);
  assert.doesNotMatch(swarmsy, /sparky-chat\.js|data-sparky-chat|\/public\/npc-chat/);
  assert.match(readme, /Retired website chatbot/);
  assert.match(readme, /no automatic account sync/);
});
