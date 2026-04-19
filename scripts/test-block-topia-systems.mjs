import assert from 'node:assert/strict';
import { createEconomySystem } from '../games/block-topia/economy/economy-system.js';
import { createSignalDuelSystem } from '../games/block-topia/duel/signal-duel-system.js';
import { createRuntimeDirector } from '../games/block-topia/world/runtime-director.js';
import { createPfpFusionSystem } from '../games/block-topia/world/pfp-fusion-system.js';

function testEconomyMineAndRewards() {
  const state = {
    player: { xp: 0 },
    economy: { xp: 0, gems: 25, spentGems: 0, dailyGemEarned: 0, dailyResetKey: '2026-01-01', weapon: { level: 1, rarity: 'common' }, mine: { active: false, gemsLoaded: 0, tier: 1, startedAt: 0, claimAt: 0 } },
  };
  const economy = createEconomySystem(state);

  assert.equal(economy.startMine(5), true, 'mine should start with available gems');
  state.economy.mine.claimAt = Date.now() - 1;
  const result = economy.claimMine(() => 0.5);
  assert.ok(result?.xp > 0, 'mine claim should return xp');

  const rewards = economy.applyDuelRewards({ win: true, damageDealt: 80, jackpot: false });
  assert.ok(rewards.xp >= 100, 'duel rewards should produce xp');
}

function testDuelLocalTurn() {
  const duel = createSignalDuelSystem();
  duel.applyStarted({ duelId: 'd1', round: 1, healthA: 100, healthB: 100, energyA: 100, energyB: 100 });
  duel.setLocalModifiers({
    modifiersA: { energyRegenBonus: 8, dodgeBonus: 0.1, timingBonus: 0.08, samResist: 0.2 },
  });
  const resolved = duel.resolveLocalTurn({ actionA: 'fight', actionB: 'run', timingA: 0.5, timingB: 0.5 }, () => 0.4);
  assert.ok(resolved, 'duel turn should resolve when energy is available');
  assert.ok(typeof resolved.dealtToA === 'number' && typeof resolved.dealtToB === 'number');
  assert.ok(duel.getState().energyA >= 93, 'energy regen passive should offset fight cost by more than default regen');
}

function testRuntimeDirector() {
  const state = {
    controlNodes: [{ status: 'unstable' }, { status: 'stable' }],
    quests: { active: [{ id: 'q1' }] },
  };
  const director = createRuntimeDirector(state);
  let directive = '';
  director.tick({ duelActive: false, mineReady: false, onDirective: (text) => { directive = text; } });
  assert.ok(directive.includes('Stabilize'), 'director should prioritize unstable nodes');
}

function testPfpFusion() {
  const fusion = createPfpFusionSystem({
    assets: { common: '/a.svg', rare: '/b.svg', epic: '/c.svg', glitch: '/d.svg' },
  });
  const profile = fusion.createProfile({ traits: ['moon_eyes', 'visor'], rarity: 'rare' });
  assert.equal(profile.rarity, 'rare');
  assert.ok(profile.modifiers.samResist > 0, 'moon_eyes should add sam resist');
  const boosted = fusion.applyDuelRewardModifier({ xp: 100, gems: 1 }, profile);
  assert.ok(boosted.xp > 100, 'visor should boost xp reward path');
}

testEconomyMineAndRewards();
testDuelLocalTurn();
testRuntimeDirector();
testPfpFusion();
console.log('Block Topia system tests passed ✅');
