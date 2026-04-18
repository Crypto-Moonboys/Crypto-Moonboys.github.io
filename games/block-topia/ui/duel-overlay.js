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

export function createDuelOverlay(doc, duelSystem) {
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
  let onAction = null;
  let onAccept = null;

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
