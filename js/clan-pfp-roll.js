import { indexManifest } from './avatar-builder-core.mjs';
import { downloadPortraitPng, loadAvatarImage, paintAvatarLayers } from './avatar-portrait.mjs';
import { isAnimatedBackground, loadAnimatedBackground } from './avatar-backgrounds/registry.js';

const panel = document.querySelector('#clan-pfp-roll');

if (panel) {
  const root = panel.closest('[data-clan-operation]');
  const operation = root.querySelector('#clan-main-operation');
  const switcher = root.querySelector('[data-pfp-switch]');
  const factionButton = switcher.querySelector('[data-pfp-mode="clan"]');
  const portrait = panel.querySelector('[data-pfp-canvas]');
  const resultText = panel.querySelector('[data-pfp-result]');
  const count = panel.querySelector('[data-pfp-count]');
  const randomize = panel.querySelector('[data-pfp-randomize]');
  const download = panel.querySelector('[data-pfp-download]');
  const connect = panel.querySelector('[data-pfp-connect]');
  const join = panel.querySelector('[data-pfp-join]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const gate = window.MOONBOYS_IDENTITY;
  const readOwner = () => String(gate?.getTelegramId?.() ?? '');
  const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
  const label = { face: 'Face', hat: 'Hat', chains: 'Chain', clothes: 'Clothes' };
  let manifestPromise, images = new Map();
  let state, owner = readOwner(), pending, generation = 0, busy = false, animation, drawPortrait;

  function current(token) {
    return generation === token && owner === readOwner();
  }

  function storageKey() {
    return 'moonboys:clan-pfp-roll:' + owner;
  }

  function remember(value) {
    pending = value;
    try {
      if (value) sessionStorage.setItem(storageKey(), JSON.stringify(value));
      else sessionStorage.removeItem(storageKey());
    } catch {
      // The in-memory request ID still covers retry on this page.
    }
  }

  function restorePending() {
    if (pending) return;
    try { pending = JSON.parse(sessionStorage.getItem(storageKey())); } catch { pending = null; }
  }

  function updateControls() {
    randomize.disabled = !state || (!busy && (!drawPortrait || (!state.rolls_left && !pending)));
    if (busy) randomize.setAttribute('aria-disabled', 'true');
    else randomize.removeAttribute('aria-disabled');
    randomize.textContent = pending && !busy ? 'Retry roll' : 'Randomize';
    download.hidden = !state?.winner;
    download.disabled = busy;
  }

  async function request(route, body) {
    const response = await fetch(`${api}/clan-operations/pfp/${route}`, {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || 'pfp_roll_unavailable'), { data });
    return data;
  }

  async function getManifest() {
    manifestPromise ??= fetch('/data/avatar-builder-manifest.json').then(async response => {
      if (!response.ok) throw new Error('pfp_art_unavailable');
      const manifest = await response.json();
      return { order: manifest.categoryOrder, traits: indexManifest(manifest).traitsById };
    }).catch(error => { manifestPromise = undefined; throw error; });
    return manifestPromise;
  }

  async function loadPfpLayer(trait) {
    if (!trait) throw new Error('pfp_art_unavailable');
    if (!isAnimatedBackground(trait)) return loadAvatarImage(trait);
    const canvas = document.createElement('canvas');
    const makeRenderer = await loadAnimatedBackground(trait.renderer);
    const renderer = makeRenderer(canvas);
    try {
      // The one visible canvas uses a still frame of the original background.
      renderer.start();
    } finally {
      renderer.destroy();
    }
    return canvas;
  }

  async function loadArt(data, token) {
    const { order, traits } = await getManifest();
    if (!current(token)) return null;
    const wanted = [...new Set([
      ...Object.values(data.target), ...data.pools.flatMap(pool => pool.choices),
      ...Object.values(data.result?.stack ?? {}), ...Object.values(data.winner?.stack ?? {}),
    ].filter(Boolean))];
    for (const id of images.keys()) if (!wanted.includes(id)) images.delete(id);
    const cache = images;
    await Promise.all(wanted.map(id => {
      if (!cache.has(id)) cache.set(id, loadPfpLayer(traits.get(id)).catch(error => {
        cache.delete(id);
        throw error;
      }));
      return cache.get(id);
    }));
    if (!current(token)) return null;
    const ready = new Map(await Promise.all(wanted.map(async id => [id, await cache.get(id)])));
    return (canvas, stack) => paintAvatarLayers(canvas, order.map(key => ready.get(stack[key])).filter(Boolean));
  }

  function messages(data) {
    const result = data.result;
    if (!result) return 'Today’s target is on the canvas.';
    const total = result.matched.length;
    const matched = result.matched.map(key => label[key]).join(', ');
    return [total === 3 ? 'Full match' : `${total} of 3 matched`, matched, `+${result.xp} Community XP`]
      .filter(Boolean).join(' · ');
  }

  function showError(error) {
    const message = {
      connect_telegram: 'Connect Telegram to use your daily rolls.',
      join_faction: 'Choose a faction to use your daily rolls.',
      pfp_roll_closed: 'Daily PFP Roll is currently closed.',
      pfp_day_changed: 'A new UTC round is ready.',
      pfp_art_unavailable: 'The portrait artwork could not load. Try again.',
    }[error.message];
    resultText.textContent = message || (pending ? 'Roll interrupted. Retry to recover your result.' : 'Daily PFP Roll is temporarily unavailable.');
    connect.hidden = error.message !== 'connect_telegram';
    join.hidden = error.message !== 'join_faction';
  }

  async function show(data, token) {
    state = data;
    resultText.textContent = messages(data);
    count.textContent = `${data.rolls_left} of ${data.limit} free rolls left · Resets at 00:00 UTC`;
    drawPortrait = undefined;
    const draw = await loadArt(data, token).catch(() => { throw new Error('pfp_art_unavailable'); });
    if (!draw) return;
    draw(portrait, data.result?.stack ?? data.target);
    drawPortrait = draw;
  }

  function animate(data, token) {
    if (reducedMotion.matches || !drawPortrait) return;
    const draw = drawPortrait;
    portrait.classList.add('pfp-rolling');
    animation = window.setInterval(() => {
      if (!current(token)) return;
      const stack = { ...data.target };
      for (const pool of data.pools) stack[pool.category] = pool.choices[Math.floor(Math.random() * pool.choices.length)];
      draw(portrait, stack);
    }, 120);
  }

  async function play(roll = false) {
    if (!api || busy || panel.hidden || (roll && randomize.disabled)) return;
    owner = readOwner();
    const token = generation;
    busy = true;
    connect.hidden = join.hidden = true;
    if (owner) restorePending();
    if (roll && !pending) remember({ id: crypto.randomUUID(), day: state.utc_day });
    updateControls();
    if (roll) {
      resultText.textContent = 'Shuffling portrait…';
      animate(state, token);
    } else resultText.textContent = 'Loading today’s portrait…';
    let reload = false;
    try {
      const auth = gate?.getFreshTelegramAuth
        ? await gate.getFreshTelegramAuth()
        : gate?.getSignedTelegramAuth?.();
      if (!current(token)) return;
      if (!auth || !owner) throw new Error('connect_telegram');
      const data = await request(roll ? 'roll' : 'state', {
        telegram_auth: auth,
        ...(roll ? { request_id: pending.id, utc_day: pending.day } : {}),
      });
      if (!current(token)) return;
      if (pending && (roll || data.latest?.request_id === pending.id)) remember(null);
      window.clearInterval(animation);
      animation = undefined;
      portrait.classList.remove('pfp-rolling');
      await show(data, token);
    } catch (error) {
      if (!current(token)) return;
      if (error.message === 'pfp_daily_limit') {
        remember(null);
        await show(error.data, token).catch(artError => { if (current(token)) showError(artError); });
      } else if (error.message === 'pfp_day_changed' || error.message === 'invalid_request_id') {
        remember(null);
        reload = true;
      } else {
        if (['connect_telegram', 'join_faction'].includes(error.message)) {
          state = drawPortrait = undefined;
          portrait.getContext('2d')?.clearRect(0, 0, portrait.width, portrait.height);
          count.textContent = '';
        }
        if (roll && drawPortrait) drawPortrait(portrait, state.result?.stack ?? state.target);
        showError(error);
      }
    } finally {
      if (current(token)) {
        window.clearInterval(animation);
        animation = undefined;
        portrait.classList.remove('pfp-rolling');
        busy = false;
        updateControls();
        if (reload) play();
      }
    }
  }

  switcher.addEventListener('click', event => {
    const button = event.target.closest('button[data-pfp-mode]');
    if (!button) return;
    const active = button.dataset.pfpMode === 'pfp';
    panel.hidden = !active;
    operation.hidden = active;
    for (const control of switcher.querySelectorAll('button')) control.setAttribute('aria-pressed', String(control === button));
    if (active) play();
  });
  function openLinkedRoll() {
    if (location.hash !== '#clan-pfp-roll' || !panel.hidden || switcher.hidden) return;
    const rollButton = switcher.querySelector('[data-pfp-mode="pfp"]');
    if (!rollButton.hidden && !rollButton.disabled) {
      rollButton.click();
      panel.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', openLinkedRoll);
  randomize.addEventListener('click', () => play(true));
  download.addEventListener('click', async () => {
    if (!state?.winner || busy) return;
    const token = generation;
    const saved = state;
    download.disabled = true;
    try {
      const draw = await loadArt(saved, token);
      if (!draw) return;
      const copy = document.createElement('canvas');
      copy.width = copy.height = 1000;
      draw(copy, saved.winner.stack);
      await downloadPortraitPng(copy, `moonboy-pfp-roll-${saved.utc_day}.png`);
    } catch {
      if (current(token)) resultText.textContent = 'Could not download the winning portrait. Try again.';
    } finally {
      if (current(token)) updateControls();
    }
  });

  function syncOwner(event) {
    if (owner === readOwner()) {
      if (['moonboys:faction-status', 'moonboys:faction-boost'].includes(event.type) && !state) play();
      return;
    }
    owner = readOwner();
    ++generation;
    state = pending = drawPortrait = undefined;
    images = new Map();
    busy = false;
    window.clearInterval(animation);
    animation = undefined;
    portrait.classList.remove('pfp-rolling');
    portrait.getContext('2d')?.clearRect(0, 0, portrait.width, portrait.height);
    resultText.textContent = count.textContent = '';
    updateControls();
    play();
  }

  for (const name of ['moonboys:identity-change', 'moonboys:telegram-session', 'moonboys:faction-status', 'moonboys:faction-boost', 'storage']) {
    window.addEventListener(name, syncOwner);
  }
  function checkDay() {
    if (!document.hidden && state && Date.now() >= Date.parse(state.resets_at)) play();
  }

  if (api) request('state').then(data => {
    if (!data.enabled) return;
    const nameOperation = () => {
      factionButton.textContent = root.dataset.activeOperation === 'graffpunks' ? 'Paint Wall' : 'Faction operation';
    };
    new MutationObserver(nameOperation).observe(root, { attributes: true, attributeFilter: ['data-active-operation'] });
    nameOperation();
    switcher.hidden = false;
    openLinkedRoll();
    document.addEventListener('visibilitychange', checkDay);
    window.setInterval(checkDay, 30_000);
  }).catch(() => {});
}
