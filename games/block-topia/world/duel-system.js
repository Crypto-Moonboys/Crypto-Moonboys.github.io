const DUEL_ACTIONS = ['fight', 'burn', 'flip', 'run'];

function createInitialState() {
  return {
    duelId: '',
    status: 'idle',
    round: 0,
    playerA: '',
    playerB: '',
    challengerName: '',
    defenderName: '',
    healthA: 100,
    healthB: 100,
    actionA: '',
    actionB: '',
    pendingTarget: '',
    requestMessage: '',
    resultMessage: '',
    samWarning: '',
    roundDeadline: 0,
  };
}

export function createDuelSystem({ sendChallenge, sendAccept, sendAction } = {}) {
  const state = createInitialState();

  function reset() {
    Object.assign(state, createInitialState());
  }

  function challengePlayer(targetPlayerId) {
    if (!targetPlayerId || state.status === 'active') return false;
    state.pendingTarget = targetPlayerId;
    sendChallenge?.(targetPlayerId);
    return true;
  }

  function acceptDuel(duelId) {
    if (!duelId) return false;
    sendAccept?.(duelId);
    return true;
  }

  function submitAction(action) {
    if (!state.duelId || state.status !== 'active') return false;
    if (!DUEL_ACTIONS.includes(action)) return false;
    sendAction?.(state.duelId, action);
    return true;
  }

  /** submitDuelAction — spec-required API. Verifies duelId matches active duel then submits. */
  function submitDuelAction(duelId, action) {
    if (duelId && state.duelId && duelId !== state.duelId) return false;
    return submitAction(action);
  }

  /**
   * handleDuelUpdate — spec-required API.
   * Generic dispatcher: routes incoming server payload to the correct apply* method.
   */
  function handleDuelUpdate(payload = {}) {
    const type = String(payload?.type || payload?.status || '').toLowerCase();
    if (type === 'requested') { applyRequested(payload); return; }
    if (type === 'active' || type === 'started') { applyStarted(payload); return; }
    if (type === 'actionsubmitted' || type === 'action_submitted') { applyActionSubmitted(payload); return; }
    if (type === 'resolved') { applyResolved(payload); return; }
    if (type === 'ended') { applyEnded(payload); return; }
  }

  function applyRequested(payload = {}) {
    state.duelId = payload.duelId || state.duelId;
    state.status = 'requested';
    state.playerA = payload.playerA || state.playerA;
    state.playerB = payload.playerB || state.playerB;
    state.challengerName = payload.challengerName || payload.playerAName || state.challengerName;
    state.defenderName = payload.defenderName || payload.playerBName || state.defenderName;
    state.requestMessage = payload.message || `${state.challengerName || 'Player'} issued a duel request.`;
    state.samWarning = '';
    state.resultMessage = '';
  }

  function applyStarted(payload = {}) {
    state.duelId = payload.duelId || state.duelId;
    state.status = 'active';
    state.round = Number(payload.round || 1);
    state.playerA = payload.playerA || state.playerA;
    state.playerB = payload.playerB || state.playerB;
    state.challengerName = payload.playerAName || state.challengerName;
    state.defenderName = payload.playerBName || state.defenderName;
    state.healthA = Number.isFinite(payload.healthA) ? payload.healthA : state.healthA;
    state.healthB = Number.isFinite(payload.healthB) ? payload.healthB : state.healthB;
    state.roundDeadline = Number(payload.roundDeadline || 0);
    state.requestMessage = '';
    state.resultMessage = payload.message || 'Duel link active.';
  }

  function applyActionSubmitted(payload = {}) {
    if ((payload.duelId || '') !== state.duelId) return;
    const side = String(payload.side || '').toLowerCase();
    if (side === 'a') state.actionA = payload.action || state.actionA;
    if (side === 'b') state.actionB = payload.action || state.actionB;
  }

  function applyResolved(payload = {}) {
    if ((payload.duelId || '') !== state.duelId) return;
    state.status = payload.status || 'active';
    state.round = Number(payload.round || state.round);
    state.actionA = payload.actionA || '';
    state.actionB = payload.actionB || '';
    state.healthA = Number.isFinite(payload.healthA) ? payload.healthA : state.healthA;
    state.healthB = Number.isFinite(payload.healthB) ? payload.healthB : state.healthB;
    state.roundDeadline = Number(payload.roundDeadline || state.roundDeadline);
    state.samWarning = payload.samWarning || '';
    state.resultMessage = payload.message || '';
  }

  function applyEnded(payload = {}) {
    if ((payload.duelId || '') && payload.duelId !== state.duelId) return;
    state.status = 'ended';
    state.resultMessage = payload.message || state.resultMessage || 'Duel link closed.';
    state.samWarning = payload.samWarning || state.samWarning;
  }

  function closeOverlay() {
    if (state.status === 'ended' || state.status === 'requested') {
      reset();
      return;
    }
    state.resultMessage = 'Duel link still active.';
  }

  function getState() {
    return state;
  }

  return {
    DUEL_ACTIONS,
    getState,
    reset,
    challengePlayer,
    acceptDuel,
    submitAction,
    submitDuelAction,
    handleDuelUpdate,
    applyRequested,
    applyStarted,
    applyActionSubmitted,
    applyResolved,
    applyEnded,
    closeOverlay,
  };
}
