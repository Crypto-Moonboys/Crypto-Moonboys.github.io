const panel = document.querySelector('[data-clan-operation]');

if (panel) {
  const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
  const gate = window.MOONBOYS_IDENTITY;
  const readOwner = () => String(gate?.getTelegramId?.() ?? '');
  const status = panel.querySelector('[role="status"]');
  const game = panel.querySelector('[data-mine-game]');
  const title = panel.querySelector('[data-mine-name]');
  const stats = panel.querySelector('[data-mine-stats]');
  const controls = panel.querySelector('[data-mine-controls]');
  const wall = panel.querySelector('[data-wall-game]');
  const wallPanels = panel.querySelector('[data-wall-panels]');
  const wallControls = panel.querySelector('[data-wall-controls]');
  const collectionLabel = panel.querySelector('[data-operation-collection-label]');
  const chamberFaction = document.body.dataset.factionPage;
  const collection = panel.querySelector('[data-mine-collection]');
  const strata = [...panel.querySelectorAll('[data-mine-tier]')];
  const retry = panel.querySelector('[data-mine-refresh]');
  const join = panel.querySelector('[data-mine-join]');
  const connect = panel.querySelector('[data-mine-connect]');
  let owner = readOwner();
  let generation = 0;
  let state;
  let pending = false;

  const tells = {
    safe_ore: 'One ore from the surface seam.',
    shaft_braced: 'Supports in place. Your next deep cut is safe.',
    deep_ore: 'You struck a deep seam and pulled three ore.',
    cave_in: 'Cave-in. You lost up to two loose ore. Clear the shaft to keep digging.',
    recovered: 'Shaft cleared and braced. The deep seam is safe to cut.',
    tier_banked: 'Tier banked. Your Renown and specimen are saved.',
    panel_painted: 'Panel repainted.',
    combo_painted: 'Combo spray hit two panels.',
    layer_banked: 'Layer banked. Your Renown and wall print are saved.',
  };
  const errors = {
    pilot_closed: 'Clan Operations is currently closed.',
    connect_telegram: 'Connect Telegram to play and save your haul.',
    join_faction: 'Join a faction to enter Clan Operations.',
    faction_not_in_pilot: 'The current pilot is for Rugpull Miners and GraffPUNKS.',
    wrong_operation_faction: 'Open Clan Operations from the Battle Chamber to play as your current clan.',
    operation_faction_locked: 'You already started a different clan operation today. A new route opens at 00:00 UTC.',
    refresh_operation: 'The operation moved on. Refresh for your latest saved state.',
    rate_limited: 'Too many requests. Give it a moment, then refresh.',
    operation_unavailable: 'Clan Operations is temporarily unavailable. Refresh to check your saved progress.',
  };

  function clearOperation() {
    state = undefined;
    game.hidden = true;
    join.hidden = true;
    connect.hidden = true;
    title.textContent = '';
    stats.textContent = '';
    collection.textContent = '';
    wallPanels.replaceChildren();
    wallControls.replaceChildren();
    delete panel.dataset.activeOperation;
    for (const layer of strata) {
      layer.textContent = '';
      layer.removeAttribute('data-banked');
    }
  }

  function showWall(data) {
    const tiles = data.wall.panels.map(({ name, shade, paint, target, matched }) => {
      const tile = document.createElement('li');
      tile.dataset.shade = shade;
      tile.toggleAttribute('data-matched', matched);
      tile.textContent = `${name}: ${paint} · ${matched ? 'Matched' : 'Target: ' + target}`;
      return tile;
    });
    wallPanels.replaceChildren(...tiles);
    const moves = data.wall.actions.map(({ id, label }) => {
      const button = wallControls.querySelector(`[value="${id}"]`) ?? document.createElement('button');
      button.type = 'button';
      button.setAttribute('value', id);
      button.textContent = id === 'bank' ? `${label} · +${data.renown_per_tier.toLocaleString()} Renown` : label;
      return button;
    });
    if (moves.length !== wallControls.children.length ||
        moves.some((button, index) => button !== wallControls.children[index])) {
      wallControls.replaceChildren(...moves);
    }
  }

  function showOperation(data) {
    if (chamberFaction && data.faction_id !== chamberFaction) {
      showError('wrong_operation_faction');
      return;
    }
    state = data;
    game.hidden = false;
    join.hidden = true;
    connect.hidden = true;
    panel.dataset.activeOperation = data.faction_id;
    const operation = data.wall ?? data.mine;
    title.textContent = operation.name;
    stats.textContent = [
      data.wall ? `${data.tier} / 3 layers banked`
        : data.mine.target ? `${data.ore} / ${data.mine.target} ore` : 'All three tiers banked',
      `${data.renown_today.toLocaleString()} Renown today`,
      `${data.renown_total.toLocaleString()} lifetime clan Renown`,
      `${data.crew_banks.toLocaleString()} crew banks today`,
    ].join(' · ');
    strata.forEach((layer, index) => {
      layer.textContent = operation.finds[index];
      layer.toggleAttribute('data-banked', index < data.tier);
      if (index < data.tier) layer.textContent += ' — banked';
      else if (data.mine) layer.textContent += ` — ${data.mine.targets[index]} ore`;
    });
    collectionLabel.textContent = data.wall ? 'Wall print collection' : 'Specimen collection';
    collection.textContent = data.collection.length
      ? data.collection.map(item => `${item.name} ×${item.collected}`).join(' · ')
      : 'Bank a tier to start your collection.';
    wall.hidden = !data.wall;
    controls.hidden = !data.mine;
    if (data.wall) {
      showWall(data);
    } else {
      controls.querySelector('[value="deep"]').textContent = data.braced
        ? 'Cut deep · +3 ore'
        : `Cut deep · ${data.mine.collapse_percent}% cave-in risk`;
      controls.querySelector('[value="bank"]').textContent = `Bank · +${data.mine.renown_per_tier.toLocaleString()} Renown`;
    }
    status.textContent = tells[data.last_outcome] || (data.wall ? 'Match the three panels to the stencil.' : 'Choose how to reach the next vein.');
    if (data.wall?.actions[0]?.id === 'bank') status.textContent = 'Stencil matched. Bank this layer.';
    if (data.status === 'complete') status.textContent = data.wall
      ? 'Wall complete. A different stencil opens at 00:00 UTC.'
      : 'Mine cleared. A different route opens at 00:00 UTC.';
    updateControls();
  }

  function updateControls() {
    retry.disabled = pending;
    for (const button of controls.querySelectorAll('button')) {
      button.disabled = pending || !state?.mine?.actions.includes(button.getAttribute('value'));
    }
    for (const button of wallControls.querySelectorAll('button')) button.disabled = pending;
  }

  function showError(code) {
    clearOperation();
    status.textContent = errors[code] || errors.operation_unavailable;
    join.hidden = code !== 'join_faction';
    connect.hidden = code !== 'connect_telegram';
  }

  async function request(action) {
    if (pending) return;
    const currentGeneration = generation;
    const currentOwner = owner;
    if (!api) return showError('operation_unavailable');
    pending = true;
    updateControls();
    if (!action) status.textContent = 'Checking clan operation…';
    try {
      const auth = gate?.getFreshTelegramAuth
        ? await gate.getFreshTelegramAuth()
        : gate?.getSignedTelegramAuth?.();
      if (currentGeneration !== generation || currentOwner !== readOwner()) return;
      if (!auth) {
        const response = await fetch(`${api}/clan-operations/state`, { signal: AbortSignal.timeout(12_000) });
        if (currentGeneration !== generation || currentOwner !== readOwner()) return;
        if (!response.ok) throw new Error('status unavailable');
        const info = await response.json();
        if (currentGeneration === generation && currentOwner === readOwner()) {
          showError(info.enabled ? 'connect_telegram' : 'pilot_closed');
        }
        return;
      }
      const response = await fetch(`${api}/clan-operations/${action ? 'move' : 'state'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          telegram_auth: auth,
          ...(chamberFaction ? { operation_faction: chamberFaction } : {}),
          ...(action ? { action, utc_day: state.utc_day, revision: state.revision, operation_faction: state.faction_id } : {}),
        }),
      });
      const data = await response.json();
      if (currentGeneration !== generation || currentOwner !== readOwner()) return;
      if (response.ok) showOperation(data);
      else showError(data.error);
    } catch {
      if (currentGeneration === generation && currentOwner === readOwner()) showError('operation_unavailable');
    } finally {
      if (currentGeneration === generation) {
        pending = false;
        updateControls();
        if (action && (!document.activeElement || document.activeElement === document.body || document.activeElement.disabled)) {
          const activeControls = state?.wall ? wallControls : controls;
          (activeControls.querySelector('button:not(:disabled)') || retry).focus();
        }
      }
    }
  }

  function refreshIdentity(event) {
    const nextOwner = readOwner();
    if (nextOwner === owner && event?.type === 'storage') return;
    if (nextOwner === owner && pending && event?.type === 'moonboys:telegram-session') return;
    owner = nextOwner;
    generation += 1;
    pending = false;
    clearOperation();
    request();
  }

  retry.addEventListener('click', () => request());
  for (const buttons of [controls, wallControls]) {
    buttons.addEventListener('click', event => {
      const button = event.target.closest('button[value]');
      if (button && !button.disabled && state) request(button.getAttribute('value'));
    });
  }
  window.addEventListener('moonboys:identity-change', refreshIdentity);
  window.addEventListener('moonboys:telegram-session', refreshIdentity);
  window.addEventListener('moonboys:faction-status', event => {
    if (state && event.detail?.faction && event.detail.faction !== state.faction_id) refreshIdentity(event);
    else if (!state && !pending && readOwner()) request();
  });
  window.addEventListener('moonboys:faction-boost', event => {
    if (event.detail?.source === 'join') refreshIdentity(event);
  });
  window.addEventListener('storage', refreshIdentity);
  function checkDay() {
    if (state && Date.now() >= Date.parse(state.resets_at)) request();
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDay();
  });
  window.setInterval(checkDay, 30_000);
  request();
}
