// #1539 PR3B: independently verifiable per-run v2 *gameplay* checkpoint trial.
//
// The 32-bit server-owned challenge seed is represented by 32 distinct,
// physically encountered LEFT or RIGHT direction checkpoints spread across
// the actual 22,000px NBG London course. A signed player must hold exactly
// that direction at the first crossing of each checkpoint's X coordinate.
// This changes player acceleration/facing on that physics tick, rather than
// accepting a nonce or a client-declared attestation in replay metadata.
//
// All 32 bits are used. For any two *different* 32-bit challenge seeds, their
// required ordered gate directions differ at least once. The still-unreleased
// 101 schema also forbids issuing the same seed to two different sessions.
// This is a deterministic replay-copy obstacle, NOT a human proof: a bot that
// regenerates controls in response to the public seed could still pass.
export const NBG_V2_CHALLENGE_GATE_COUNT = 32;
export const NBG_V2_CHALLENGE_FIRST_X = 1900;
export const NBG_V2_CHALLENGE_STEP_X = 600;

export function nbgChallengeGateX(index) {
  if (!Number.isInteger(index) || index < 0 ||
      index >= NBG_V2_CHALLENGE_GATE_COUNT)
    throw new RangeError('nbg_invalid_challenge_gate_index');
  return NBG_V2_CHALLENGE_FIRST_X + index * NBG_V2_CHALLENGE_STEP_X;
}

export function nbgChallengeGateDirection(seed, index) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('nbg_invalid_challenge_seed');
  nbgChallengeGateX(index);
  return ((seed >>> index) & 1) === 0 ? 1 : 2; // LEFT=1 RIGHT=2
}

export function nbgChallengeGateStep(seed, gateIndex, playerX, controlMask) {
  if (gateIndex === NBG_V2_CHALLENGE_GATE_COUNT)
    return { gateIndex, complete: true, failed: false };
  if (!Number.isFinite(playerX) || !Number.isInteger(controlMask) ||
      controlMask < 0 || controlMask > 15)
    throw new RangeError('nbg_invalid_challenge_action');
  if (playerX < nbgChallengeGateX(gateIndex))
    return { gateIndex, complete: false, failed: false };
  const requiredDirection = nbgChallengeGateDirection(seed, gateIndex);
  // Exactly one direction must be pressed on the actual physics tick that
  // first crosses this location. LEFT+RIGHT is never valid for either bit.
  // Freeze after the first crossing so a player cannot submit both directions
  // within the same zone to satisfy multiple differently seeded challenges.
  return {
    gateIndex: gateIndex + 1,
    complete: gateIndex + 1 === NBG_V2_CHALLENGE_GATE_COUNT,
    failed: (controlMask & 3) !== requiredDirection,
  };
}
