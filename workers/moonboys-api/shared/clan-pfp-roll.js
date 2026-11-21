import { AVATAR_PRESETS } from '../../../js/avatar-builder-homepage-presets.mjs';

const DAY_MS = 86_400_000;
const ROTATION_EPOCH = Date.UTC(2026, 10, 21);
const TRAITS = ['face', 'hat', 'chains', 'clothes'];
// The TV shell covers the face artwork completely.
const FACE_COVERING_HAT = 'hat-mb-hat-49';

async function order(items, seed, key) {
  const encoder = new TextEncoder();
  const entries = await Promise.all(items.map(async item => {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(seed + ':' + key(item)));
    const rank = new DataView(hash).getUint32(0);
    return { item, rank };
  }));
  return entries.sort((a, b) => a.rank - b.rank).map(entry => entry.item);
}

export async function buildPfpRound(day) {
  const dayIndex = (Date.parse(day + 'T00:00:00Z') - ROTATION_EPOCH) / DAY_MS;
  const cycle = Math.floor(dayIndex / AVATAR_PRESETS.length);
  const position = dayIndex - cycle * AVATAR_PRESETS.length;
  const presets = await order(AVATAR_PRESETS, 'clan-pfp-cycle-v1:' + cycle, preset => preset.id);
  const target = presets[position];
  const categories = TRAITS.filter(category => target.stack[category] &&
    (category !== 'face' || target.stack.hat !== FACE_COVERING_HAT)).slice(0, 3);
  if (categories.length !== 3) throw new Error('pfp_target_missing_traits');
  const pools = await Promise.all(categories.map(async category => {
    const correct = target.stack[category];
    const excluded = category === 'hat' && categories.includes('face') ? FACE_COVERING_HAT : null;
    const alternatives = [...new Set(AVATAR_PRESETS.map(preset => preset.stack[category]))]
      .filter(trait => trait && trait !== correct && trait !== excluded);
    const [first, second] = await order(alternatives, day + ':' + category, trait => trait);
    if (!second) throw new Error('pfp_target_missing_alternatives');
    return { category, choices: await order([correct, first, second], day + ':pool:' + category, trait => trait) };
  }));
  return { presetId: target.id, target: target.stack, pools, limit: 5, rewards: [0, 5, 15, 50] };
}

function drawIndex(bound) {
  // A byte at or above the largest multiple of bound would bias the result.
  const sample = new Uint8Array(1);
  const ceiling = 256 - (256 % bound);
  do { crypto.getRandomValues(sample); } while (sample[0] >= ceiling);
  return sample[0] % bound;
}

export function drawPfpRoll(round, pickIndex = drawIndex) {
  const stack = { ...round.target };
  const matched = [];
  for (const { category, choices } of round.pools) {
    stack[category] = choices[pickIndex(choices.length)];
    if (stack[category] === round.target[category]) matched.push(category);
  }
  return { stack, matched, xp: round.rewards[matched.length] };
}
