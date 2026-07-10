import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(ROOT, 'workers/leaderboard-worker.js'), 'utf8');

function extractFunction(name) {
  const match = source.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(match, `expected to find function ${name}`);
  const start = match.index;
  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart > start, `expected opening brace for ${name}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const harness = new Function(`
  ${extractFunction('isGuestLikePlayerName')}
  ${extractFunction('resolveAuthenticatedPlayerName')}
  ${extractFunction('sanitizePublicPlayerName')}
  ${extractFunction('sanitizePublicBoardEntry')}
  ${extractFunction('getStoredBoard')}
  ${extractFunction('getBoard')}
  return { isGuestLikePlayerName, resolveAuthenticatedPlayerName, sanitizePublicPlayerName, sanitizePublicBoardEntry, getStoredBoard, getBoard };
`)();

{
  const player = harness.resolveAuthenticatedPlayerName('Guest-12345', {
    first_name: 'Moon',
    last_name: 'Boy',
    username: 'moonboy',
  });
  assert.equal(player, 'Moon Boy', 'guest-like submitted names must be replaced by authenticated Telegram identity');
}

{
  const player = harness.resolveAuthenticatedPlayerName('Player_0001', {
    username: 'moonboy',
  });
  assert.equal(player, '@moonboy', 'username-only Telegram auth must still resolve a non-guest leaderboard identity');
}

{
  const player = harness.resolveAuthenticatedPlayerName('Guest-12345', {});
  assert.equal(player, null, 'worker must reject competitive writes when no authenticated display identity can be resolved');
}

{
  const env = {
    LEADERBOARD: {
      async get() {
        return JSON.stringify([
          { player: 'Linked Alpha', score: 900, telegram_id: '111', rank: 1 },
          { player: 'Guest-2222', score: 800, telegram_id: '222', rank: 2 },
          { player: 'Player_1234', score: 750, telegram_id: '333', rank: 3 },
          { player: 'Anonymous', score: 700, rank: 3 },
        ]);
      },
    },
  };
  const board = await harness.getBoard(env, 'snake');
  assert.deepEqual(
    board,
    [
      { player: 'Linked Alpha', score: 900, telegram_id: '111', rank: 1 },
      { player: 'Telegram Player', score: 800, telegram_id: '222', rank: 2 },
      { player: 'Telegram Player', score: 750, telegram_id: '333', rank: 3 },
    ],
    'leaderboard public reads must preserve authenticated rows while hiding guest-like display names',
  );
}

{
  const env = {
    LEADERBOARD: {
      async get() {
        return JSON.stringify([
          { player: 'Guest-2222', score: 800, telegram_id: '222', rank: 1 },
        ]);
      },
    },
  };
  const stored = await harness.getStoredBoard(env, 'snake');
  assert.deepEqual(
    stored,
    [{ player: 'Guest-2222', score: 800, telegram_id: '222', rank: 1 }],
    'raw leaderboard reads must preserve authenticated legacy rows for mutation/recompute paths',
  );
}

console.log('Leaderboard worker identity filter checks passed.');
