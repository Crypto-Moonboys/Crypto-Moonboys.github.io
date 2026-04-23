// Covert Ops System — Phase 1
// Server-authoritative operative lifecycle: deploy, mission resolution, extract / loss.
// Only the 'ghost' operative type is supported in Phase 1.

export const COVERT_MISSION_DURATION_MS = 15000;
const COVERT_OPERATIVE_TYPE = 'ghost';

function randomId() {
  return `op-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Roll success / failure for a deployed operative.
 *
 * Factors that reduce the success chance:
 *   - covertHeat on the target node     (0 → 0 %, 100 → 45 % penalty)
 *   - global SAM pressure               (0 → 0 %, 140 → 18 % penalty)
 *   - district patrol posture score     (0 → 0 %, 100 → 15 % penalty)
 *
 * Clamped to a floor of 10 % and a ceiling of 90 %.
 *
 * @returns {{ success: boolean, successChance: number }}
 */
export function resolveOperativeMission({ node, samPressure = 0, districtPostureScore = 0 }) {
  const heat = Number(node?.covertHeat) || 0;
  const heatPenalty = (clamp(heat, 0, 100) / 100) * 0.45;
  const samPenalty = (clamp(samPressure, 0, 140) / 140) * 0.18;
  const posturePenalty = (clamp(districtPostureScore, 0, 100) / 100) * 0.15;
  const successChance = clamp(0.70 - heatPenalty - samPenalty - posturePenalty, 0.10, 0.90);
  const success = Math.random() < successChance;
  return { success, successChance: Number(successChance.toFixed(3)) };
}

/**
 * Factory for the covert ops system.
 *
 * Tracks at most one active operative per player.  All state is server-side;
 * clients only send deploy / extract requests — the server resolves outcomes.
 */
export function createCovertOpsSystem() {
  // operativeId → operative object
  const operatives = new Map();
  // playerId → operativeId  (one active op per player enforced)
  const playerOperative = new Map();

  function hasActiveOperative(playerId) {
    const opId = playerOperative.get(playerId);
    if (!opId) return false;
    const op = operatives.get(opId);
    return Boolean(op && op.status === 'deployed');
  }

  /**
   * Deploy a 'ghost' operative to a node on behalf of a player.
   * Returns { operative } on success or { error: string } on rejection.
   */
  function deployOperative(playerId, nodeId, intent = 'disrupt') {
    if (!playerId || !nodeId) return { error: 'invalid-params' };
    if (hasActiveOperative(playerId)) return { error: 'operative-active' };

    const id = randomId();
    const op = {
      id,
      playerId,
      nodeId,
      type: COVERT_OPERATIVE_TYPE,
      intent: intent === 'assist' ? 'assist' : 'disrupt',
      status: 'deployed',
      deployedAt: Date.now(),
    };
    operatives.set(id, op);
    playerOperative.set(playerId, id);
    return { operative: op };
  }

  /**
   * Manually extract a player's active operative before the mission timer fires.
   * Returns { operative } or { error: string }.
   */
  function extractOperative(playerId) {
    const opId = playerOperative.get(playerId);
    if (!opId) return { error: 'no-operative' };
    const op = operatives.get(opId);
    if (!op || op.status !== 'deployed') return { error: 'not-deployed' };

    op.status = 'extracted';
    playerOperative.delete(playerId);
    operatives.delete(opId);
    return { operative: op };
  }

  /**
   * Called each server tick.  Finds all operatives whose mission timer has elapsed
   * and resolves them via the supplied `resolveFn`.
   *
   * `resolveFn(operative)` must return `{ success: boolean, successChance: number }`.
   * Returns an array of `{ operative, success, successChance }` records.
   */
  function resolveExpiredOperatives(nowMs, resolveFn) {
    const resolved = [];
    for (const [opId, op] of operatives.entries()) {
      if (op.status !== 'deployed') continue;
      if (nowMs - op.deployedAt < COVERT_MISSION_DURATION_MS) continue;

      const outcome = resolveFn(op);
      op.status = outcome.success ? 'complete' : 'captured';
      playerOperative.delete(op.playerId);
      operatives.delete(opId);
      resolved.push({ operative: op, success: outcome.success, successChance: outcome.successChance });
    }
    return resolved;
  }

  /**
   * Clean up any operative belonging to a disconnecting player.
   * Returns the operative if one was active, otherwise null.
   */
  function onPlayerLeave(playerId) {
    const opId = playerOperative.get(playerId);
    if (!opId) return null;
    const op = operatives.get(opId);
    if (op) {
      op.status = 'extracted';
      operatives.delete(opId);
    }
    playerOperative.delete(playerId);
    return op || null;
  }

  return {
    deployOperative,
    extractOperative,
    resolveExpiredOperatives,
    onPlayerLeave,
    hasActiveOperative,
  };
}
