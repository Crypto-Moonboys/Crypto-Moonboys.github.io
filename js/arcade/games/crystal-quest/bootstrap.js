import { loadGameData } from '/js/data-loader.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { CRYSTAL_QUEST_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter, bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createSamAgent } from './sam-agent.js';
import { getActiveModifiers, hasEffect, getStatEffect } from '/js/arcade/systems/cross-game-modifier-system.js';
import {
  getPlayerFaction, getFactionEffects,
} from '/js/arcade/systems/faction-effect-system.js';
import { recordContribution } from '/js/arcade/systems/faction-war-system.js';
import { recordMissionProgress } from '/js/arcade/systems/faction-missions.js';
import { recordLogin, recordWarContribution } from '/js/arcade/systems/faction-streaks.js';
import { checkRankUp } from '/js/arcade/systems/faction-ranks.js';
import { emitFactionGain } from '/js/arcade/systems/live-activity.js';

// UI status copy — use the global set by ui-status-copy.js (classic script); fall back to literal.
const COPY = window.UI_STATUS_COPY || { UNLINKED: 'Telegram not linked \u2014 run /gklink' };

export const CRYSTAL_QUEST_ADAPTER = createGameAdapter({
  id: CRYSTAL_QUEST_CONFIG.id,
  name: CRYSTAL_QUEST_CONFIG.label,
  systems: {},
  legacyBootstrap: function (root) {
    return createLegacybootstrapCrystalQuest(root);
  },
});

registerGameAdapter(CRYSTAL_QUEST_CONFIG, CRYSTAL_QUEST_ADAPTER, bootstrapCrystalQuest);

export function bootstrapCrystalQuest(root) {
  return bootstrapFromAdapter(root, CRYSTAL_QUEST_ADAPTER);
}

function createLegacybootstrapCrystalQuest(root) {
  var GAME_ID = CRYSTAL_QUEST_CONFIG.id;
  var PACKS = [
    '/games/data/question_pack_001.json',
    '/games/data/question_pack_002.json',
  ];
  var MAX_SKIPS = 2;
  var RUN_MIN = 5;
  var RUN_MAX = 10;

  // â”€â”€ DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var scoreCount     = document.getElementById('scoreCount');
  var streakCount    = document.getElementById('streakCount');
  var remainingCount = document.getElementById('remainingCount');
  var skipsLeftCount = document.getElementById('skipsLeftCount');
  var questTitle     = document.getElementById('questTitle');
  var questClue      = document.getElementById('questClue');
  var questLink      = document.getElementById('questLink');
  var questDiff      = document.getElementById('questDifficulty');
  var questProgress  = document.getElementById('questProgress');
  var feedback       = document.getElementById('feedback');
  var statusLine     = document.getElementById('statusLine');
  var answerInput    = document.getElementById('answerInput');
  var sourceLabel    = document.getElementById('sourceLabel');

  var startBtn       = document.getElementById('startBtn');
  var pauseBtn       = document.getElementById('pauseBtn');
  var resetBtn       = document.getElementById('resetBtn');
  var submitBtn      = document.getElementById('submitBtn');
  var skipBtn        = document.getElementById('skipBtn');
  var submitScoreBtn = document.getElementById('submitScoreBtn');

  var pulseLayer     = document.getElementById('crystalPulseLayer');
  var particleLayer  = document.getElementById('crystalParticles');

  var samRoot    = document.getElementById('samAgent');
  var samMessage = document.getElementById('samMessage');

  var loreLogEl      = document.getElementById('loreLog');
  var loreLogEntries = document.getElementById('loreLogEntries');

  var runBannerEl    = document.getElementById('runCompleteBanner');
  var rcbScoreEl     = document.getElementById('rcbScore');
  var rcbStatsEl     = document.getElementById('rcbStats');
  var rcbLoreEl      = document.getElementById('rcbLore');

  var sam = createSamAgent({ root: samRoot, messageEl: samMessage });

  // â”€â”€ Game state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var score = 0;
  var streak = 0;
  var run = null;
  var loadedPackIndex = -1;
  var unusedQuestions = [];
  var usedQuestions   = [];
  var knownQuestionIds = new Set();
  var loreUnlocked = [];   // crystals secured this run

  // ── Faction state ─────────────────────────────────────────────────────────
  var _cqFactionId = 'unaligned';
  var _cqFxDef     = null;
  var _cqCrossMods     = [];
  var _cqModScoreMult  = 1;

  function _cqInitFaction() {
    _cqFactionId    = getPlayerFaction();
    _cqFxDef        = getFactionEffects(_cqFactionId);
    _cqCrossMods    = getActiveModifiers(GAME_ID, CRYSTAL_QUEST_CONFIG.crossGameTags || []);
    _cqModScoreMult = getStatEffect(_cqCrossMods, 'scoreMult', 1);
    recordLogin(_cqFactionId);
  }

  function _cqEmitBus(event, detail) {
    try {
      var bus = (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS;
      if (bus && typeof bus.emit === 'function') bus.emit(event, detail);
    } catch (_) {}
  }

  // â”€â”€ Visual helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setGlow(type) {
    if (!pulseLayer) return;
    pulseLayer.classList.remove('pulse-start', 'pulse-correct', 'pulse-error', 'pulse-warning', 'pulse-hype', 'pulse-complete');
    if (type) pulseLayer.classList.add(type);
  }

  function ensureParticles() {
    if (!particleLayer || particleLayer.childElementCount) return;
    for (var i = 0; i < 28; i++) {
      var dot = document.createElement('span');
      dot.className = 'crystal-particle';
      dot.style.left = Math.floor(Math.random() * 100) + '%';
      dot.style.animationDelay = (Math.random() * 5).toFixed(2) + 's';
      dot.style.animationDuration = (2.4 + Math.random() * 3.6).toFixed(2) + 's';
      dot.style.opacity = (0.15 + Math.random() * 0.7).toFixed(2);
      particleLayer.appendChild(dot);
    }
  }

  // â”€â”€ Audio helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function playQuestSound(soundId) {
    if (isMuted()) return;
    try { playSound(soundId); } catch (_) {}
  }

  // â”€â”€ Answer helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function normalizeAnswer(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function getAliases(question) {
    var accepted = Array.isArray(question && question.accepted_answers) ? question.accepted_answers : [];
    var aliases  = Array.isArray(question && question.aliases) ? question.aliases : [];
    return accepted.concat(aliases).map(normalizeAnswer);
  }

  function scoreForQuestion(question, currentStreak) {
    var baseScore = Number(question && question.rewards && question.rewards.score);
    if (!Number.isFinite(baseScore) || baseScore <= 0) baseScore = 100;
    var streakBonus = Math.max(0, Math.floor(currentStreak) * 12);
    return Math.floor(baseScore) + streakBonus;
  }

  // â”€â”€ Seeded shuffle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function shuffle(arr, seed) {
    var out = arr.slice();
    var s = (seed >>> 0) || 1;
    function rnd() {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    }
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  function nextSeed() {
    return Math.floor(Math.random() * 0x7fffffff);
  }

  function secureToken() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      return bytes[0].toString(36) + bytes[1].toString(36);
    }
    // Non-crypto fallback: combine two independent timestamps for differentiation.
    var t1 = Date.now().toString(36);
    var t2 = (typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : (Date.now() & 0xfffff)).toString(36);
    return t1 + t2;
  }

  // â”€â”€ Pack loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function loadNextPack() {
    if (loadedPackIndex + 1 >= PACKS.length) return false;
    loadedPackIndex += 1;
    var path = PACKS[loadedPackIndex];
    var data = await loadGameData(path);
    var list = Array.isArray(data && data.quests) ? data.quests : [];

    var fresh = list.filter(function (q) {
      if (!q || !q.id || knownQuestionIds.has(q.id)) return false;
      knownQuestionIds.add(q.id);
      return true;
    });

    unusedQuestions = unusedQuestions.concat(shuffle(fresh, nextSeed()));
    sourceLabel.textContent = 'Pack ' + String(loadedPackIndex + 1).padStart(3, '0');
    statusLine.textContent = 'Pack ' + (loadedPackIndex + 1) + ' online â€” ' + fresh.length + ' new signals.';

    if (loadedPackIndex > 0) {
      sam.onPackUnlock();
      setGlow('pulse-hype');
    }
    return fresh.length > 0;
  }

  async function ensureQuestionSupply(minCount) {
    while (unusedQuestions.length < minCount) {
      var loaded = await loadNextPack();
      if (!loaded) break;
    }
    if (unusedQuestions.length < minCount && loadedPackIndex >= PACKS.length - 1 && usedQuestions.length) {
      unusedQuestions = shuffle(usedQuestions, nextSeed());
      usedQuestions = [];
      statusLine.textContent = 'Full lore cycle complete. All signals reset for a new hunt.';
    }
    return unusedQuestions.length >= minCount;
  }

  // â”€â”€ Run state helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getCurrentQuestion() {
    if (!run) return null;
    return run.questionSet[run.index] || null;
  }

  function remainingQuestions() {
    if (!run) return 0;
    return Math.max(0, run.questionSet.length - run.index);
  }

  function skipsLeft() {
    if (!run) return MAX_SKIPS;
    return Math.max(0, MAX_SKIPS - run.skips);
  }

  function syncRunButtons() {
    var active = !!(run && run.started && !run.completed);
    if (startBtn)       startBtn.disabled       = active;
    if (submitBtn)      submitBtn.disabled      = !active;
    if (skipBtn)        skipBtn.disabled        = !active;
    if (submitScoreBtn) submitScoreBtn.disabled = true;
  }

  function canSubmitIdentity() {
    if (!(window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.isTelegramLinked === 'function')) return false;
    return !!window.MOONBOYS_IDENTITY.isTelegramLinked();
  }

  function finalizeCompletedRun() {
    if (!run || !run.completed || run.submitted) return;
    ArcadeSync.setHighScore(GAME_ID, score);
    if (canSubmitIdentity() && score > 0) {
      submitScore(ArcadeSync.getPlayer(), score, GAME_ID);
    }
    run.submitted = true;
    updateHud();

    // ── Faction + mission hooks ───────────────────────────────────────────────
    try {
      var fId = _cqFactionId || 'unaligned';
      var contrib = Math.max(1, Math.floor(score / 100));
      recordMissionProgress(fId, 'runs', 1);
      recordMissionProgress(fId, 'score', score);
      if (streak >= 3) recordMissionProgress(fId, 'combo', streak);
      if (score > 0) {
        recordContribution(fId, contrib);
        recordWarContribution(fId, contrib);
        checkRankUp(fId);
        emitFactionGain(fId, contrib);
        recordMissionProgress(fId, 'war_contrib', contrib);
        _cqEmitBus('arcade:faction-signal', { gameId: GAME_ID, factionId: fId, amount: contrib, ts: Date.now() });
        _cqEmitBus('arcade:mission-progress', { gameId: GAME_ID, factionId: fId, ts: Date.now() });
      }
    } catch (_) {}
    if (feedback)   feedback.textContent   = canSubmitIdentity()
      ? 'ðŸ† Run complete. Score submitted to leaderboard.'
      : 'ðŸ Run complete. Link identity to sync this score next run.';
    if (statusLine) statusLine.textContent = 'Run sealed at score ' + score + '.';
  }

  // â”€â”€ HUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function updateHud() {
    if (scoreCount)     scoreCount.textContent     = String(score);
    if (streakCount)    streakCount.textContent     = String(streak);
    if (remainingCount) remainingCount.textContent = String(remainingQuestions());
    if (skipsLeftCount) skipsLeftCount.textContent = String(skipsLeft());
    syncRunButtons();
  }

  // â”€â”€ Difficulty badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var DIFF_LABELS = { easy: 'â¬¡ Easy', medium: 'â—ˆ Medium', hard: 'â¬Ÿ Hard', default: 'â—‡ Unknown' };
  var DIFF_CLASSES = { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' };

  function renderDifficultyBadge(difficulty) {
    if (!questDiff) return;
    var key = String(difficulty || '').toLowerCase();
    questDiff.textContent = DIFF_LABELS[key] || DIFF_LABELS['default'];
    questDiff.className = 'diff-badge ' + (DIFF_CLASSES[key] || 'diff-unknown');
    questDiff.style.display = 'inline-block';
  }

  // â”€â”€ Mission progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function renderMissionProgress() {
    if (!questProgress || !run) return;
    var total = run.questionSet.length;
    var done  = run.index;
    questProgress.textContent = 'Mission ' + (done + 1) + ' of ' + total;
  }

  // â”€â”€ Quest renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function renderCurrentQuestion() {
    var q = getCurrentQuestion();
    if (!q) {
      if (questTitle)    questTitle.textContent  = 'No active mission';
      if (questClue)     questClue.textContent   = 'Press Start Quest to begin a lore hunt run.';
      if (questLink)     { questLink.href = '#'; questLink.textContent = 'â€”'; }
      if (questDiff)     questDiff.style.display = 'none';
      if (questProgress) questProgress.textContent = 'â€”';
      return;
    }
    if (questTitle) questTitle.textContent = q.title || 'Untitled mission';
    if (questClue)  questClue.textContent  = q.clue  || 'No clue available.';
    if (questLink)  { questLink.href = q.wiki_url || '#'; questLink.textContent = q.wiki_url || '#'; }
    renderDifficultyBadge(q.difficulty);
    renderMissionProgress();
  }

  function clearAnswerInput() {
    if (answerInput) answerInput.value = '';
  }

  // â”€â”€ Lore discovery log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function showLoreLog() {
    if (loreLogEl) loreLogEl.style.display = '';
  }

  function addLoreEntry(question, scoreGain) {
    loreUnlocked.push({ title: question.title, scoreGain: scoreGain });
    if (!loreLogEntries) return;
    var entry = document.createElement('div');
    entry.className = 'lore-entry';
    entry.setAttribute('aria-label', 'Crystal secured: ' + question.title);
    var icon = document.createElement('span');
    icon.className = 'lore-icon';
    icon.textContent = 'ðŸ’Ž';
    var text = document.createElement('span');
    text.className = 'lore-title';
    text.textContent = question.title || 'Unknown';
    var pts = document.createElement('span');
    pts.className = 'lore-pts';
    pts.textContent = '+' + scoreGain;
    entry.appendChild(icon);
    entry.appendChild(text);
    entry.appendChild(pts);
    loreLogEntries.appendChild(entry);
    // Auto-scroll to latest
    loreLogEntries.scrollTop = loreLogEntries.scrollHeight;
  }

  function clearLoreLog() {
    loreUnlocked = [];
    if (loreLogEntries) loreLogEntries.innerHTML = '';
    if (loreLogEl) loreLogEl.style.display = 'none';
  }

  // â”€â”€ Run complete banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function showRunCompleteBanner() {
    if (!runBannerEl) return;

    var correct = run.answers.filter(function (a) { return a.correct; }).length;
    var skipped = run.skips;
    var total   = run.questionSet.length;

    if (rcbScoreEl)  rcbScoreEl.textContent  = String(score);
    if (rcbStatsEl)  rcbStatsEl.textContent  =
      correct + ' / ' + total + ' crystals secured' +
      (skipped ? '  Â·  ' + skipped + ' signal' + (skipped === 1 ? '' : 's') + ' skipped' : '');

    if (rcbLoreEl && loreUnlocked.length) {
      rcbLoreEl.innerHTML = '';
      loreUnlocked.slice(-5).forEach(function (e) {
        var span = document.createElement('span');
        span.className = 'rcb-lore-tag';
        span.textContent = 'ðŸ’Ž ' + e.title;
        rcbLoreEl.appendChild(span);
      });
      rcbLoreEl.style.display = '';
    }

    runBannerEl.style.display = '';
    runBannerEl.scrollIntoView && runBannerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideRunCompleteBanner() {
    if (runBannerEl) runBannerEl.style.display = 'none';
    if (rcbLoreEl) rcbLoreEl.style.display = 'none';
  }

  // â”€â”€ Sync payload prep â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function syncQuestRun(sessionData) {
    var payload = {
      sessionId:  sessionData.sessionId,
      score:      sessionData.score,
      answers:    sessionData.answers,
      skips:      sessionData.skips,
      completed:  true,
    };
    window.crystalQuestLastSyncPayload = payload;
    return payload;
  }
  window.syncQuestRun = syncQuestRun;

  // â”€â”€ Run session factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function createRunSession(questionSet, seed) {
    return {
      sessionId:  'cq-' + Date.now().toString(36) + '-' + secureToken(),
      seed:       seed,
      questionSet: questionSet,
      index:      0,
      skips:      0,
      started:    true,
      completed:  false,
      submitted:  false,
      answers:    [],
      startedAt:  Date.now(),
    };
  }

  // â”€â”€ Start run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function startRun() {
    var seed = nextSeed();
    var runLength = RUN_MIN + Math.floor(Math.abs(seed) % (RUN_MAX - RUN_MIN + 1));
    var hasEnough = await ensureQuestionSupply(runLength);

    if (!hasEnough) {
      if (feedback) feedback.textContent = 'âš ï¸ Not enough signals to start a run. Check lore packs.';
      sam.setIdle('Mission data unavailable.');
      return;
    }

    _cqInitFaction();
    var questionSet = unusedQuestions.splice(0, runLength);
    run = createRunSession(questionSet, seed);
    score = 0;
    streak = 0;
    clearAnswerInput();
    clearLoreLog();
    hideRunCompleteBanner();
    renderCurrentQuestion();
    showLoreLog();
    updateHud();

    sam.onRunStart();
    setGlow('pulse-start');
    playQuestSound('start');

    if (statusLine) statusLine.textContent = 'Session ' + run.sessionId + ' Â· seed ' + run.seed + ' Â· ' + runLength + ' missions.';
    if (feedback)   feedback.textContent   = 'ðŸ”® Run armed. Track the wiki trail and lock every crystal.';
  }

  // â”€â”€ Question progression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function advanceQuestion() {
    var q = getCurrentQuestion();
    if (!q || !run) return;
    usedQuestions.push(q);
    run.index += 1;

    if (run.index >= run.questionSet.length) {
      // â”€â”€ RUN COMPLETE â”€â”€
      run.completed = true;
      renderCurrentQuestion();
      updateHud();
      sam.onRunComplete();
      setGlow('pulse-complete');
      playQuestSound('correct');
      showRunCompleteBanner();
      syncQuestRun({
        sessionId: run.sessionId,
        score:     score,
        answers:   run.answers.slice(),
        skips:     run.skips,
      });
      finalizeCompletedRun();
      return;
    }

    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();
  }

  // â”€â”€ Submit answer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function submitAnswer() {
    if (!run || run.completed) return;
    var q = getCurrentQuestion();
    if (!q) return;

    var guess = normalizeAnswer(answerInput && answerInput.value);
    if (!guess) {
      if (feedback) feedback.textContent = 'Enter an answer before submitting.';
      return;
    }

    var validAnswers = getAliases(q);
    var isCorrect    = validAnswers.includes(guess);

    if (isCorrect) {
      streak += 1;
      var scoreGain = scoreForQuestion(q, streak);
      score += scoreGain;
      run.answers.push({ questionId: q.id, answer: guess, correct: true, skipped: false, scoreGain: scoreGain });
      addLoreEntry(q, scoreGain);
      sam.onCorrect(streak);
      if (streak >= 5) {
        setGlow('pulse-hype');
      } else {
        setGlow('pulse-correct');
      }
      playQuestSound('correct');
      // Apply cross-game score multiplier
      if (_cqModScoreMult !== 1) score = Math.round(score - scoreGain + scoreGain * _cqModScoreMult);
      // Emit combo milestone
      if (streak === 3 || streak === 5) {
        _cqEmitBus('arcade:perk-triggered', { gameId: GAME_ID, factionId: _cqFactionId, perkKey: 'comboStreak', ts: Date.now() });
        recordMissionProgress(_cqFactionId, 'combo', streak);
      }
      if (feedback) feedback.textContent = 'ðŸ’Ž Crystal secured: ' + (q.title || 'Lore entry') + '  (+' + scoreGain + ')';
    } else {
      streak = 0;
      run.answers.push({ questionId: q.id, answer: guess, correct: false, skipped: false, scoreGain: 0 });
      sam.onWrong();
      setGlow('pulse-error');
      playQuestSound('error');
      if (feedback) feedback.textContent = 'âŒ Signal mismatch. Re-read: ' + (q.wiki_url || 'the linked page.');
      return;   // stay on same question â€” wrong does not advance
    }

    advanceQuestion();
  }

  // â”€â”€ Skip question â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function skipQuestion() {
    if (!run || run.completed) return;
    if (skipsLeft() <= 0) {
      if (feedback) feedback.textContent = 'ï¿½ï¿½ No skips remaining. All signals are mandatory.';
      sam.onSkip(0);
      setGlow('pulse-warning');
      return;
    }

    var q = getCurrentQuestion();
    streak = 0;
    run.skips += 1;
    var penalty = 50;
    score = Math.max(0, score - penalty);
    run.answers.push({
      questionId: q && q.id,
      answer:     null,
      correct:    false,
      skipped:    true,
      scoreGain:  -penalty,
    });

    sam.onSkip(skipsLeft());
    setGlow('pulse-warning');
    playQuestSound('error');
    var remaining = skipsLeft();
    if (feedback) feedback.textContent = 'âš ï¸ Signal bypassed. -' + penalty + ' score. ' + remaining + ' skip' + (remaining === 1 ? '' : 's') + ' left.';

    advanceQuestion();
  }

  // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function init() {
    ensureParticles();
    setGlow('pulse-start');
    sam.setIdle();

    score = 0;
    streak = 0;
    run = null;
    loadedPackIndex = -1;
    unusedQuestions = [];
    usedQuestions   = [];
    knownQuestionIds = new Set();
    clearLoreLog();
    hideRunCompleteBanner();

    if (sourceLabel) sourceLabel.textContent = 'Loadingâ€¦';
    if (statusLine)  statusLine.textContent  = 'Initializing lore packsâ€¦';

    await ensureQuestionSupply(RUN_MIN);

    if (sourceLabel) sourceLabel.textContent = loadedPackIndex >= 0
      ? 'Pack ' + String(loadedPackIndex + 1).padStart(3, '0')
      : 'Unavailable';

    var linked = false;
    if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.isTelegramLinked === 'function') {
      linked = window.MOONBOYS_IDENTITY.isTelegramLinked();
    }

    if (statusLine) statusLine.textContent = linked
      ? 'Identity linked — leaderboard enabled after run completion.'
      : COPY.UNLINKED;

    renderCurrentQuestion();
    updateHud();

    if (startBtn)       startBtn.onclick       = function () { startRun().catch(function (e) { console.error(e); }); };
    if (submitBtn)      submitBtn.onclick      = submitAnswer;
    if (skipBtn)        skipBtn.onclick        = skipQuestion;
    if (resetBtn)       resetBtn.onclick       = reset;
    if (submitScoreBtn) submitScoreBtn.onclick = null;
    if (pauseBtn)       pauseBtn.onclick       = pause;

    if (answerInput) {
      answerInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && run && !run.completed) {
          e.preventDefault();
          submitAnswer();
        }
      });
    }
  }

  function start() {
    startRun().catch(function (e) { console.error('[crystal-quest] start failed:', e); });
  }

  function pause()  { stopAllSounds(); }

  function resume() { sam.setScanning('Signal reacquired. Continue the lore hunt.'); }

  function reset() {
    stopAllSounds();
    score  = 0;
    streak = 0;
    run    = null;
    clearLoreLog();
    hideRunCompleteBanner();
    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();
    setGlow('pulse-start');
    sam.onReset();
    if (feedback)   feedback.textContent   = 'Run cleared. Press Start Quest for a new lore hunt.';
    if (statusLine) statusLine.textContent = 'Ready.';
  }

  function destroy() {
    stopAllSounds();
    if (startBtn)       startBtn.onclick       = null;
    if (pauseBtn)       pauseBtn.onclick       = null;
    if (resetBtn)       resetBtn.onclick       = null;
    if (submitBtn)      submitBtn.onclick      = null;
    if (skipBtn)        skipBtn.onclick        = null;
    if (submitScoreBtn) submitScoreBtn.onclick = null;
  }

  function getScore() { return score; }

  return { init, start, pause, resume, reset, destroy, getScore };
}
