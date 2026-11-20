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
  };
  const errors = {
    pilot_closed: 'The Rugpull Miners pilot is currently closed.',
    connect_telegram: 'Connect Telegram to play and save your haul.',
    join_faction: 'Join a faction to enter Clan Operations. Rugpull Miners is the first playable crew.',
    faction_not_in_pilot: 'The current pilot is for Rugpull Miners. More clan operations are in development.',
    refresh_operation: 'The operation moved on. Refresh for your latest saved state.',
    rate_limited: 'Too many requests. Give it a moment, then refresh.',
    operation_unavailable: 'The mine is temporarily unavailable. Refresh to check your saved progress.',
  };

  function clearMine() {
    state = undefined;
    game.hidden = true;
    join.hidden = true;
    connect.hidden = true;
    title.textContent = '';
    stats.textContent = '';
    collection.textContent = '';
    for (const layer of strata) {
      layer.textContent = '';
      layer.removeAttribute('data-banked');
    }
  }

  function showMine(data) {
    state = data;
    game.hidden = false;
    title.textContent = data.mine.name;
    stats.textContent = [
      data.mine.target ? `${data.ore} / ${data.mine.target} ore` : 'All three tiers banked',
      `${data.renown_today.toLocaleString()} Renown today`,
      `${data.renown_total.toLocaleString()} lifetime Renown`,
      `${data.crew_banks.toLocaleString()} crew banks today`,
    ].join(' · ');
    strata.forEach((layer, index) => {
      layer.textContent = data.mine.finds[index];
      layer.toggleAttribute('data-banked', index < data.tier);
      layer.textContent += index < data.tier ? ' — banked' : ` — ${data.mine.targets[index]} ore`;
    });
    collection.textContent = data.collection.length
      ? data.collection.map(item => `${item.name} ×${item.collected}`).join(' · ')
      : 'Bank a tier to start your collection.';
    controls.querySelector('[value="deep"]').textContent = data.braced
      ? 'Cut deep · +3 ore'
      : `Cut deep · ${data.mine.collapse_percent}% cave-in risk`;
    controls.querySelector('[value="bank"]').textContent = `Bank · +${data.mine.renown_per_tier.toLocaleString()} Renown`;
    status.textContent = tells[data.last_outcome] || 'Choose how to reach the next vein.';
    if (data.status === 'complete') status.textContent = 'Mine cleared. A different route opens at 00:00 UTC.';
    updateControls();
  }

  function updateControls() {
    retry.disabled = pending;
    for (const button of controls.querySelectorAll('button')) {
      button.disabled = pending || !state?.mine.actions.includes(button.value);
    }
  }

  function showError(code) {
    clearMine();
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
    if (!action) status.textContent = 'Checking the mine…';
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
          ...(action ? { action, utc_day: state.utc_day, revision: state.revision } : {}),
        }),
      });
      const data = await response.json();
      if (currentGeneration !== generation || currentOwner !== readOwner()) return;
      if (response.ok) showMine(data);
      else showError(data.error);
    } catch {
      if (currentGeneration === generation && currentOwner === readOwner()) showError('operation_unavailable');
    } finally {
      if (currentGeneration === generation) {
        pending = false;
        updateControls();
        if (action && (!document.activeElement || document.activeElement === document.body || document.activeElement.disabled)) {
          (controls.querySelector('button:not(:disabled)') || retry).focus();
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
    clearMine();
    request();
  }

  retry.addEventListener('click', () => request());
  controls.addEventListener('click', event => {
    const button = event.target.closest('button[value]');
    if (button && !button.disabled && state) request(button.value);
  });
  window.addEventListener('moonboys:identity-change', refreshIdentity);
  window.addEventListener('moonboys:telegram-session', refreshIdentity);
  window.addEventListener('moonboys:faction-status', () => {
    if (!state && !pending && readOwner()) request();
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
