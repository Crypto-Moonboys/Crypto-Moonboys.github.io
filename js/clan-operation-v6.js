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
  let wall = panel.querySelector('[data-wall-game]');
  if (!wall) {
    // Older cached chambers have the mining controls but no mural mount.
    wall = document.createElement('div');
    wall.hidden = true;
    const panels = document.createElement('ol');
    panels.className = 'clan-strata clan-wall';
    panels.setAttribute('data-wall-panels', '');
    panels.setAttribute('aria-label', 'Mural panels');
    const moves = document.createElement('div');
    moves.className = 'clan-controls';
    moves.setAttribute('data-wall-controls', '');
    moves.setAttribute('aria-label', 'Paint moves');
    wall.append(panels, moves);
    controls.after(wall);
    if (!document.body.dataset.factionPage) {
      panel.querySelector('h2').textContent = 'Clan Operations';
      game.previousElementSibling.textContent = 'Open your clan’s daily operation. The route changes at 00:00 UTC.';
    }
  }
  const wallPanels = wall.querySelector('[data-wall-panels]');
  const wallControls = wall.querySelector('[data-wall-controls]');
  const boardRules = document.createElement('p');
  boardRules.hidden = true;
  wallPanels.before(boardRules);
  const chamberFaction = document.body.dataset.factionPage;
  const collection = panel.querySelector('[data-mine-collection]');
  const collectionLabel = panel.querySelector('[data-operation-collection-label]')
    ?? collection.previousElementSibling?.querySelector('strong');
  const strata = [...panel.querySelectorAll('[data-mine-tier]')];
  const retry = panel.querySelector('[data-mine-refresh]');
  const join = panel.querySelector('[data-mine-join]');
  const connect = panel.querySelector('[data-mine-connect]');
  let owner = readOwner();
  let generation = 0;
  let state;
  let pending = false;
  let retryTimer;

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
    faction_not_in_pilot: 'Your faction does not have a playable operation in this pilot yet.',
    wrong_operation_faction: 'Open Clan Operations from the Battle Chamber to play as your current clan.',
    operation_faction_locked: 'You already started a different clan operation today. A new route opens at 00:00 UTC.',
    refresh_operation: 'The operation moved on. Refresh for your latest saved state.',
    operation_unavailable: 'Clan Operations is temporarily unavailable. If Refresh operation keeps showing this message, reload or reopen the Battle Chamber page.',
  };

  function clearOperation() {
    state = undefined;
    game.after(status);
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
  }

  function showTrail(trail) {
    const stops = trail.locations.map(stop => {
      const tile = document.createElement('li');
      tile.toggleAttribute('data-current-stop', stop.current);
      tile.toggleAttribute('data-surveyed', stop.surveyed);
      const name = document.createElement('strong');
      name.textContent = stop.name;
      tile.append(name);
      const labels = [];
      if (stop.current) labels.push('You are here');
      if (stop.camp) labels.push('Camp');
      if (stop.waypoint) labels.push(stop.surveyed ? 'Surveyed landmark' : 'Landmark to survey');
      if (labels.length) tile.append(' · ' + labels.join(' · '));
      const paths = document.createElement('small');
      paths.textContent = 'Paths: ' + stop.paths.map(({ name, cost }) =>
        cost ? `${name} (${cost} supply)` : name).join(', ');
      tile.append(paths);
      return tile;
    });
    wallPanels.replaceChildren(...stops);
  }

  function showMoves(actions, renown) {
    const moves = actions.map(({ id, label }) => {
      const button = wallControls.querySelector(`[value="${id}"]`) ?? document.createElement('button');
      button.type = 'button';
      button.setAttribute('value', id);
      button.textContent = id === 'bank' ? `${label} · +${renown.toLocaleString()} Renown` : label;
      return button;
    });
    if (moves.length !== wallControls.children.length ||
        moves.some((button, index) => button !== wallControls.children[index])) {
      wallControls.replaceChildren(...moves);
    }
  }

  function showDistrict(district) {
    const points = district.lanes.map(lane => {
      const tile = document.createElement('li');
      tile.toggleAttribute('data-pressure', lane.under_pressure);
      tile.toggleAttribute('data-secured', lane.secured);
      const name = document.createElement('strong');
      name.textContent = lane.name;
      const control = document.createElement('small');
      control.textContent = `Control ${lane.control}/${lane.max_control} · ${lane.secured ? 'Secured' : 'Unsecured'}`;
      if (lane.under_pressure) control.textContent += ' · Next pressure';
      tile.append(name, control);
      return tile;
    });
    wallPanels.replaceChildren(...points);
  }

  function showFork(fork) {
    const tiles = fork.fork ? fork.sections.map((section, index) => ({
      title: `Section ${index + 1}`,
      detail: `${section.cost} stability · ${section.cleared ? 'Cleared' : section.next ? 'Next' : 'Ahead'}`,
      cleared: section.cleared, next: section.next,
    })) : fork.paths.map(path => ({
      title: path.name,
      detail: path.costs.join(' → ') + ' stability · ' + path.find,
    }));
    wallPanels.replaceChildren(...tiles.map(tile => {
      const item = document.createElement('li');
      item.toggleAttribute('data-fork-cleared', !!tile.cleared);
      item.toggleAttribute('data-fork-next', !!tile.next);
      const title = document.createElement('strong');
      title.textContent = tile.title;
      const detail = document.createElement('small');
      detail.textContent = tile.detail;
      item.append(title, detail);
      return item;
    }));
  }

  function forkFeedback(data) {
    if (data.status === 'complete') return 'All three runs banked. A different route opens at 00:00 UTC.';
    const { fork } = data;
    if (!fork.fork) {
      const prefix = data.last_outcome === 'fork_banked' ? 'Fork fragment banked. ' : '';
      return prefix + 'Choose a fork for this run.';
    }
    const name = fork.fork === 'edge' ? 'Edge Fork' : 'Stable Fork';
    if (fork.ready) return `${name} cleared. Bank this run.`;
    if (fork.stalled) return 'Edge Fork stalled. Restart this run on Stable Fork to keep earning Renown.';
    const next = fork.sections.find(section => section.next);
    const recovery = data.last_outcome === 'fork_recovered' ? 'Run restarted. ' : '';
    return `${recovery}${name}. Stability ${fork.stability} of ${fork.max_stability}. Next section costs ${next.cost}.`;
  }

  function showSignal(signal) {
    const channels = signal.candidates.map(channel => {
      const tile = document.createElement('li');
      tile.toggleAttribute('data-signal-locked', signal.locked);
      const name = document.createElement('strong');
      name.textContent = channel.name;
      const traits = document.createElement('small');
      traits.textContent = channel.traits.map(({ label, value }) => `${label} ${value}`).join(' · ');
      tile.append(name, traits);
      return tile;
    });
    wallPanels.replaceChildren(...channels);
  }

  function signalFeedback(data) {
    if (data.status === 'complete') return 'All three sweeps banked. A different relay opens at 00:00 UTC.';
    const { signal } = data;
    if (signal.locked) return `${signal.candidates[0].name} verified. Bank this sweep.`;
    const measured = signal.measurements.map(({ label, value }) => `${label} ${value}`).join(' · ');
    const result = {
      signal_banked: 'Signal Intel banked. ',
      signal_misread: 'Signal jammed. Recalibrate before scanning again. ',
      signal_recalibrated: 'Receiver ready. Finish all three scans before locking. ',
    }[data.last_outcome] ?? '';
    const candidates = signal.candidates.length;
    return `${result}${candidates} matching ${candidates === 1 ? 'channel' : 'channels'}.${measured ? ' ' + measured + '.' : ''}`;
  }

  function districtFeedback(data) {
    if (data.status === 'complete') {
      return 'All three holds banked. A different district opens at 00:00 UTC.';
    }
    const { district } = data;
    const secured = district.lanes.filter(lane => lane.secured).length;
    const result = {
      district_held: 'Timed hold counted. ',
      district_pushed: 'Push resolved. ',
      district_banked: 'Territory Mark banked. ',
    }[data.last_outcome] ?? '';
    if (district.actions[0]?.id === 'bank') return `${result}All three points secured. Bank this hold.`;
    return `${result}${secured} of 3 points secured. Timed hold: ${district.held ? 'complete' : 'needed'}. Next pressure: ${district.next_pressure}.`;
  }

  function trailFeedback(data) {
    if (data.status === 'complete') {
      return 'All three routes banked. A different trail opens at 00:00 UTC.';
    }
    const { position, supplies, objectives, actions, camp } = data.trail;
    const surveyed = objectives.filter(objective => objective.surveyed).length;
    const next = actions[0]?.id === 'bank' ? 'Bank this route.' : `Survey the landmarks and reach ${camp}.`;
    const arrival = {
      trail_surveyed: `Arrived at ${position} and surveyed the landmark.`,
      trail_shortcut: `Took a shortcut to ${position}.`,
      trail_walked: `Arrived at ${position}.`,
      trail_banked: `Route banked. Next leg starts at ${position}.`,
    }[data.last_outcome] ?? `At ${position}.`;
    return `${arrival} ${surveyed} of ${objectives.length} landmarks surveyed. Supplies left: ${supplies}. ${next}`;
  }

  function boardFeedback(data) {
    if (data?.fork) return forkFeedback(data);
    if (data?.signal) return signalFeedback(data);
    if (data?.district) return districtFeedback(data);
    if (data?.trail) return trailFeedback(data);
    return '';
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
    const operation = data.fork ?? data.signal ?? data.district ?? data.trail ?? data.wall ?? data.mine;
    title.textContent = operation.name;
    const progress = data.fork ? `${data.tier} / 3 runs banked`
      : data.signal ? `${data.tier} / 3 sweeps banked`
      : data.district ? `${data.tier} / 3 holds banked`
      : data.trail ? `${data.tier} / 3 routes banked`
      : data.wall ? `${data.tier} / 3 layers banked`
        : data.mine.target ? `${data.ore} / ${data.mine.target} ore` : 'All three tiers banked';
    stats.textContent = [
      progress,
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
    if (collectionLabel) collectionLabel.textContent = data.fork ? 'Fork Fragment collection'
      : data.signal ? 'Signal Intel collection'
      : data.district ? 'Territory Mark collection'
      : data.trail ? 'Route fragment collection' : data.wall ? 'Wall print collection' : 'Specimen collection';
    collection.textContent = data.collection.length
      ? data.collection.map(item => `${item.name} ×${item.collected}`).join(' · ')
      : data.trail ? 'Bank a route to start your collection.' : 'Bank a tier to start your collection.';
    wall.hidden = !!data.mine;
    controls.hidden = !data.mine;
    boardRules.hidden = !data.district && !data.signal && (!data.fork || data.status === 'complete');
    if (data.fork) {
      boardRules.textContent = 'Stable Fork can be crossed on the starting stability. On Edge Fork, brace once to regain up to 2 stability. Use the full brace when stability reaches 2 or less.';
    } else if (data.signal) {
      boardRules.textContent = 'Scan band, pulse, or phase to narrow the channels. Lock after two scans or scan all three to verify first. A missed lock needs recalibration and a full scan.';
    } else if (data.district) {
      boardRules.textContent = 'Push for 2 control. Each push lets the forecast point lose 1. Hold that point when it has control to block the loss and gain 1. Bank after a hold with all three points at 2 or more.';
    }
    if (data.trail || data.district || data.signal || data.fork) {
      if (status.parentNode !== wall) wallControls.before(status);
    } else if (status.parentNode !== panel) {
      game.after(status);
    }
    if (!data.mine) {
      wallPanels.setAttribute('aria-label', data.fork ? 'Fork route board'
        : data.signal ? 'Signal candidates' : data.district ? 'District control points' : data.trail ? 'Expedition stops and paths' : 'Mural panels');
      wallControls.setAttribute('aria-label', data.fork ? 'Fork controls'
        : data.signal ? 'Receiver controls' : data.district ? 'District moves' : data.trail ? 'Travel moves' : 'Paint moves');
      if (data.fork) showFork(data.fork);
      else if (data.signal) showSignal(data.signal);
      else if (data.district) showDistrict(data.district);
      else if (data.trail) showTrail(data.trail);
      else showWall(data);
      showMoves(operation.actions, data.renown_per_tier);
    } else {
      controls.querySelector('[value="deep"]').textContent = data.braced
        ? 'Cut deep · +3 ore'
        : `Cut deep · ${data.mine.collapse_percent}% cave-in risk`;
      controls.querySelector('[value="bank"]').textContent = `Bank · +${data.mine.renown_per_tier.toLocaleString()} Renown`;
    }
    const feedback = boardFeedback(data);
    if (feedback) status.textContent = feedback;
    else if (data.status === 'complete') status.textContent = data.wall
      ? 'Wall complete. A different stencil opens at 00:00 UTC.'
      : 'Mine cleared. A different route opens at 00:00 UTC.';
    else if (data.wall?.actions[0]?.id === 'bank') status.textContent = 'Stencil matched. Bank this layer.';
    else status.textContent = tells[data.last_outcome] || (data.wall
      ? 'Match the three panels to the stencil.' : 'Choose how to reach the next vein.');
    updateControls();
  }

  function updateControls() {
    const mineButtons = controls.querySelectorAll('button');
    for (const button of mineButtons) {
      button.disabled = !state?.mine?.actions.includes(button.getAttribute('value'));
    }
    // A temporary request lock must keep the player's focused button in the tab order.
    for (const button of [retry, ...mineButtons, ...wallControls.querySelectorAll('button')]) {
      if (pending || retryTimer) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  }

  function waitForRetry(seconds) {
    const delay = Number.isInteger(seconds) && seconds >= 1 && seconds <= 60 ? seconds : 60;
    const feedback = boardFeedback(state);
    const prefix = feedback ? feedback + ' ' : '';
    status.textContent = `${prefix}Too many requests. Try again in ${delay} ${delay === 1 ? 'second' : 'seconds'}.`;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      updateControls();
      status.textContent = `${prefix}You can try again now.`;
    }, delay * 1000);
  }

  function showError(code) {
    clearOperation();
    status.textContent = errors[code] || errors.operation_unavailable;
    join.hidden = code !== 'join_faction';
    connect.hidden = code !== 'connect_telegram';
  }

  async function request(action, button) {
    if (pending || retryTimer) return;
    const restoreFocus = button && document.activeElement === button;
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
          operation_ui: 'wall-v1',
          expedition_ui: 'trail-v1',
          district_ui: 'district-v1',
          signal_ui: 'signal-v1',
          fork_ui: 'fork-v1',
          ...(chamberFaction ? { operation_faction: chamberFaction } : {}),
          ...(action ? { action, utc_day: state.utc_day, revision: state.revision, operation_faction: state.faction_id } : {}),
        }),
      });
      const data = response.status === 429 ? await response.json().catch(() => ({})) : await response.json();
      if (currentGeneration !== generation || currentOwner !== readOwner()) return;
      if (response.status === 429) waitForRetry(data?.retry_after_seconds);
      else if (response.ok) showOperation(data);
      else showError(data.error);
    } catch {
      if (currentGeneration === generation && currentOwner === readOwner()) showError('operation_unavailable');
    } finally {
      if (currentGeneration === generation) {
        pending = false;
        updateControls();
        if (restoreFocus && (!document.activeElement || document.activeElement === document.body || document.activeElement === button)) {
          const activeControls = state?.mine ? controls : state ? wallControls : null;
          const available = [...(activeControls?.querySelectorAll('button:not(:disabled)') ?? [])];
          const next = available.find(control => control.getAttribute('value') === action) ?? available[0] ?? retry;
          if (document.activeElement !== next) next.focus();
        }
      }
    }
  }

  function refreshIdentity(event) {
    const nextOwner = readOwner();
    if (nextOwner === owner && event?.type === 'storage') return;
    if (nextOwner === owner && (pending || retryTimer) && event?.type === 'moonboys:telegram-session') return;
    owner = nextOwner;
    generation += 1;
    pending = false;
    window.clearTimeout(retryTimer);
    retryTimer = undefined;
    clearOperation();
    request();
  }

  retry.addEventListener('click', () => request());
  for (const buttons of [controls, wallControls]) {
    buttons.addEventListener('click', event => {
      const button = event.target.closest('button[value]');
      if (button && !button.disabled && state) request(button.getAttribute('value'), button);
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
