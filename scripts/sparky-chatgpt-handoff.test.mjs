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

test('every activity selects exactly one route and launches its expected ChatGPT starter', () => {
  // Independent expectations: do not derive the expected starter from the page's
  // JavaScript activities table, or a broken route could pass by agreeing with itself.
  const expected = [
    { id: "start", name: "Help me choose", goalStart: "I have no idea yet. Choose a simple creative activity for me" },
    { id: "stickers", name: "Sticker design", goalStart: "Help me make my first original sticker design." },
    { id: "posters", name: "Poster design", goalStart: "Help me design one original poster" },
    { id: "walls", name: "Permitted mural", goalStart: "Help me plan my first legal mural or wall-art project" },
    { id: "zines", name: "Folded mini zine", goalStart: "Help me make a one-sheet A4 folded mini zine." },
    { id: "merch", name: "Merch design", goalStart: "Help me put one original design on a T-shirt" },
    { id: "character", name: "Mascot and character", goalStart: "Help me invent an original recognisable mascot or character" },
    { id: "streetart", name: "Street-art design", goalStart: "Help me make a bold original graffiti-lettering or stencil-inspired artwork" },
    { id: "moonboy", name: "Moonboy and PFP", goalStart: "Help me develop a Moonboy or PFP" },
    { id: "grow", name: "Grow a project", goalStart: "Help me share or sell a creative thing I have genuinely made." },
  ];
  const { routes, elements } = simulate();
  assert.equal(routes.length, expected.length, 'exactly ten activity buttons');

  // Verify the initial default AND click every route, including going back to start.
  for (const activity of expected) {
    const button = routes.find(route => route.attrs['data-route'] === activity.id);
    assert.ok(button, `missing button for ${activity.id}`);
    assert.equal(typeof button.handlers.click, 'function', `click is not wired for ${activity.id}`);
    button.handlers.click();

    const pressed = routes.filter(route => route.attrs['aria-pressed'] === 'true');
    assert.equal(pressed.length, 1, `exactly one activity must be selected for ${activity.id}`);
    assert.equal(pressed[0], button, `wrong selected activity for ${activity.id}`);

    const launch = new URL(elements['gpt-open-link'].href);
    assert.equal(launch.origin, 'https://chatgpt.com', `wrong ChatGPT host for ${activity.id}`);
    assert.equal(launch.pathname, '/', `wrong ChatGPT path for ${activity.id}`);
    assert.equal([...launch.searchParams.keys()].join(','), 'q', `unexpected launch parameters for ${activity.id}`);

    const prompt = launch.searchParams.get('q');
    assert.ok(prompt, `ChatGPT starter is empty for ${activity.id}`);
    assert.ok(prompt.includes(`MY STARTER: ${activity.name}. ${activity.goalStart}`),
      `incorrect starter or activity instructions for ${activity.id}`);
    assert.equal(elements['gpt-prompt-preview'].value, prompt,
      `visible copy fallback differs from ChatGPT starter for ${activity.id}`);
    assert.equal(elements['gpt-choice'].textContent, `Selected: ${activity.name}`,
      `activity label is wrong for ${activity.id}`);
    assert.match(prompt, /Try to read https:\/\/cryptomoonboys\.com\/sparky-chatgpt-guide\.txt/,
      `public guide missing from ${activity.id}`);
    assert.match(prompt, /if you cannot open the link/i,
      `offline guide fallback missing from ${activity.id}`);
    assert.match(prompt, /permissioned surfaces/i,
      `permission constraint missing from ${activity.id}`);
  }
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
