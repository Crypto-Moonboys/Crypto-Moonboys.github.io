const REQUEST_TIMEOUT_MS = 15000;
const ACTION_WINDOW_MS = 9000;
const STARTING_HEALTH = 100;
const VALID_ACTIONS = new Set(['fight', 'burn', 'flip', 'run']);
const FLIP_DAMAGE_BASE = 18;
const FLIP_DAMAGE_PENALTY = -10;
const FLIP_DAMAGE_BONUS = 14;
const RUN_DAMAGE_MULTIPLIER = 0.35;
const SAM_DISTORTION_CHANCE = 0.16;

function randomId() {
  return `duel-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function damageFor(action) {
  if (action === 'burn') return 24;
  if (action === 'flip') return FLIP_DAMAGE_BASE + (Math.random() < 0.5 ? FLIP_DAMAGE_PENALTY : FLIP_DAMAGE_BONUS);
  if (action === 'run') return 4;
  return 16;
}

function resolveRound(duel, samPhase = 0) {
  const resolvedRound = duel.round;
  const actionA = duel.actionA || 'run';
  const actionB = duel.actionB || 'run';
  let damageToA = damageFor(actionB);
  let damageToB = damageFor(actionA);
  let samWarning = '';

  if (actionA === 'run') damageToA = Math.round(damageToA * RUN_DAMAGE_MULTIPLIER);
  if (actionB === 'run') damageToB = Math.round(damageToB * RUN_DAMAGE_MULTIPLIER);

  if (actionA === 'fight' && actionB === 'burn') damageToB += 6;
  if (actionB === 'fight' && actionA === 'burn') damageToA += 6;
  if (actionA === 'flip' && Math.random() < 0.35) damageToB += 10;
  if (actionB === 'flip' && Math.random() < 0.35) damageToA += 10;

  if (Math.random() < SAM_DISTORTION_CHANCE) {
    const distortion = Math.max(0, Number(samPhase) || 0);
    if (distortion > 0) {
      if (Math.random() < 0.5) {
        damageToA += distortion * 2;
        samWarning = `Action distortion spike (+${distortion * 2} to ${duel.playerAName})`;
      } else {
        damageToB += distortion * 2;
        samWarning = `Action distortion spike (+${distortion * 2} to ${duel.playerBName})`;
      }
    }
  }

  duel.healthA = clamp(duel.healthA - damageToA, 0, STARTING_HEALTH);
  duel.healthB = clamp(duel.healthB - damageToB, 0, STARTING_HEALTH);
  duel.lastActionA = actionA;
  duel.lastActionB = actionB;
  duel.resolvedRound = resolvedRound;
  duel.lastDamageA = damageToA;
  duel.lastDamageB = damageToB;
  duel.status = 'active';
  duel.round += 1;
  duel.actionA = '';
  duel.actionB = '';
  duel.roundDeadline = Date.now() + ACTION_WINDOW_MS;

  let ended = false;
  let winnerId = '';
  if (duel.healthA <= 0 || duel.healthB <= 0) {
    ended = true;
    duel.status = 'ended';
    winnerId = duel.healthA === duel.healthB
      ? ''
      : (duel.healthA > duel.healthB ? duel.playerA : duel.playerB);
  }

  return {
    ended,
    winnerId,
    samWarning,
  };
}

export function createDuelSystem({ getPlayerName, getSamPhase } = {}) {
  const duels = new Map();
  const playerToDuel = new Map();

  function getDuel(id) {
    return duels.get(id) || null;
  }

  function hasActiveDuel(playerId) {
    const duelId = playerToDuel.get(playerId);
    if (!duelId) return false;
    const duel = getDuel(duelId);
    return Boolean(duel && duel.status !== 'ended');
  }

  function createChallenge(challengerId, targetId) {
    if (!challengerId || !targetId || challengerId === targetId) return { error: 'invalid-target' };
    if (hasActiveDuel(challengerId) || hasActiveDuel(targetId)) return { error: 'duel-busy' };

    const duelId = randomId();
    const now = Date.now();
    const duel = {
      duelId,
      playerA: challengerId,
      playerB: targetId,
      playerAName: getPlayerName?.(challengerId) || 'Challenger',
      playerBName: getPlayerName?.(targetId) || 'Defender',
      status: 'requested',
      round: 0,
      createdAt: now,
      requestedUntil: now + REQUEST_TIMEOUT_MS,
      roundDeadline: 0,
      healthA: STARTING_HEALTH,
      healthB: STARTING_HEALTH,
      actionA: '',
      actionB: '',
      lastDamageA: 0,
      lastDamageB: 0,
      lastActionA: '',
      lastActionB: '',
      resolvedRound: 0,
    };
    duels.set(duelId, duel);
    playerToDuel.set(challengerId, duelId);
    playerToDuel.set(targetId, duelId);
    return { duel };
  }

  function acceptChallenge(playerId, duelId) {
    const duel = getDuel(duelId);
    if (!duel) return { error: 'duel-not-found' };
    if (duel.status !== 'requested') return { error: 'duel-not-requested' };
    if (duel.playerB !== playerId) return { error: 'duel-not-authorized' };
    duel.status = 'active';
    duel.round = 1;
    duel.roundDeadline = Date.now() + ACTION_WINDOW_MS;
    return { duel };
  }

  function submitAction(playerId, duelId, action) {
    const duel = getDuel(duelId);
    const normalizedAction = String(action || '').toLowerCase();
    if (!duel) return { error: 'duel-not-found' };
    if (duel.status !== 'active') return { error: 'duel-not-active' };
    if (!VALID_ACTIONS.has(normalizedAction)) return { error: 'duel-invalid-action' };
    if (playerId !== duel.playerA && playerId !== duel.playerB) return { error: 'duel-not-authorized' };

    if (playerId === duel.playerA) duel.actionA = normalizedAction;
    if (playerId === duel.playerB) duel.actionB = normalizedAction;

    const bothSubmitted = duel.actionA !== '' && duel.actionB !== '';
    const shouldResolve = bothSubmitted || Date.now() >= duel.roundDeadline;
    if (!shouldResolve) return { duel, resolved: false };

    const resolution = resolveRound(duel, getSamPhase?.() || 0);
    return {
      duel,
      resolved: true,
      resolution,
    };
  }

  function endDuel(duelId, reason = 'ended') {
    const duel = getDuel(duelId);
    if (!duel) return null;
    duel.status = 'ended';
    duel.endReason = reason;
    playerToDuel.delete(duel.playerA);
    playerToDuel.delete(duel.playerB);
    return duel;
  }

  function onPlayerLeave(playerId) {
    const duelId = playerToDuel.get(playerId);
    if (!duelId) return null;
    const duel = endDuel(duelId, 'player-left');
    if (duel) duels.delete(duelId);
    return duel;
  }

  function tick() {
    const now = Date.now();
    const expired = [];
    for (const duel of duels.values()) {
      if (duel.status === 'requested' && duel.requestedUntil <= now) {
        expired.push({ duel, reason: 'request-timeout' });
      } else if (duel.status === 'active' && duel.roundDeadline <= now) {
        const result = resolveRound(duel, getSamPhase?.() || 0);
        expired.push({ duel, reason: 'round-resolved', result });
      } else if (duel.status === 'ended') {
        expired.push({ duel, reason: 'cleanup' });
      }
    }
    return expired;
  }

  function remove(duelId) {
    const duel = getDuel(duelId);
    if (!duel) return;
    playerToDuel.delete(duel.playerA);
    playerToDuel.delete(duel.playerB);
    duels.delete(duelId);
  }

  return {
    createChallenge,
    acceptChallenge,
    submitAction,
    endDuel,
    onPlayerLeave,
    tick,
    remove,
  };
}
