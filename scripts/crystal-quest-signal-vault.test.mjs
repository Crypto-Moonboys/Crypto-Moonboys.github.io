import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeSignalAnswer,
  getAcceptedSignalAnswers,
  isSignalAnswerCorrect,
  isCloseSignalAnswerMatch,
  buildSignalAttemptHint,
} from '../js/arcade/games/crystal-quest/signal-vault-utils.mjs';

const root = process.cwd();
const crystalFiles = [
  'games/crystal-quest/index.html',
  'js/arcade/games/crystal-quest/bootstrap.js',
  'js/arcade/games/crystal-quest/sam-agent.js',
  'js/arcade/games/crystal-quest/signal-vault-utils.mjs',
];

const question = {
  accepted_answers: ['Moon Boy Prime', "Satoshi's Signal"],
  aliases: ['crystal-quest_signal', 'Vault.Signal'],
};

assert.equal(normalizeSignalAnswer('  MOON---boy___prime!!!  '), 'moonboyprime');
assert.equal(normalizeSignalAnswer("satoshi's signal"), 'satoshissignal');
assert.equal(isSignalAnswerCorrect(question, 'moon boy prime'), true);
assert.equal(isSignalAnswerCorrect(question, 'CRYSTAL QUEST SIGNAL'), true);
assert.equal(isSignalAnswerCorrect(question, 'vault-signal'), true);
assert.equal(isCloseSignalAnswerMatch(question, 'moon boy prim'), true);
assert.equal(isCloseSignalAnswerMatch(question, 'totally wrong'), false);
assert.deepEqual(
  getAcceptedSignalAnswers({ accepted_answers: ['A-B'], aliases: ['A_B'] }),
  ['ab', 'ab'],
);

assert.match(buildSignalAttemptHint(question, 1), /Soft hint/);
assert.match(buildSignalAttemptHint(question, 2), /3 words/);
assert.match(buildSignalAttemptHint(question, 3), /Strong hint/);

const bootstrap = fs.readFileSync(path.join(root, 'js/arcade/games/crystal-quest/bootstrap.js'), 'utf8');
assert.match(bootstrap, /var MAX_SKIPS = 2;/, 'skip limit remains capped at two bypasses');
assert.match(bootstrap, /function skipsLeft\(\)[\s\S]*MAX_SKIPS - run\.skips/, 'skip counter still derives from MAX_SKIPS');
assert.match(bootstrap, /run\.completed = true;[\s\S]*syncQuestRun\([\s\S]*finalizeCompletedRun\(\)/, 'run completion still uses sync payload and finalize path');
assert.match(bootstrap, /submitScoreBtn\.hidden = true;/, 'manual score button is hidden by the Crystal Quest UI state sync if legacy markup exists');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'games/crystal-quest/index.html'), 'utf8'), /id="submitScoreBtn"/, 'manual Submit Score button is not visible in active play markup');
assert.match(bootstrap, /submitScore\(ArcadeSync\.getPlayer\(\), score, GAME_ID\)/, 'score submission contract remains present');
assert.match(bootstrap, /missionStates: questionSet\.map/, 'mission grid state is initialized per question');
assert.match(bootstrap, /function syncQuestRun/, 'Crystal Quest keeps syncQuestRun path');
assert.match(bootstrap, /function finalizeCompletedRun/, 'Crystal Quest keeps finalizeCompletedRun path');

for (const file of crystalFiles) {
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(contents, /(?:â€”|â€“|â€¦|â€œ|â€�|â€™|â€˜|â€¢|ï¿½|ðŸ)/u, `${file} contains visible mojibake`);
}

console.log('crystal-quest-signal-vault: passed');
