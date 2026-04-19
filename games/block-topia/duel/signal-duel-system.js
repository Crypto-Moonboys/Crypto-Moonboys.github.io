const ACTIONS = ['fight', 'burn', 'flip', 'run'];
const ENERGY_COST = { burn: 20, fight: 15, flip: 10, run: 5 };
const TURN_REGEN = 10;
const BASE_DECISION_WINDOW_MS = 2500;
const BASE_RUN_DODGE_CHANCE = 0.5;
const BASE_SAM_INTERFERENCE_CHANCE = 0.02;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timingMultiplier(timing = 0.5) {
  if (timing >= 0.45 && timing <= 0.55) return 1.5;
  return 1;
}

function jackpotMultiplier(rng = Math.random) {
  const roll = rng();
  if (roll <= 0.005) return { mult: 0, megaGlitch: true, jackpot: false };
  if (roll <= 0.035) return { mult: 3, megaGlitch: false, jackpot: true };
  return { mult: 1, megaGlitch: false, jackpot: false };
}

function weaponRarityMultiplier(rarity = 'common', rng = Math.random) {
  if (rarity === 'epic') return 1.5;
  if (rarity === 'rare') return 1.2;
  if (rarity === 'glitch') return 0.8 + rng() * 1.4;
  return 1;
}

function baseDamage(level = 1, rarity = 'common', timing = 0.5, energy = 100, rng = Math.random) {
  const rarityMult = weaponRarityMultiplier(rarity, rng);
  const energyMult = clamp(0.75 + (energy / 200), 0.75, 1.5);
  const randomMult = 0.85 + rng() * 0.35;
  return 22 * (1 + level * 0.12) * rarityMult * timingMultiplier(timing) * energyMult * randomMult;
}

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
    energyA: 100,
    energyB: 100,
    actionA: '',
    actionB: '',
    pendingTarget: '',
    requestMessage: '',
    resultMessage: '',
    samWarning: '',
    roundDeadline: 0,
  };
}

function sanitizeModifiers(raw = {}) {
  return {
    timingBonus: clamp(Number(raw.timingBonus) || 0, 0, 0.35),
    dodgeBonus: clamp(Number(raw.dodgeBonus) || 0, 0, 0.35),
    energyRegenBonus: clamp(Number(raw.energyRegenBonus) || 0, 0, 25),
    samResist: clamp(Number(raw.samResist) || 0, 0, 0.9),
  };
}

export function createSignalDuelSystem({ sendChallenge, sendAccept, sendAction } = {}) {
  const state = createInitialState();
  const localModifiers = {
    modifiersA: sanitizeModifiers(),
    modifiersB: sanitizeModifiers(),
  };

  function reset() { Object.assign(state, createInitialState()); }

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
    if (!state.duelId || state.status !== 'active' || !ACTIONS.includes(action)) return false;
    sendAction?.(state.duelId, action);
    return true;
  }

  function submitDuelAction(duelId, action) {
    if (duelId && state.duelId && duelId !== state.duelId) return false;
    return submitAction(action);
  }

  function applyRequested(payload = {}) {
    state.duelId = payload.duelId || state.duelId;
    state.status = 'requested';
    state.playerA = payload.playerA || state.playerA;
    state.playerB = payload.playerB || state.playerB;
    state.challengerName = payload.challengerName || payload.playerAName || state.challengerName;
    state.defenderName = payload.defenderName || payload.playerBName || state.defenderName;
    state.requestMessage = payload.message || `${state.challengerName || 'Player'} challenged you.`;
    state.resultMessage = '';
    state.samWarning = '';
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
    state.energyA = Number.isFinite(payload.energyA) ? payload.energyA : state.energyA;
    state.energyB = Number.isFinite(payload.energyB) ? payload.energyB : state.energyB;
    state.roundDeadline = Number(payload.roundDeadline || (Date.now() + BASE_DECISION_WINDOW_MS));
    state.resultMessage = payload.message || 'Duel started.';
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
    state.energyA = Number.isFinite(payload.energyA) ? payload.energyA : state.energyA;
    state.energyB = Number.isFinite(payload.energyB) ? payload.energyB : state.energyB;
    state.roundDeadline = Number(payload.roundDeadline || state.roundDeadline);
    state.samWarning = payload.samWarning || '';
    state.resultMessage = payload.message || '';
  }

  function applyEnded(payload = {}) {
    if ((payload.duelId || '') && payload.duelId !== state.duelId) return;
    state.status = 'ended';
    state.resultMessage = payload.message || state.resultMessage || 'Duel ended.';
    state.samWarning = payload.samWarning || state.samWarning;
  }

  function resolveLocalTurn({ actionA = 'fight', actionB = 'fight', timingA = 0.5, timingB = 0.5, levelA = 1, levelB = 1, rarityA = 'common', rarityB = 'common' } = {}, rng = Math.random) {
    const modifiersA = sanitizeModifiers(localModifiers.modifiersA);
    const modifiersB = sanitizeModifiers(localModifiers.modifiersB);
    const effectiveTimingA = clamp(Number(timingA) + modifiersA.timingBonus, 0, 1);
    const effectiveTimingB = clamp(Number(timingB) + modifiersB.timingBonus, 0, 1);
    const costA = ENERGY_COST[actionA] || 0;
    const costB = ENERGY_COST[actionB] || 0;
    if (state.energyA < costA || state.energyB < costB) return null;

    let nextAttackBoostA = actionA === 'burn' ? 1.5 : 1;
    let nextAttackBoostB = actionB === 'burn' ? 1.5 : 1;

    if (actionA === 'flip') nextAttackBoostA = rng() < 0.5 ? 1.6 : 0.2;
    if (actionB === 'flip') nextAttackBoostB = rng() < 0.5 ? 1.6 : 0.2;

    const jackpotA = jackpotMultiplier(rng);
    const jackpotB = jackpotMultiplier(rng);
    const dodgeChanceA = clamp(BASE_RUN_DODGE_CHANCE + modifiersA.dodgeBonus, 0, 0.95);
    const dodgeChanceB = clamp(BASE_RUN_DODGE_CHANCE + modifiersB.dodgeBonus, 0, 0.95);
    const dodgeA = actionA === 'run' && rng() < dodgeChanceA;
    const dodgeB = actionB === 'run' && rng() < dodgeChanceB;

    const rawA = baseDamage(levelA, rarityA, effectiveTimingA, state.energyA, rng) * nextAttackBoostA * jackpotA.mult;
    const rawB = baseDamage(levelB, rarityB, effectiveTimingB, state.energyB, rng) * nextAttackBoostB * jackpotB.mult;

    const dealtToB = Math.round(dodgeB ? 0 : rawA);
    const dealtToA = Math.round(dodgeA ? 0 : rawB);

    const regenA = TURN_REGEN + Math.round(modifiersA.energyRegenBonus);
    const regenB = TURN_REGEN + Math.round(modifiersB.energyRegenBonus);
    state.healthA = clamp(state.healthA - dealtToA, 0, 100);
    state.healthB = clamp(state.healthB - dealtToB, 0, 100);
    state.energyA = clamp(state.energyA - costA + regenA, 0, 100);
    state.energyB = clamp(state.energyB - costB + regenB, 0, 100);

    const samChanceA = BASE_SAM_INTERFERENCE_CHANCE * (1 - modifiersA.samResist);
    const samChanceB = BASE_SAM_INTERFERENCE_CHANCE * (1 - modifiersB.samResist);
    const samInterference = rng() < Math.max(samChanceA, samChanceB);
    const megaGlitch = jackpotA.megaGlitch || jackpotB.megaGlitch;

    return {
      dealtToA,
      dealtToB,
      jackpotA: jackpotA.jackpot,
      jackpotB: jackpotB.jackpot,
      megaGlitch,
      samInterference,
      ended: state.healthA <= 0 || state.healthB <= 0,
    };
  }

  function setLocalModifiers({ modifiersA, modifiersB } = {}) {
    if (modifiersA) localModifiers.modifiersA = sanitizeModifiers(modifiersA);
    if (modifiersB) localModifiers.modifiersB = sanitizeModifiers(modifiersB);
  }

  function closeOverlay() {
    if (state.status === 'ended' || state.status === 'requested') {
      reset();
      return;
    }
    state.resultMessage = 'Duel in progress.';
  }

  function getState() { return state; }

  return {
    DUEL_ACTIONS: ACTIONS,
    getState,
    reset,
    challengePlayer,
    acceptDuel,
    submitAction,
    submitDuelAction,
    applyRequested,
    applyStarted,
    applyActionSubmitted,
    applyResolved,
    applyEnded,
    resolveLocalTurn,
    setLocalModifiers,
    closeOverlay,
  };
}
