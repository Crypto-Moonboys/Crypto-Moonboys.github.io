import { loadGameData } from '/js/data-loader.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { CRYSTAL_QUEST_CONFIG } from './config.js';
import { createGameAdapter, registerGameAdapter, bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createSamAgent } from './sam-agent.js';
import { normalizeSignalAnswer, isSignalAnswerCorrect, isCloseSignalAnswerMatch, buildSignalAttemptHint } from './signal-vault-utils.mjs';
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

  // DOM refs
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
  var missionGrid    = document.getElementById('signalMissionGrid');
  var vaultStatus    = document.getElementById('signalVaultStatus');
  var samVaultCopy   = document.getElementById('samVaultCopy');
  var wikiTrailToggle  = document.getElementById('wikiTrailToggle');
  var wikiTrailPanel   = document.getElementById('wikiTrailPanel');
  var wikiTrailTitle   = document.getElementById('wikiTrailTitle');
  var wikiTrailClue    = document.getElementById('wikiTrailClue');
  var wikiTrailUrl     = document.getElementById('wikiTrailUrl');
  var wikiTrailDiff    = document.getElementById('wikiTrailDifficulty');
  var wikiTrailHint    = document.getElementById('wikiTrailHint');
  var wikiTrailPreviewTitle = document.getElementById('wikiTrailPreviewTitle');
  var wikiTrailPreviewBody  = document.getElementById('wikiTrailPreviewBody');
  var wikiTrailFullLink     = document.getElementById('wikiTrailFullLink');

  var startBtn       = document.getElementById('startBtn');
  var pauseBtn       = document.getElementById('pauseBtn');
  var resetBtn       = document.getElementById('resetBtn');
  var submitBtn      = document.getElementById('submitBtn');
  var skipBtn        = document.getElementById('skipBtn');
  var submitScoreBtn = document.getElementById('submitScoreBtn');
  var submitScoreStatus = document.getElementById('submitScoreStatus');

  var pulseLayer     = document.getElementById('crystalPulseLayer');
  var effectsLayer   = document.getElementById('crystalQuestEffectsLayer');
  var rootEl         = root || document.querySelector('.crystal-quest-card');
  var signalGridPanel = missionGrid && missionGrid.closest ? missionGrid.closest('.signal-grid-panel') : null;
  var samHead        = document.querySelector('.crystal-quest-card .sam-head');

  var samRoot    = document.getElementById('samAgent');
  var samMessage = document.getElementById('samMessage');

  var loreLogEl      = document.getElementById('loreLog');
  var loreLogEntries = document.getElementById('loreLogEntries');

  var runBannerEl    = document.getElementById('runCompleteBanner');
  var rcbScoreEl     = document.getElementById('rcbScore');
  var rcbStatsEl     = document.getElementById('rcbStats');
  var rcbLoreEl      = document.getElementById('rcbLore');

  var sam = createSamAgent({ root: samRoot, messageEl: samMessage });
  var boundAnswerKeydown = null;
  var boundDocumentKeydown = null;

  // Game state
  var score = 0;
  var streak = 0;
  var run = null;
  var loadedPackIndex = -1;
  var unusedQuestions = [];
  var usedQuestions   = [];
  var knownQuestionIds = new Set();
  var loreUnlocked = [];   // crystals secured this run
  var bestStreak = 0;
  var wikiTrailPreviewRequestId = 0;
  var transientSignalEffect = null;
  var effectCleanupTimers = [];
  var ROOT_TEMPORARY_EFFECT_CLASSES = [
    'cq-effect-correct',
    'cq-effect-wrong',
    'cq-effect-skip',
    'cq-effect-vault-sealed',
    'cq-streak-surge',
    'cq-hud-flash',
  ];
  var GRID_TEMPORARY_EFFECT_CLASSES = ['cq-grid-line-pulse'];
  var SAM_TEMPORARY_EFFECT_CLASSES = ['sam-warning-flicker'];

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

  // Visual helpers
  function setGlow(type) {
    if (!pulseLayer) return;
    pulseLayer.classList.remove('pulse-start', 'pulse-correct', 'pulse-error', 'pulse-warning', 'pulse-hype', 'pulse-complete');
    if (type) pulseLayer.classList.add(type);
  }

  function setVaultCopy(message) {
    if (vaultStatus) vaultStatus.textContent = message;
    if (samVaultCopy) samVaultCopy.textContent = 'Vault status: ' + message.toLowerCase();
  }

  function ensureParticles() {
    // Crystal Quest arcade-terminal redesign intentionally disables floating dots.
    // No DOM particles are created, which prevents decorative bottom overflow in fullscreen.
    return;
  }

  function queueEffectCleanup(fn, delay) {
    var timer = window.setTimeout(function () {
      effectCleanupTimers = effectCleanupTimers.filter(function (id) { return id !== timer; });
      fn();
    }, delay);
    effectCleanupTimers.push(timer);
    return timer;
  }

  function removeTemporaryEffectClasses() {
    if (rootEl) rootEl.classList.remove.apply(rootEl.classList, ROOT_TEMPORARY_EFFECT_CLASSES);
    if (signalGridPanel) signalGridPanel.classList.remove.apply(signalGridPanel.classList, GRID_TEMPORARY_EFFECT_CLASSES);
    if (samRoot) samRoot.classList.remove.apply(samRoot.classList, SAM_TEMPORARY_EFFECT_CLASSES);
    if (samHead) samHead.classList.remove.apply(samHead.classList, SAM_TEMPORARY_EFFECT_CLASSES);
  }

  function clearEffectTimers() {
    removeTemporaryEffectClasses();
    effectCleanupTimers.forEach(function (timer) { window.clearTimeout(timer); });
    effectCleanupTimers = [];
    removeTemporaryEffectClasses();
  }

  function setTransientSignalEffect(type, index, duration) {
    if (!run || typeof index !== 'number') return;
    transientSignalEffect = { type: type, index: index, expires: Date.now() + duration };
    queueEffectCleanup(function () {
      if (transientSignalEffect && transientSignalEffect.type === type && transientSignalEffect.index === index) {
        transientSignalEffect = null;
        renderMissionGrid();
      }
    }, duration + 40);
  }

  function addTemporaryClass(el, className, duration) {
    if (!el) return;
    el.classList.add(className);
    queueEffectCleanup(function () { el.classList.remove(className); }, duration);
  }

  function appendEffectNode(kind, parts, duration) {
    if (!effectsLayer) return;
    var effect = document.createElement('div');
    effect.className = 'cq-effect cq-effect-' + kind;
    parts.forEach(function (className) {
      var part = document.createElement('span');
      part.className = className;
      effect.appendChild(part);
    });
    effectsLayer.appendChild(effect);
    queueEffectCleanup(function () { effect.remove(); }, duration);
  }

  function triggerQuestEffect(kind, options) {
    var opts = options || {};
    var duration = opts.duration || 700;
    if (rootEl) rootEl.dataset.cqLastEffect = kind;
    if (kind === 'correct') {
      appendEffectNode('correct', ['cq-crystal-burst', 'cq-radial-shockwave', 'cq-signal-line-pulse'], duration);
      addTemporaryClass(rootEl, 'cq-effect-correct', duration);
      addTemporaryClass(rootEl, 'cq-hud-flash', 520);
      addTemporaryClass(signalGridPanel, 'cq-grid-line-pulse', 560);
    } else if (kind === 'wrong') {
      appendEffectNode('wrong', ['cq-glitch-slice'], 420);
      addTemporaryClass(rootEl, 'cq-effect-wrong', 360);
      addTemporaryClass(samRoot, 'sam-warning-flicker', 520);
      addTemporaryClass(samHead, 'sam-warning-flicker', 520);
    } else if (kind === 'skip') {
      appendEffectNode('skip', ['cq-bypass-arc'], 560);
      addTemporaryClass(rootEl, 'cq-effect-skip', 520);
      addTemporaryClass(rootEl, 'cq-hud-flash', 420);
    } else if (kind === 'streak') {
      appendEffectNode('streak', ['cq-energy-surge', 'cq-signal-line-pulse'], 860);
      addTemporaryClass(rootEl, 'cq-streak-surge', 840);
      addTemporaryClass(signalGridPanel, 'cq-grid-line-pulse', 760);
    } else if (kind === 'vault') {
      appendEffectNode('vault', ['cq-radial-shockwave', 'cq-signal-line-pulse'], 1100);
      addTemporaryClass(rootEl, 'cq-effect-vault-sealed', 1300);
      addTemporaryClass(signalGridPanel, 'cq-grid-line-pulse', 1100);
    }
  }

  var CRYSTAL_QUEST_GENERATED_TONES = {
    correct: { kind: 'chord', tones: [
      { type: 'sine', freqStart: 660, freqEnd: 880, duration: 0.08, volume: 0.035, delay: 0 },
      { type: 'triangle', freqStart: 990, freqEnd: 1320, duration: 0.12, volume: 0.032, delay: 0.04 },
    ] },
    error: { kind: 'tone', type: 'sawtooth', freqStart: 170, freqEnd: 72, duration: 0.16, volume: 0.042 },
    skip: { kind: 'tone', type: 'triangle', freqStart: 330, freqEnd: 590, duration: 0.13, volume: 0.034 },
    complete: { kind: 'chord', tones: [
      { type: 'sine', freqStart: 523, freqEnd: 523, duration: 0.12, volume: 0.036, delay: 0 },
      { type: 'sine', freqStart: 784, freqEnd: 784, duration: 0.14, volume: 0.034, delay: 0.09 },
      { type: 'triangle', freqStart: 1175, freqEnd: 1175, duration: 0.18, volume: 0.03, delay: 0.18 },
    ] },
    start: { kind: 'tone', type: 'sine', freqStart: 420, freqEnd: 840, duration: 0.1, volume: 0.028 },
  };

  // Audio helper
  function playQuestSound(soundId) {
    if (isMuted()) return;
    try { playSound(soundId, CRYSTAL_QUEST_GENERATED_TONES[soundId]); } catch (_) {}
  }


  // Wiki Trail helpers
  function isLocalWikiPath(url) {
    return typeof url === 'string' && /^\/wiki\/[a-z0-9][a-z0-9-]*\.html(?:[?#].*)?$/i.test(url);
  }

  function setWikiTrailFallback(message) {
    if (wikiTrailPreviewTitle) wikiTrailPreviewTitle.textContent = 'Preview unavailable';
    if (wikiTrailPreviewBody) wikiTrailPreviewBody.textContent = message || 'Open the full wiki page to inspect the signal trail.';
  }

  function setWikiTrailPreviewPlaceholder(message) {
    if (wikiTrailPreviewTitle) wikiTrailPreviewTitle.textContent = 'Safe preview';
    if (wikiTrailPreviewBody) wikiTrailPreviewBody.textContent = message || 'Open Wiki Trail to load a safe local preview.';
  }

  function isWikiTrailOpen() {
    return !!(wikiTrailPanel && !wikiTrailPanel.hasAttribute('hidden'));
  }

  function closeWikiTrail() {
    if (!wikiTrailPanel || !wikiTrailToggle || !isWikiTrailOpen()) return false;
    wikiTrailPanel.setAttribute('hidden', '');
    wikiTrailToggle.setAttribute('aria-expanded', 'false');
    wikiTrailToggle.textContent = 'Open Wiki Trail';
    wikiTrailPreviewRequestId += 1;
    setWikiTrailPreviewPlaceholder('Open Wiki Trail to load a safe local preview.');
    return true;
  }

  function openWikiTrail() {
    if (!wikiTrailPanel || !wikiTrailToggle) return;
    wikiTrailPanel.removeAttribute('hidden');
    wikiTrailToggle.setAttribute('aria-expanded', 'true');
    wikiTrailToggle.textContent = 'Close Wiki Trail';
    renderWikiTrailPanel();
  }

  function toggleWikiTrail() {
    if (isWikiTrailOpen()) closeWikiTrail();
    else openWikiTrail();
  }

  function isWikiTrailPreviewCurrent(requestId, questionId, wikiUrl) {
    var active = getCurrentQuestion();
    return requestId === wikiTrailPreviewRequestId &&
      !!active &&
      active.id === questionId &&
      active.wiki_url === wikiUrl &&
      isWikiTrailOpen();
  }

  function renderWikiTrailHint(question) {
    if (!wikiTrailHint) return;
    if (!run || !question) {
      wikiTrailHint.textContent = 'Hint state: start a run to unlock signal hints.';
      return;
    }
    var attempt = currentWrongAttempts(question);
    var tier = attempt <= 0 ? 'No wrong attempts yet' : 'Wrong-attempt tier ' + attempt;
    var hint = attempt <= 0
      ? 'Decode once for a soft hint; more exact-wording help unlocks after misses.'
      : buildWrongAttemptHint(question, attempt);
    wikiTrailHint.textContent = tier + ': ' + hint;
  }

  function extractWikiPreview(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script, style, noscript, iframe, object, embed').forEach(function (node) { node.remove(); });
    var heading = doc.querySelector('main h1, h1, .page-title, title');
    var title = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : 'Wiki signal preview';
    var body = '';
    var nodes = doc.querySelectorAll('main p, article p, .lore-paragraph, main li, article li, p, li');
    for (var i = 0; i < nodes.length; i++) {
      var text = nodes[i].textContent.replace(/\s+/g, ' ').trim();
      if (text && text.length >= 40 && !/^home\b|^navigation\b/i.test(text)) {
        body = text;
        break;
      }
    }
    if (!body) body = 'Open the full wiki page to continue the signal hunt.';
    if (body.length > 360) body = body.slice(0, 357).trim() + '...';
    return { title: title || 'Wiki signal preview', body: body };
  }

  async function loadWikiTrailPreview(question) {
    if (!wikiTrailPreviewTitle || !wikiTrailPreviewBody || !question) return;
    var url = question.wiki_url;
    var questionId = question.id;
    var requestId = ++wikiTrailPreviewRequestId;
    if (!isLocalWikiPath(url) || typeof fetch !== 'function' || typeof DOMParser === 'undefined') {
      setWikiTrailFallback('Preview unavailable here. Use the full wiki page link to follow the signal trail.');
      return;
    }
    wikiTrailPreviewTitle.textContent = 'Loading preview...';
    wikiTrailPreviewBody.textContent = 'Scanning the local wiki trail without leaving the run.';
    try {
      var response = await fetch(url, { credentials: 'same-origin' });
      if (!response || !response.ok) throw new Error('preview fetch failed');
      var preview = extractWikiPreview(await response.text());
      if (!isWikiTrailPreviewCurrent(requestId, questionId, url)) return;
      wikiTrailPreviewTitle.textContent = preview.title;
      wikiTrailPreviewBody.textContent = preview.body;
    } catch (_) {
      if (!isWikiTrailPreviewCurrent(requestId, questionId, url)) return;
      setWikiTrailFallback('Could not load the inline preview. The full wiki page link still works.');
    }
  }

  function renderWikiTrailPanel() {
    var q = getCurrentQuestion();
    if (!q) {
      wikiTrailPreviewRequestId += 1;
      if (wikiTrailTitle) wikiTrailTitle.textContent = 'No active signal';
      if (wikiTrailClue) wikiTrailClue.textContent = 'Start a Crystal Quest run to open an in-game wiki trail.';
      if (wikiTrailUrl) wikiTrailUrl.textContent = '—';
      if (wikiTrailDiff) wikiTrailDiff.textContent = 'Difficulty: —';
      if (wikiTrailFullLink) {
        wikiTrailFullLink.removeAttribute('href');
        wikiTrailFullLink.setAttribute('aria-disabled', 'true');
        wikiTrailFullLink.setAttribute('tabindex', '-1');
      }
      renderWikiTrailHint(null);
      setWikiTrailPreviewPlaceholder('Open Wiki Trail to load a safe local preview.');
      return;
    }
    if (wikiTrailTitle) wikiTrailTitle.textContent = q.title || 'Untitled mission';
    if (wikiTrailClue) wikiTrailClue.textContent = q.clue || 'No clue available.';
    if (wikiTrailUrl) wikiTrailUrl.textContent = q.wiki_url || '#';
    if (wikiTrailDiff) wikiTrailDiff.textContent = 'Difficulty: ' + (q.difficulty || 'unknown');
    if (wikiTrailFullLink) {
      wikiTrailFullLink.setAttribute('href', q.wiki_url || '#');
      wikiTrailFullLink.removeAttribute('aria-disabled');
      wikiTrailFullLink.removeAttribute('tabindex');
    }
    renderWikiTrailHint(q);
    if (!isWikiTrailOpen()) {
      wikiTrailPreviewRequestId += 1;
      setWikiTrailPreviewPlaceholder('Open Wiki Trail to load a safe local preview.');
      return;
    }
    loadWikiTrailPreview(q);
  }

  // Answer helpers
  function normalizeAnswer(value) {
    return normalizeSignalAnswer(value);
  }

  function currentWrongAttempts(question) {
    if (!run || !question) return 0;
    return run.answers.filter(function (a) {
      return a.questionId === question.id && !a.correct && !a.skipped;
    }).length;
  }

  function buildWrongAttemptHint(question, attempt) {
    return buildSignalAttemptHint(question, attempt);
  }

  function scoreForQuestion(question, currentStreak) {
    var baseScore = Number(question && question.rewards && question.rewards.score);
    if (!Number.isFinite(baseScore) || baseScore <= 0) baseScore = 100;
    var streakBonus = Math.max(0, Math.floor(currentStreak) * 12);
    return Math.floor(baseScore) + streakBonus;
  }

  // Seeded shuffle
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

  // Pack loading
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
    statusLine.textContent = 'Pack ' + (loadedPackIndex + 1) + ' online - ' + fresh.length + ' new signals.';

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

  // Run state helpers
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
    if (startBtn) {
      startBtn.disabled = active;
      startBtn.setAttribute('aria-disabled', active ? 'true' : 'false');
    }
    if (submitBtn) {
      submitBtn.disabled = !active;
      submitBtn.setAttribute('aria-disabled', active ? 'false' : 'true');
    }
    if (skipBtn) {
      skipBtn.disabled = !active;
      skipBtn.setAttribute('aria-disabled', active ? 'false' : 'true');
    }
    if (answerInput) {
      answerInput.disabled = !active;
      answerInput.setAttribute('aria-disabled', active ? 'false' : 'true');
    }
    if (submitScoreBtn) {
      submitScoreBtn.disabled = true;
      submitScoreBtn.hidden = true;
      submitScoreBtn.setAttribute('aria-hidden', 'true');
    }
    if (submitScoreStatus) {
      submitScoreStatus.textContent = run && run.completed
        ? 'Vault sealed - auto-submit triggered.'
        : 'Auto-submit arms when the vault seals.';
    }
  }

  // POST-RUN LOOP AUDIT — Crystal Quest
  // Legacy regression sentinel (not UI copy): Run complete. Score submitted to leaderboard.
  //
  // Game-over detection:  finalizeCompletedRun() is called when run.completed
  //   is set to true (all questions answered or time expired).
  //   Guard: run.submitted prevents re-submission per run.
  //
  // Score submission:     submitScore(ArcadeSync.getPlayer(), score, GAME_ID).catch(()=>{})
  //   — fire-and-forget from a synchronous handler (cannot await here).
  //   Only called when score > 0.
  //   Uses the shared post-run path in leaderboard-client.js.
  //
  // Public leaderboard:   submitScore() always attempts a public leaderboard POST.
  //
  // Arcade XP queue:      submitScore() calls ArcadeSync queuePendingProgress
  //   for unlinked users (always) and linked users on accepted runs.
  //
  // Local meta:           submitScore() calls ArcadeMeta trackGameResult for all
  //   runs (daily/weekly/monthly/seasonal clout, rabbit-hole branches, streaks).
  //
  // Telegram-linked users: When linked + signed auth, submitScore() attaches
  //   telegram_auth, calls callFactionEarn(), and calls
  //   ArcadeSync.syncPendingArcadeProgress() for server XP sync.
  //
  // Unlinked users:        Score goes to public leaderboard only; no XP sync
  //   claimed; run queued locally via queuePendingProgress.
  //
  // API unavailable:       submitScore() queues/pends; no false sync claimed.
  //
  // Retry queue:           localStorage moonboys_arcade_pending_progress_v1.
  function finalizeCompletedRun() {
    if (!run || !run.completed || run.submitted) return;
    ArcadeSync.setHighScore(GAME_ID, score);
    if (score > 0) {
      submitScore(ArcadeSync.getPlayer(), score, GAME_ID).catch(function () {});
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
        recordContribution(fId, 'score_submission', contrib);
        recordWarContribution(fId, contrib);
        checkRankUp(fId);
        emitFactionGain(fId, contrib, 'score_submission');
        recordMissionProgress(fId, 'war_contrib', contrib);
        _cqEmitBus('arcade:faction-signal', { gameId: GAME_ID, factionId: fId, amount: contrib, ts: Date.now() });
        _cqEmitBus('arcade:mission-progress', { gameId: GAME_ID, factionId: fId, ts: Date.now() });
      }
    } catch (_) {}
    if (feedback)   feedback.textContent   = 'Vault Sealed. Score submission handled by the run finalizer.';
    if (statusLine) statusLine.textContent = 'Vault sealed at score ' + score + '.';
  }

  // HUD
  function updateHud() {
    if (scoreCount)     scoreCount.textContent     = String(score);
    if (streakCount)    streakCount.textContent     = String(streak);
    if (remainingCount) remainingCount.textContent = String(remainingQuestions());
    if (skipsLeftCount) skipsLeftCount.textContent = String(skipsLeft());
    renderMissionGrid();
    syncRunButtons();
  }

  // Difficulty badge
  var DIFF_LABELS = { easy: 'LOW RISK', medium: 'MEDIUM RISK', hard: 'HIGH RISK', default: 'UNKNOWN' };
  var DIFF_CLASSES = { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' };

  function renderDifficultyBadge(difficulty) {
    if (!questDiff) return;
    var key = String(difficulty || '').toLowerCase();
    questDiff.textContent = DIFF_LABELS[key] || DIFF_LABELS['default'];
    questDiff.className = 'diff-badge ' + (DIFF_CLASSES[key] || 'diff-unknown');
    questDiff.style.display = 'inline-block';
  }

  // Mission progress
  function renderMissionProgress() {
    if (!questProgress || !run) return;
    var total = run.questionSet.length;
    var done  = Math.min(run.index + 1, total);
    questProgress.textContent = 'Signal ' + done + ' of ' + total;
  }

  function renderMissionGrid() {
    if (!missionGrid) return;
    missionGrid.innerHTML = '';
    if (!run || !run.questionSet || !run.questionSet.length) {
      setVaultCopy('Vault standby');
      return;
    }
    run.questionSet.forEach(function (_q, idx) {
      var node = document.createElement('div');
      var state = run.missionStates && run.missionStates[idx] ? run.missionStates[idx] : 'locked';
      if (idx === run.index && !run.completed && state !== 'secured' && state !== 'bypassed') state = state === 'error' ? 'active error' : 'active';
      var ariaState = state.replace(/\s+/g, ' ').trim();
      var nodeClasses = ['signal-node'].concat(state.split(/\s+/));
      if (transientSignalEffect && transientSignalEffect.index === idx && transientSignalEffect.expires > Date.now()) {
        if (transientSignalEffect.type === 'correct') nodeClasses.push('signal-node-secured-burst');
        if (transientSignalEffect.type === 'wrong') nodeClasses.push('signal-node-error-pulse');
        if (transientSignalEffect.type === 'skip') nodeClasses.push('signal-node-bypass-crack');
        if (transientSignalEffect.type === 'streak') nodeClasses.push('signal-node-streak-surge');
      }
      if (run.completed && state === 'secured') {
        nodeClasses.push('cq-vault-seal-step');
        node.style.animationDelay = String(Math.min(idx * 80, 720)) + 'ms';
      }
      node.className = nodeClasses.join(' ');
      node.setAttribute('aria-label', 'Signal ' + (idx + 1) + ' ' + ariaState);
      node.setAttribute('role', 'listitem');
      var label = document.createElement('span');
      label.textContent = String(idx + 1).padStart(2, '0');
      node.appendChild(label);
      missionGrid.appendChild(node);
    });
    if (run.completed) setVaultCopy('Vault sealed');
    else setVaultCopy('Scanning signal ' + (run.index + 1) + '/' + run.questionSet.length);
  }

  // Quest renderer
  function renderCurrentQuestion() {
    var q = getCurrentQuestion();
    if (!q) {
      var sealed = !!(run && run.completed);
      if (questTitle)    questTitle.textContent  = sealed ? 'Vault sealed' : 'No active mission';
      if (questClue)     questClue.textContent   = sealed ? 'Vault sealed. Run complete.' : 'Run not started. Press Start Quest to begin a lore hunt run.';
      if (questLink)     { questLink.href = '#'; questLink.textContent = '—'; }
      if (questDiff)     questDiff.style.display = 'none';
      if (questProgress) questProgress.textContent = sealed ? 'Vault sealed' : 'Run not started';
      if (feedback && !sealed) feedback.textContent = 'Run not started. Press Start Quest to arm the Signal Vault.';
      renderWikiTrailPanel();
      return;
    }
    if (questTitle) questTitle.textContent = q.title || 'Untitled mission';
    if (questClue)  questClue.textContent  = q.clue  || 'No clue available.';
    if (questLink)  { questLink.href = q.wiki_url || '#'; questLink.textContent = q.wiki_url || '#'; }
    renderDifficultyBadge(q.difficulty);
    renderMissionProgress();
    renderWikiTrailPanel();
  }

  function clearAnswerInput() {
    if (answerInput) answerInput.value = '';
  }

  // Lore discovery log
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
    icon.textContent = '💎';
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

  // Run complete banner
  function showRunCompleteBanner() {
    if (!runBannerEl) return;

    var correct = run.answers.filter(function (a) { return a.correct; }).length;
    var skipped = run.skips;
    var total   = run.questionSet.length;

    if (rcbScoreEl)  rcbScoreEl.textContent  = String(score);
    if (rcbStatsEl)  rcbStatsEl.textContent  =
      'Final score: ' + score + ' · Crystals secured: ' + correct + '/' + total +
      ' · Bypassed signals: ' + skipped + ' · Best streak: ' + bestStreak;

    if (rcbLoreEl && loreUnlocked.length) {
      rcbLoreEl.innerHTML = '';
      loreUnlocked.slice(-5).forEach(function (e) {
        var span = document.createElement('span');
        span.className = 'rcb-lore-tag';
        span.textContent = '💎 ' + e.title;
        rcbLoreEl.appendChild(span);
      });
      var label = document.createElement('span');
      label.className = 'rcb-lore-tag';
      label.textContent = 'Latest secured crystals';
      rcbLoreEl.insertBefore(label, rcbLoreEl.firstChild);
      rcbLoreEl.style.display = '';
    }

    runBannerEl.style.display = '';
    runBannerEl.scrollIntoView && runBannerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideRunCompleteBanner() {
    if (runBannerEl) runBannerEl.style.display = 'none';
    if (rcbLoreEl) { rcbLoreEl.style.display = 'none'; rcbLoreEl.innerHTML = ''; }
  }

  // Sync payload prep
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

  // Run session factory
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
      missionStates: questionSet.map(function () { return 'locked'; }),
      startedAt:  Date.now(),
    };
  }

  // Start run
  async function startRun() {
    var seed = nextSeed();
    var runLength = RUN_MIN + Math.floor(Math.abs(seed) % (RUN_MAX - RUN_MIN + 1));
    var hasEnough = await ensureQuestionSupply(runLength);

    if (!hasEnough) {
      if (feedback) feedback.textContent = 'Warning: Not enough signals to start a run. Check lore packs.';
      sam.setIdle('Mission data unavailable.');
      return;
    }

    _cqInitFaction();
    var questionSet = unusedQuestions.splice(0, runLength);
    run = createRunSession(questionSet, seed);
    score = 0;
    streak = 0;
    bestStreak = 0;
    clearEffectTimers();
    transientSignalEffect = null;
    if (effectsLayer) effectsLayer.innerHTML = '';
    clearAnswerInput();
    clearLoreLog();
    hideRunCompleteBanner();
    renderCurrentQuestion();
    showLoreLog();
    updateHud();

    renderMissionGrid();
    sam.onRunStart();
    setGlow('pulse-start');
    playQuestSound('start');

    if (statusLine) statusLine.textContent = 'Session ' + run.sessionId + ' · seed ' + run.seed + ' · ' + runLength + ' signals.';
    if (feedback)   feedback.textContent   = 'Signal Vault armed. Decode each lore signal and secure every crystal.';
  }

  // Question progression
  function advanceQuestion() {
    var q = getCurrentQuestion();
    if (!q || !run) return;
    usedQuestions.push(q);
    run.index += 1;

    if (run.index >= run.questionSet.length) {
      // Vault sealed
      run.completed = true;
      renderCurrentQuestion();
      updateHud();
      sam.onRunComplete();
      setGlow('pulse-complete');
      triggerQuestEffect('vault', { duration: 1200 });
      playQuestSound('complete');
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

  // Submit answer
  function submitAnswer() {
    if (!run || run.completed) return;
    var q = getCurrentQuestion();
    if (!q) return;

    var guess = normalizeAnswer(answerInput && answerInput.value);
    if (!guess) {
      if (feedback) feedback.textContent = 'Enter an answer before submitting.';
      return;
    }

    var isCorrect = isSignalAnswerCorrect(q, answerInput && answerInput.value);

    if (isCorrect) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      if (run.missionStates) run.missionStates[run.index] = 'secured';
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
      setTransientSignalEffect('correct', run.index, 680);
      triggerQuestEffect('correct', { duration: 700 });
      playQuestSound('correct');
      // Apply cross-game score multiplier
      if (_cqModScoreMult !== 1) score = Math.round(score - scoreGain + scoreGain * _cqModScoreMult);
      // Emit combo milestone
      if (streak === 3 || streak === 5) {
        setTransientSignalEffect('streak', run.index, 880);
        triggerQuestEffect('streak', { duration: 880 });
        _cqEmitBus('arcade:perk-triggered', { gameId: GAME_ID, factionId: _cqFactionId, perkKey: 'comboStreak', ts: Date.now() });
        recordMissionProgress(_cqFactionId, 'combo', streak);
      }
      if (feedback) feedback.textContent = 'Crystal Secured: ' + (q.title || 'Lore entry') + ' (+' + scoreGain + ')';
    } else {
      streak = 0;
      run.answers.push({ questionId: q.id, answer: guess, correct: false, skipped: false, scoreGain: 0 });
      if (run.missionStates) run.missionStates[run.index] = 'error';
      renderMissionGrid();
      var attemptCount = currentWrongAttempts(q);
      var wrongHint = buildWrongAttemptHint(q, attemptCount);
      if (isCloseSignalAnswerMatch(q, answerInput && answerInput.value)) {
        wrongHint = 'Close signal match — check exact wording. ' + wrongHint;
      }
      renderWikiTrailHint(q);
      sam.onWrong(wrongHint);
      setGlow('pulse-error');
      setTransientSignalEffect('wrong', run.index, 520);
      renderMissionGrid();
      triggerQuestEffect('wrong', { duration: 520 });
      playQuestSound('error');
      if (feedback) feedback.textContent = wrongHint;
      return;   // stay on same question - wrong does not advance
    }

    advanceQuestion();
  }

  // Skip question
  function skipQuestion() {
    if (!run || run.completed) return;
    if (skipsLeft() <= 0) {
      if (feedback) feedback.textContent = 'No bypasses remaining. All signals are mandatory.';
      sam.onSkip(0);
      setGlow('pulse-warning');
      return;
    }

    var q = getCurrentQuestion();
    streak = 0;
    run.skips += 1;
    if (run.missionStates) run.missionStates[run.index] = 'bypassed';
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
    setTransientSignalEffect('skip', run.index, 620);
    triggerQuestEffect('skip', { duration: 620 });
    playQuestSound('skip');
    var remaining = skipsLeft();
    if (feedback) feedback.textContent = 'Signal bypassed. -' + penalty + ' score. ' + remaining + ' bypass' + (remaining === 1 ? '' : 'es') + ' left.';

    advanceQuestion();
  }

  // Lifecycle
  async function init() {
    ensureParticles();
    clearEffectTimers();
    if (effectsLayer) effectsLayer.innerHTML = '';
    transientSignalEffect = null;
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

    if (sourceLabel) sourceLabel.textContent = 'Loading...';
    if (statusLine)  statusLine.textContent  = 'Initializing lore packs...';

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
    if (wikiTrailToggle) wikiTrailToggle.onclick = toggleWikiTrail;

    if (!boundAnswerKeydown) {
      boundAnswerKeydown = function (e) {
        if (e.key === 'Enter' && run && !run.completed) {
          e.preventDefault();
          submitAnswer();
        }
      };
    }
    if (answerInput) answerInput.addEventListener('keydown', boundAnswerKeydown);

    if (!boundDocumentKeydown) {
      boundDocumentKeydown = function (e) {
        if (e.key === 'Escape' && isWikiTrailOpen()) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          closeWikiTrail();
          if (wikiTrailToggle) wikiTrailToggle.focus();
        }
      };
    }
    document.addEventListener('keydown', boundDocumentKeydown, true);
  }

  function start() {
    startRun().catch(function (e) { console.error('[crystal-quest] start failed:', e); });
  }

  function pause()  { stopAllSounds(); }

  function resume() { sam.setScanning('Signal reacquired. Continue the lore hunt.'); }

  function reset() {
    stopAllSounds();
    clearEffectTimers();
    transientSignalEffect = null;
    if (effectsLayer) effectsLayer.innerHTML = '';
    score  = 0;
    streak = 0;
    bestStreak = 0;
    run    = null;
    clearLoreLog();
    hideRunCompleteBanner();
    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();
    setGlow('pulse-start');
    sam.onReset();
    closeWikiTrail();
    if (feedback)   feedback.textContent   = 'Run not started. Run cleared; press Start Quest to arm a new Signal Vault.';
    if (statusLine) statusLine.textContent = 'Ready.';
  }

  function destroy() {
    stopAllSounds();
    clearEffectTimers();
    transientSignalEffect = null;
    if (effectsLayer) effectsLayer.innerHTML = '';
    if (startBtn)       startBtn.onclick       = null;
    if (pauseBtn)       pauseBtn.onclick       = null;
    if (resetBtn)       resetBtn.onclick       = null;
    if (submitBtn)      submitBtn.onclick      = null;
    if (skipBtn)        skipBtn.onclick        = null;
    if (submitScoreBtn) submitScoreBtn.onclick = null;
    if (wikiTrailToggle) wikiTrailToggle.onclick = null;
    if (answerInput && boundAnswerKeydown) answerInput.removeEventListener('keydown', boundAnswerKeydown);
    if (boundDocumentKeydown) document.removeEventListener('keydown', boundDocumentKeydown, true);
  }

  function getScore() { return score; }

  return { init, start, pause, resume, reset, destroy, getScore };
}
