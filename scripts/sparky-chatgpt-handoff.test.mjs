import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../gpt-users.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../sparky-chatgpt-guide.txt', import.meta.url), 'utf8');
const swarmsy = readFileSync(new URL('../swarmsy.html', import.meta.url), 'utf8');

function simulate() {
  const activityNames = ['start', 'stickers', 'posters', 'walls', 'zines', 'merch', 'character', 'streetart', 'moonboy', 'grow'];
  const routes = activityNames.map(id => ({
    attrs: { 'data-route': id, 'aria-pressed': 'false' },
    handlers: {},
    getAttribute(key) { return this.attrs[key]; },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
  }));
  const elements = Object.fromEntries(['gpt-open-link', 'gpt-prompt-preview', 'gpt-prompt-details', 'gpt-choice', 'gpt-what', 'gpt-copy-status', 'gpt-copy-prompt'].map(id => [id, {
    href: '', value: '', textContent: '', handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    focus() { this.didFocus = true; },
    select() { this.didSelect = true; },
  }]));
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(s => s.includes('setActivity'));
  assert.equal(scripts.length, 1, 'one inline startup script exists');
  const written = [];
  const ctx = {
    document: { querySelectorAll: () => routes, getElementById: id => elements[id] },
    navigator: { clipboard: { writeText: async str => { written.push(str); } } },
    encodeURIComponent,
  };
  new vm.Script(scripts[0], { filename: 'gpt-users.html:inline' }).runInNewContext(ctx);
  return { routes, elements, written, ctx };
}

test('public beginner guide and ten activities stay discoverable', () => {
  assert.match(page, /<h1 id="gpt-users-title">/);
  assert.match(page, /https:\/\/chatgpt\.com\/\?q=/);
  assert.match(page, /sparky-chatgpt-guide\.txt/);
  assert.match(swarmsy, /START WITH CHATGPT/);
  assert.match(guide, /THIS IS A PUBLIC/i);
  assert.match(guide, /STICKERS:/);
  assert.match(guide, /LEGAL WALL \/ MURAL:/);
  assert.match(guide, /MINI ZINE:/);
  assert.match(guide, /MERCH:/);
  assert.match(guide, /Never pass off AI mockups/i);
  for (const id of ['start', 'stickers', 'posters', 'walls', 'zines', 'merch', 'character', 'streetart', 'moonboy', 'grow']) {
    assert.match(page, new RegExp('data-route="' + id + '"'));
  }
});

test('activity changes the prepared ChatGPT handoff with no user input', () => {
  const { routes, elements } = simulate();
  assert.match(decodeURIComponent(elements['gpt-open-link'].href), /MY STARTER: Help me choose/);
  routes.find(r => r.attrs['data-route'] === 'zines').handlers.click();
  assert.equal(routes.find(r => r.attrs['data-route'] === 'zines').attrs['aria-pressed'], 'true');
  assert.equal(routes.find(r => r.attrs['data-route'] === 'start').attrs['aria-pressed'], 'false');
  assert.match(decodeURIComponent(elements['gpt-open-link'].href), /MY STARTER: Folded mini zine/);
  assert.match(elements['gpt-prompt-preview'].value, /Try to read https:\/\/cryptomoonboys\.com\/sparky-chatgpt-guide\.txt/);
  assert.match(elements['gpt-prompt-preview'].value, /if you cannot open the link/i);
  assert.match(elements['gpt-prompt-preview'].value, /permissioned surfaces/i);
});

test('copy action copies the selected prompt and reports success', async () => {
  const { routes, elements, written } = simulate();
  routes.find(r => r.attrs['data-route'] === 'stickers').handlers.click();
  await elements['gpt-copy-prompt'].handlers.click();
  assert.equal(written.length, 1);
  assert.equal(written[0], elements['gpt-prompt-preview'].value);
  assert.match(written[0], /MY STARTER: Sticker design/);
  assert.match(elements['gpt-copy-status'].textContent, /copied/i);
});

test('clipboard fallback selects text for manual copy', async () => {
  const { elements, ctx } = simulate();
  ctx.navigator.clipboard.writeText = async () => { throw Error('blocked'); };
  await elements['gpt-copy-prompt'].handlers.click();
  assert.equal(elements['gpt-prompt-details'].open, true, 'hidden prompt details become visible');
  assert.equal(elements['gpt-prompt-preview'].didSelect, true);
  assert.match(elements['gpt-copy-status'].textContent, /select and copy/i);
});
