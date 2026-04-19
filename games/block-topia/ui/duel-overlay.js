function remainingSeconds(deadlineMs) {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return 0;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

function formatHealthLine(state) {
  const challenger = state.challengerName || 'Challenger';
  const defender = state.defenderName || 'Defender';
  const healthA = Math.max(0, Math.round(state.healthA || 0));
  const healthB = Math.max(0, Math.round(state.healthB || 0));
  return `${challenger}:${healthA} · ${defender}:${healthB}`;
}

function normalizeLabel(label) {
  const normalized = String(label || '').toLowerCase();
  return ['common', 'rare', 'epic', 'glitch'].includes(normalized) ? normalized : '';
}

function buildFighterVisual(state, side, fighterConfig = {}, localPlayerId = '') {
  const isPlayerSide = side === 'player';
  const fallback = fighterConfig.placeholders?.fallback || '';
  const defaultAsset = isPlayerSide
    ? fighterConfig.placeholders?.player || fallback
    : fighterConfig.placeholders?.opponent || fallback;
  const name = isPlayerSide
    ? state.challengerName || 'Challenger'
    : state.defenderName || 'Defender';
  const playerId = isPlayerSide ? state.playerA : state.playerB;
  const roleKey = playerId && localPlayerId && playerId === localPlayerId ? 'player' : 'opponent';
  const idOverride = fighterConfig.byPlayerId?.[playerId] || null;
  const nameOverride = fighterConfig.byName?.[name] || null;
  const override = idOverride || nameOverride;
  const label = normalizeLabel(override?.label || fighterConfig.labels?.[roleKey] || '');

  return {
    name,
    fallback,
    asset: override?.asset || defaultAsset || fallback,
    label,
  };
}

export function createDuelOverlay(doc, duelSystem, { fighterConfig = {}, getLocalPlayerId } = {}) {
  const root = doc.createElement('section');
  root.id = 'duel-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="duel-underlay"></div>
    <div class="duel-card" role="dialog" aria-live="polite" aria-label="Signal Duel">
      <header class="duel-header">
        <p class="duel-chip">SIGNAL DUEL</p>
        <button class="duel-close" type="button">×</button>
      </header>
      <div class="duel-fighters" id="duel-fighters">
        <article class="duel-fighter duel-fighter-player">
          <img class="duel-fighter-art" id="duel-fighter-player-art" alt="Player fighter" loading="lazy" decoding="async">
          <p class="duel-fighter-name" id="duel-fighter-player-name">Player</p>
          <p class="duel-fighter-label hidden" id="duel-fighter-player-label"></p>
        </article>
        <article class="duel-fighter duel-fighter-opponent">
          <img class="duel-fighter-art" id="duel-fighter-opponent-art" alt="Opponent fighter" loading="lazy" decoding="async">
          <p class="duel-fighter-name" id="duel-fighter-opponent-name">Opponent</p>
          <p class="duel-fighter-label hidden" id="duel-fighter-opponent-label"></p>
        </article>
      </div>
      <p class="duel-matchup" id="duel-matchup">Awaiting duel</p>
      <p class="duel-round" id="duel-round">Round 0</p>
      <p class="duel-hp" id="duel-hp">A:100 · B:100</p>
      <p class="duel-timer" id="duel-timer"></p>
      <p class="duel-result" id="duel-result"></p>
      <p class="duel-sam" id="duel-sam"></p>
      <div class="duel-actions" id="duel-actions"></div>
      <div class="duel-request-actions" id="duel-request-actions"></div>
    </div>
  `;
  doc.body.appendChild(root);

  const closeBtn = root.querySelector('.duel-close');
  const matchupEl = root.querySelector('#duel-matchup');
  const roundEl = root.querySelector('#duel-round');
  const hpEl = root.querySelector('#duel-hp');
  const timerEl = root.querySelector('#duel-timer');
  const resultEl = root.querySelector('#duel-result');
  const samEl = root.querySelector('#duel-sam');
  const actionsEl = root.querySelector('#duel-actions');
  const requestActionsEl = root.querySelector('#duel-request-actions');
  const fighterPlayerArtEl = root.querySelector('#duel-fighter-player-art');
  const fighterOpponentArtEl = root.querySelector('#duel-fighter-opponent-art');
  const fighterPlayerNameEl = root.querySelector('#duel-fighter-player-name');
  const fighterOpponentNameEl = root.querySelector('#duel-fighter-opponent-name');
  const fighterPlayerLabelEl = root.querySelector('#duel-fighter-player-label');
  const fighterOpponentLabelEl = root.querySelector('#duel-fighter-opponent-label');
  let onAction = null;
  let onAccept = null;

  function applyFighterVisual(side, visual) {
    const isPlayer = side === 'player';
    const artEl = isPlayer ? fighterPlayerArtEl : fighterOpponentArtEl;
    const nameEl = isPlayer ? fighterPlayerNameEl : fighterOpponentNameEl;
    const labelEl = isPlayer ? fighterPlayerLabelEl : fighterOpponentLabelEl;
    if (!artEl || !nameEl || !labelEl) return;

    nameEl.textContent = visual.name;
    labelEl.textContent = visual.label ? visual.label.toUpperCase() : '';
    labelEl.classList.toggle('hidden', !visual.label);

    artEl.onerror = () => {
      if (visual.fallback && artEl.src !== new URL(visual.fallback, window.location.origin).href) {
        artEl.src = visual.fallback;
      }
    };
    artEl.src = visual.asset || visual.fallback;
  }

  function makeActionButton(action) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'duel-action-btn';
    button.textContent = action.toUpperCase();
    button.addEventListener('click', () => onAction?.(action));
    return button;
  }

  const actionButtons = duelSystem.DUEL_ACTIONS.map((action) => makeActionButton(action));
  actionsEl.replaceChildren(...actionButtons);

  closeBtn?.addEventListener('click', () => {
    duelSystem.closeOverlay();
    render();
  });

  function render() {
    const state = duelSystem.getState();
    const visible = ['requested', 'active', 'ended'].includes(state.status);
    root.classList.toggle('hidden', !visible);
    if (!visible) return;

    const localPlayerId = getLocalPlayerId?.() || '';
    const playerVisual = buildFighterVisual(state, 'player', fighterConfig, localPlayerId);
    const opponentVisual = buildFighterVisual(state, 'opponent', fighterConfig, localPlayerId);
    applyFighterVisual('player', playerVisual);
    applyFighterVisual('opponent', opponentVisual);

    matchupEl.textContent = `${state.challengerName || 'Challenger'} vs ${state.defenderName || 'Defender'}`;
    roundEl.textContent = `Round ${state.round || 0}`;
    hpEl.textContent = formatHealthLine(state);
    timerEl.textContent = state.status === 'active'
      ? `Action timer: ${remainingSeconds(state.roundDeadline)}s`
      : '';
    resultEl.textContent = state.requestMessage || state.resultMessage || '';
    samEl.textContent = state.samWarning ? `SAM WARNING: ${state.samWarning}` : '';

    const active = state.status === 'active';
    actionsEl.classList.toggle('hidden', !active);
    for (const button of actionButtons) {
      button.disabled = !active;
    }

    requestActionsEl.replaceChildren();
    if (state.status === 'requested') {
      const acceptBtn = doc.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.className = 'duel-request-btn';
      acceptBtn.textContent = 'ACCEPT DUEL';
      acceptBtn.addEventListener('click', () => onAccept?.(state.duelId));
      requestActionsEl.appendChild(acceptBtn);
    }
  }

  function bindHandlers({ onSubmitAction, onAcceptDuel }) {
    onAction = onSubmitAction;
    onAccept = onAcceptDuel;
  }

  return {
    render,
    bindHandlers,
  };
}
