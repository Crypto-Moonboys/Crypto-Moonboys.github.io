import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const roomPath = path.resolve(here, './MinimalCityRoom.js');
const source = await fs.readFile(roomPath, 'utf8');

assert.ok(source.includes("const NPC_COUNT = 14;"), 'NPC count must stay bounded at 14.');
assert.ok(source.includes("const ATTACK_COOLDOWN_MS = 350;"), 'Attack cooldown constant must exist.');
assert.ok(source.includes("if (!player || player.hp <= 0) return;"), 'Dead/missing attacker guard must exist.');
assert.ok(source.includes("if (now - lastAttackAt < ATTACK_COOLDOWN_MS) return;"), 'Attack cooldown guard must exist.');
assert.ok(source.includes("const target = this._findNearestNpc(player, ATTACK_RANGE);"), 'Attack target must be server-resolved in range.');
assert.ok(source.includes("if (!target) return;"), 'Missing/out-of-range target must be ignored safely.');
assert.ok(source.includes("target.hp = Math.max(0, target.hp - ATTACK_DAMAGE);"), 'Target hp must be clamped.');
assert.ok(source.includes("if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;"), 'Move payload must validate numeric coords.');

console.log('MinimalCityRoom safety smoke checks passed.');