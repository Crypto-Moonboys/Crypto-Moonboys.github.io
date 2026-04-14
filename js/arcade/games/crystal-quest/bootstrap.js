/**
 * bootstrap.js — Crystal Quest game module
 *
 * Contains all Crystal Quest game logic.  Exports bootstrapCrystalQuest(), which is
 * the entry point called by game-shell.js via mountGame().
 *
 * Integrations preserved:
 *  - ArcadeSync   (local high-score persistence)
 *  - submitScore  (leaderboard-client.js remote submission)
 *  - rollHiddenBonus / showBonusPopup  (bonus-engine.js)
 *  - loadGameData (data-loader.js R2/local fallback)
 */

import { loadGameData }                    from '/js/data-loader.js';
import { ArcadeSync }                      from '/js/arcade-sync.js';
import { submitScore }                     from '/js/leaderboard-client.js';
import { rollHiddenBonus, showBonusPopup } from '/js/bonus-engine.js';
import { CRYSTAL_QUEST_CONFIG }            from './config.js';
import { GameRegistry }                    from '/js/arcade/core/game-registry.js';

// Register in the central registry when this module is first imported.
GameRegistry.register(CRYSTAL_QUEST_CONFIG.id, {
  label:     CRYSTAL_QUEST_CONFIG.label,
  bootstrap: bootstrapCrystalQuest,
});

/**
 * Bootstrap the Crystal Quest game.
 *
 * @param {Element} root - The .game-card element (unused directly; DOM IDs are unique).
 * @returns {{ init, start, pause, resume, reset, destroy, getScore }}
 */
export function bootstrapCrystalQuest(root) {
  const GAME_ID = CRYSTAL_QUEST_CONFIG.id;
  const STORAGE_KEY_SEEN = 'crystal_seen_ids';

  const titleEl    = document.getElementById('questTitle');
  const clueEl     = document.getElementById('questClue');
  const linkEl     = document.getElementById('questLink');
  const feedbackEl = document.getElementById('feedback');
  const answerInput  = document.getElementById('answerInput');
  const solvedCount  = document.getElementById('solvedCount');
  const scoreCount   = document.getElementById('scoreCount');
  const streakCount  = document.getElementById('streakCount');
  const sourceLabel  = document.getElementById('sourceLabel');
  const statusLine   = document.getElementById('statusLine');
  const submitBtnEl  = document.getElementById('submitBtn');
  const nextBtnEl    = document.getElementById('nextBtn');

  let allQuests = [];
  let queue = [];
  let queueIdx = 0;
  let solved = 0, score = 0, streak = 0;

  // ── No-repeat helpers ──────────────────────────────────────────────────────
  function loadSeenIds() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_SEEN) || '[]')); }
    catch { return new Set(); }
  }
  function saveSeenIds(set) {
    try { localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify([...set])); } catch {}
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue(seenIds) {
    const unseen = allQuests.filter(q => !seenIds.has(q.id));
    if (unseen.length === 0) {
      saveSeenIds(new Set());
      statusLine.textContent = '🎉 Full cycle complete! All quests reset. Bonus round unlocked.';
      return shuffle(allQuests);
    }
    return shuffle(unseen);
  }

  function currentQuest() {
    return queue[queueIdx] || null;
  }

  function updateHud() {
    solvedCount.textContent = solved;
    scoreCount.textContent = score;
    streakCount.textContent = streak;
  }

  function normalizeAnswers(arr) {
    return (arr || []).map(v => String(v).trim().toUpperCase());
  }

  function loadQuest() {
    const q = currentQuest();
    if (!q) {
      const seenIds = loadSeenIds();
      queue = buildQueue(seenIds);
      queueIdx = 0;
    }
    const current = currentQuest();
    if (!current) return;
    titleEl.textContent = current.title || 'Untitled Quest';
    clueEl.textContent = current.clue || 'No clue available.';
    linkEl.href = current.wiki_url || '#';
    linkEl.textContent = current.wiki_url || '#';
    answerInput.value = '';
    feedbackEl.textContent = 'Read the linked page, return, and enter the hidden answer.';
  }

  function advanceQueue() {
    const q = currentQuest();
    if (q) {
      const seen = loadSeenIds();
      seen.add(q.id);
      saveSeenIds(seen);
    }
    queueIdx += 1;
    if (queueIdx >= queue.length) {
      const seen = loadSeenIds();
      queue = buildQueue(seen);
      queueIdx = 0;
    }
  }

  async function onCorrectAnswer(q) {
    solved += 1;
    streak += 1;
    score += (q.rewards?.arcade_points || 100);
    feedbackEl.textContent = '✅ Correct. Crystal secured.';
    // AUDIO_HOOK: play('correct')
    advanceQueue();
    updateHud();
    ArcadeSync.setHighScore(GAME_ID, score);
    submitScore(ArcadeSync.getPlayer(), score, GAME_ID);

    const bonus = await rollHiddenBonus({ score, streak, game: GAME_ID });
    if (bonus) {
      score += bonus.rewards?.arcade_points || 0;
      updateHud();
      showBonusPopup(bonus);
      ArcadeSync.setHighScore(GAME_ID, score);
      submitScore(ArcadeSync.getPlayer(), score, GAME_ID);
    }

    setTimeout(loadQuest, 500);
  }

  function onSubmit() {
    const q = currentQuest();
    if (!q) return;
    const guess = answerInput.value.trim().toUpperCase();
    if (!guess) return;
    const answers = normalizeAnswers(q.accepted_answers);
    if (answers.includes(guess)) {
      onCorrectAnswer(q);
    } else {
      streak = 0;
      // AUDIO_HOOK: play('wrong')
      feedbackEl.textContent = '❌ Wrong answer. Read again and try properly.';
      updateHud();
    }
  }

  function onSkip() {
    streak = 0;
    advanceQueue();
    updateHud();
    loadQuest();
  }

  // ── Lifecycle implementation ──────────────────────────────────────────────

  async function init() {
    try {
      const base = (window.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
      sourceLabel.textContent = base ? 'R2 / Local' : 'Local';
      statusLine.textContent = base
        ? `R2 enabled: ${base}/games/data/crystal-maze-seed.json`
        : 'R2 base URL not set, using local files only.';
      const data = await loadGameData('/games/data/crystal-maze-seed.json');
      allQuests = data.quests || [];
      if (!allQuests.length) throw new Error('No quests found in crystal-maze-seed.json');
      const seenIds = loadSeenIds();
      queue = buildQueue(seenIds);
      queueIdx = 0;
      const remaining = queue.length;
      statusLine.textContent += ` | ${remaining} of ${allQuests.length} quests remaining in cycle.`;
      updateHud();
      loadQuest();
    } catch (err) {
      console.error(err);
      titleEl.textContent = 'Quest load failed';
      clueEl.textContent = 'Could not load crystal-maze-seed.json from R2 or local fallback.';
      feedbackEl.textContent = 'Check file path, bucket path, and R2 public URL.';
      statusLine.textContent = err.message;
      sourceLabel.textContent = 'Error';
    }

    submitBtnEl.onclick = onSubmit;
    nextBtnEl.onclick   = onSkip;
  }

  function start() {
    // Re-run init to reload data and start fresh
    solved = 0; score = 0; streak = 0;
    updateHud();
    init();
  }

  function pause()  { /* Crystal Quest is turn-based; no pause needed */ }
  function resume() { /* Crystal Quest is turn-based; no resume needed */ }

  function reset() {
    solved = 0; score = 0; streak = 0;
    updateHud();
    if (allQuests.length) {
      const seenIds = loadSeenIds();
      queue = buildQueue(seenIds);
      queueIdx = 0;
      loadQuest();
    }
  }

  function destroy() {
    if (submitBtnEl) submitBtnEl.onclick = null;
    if (nextBtnEl)   nextBtnEl.onclick   = null;
  }

  function getScore() { return score; }

  // ── Public lifecycle object ───────────────────────────────────────────────

  return { init, start, pause, resume, reset, destroy, getScore };
}
