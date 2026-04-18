import { loadGameData } from '/js/data-loader.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { CRYSTAL_QUEST_CONFIG } from './config.js';
import { GameRegistry } from '/js/arcade/core/game-registry.js';
import { playSound, stopAllSounds, isMuted } from '/js/arcade/core/audio.js';
import { createSamAgent } from './sam-agent.js';

GameRegistry.register(CRYSTAL_QUEST_CONFIG.id, {
  label: CRYSTAL_QUEST_CONFIG.label,
  bootstrap: bootstrapCrystalQuest,
});

export function bootstrapCrystalQuest(root) {
  var GAME_ID = CRYSTAL_QUEST_CONFIG.id;
  var LEADERBOARD_GAME_ID = 'CRYSTAL_QUEST';
  var PACKS = ['/games/data/question_pack_001.json', '/games/data/question_pack_002.json'];
  var MAX_SKIPS = 2;
  var RUN_MIN = 5;
  var RUN_MAX = 10;

  var scoreCount = document.getElementById('scoreCount');
  var streakCount = document.getElementById('streakCount');
  var remainingCount = document.getElementById('remainingCount');
  var skipsLeftCount = document.getElementById('skipsLeftCount');
  var questTitle = document.getElementById('questTitle');
  var questClue = document.getElementById('questClue');
  var questLink = document.getElementById('questLink');
  var feedback = document.getElementById('feedback');
  var statusLine = document.getElementById('statusLine');
  var answerInput = document.getElementById('answerInput');
  var sourceLabel = document.getElementById('sourceLabel');

  var startBtn = document.getElementById('startBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var resetBtn = document.getElementById('resetBtn');
  var submitBtn = document.getElementById('submitBtn');
  var skipBtn = document.getElementById('skipBtn');
  var submitScoreBtn = document.getElementById('submitScoreBtn');

  var pulseLayer = document.getElementById('crystalPulseLayer');
  var particleLayer = document.getElementById('crystalParticles');

  var samRoot = document.getElementById('samAgent');
  var samMessage = document.getElementById('samMessage');

  var sam = createSamAgent({ root: samRoot, messageEl: samMessage });

  var score = 0;
  var streak = 0;
  var run = null;
  var loadedPackIndex = -1;
  var unusedQuestions = [];
  var usedQuestions = [];
  var knownQuestionIds = new Set();

  function setGlow(type) {
    if (!pulseLayer) return;
    pulseLayer.classList.remove('pulse-start', 'pulse-correct', 'pulse-error', 'pulse-warning');
    if (type) pulseLayer.classList.add(type);
  }

  function ensureParticles() {
    if (!particleLayer || particleLayer.childElementCount) return;
    for (var i = 0; i < 24; i++) {
      var dot = document.createElement('span');
      dot.className = 'crystal-particle';
      dot.style.left = Math.floor(Math.random() * 100) + '%';
      dot.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
      dot.style.animationDuration = (2.8 + Math.random() * 3.2).toFixed(2) + 's';
      dot.style.opacity = (0.2 + Math.random() * 0.6).toFixed(2);
      particleLayer.appendChild(dot);
    }
  }

  function playQuestSound(soundId) {
    if (isMuted()) return;
    try { playSound(soundId); } catch (_) {}
  }

  function normalizeAnswer(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function getAliases(question) {
    var accepted = Array.isArray(question && question.accepted_answers) ? question.accepted_answers : [];
    var aliases = Array.isArray(question && question.aliases) ? question.aliases : [];
    return accepted.concat(aliases).map(normalizeAnswer);
  }

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
      var temp = out[i];
      out[i] = out[j];
      out[j] = temp;
    }
    return out;
  }

  function nextSeed() {
    return Math.floor(Math.random() * 0x7fffffff);
  }

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

    var seeded = shuffle(fresh, nextSeed());
    unusedQuestions = unusedQuestions.concat(seeded);
    sourceLabel.textContent = 'Pack ' + String(loadedPackIndex + 1).padStart(3, '0');
    statusLine.textContent = 'Loaded ' + path + ' (' + fresh.length + ' questions).';
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
      statusLine.textContent = 'Question pool exhausted. Starting a fresh cycle.';
    }

    return unusedQuestions.length >= minCount;
  }

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
    if (startBtn) startBtn.disabled = active;
    if (submitBtn) submitBtn.disabled = !active;
    if (skipBtn) skipBtn.disabled = !active || skipsLeft() <= 0;
    if (submitScoreBtn) submitScoreBtn.disabled = !(run && run.completed && !run.submitted);
  }

  function updateHud() {
    if (scoreCount) scoreCount.textContent = String(score);
    if (streakCount) streakCount.textContent = String(streak);
    if (remainingCount) remainingCount.textContent = String(remainingQuestions());
    if (skipsLeftCount) skipsLeftCount.textContent = String(skipsLeft());
    syncRunButtons();
  }

  function renderCurrentQuestion() {
    var q = getCurrentQuestion();
    if (!q) {
      questTitle.textContent = 'No active mission';
      questClue.textContent = 'Press Start Quest to begin a run.';
      questLink.href = '#';
      questLink.textContent = '—';
      return;
    }

    questTitle.textContent = q.title || 'Untitled mission';
    questClue.textContent = q.clue || 'No clue available.';
    questLink.href = q.wiki_url || '#';
    questLink.textContent = q.wiki_url || '#';
  }

  function clearAnswerInput() {
    if (answerInput) answerInput.value = '';
  }

  function syncQuestRun(sessionData) {
    var payload = {
      sessionId: sessionData.sessionId,
      score: sessionData.score,
      answers: sessionData.answers,
      skips: sessionData.skips,
      completed: true,
    };
    window.__crystalQuestLastSyncPayload = payload;
    return payload;
  }

  window.syncQuestRun = syncQuestRun;

  function createRunSession(questionSet, seed) {
    return {
      sessionId: 'cq-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 99999).toString(36),
      seed: seed,
      questionSet: questionSet,
      index: 0,
      skips: 0,
      started: true,
      completed: false,
      submitted: false,
      answers: [],
      startedAt: Date.now(),
    };
  }

  async function startRun() {
    var seed = nextSeed();
    var runLength = RUN_MIN + Math.floor((seed % (RUN_MAX - RUN_MIN + 1)));
    var hasEnough = await ensureQuestionSupply(runLength);

    if (!hasEnough) {
      feedback.textContent = 'Not enough questions to start a run.';
      sam.setIdle('Mission data unavailable.');
      return;
    }

    var questionSet = unusedQuestions.splice(0, runLength);
    run = createRunSession(questionSet, seed);
    score = 0;
    streak = 0;
    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();

    sam.setScanning('Quest armed. Track the signal.');
    setGlow('pulse-start');
    playQuestSound('start');

    statusLine.textContent = 'Session ' + run.sessionId + ' seeded at ' + run.seed + '.';
    feedback.textContent = 'Run started. Solve each mission to lock your final score.';
  }

  function completeCurrentQuestion() {
    var q = getCurrentQuestion();
    if (!q || !run) return;
    usedQuestions.push(q);
    run.index += 1;

    if (run.index >= run.questionSet.length) {
      run.completed = true;
      renderCurrentQuestion();
      updateHud();
      sam.onRunComplete();
      setGlow('pulse-start');
      feedback.textContent = 'Run complete. Submit your score to leaderboard.';
      syncQuestRun({
        sessionId: run.sessionId,
        score: score,
        answers: run.answers.slice(),
        skips: run.skips,
      });
      return;
    }

    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();
  }

  function submitAnswer() {
    if (!run || run.completed) return;
    var q = getCurrentQuestion();
    if (!q) return;

    var guess = normalizeAnswer(answerInput && answerInput.value);
    if (!guess) {
      feedback.textContent = 'Enter an answer before submitting.';
      return;
    }

    var answers = getAliases(q);
    var isCorrect = answers.includes(guess);

    if (isCorrect) {
      streak += 1;
      var scoreGain = 100 + (streak * 20);
      score += scoreGain;
      run.answers.push({ questionId: q.id, answer: guess, correct: true, skipped: false, scoreGain: scoreGain });
      feedback.textContent = '✅ Correct. Mission progress locked.';
      sam.onCorrect(streak >= 3);
      setGlow('pulse-correct');
      playQuestSound('correct');
    } else {
      streak = 0;
      run.answers.push({ questionId: q.id, answer: guess, correct: false, skipped: false, scoreGain: 0 });
      feedback.textContent = '❌ Data mismatch. Re-check the linked lore and continue.';
      sam.onWrong();
      setGlow('pulse-error');
      playQuestSound('error');
    }

    completeCurrentQuestion();
  }

  function skipQuestion() {
    if (!run || run.completed) return;
    if (skipsLeft() <= 0) {
      feedback.textContent = 'No skips left in this run.';
      sam.onLowSkips();
      setGlow('pulse-warning');
      return;
    }

    var q = getCurrentQuestion();
    streak = 0;
    run.skips += 1;
    score = Math.max(0, score - 50);
    run.answers.push({
      questionId: q && q.id,
      answer: null,
      correct: false,
      skipped: true,
      scoreGain: -50,
    });

    feedback.textContent = '⚠️ Skip used. -50 score penalty applied.';
    sam.onSkip();
    setGlow('pulse-warning');
    playQuestSound('error');

    if (skipsLeft() === 0) {
      sam.onLowSkips();
    }

    completeCurrentQuestion();
  }

  function submitFinalScore() {
    if (!run || !run.completed || run.submitted) return;

    ArcadeSync.setHighScore(GAME_ID, score);
    submitScore(ArcadeSync.getPlayer(), score, LEADERBOARD_GAME_ID);
    run.submitted = true;
    updateHud();

    feedback.textContent = 'Score submitted for this completed run.';
    statusLine.textContent = 'Submission ready: local high score saved; linked identity submits to leaderboard.';
  }

  async function init() {
    ensureParticles();
    setGlow('pulse-start');
    sam.setIdle('Awaiting mission command.');

    score = 0;
    streak = 0;
    run = null;
    loadedPackIndex = -1;
    unusedQuestions = [];
    usedQuestions = [];
    knownQuestionIds = new Set();

    sourceLabel.textContent = 'Loading…';
    statusLine.textContent = 'Initializing Crystal Quest packs…';

    await ensureQuestionSupply(RUN_MIN);

    sourceLabel.textContent = loadedPackIndex >= 0
      ? ('Pack ' + String(loadedPackIndex + 1).padStart(3, '0'))
      : 'Unavailable';

    var linked = !!(window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.isTelegramLinked === 'function'
      ? window.MOONBOYS_IDENTITY.isTelegramLinked()
      : false);

    statusLine.textContent = linked
      ? 'Identity linked: leaderboard submissions enabled after run completion.'
      : 'Identity not linked: score stays local until account is linked.';

    renderCurrentQuestion();
    updateHud();

    if (startBtn) startBtn.onclick = function () { startRun().catch(function (err) { console.error(err); }); };
    if (submitBtn) submitBtn.onclick = submitAnswer;
    if (skipBtn) skipBtn.onclick = skipQuestion;
    if (resetBtn) resetBtn.onclick = reset;
    if (submitScoreBtn) submitScoreBtn.onclick = submitFinalScore;
    if (pauseBtn) pauseBtn.onclick = pause;
  }

  function start() {
    startRun().catch(function (err) { console.error('[crystal-quest] start failed:', err); });
  }

  function pause() {
    stopAllSounds();
  }

  function resume() {
    sam.setScanning('Signal reacquired. Continue the run.');
  }

  function reset() {
    stopAllSounds();
    score = 0;
    streak = 0;
    run = null;
    feedback.textContent = 'Run reset. Press Start Quest for a new seeded session.';
    statusLine.textContent = 'Ready.';
    sam.setIdle('Run reset. Awaiting command.');
    setGlow('pulse-start');
    clearAnswerInput();
    renderCurrentQuestion();
    updateHud();
  }

  function destroy() {
    stopAllSounds();
    if (startBtn) startBtn.onclick = null;
    if (pauseBtn) pauseBtn.onclick = null;
    if (resetBtn) resetBtn.onclick = null;
    if (submitBtn) submitBtn.onclick = null;
    if (skipBtn) skipBtn.onclick = null;
    if (submitScoreBtn) submitScoreBtn.onclick = null;
  }

  function getScore() {
    return score;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}
