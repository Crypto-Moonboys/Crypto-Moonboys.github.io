import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { playSound } from '/js/arcade/core/audio.js';

const STREAK_GAP_MS = 45 * 60 * 1000;
const LIVE_EVENT_COOLDOWN_MS = 25000;
const LIVE_EVENTS = [
  { id: 'invert_controls', label: 'INVERT CONTROLS', rarity: 'epic', durationMs: 6000, uiMultiplier: 1.2 },
  { id: 'slow_time', label: 'SLOW TIME', rarity: 'rare', durationMs: 5000, uiMultiplier: 1.1 },
  { id: 'chaos_mode', label: 'CHAOS MODE', rarity: 'wtf', durationMs: 4500, uiMultiplier: 1.25 },
];
const GAME_ID_MAP = {
  snakeCanvas: 'snake',
  invCanvas: 'invaders',
  brkCanvas: 'breakout',
  pacCanvas: 'pacchain',
  tetCanvas: 'tetris',
  astCanvas: 'asteroid-fork',
  btqmCanvas: 'btqm',
};

let uiRoot = null;
let popupRoot = null;
let nearMissHint = null;
let hudDaily = null;
let hudQuests = null;
let hudStreak = null;
let hudMultiplier = null;
let streakBarInner = null;
let streakCountdown = null;
let runActive = false;
let runPaused = false;
let survivalTimer = null;
let scoreObserver = null;
let comboObserver = null;
let lastScore = 0;
let lastComboValue = 1;
let hintTimeout = null;
let liveEventTimer = null;
let chaosPulseTimer = null;
let lastLiveEventAt = 0;
let activeLiveEvent = null;

function isArcadeGamePage() {
  return !!document.getElementById('startBtn') && !!document.querySelector('.game-card');
}

function safePlay(soundId) {
  try { playSound(soundId); } catch (_) {}
}

function detectGameId() {
  const ids = Object.keys(GAME_ID_MAP);
  for (const id of ids) {
    if (document.getElementById(id)) return GAME_ID_MAP[id];
  }
  const path = (location.pathname || '').toLowerCase();
  if (path.includes('invaders')) return 'invaders';
  if (path.includes('breakout')) return 'breakout';
  if (path.includes('pac-chain')) return 'pacchain';
  if (path.includes('tetris')) return 'tetris';
  if (path.includes('asteroid')) return 'asteroid-fork';
  if (path.includes('block-topia-quest-maze')) return 'btqm';
  if (path.includes('crystal-quest')) return 'crystal';
  return 'global';
}

function parseNumeric(text) {
  const clean = String(text || '').replace(/[^0-9.]/g, '');
  const value = Number(clean);
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function questProgress(quest, state) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const windowRuns = history.filter((h) => {
    const ts = Number(h?.timestamp);
    return Number.isFinite(ts)
      && ts >= Number(quest.created_at || 0)
      && ts <= Number(quest.expires_at || Number.MAX_SAFE_INTEGER);
  });
  if (!windowRuns.length) return 0;

  if (quest.type === 'score_target') {
    const target = Math.max(1, Number(quest.target) || 1);
    const best = windowRuns
      .filter((h) => h.game === quest.game)
      .reduce((max, h) => Math.max(max, Number(h.raw_score) || 0), 0);
    return clamp(best / target, 0, 1);
  }

  if (quest.type === 'multi_game_burst') {
    const requiredRuns = Math.max(1, Number(quest.required_runs) || 2);
    const requiredUnique = Math.max(1, Number(quest.required_unique_games) || 2);
    const windowMs = Number(quest.window_ms) || (5 * 60 * 1000);
    const latestTs = windowRuns[windowRuns.length - 1]?.timestamp || Date.now();
    const burstRuns = windowRuns.filter((h) => Number(h.timestamp) >= latestTs - windowMs);
    const runRatio = burstRuns.length / requiredRuns;
    const uniqueRatio = new Set(burstRuns.map((h) => h.game)).size / requiredUnique;
    return clamp(Math.min(runRatio, uniqueRatio), 0, 1);
  }

  if (quest.type === 'snake_survivor') {
    const target = Math.max(1, Number(quest.min_duration_ms) || 60000);
    const bestDuration = windowRuns
      .filter((h) => h.game === 'snake')
      .reduce((max, h) => Math.max(max, Number(h.duration) || 0), 0);
    return clamp(bestDuration / target, 0, 1);
  }

  if (quest.type === 'btqm_zone_clear') {
    const target = Math.max(1, Number(quest.target) || 1);
    const best = windowRuns
      .filter((h) => h.game === 'btqm')
      .reduce((max, h) => Math.max(max, Number(h.raw_score) || 0), 0);
    return clamp(best / target, 0, 1);
  }

  if (quest.type === 'switch_chain') {
    const switches = Math.max(1, Number(quest.switches) || 2);
    const ordered = windowRuns.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    let switchCount = 0;
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].game && ordered[i - 1].game && ordered[i].game !== ordered[i - 1].game) {
        switchCount += 1;
      }
    }
    return clamp(switchCount / switches, 0, 1);
  }

  return 0;
}

function evaluateQuestNearMiss(state) {
  const active = Array.isArray(state?.quests?.active) ? state.quests.active : [];
  let best = null;
  for (const quest of active) {
    const progress = questProgress(quest, state);
    if (progress >= 0.8 && progress < 1) {
      if (!best || progress > best.progress) best = { quest, progress };
    }
  }
  return best;
}

function injectStyles() {
  if (document.getElementById('arcade-meta-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'arcade-meta-ui-style';
  style.textContent = `
    #arcade-meta-ui{position:fixed;inset:0;pointer-events:none;z-index:9999}
    #arcade-meta-hud{position:fixed;right:14px;top:78px;display:grid;gap:6px;background:rgba(6,8,15,.72);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:10px 12px;min-width:190px;backdrop-filter:blur(4px)}
    #arcade-meta-hud .meta-row{display:flex;justify-content:space-between;gap:12px;font-size:.74rem;color:#ccd7ff}
    #arcade-meta-hud .meta-val{font-weight:700;color:#fff}
    #arcade-meta-streak-pressure{margin-top:2px}
    #arcade-meta-streak-pressure .meta-row{font-size:.65rem}
    #arcade-meta-streak-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
    #arcade-meta-streak-bar-inner{height:100%;width:100%;background:linear-gradient(90deg,#31d2ff,#f7ab1a);transition:width .22s ease}
    #arcade-meta-streak-pressure.warning #arcade-meta-streak-bar-inner{background:linear-gradient(90deg,#ff4fd1,#ff5454)}
    #arcade-meta-streak-pressure.warning{animation:metaWarn .45s ease-in-out infinite alternate}
    #arcade-meta-popup-root{position:fixed;inset:0;display:grid;place-items:center}
    .arcade-meta-popup{padding:14px 16px;border-radius:14px;color:#fff;font-weight:800;letter-spacing:.03em;background:rgba(20,24,36,.92);border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 42px rgba(0,0,0,.45);opacity:0;transform:translateY(18px) scale(.96);animation:metaPopIn .2s ease-out forwards,metaPopOut .26s ease-in forwards}
    .arcade-meta-popup .sub{display:block;font-size:.75rem;font-weight:600;opacity:.92;margin-top:4px}
    .arcade-meta-popup.common{border-color:#7db7ff}
    .arcade-meta-popup.rare{border-color:#8cffad}
    .arcade-meta-popup.epic{border-color:#d28cff}
    .arcade-meta-popup.wtf{border-color:#ff5cc8;box-shadow:0 0 0 1px rgba(255,92,200,.4),0 14px 50px rgba(255,92,200,.33)}
    #arcade-meta-near-miss{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);padding:8px 12px;border-radius:999px;background:rgba(255,77,156,.18);border:1px solid rgba(255,77,156,.55);color:#fff;font-size:.73rem;font-weight:800;opacity:0;transition:opacity .14s ease,transform .14s ease}
    #arcade-meta-near-miss.active{opacity:1;transform:translateX(-50%) scale(1.04)}
    body.arcade-meta-shake #game-overlay .game-stage, body.arcade-meta-shake .game-card{animation:metaShake .18s linear 2}
    body.arcade-meta-glitch #game-overlay .game-stage, body.arcade-meta-glitch .game-card{filter:hue-rotate(22deg) contrast(1.14) saturate(1.22)}
    body.arcade-meta-slow #game-overlay .game-stage, body.arcade-meta-slow .game-card{filter:saturate(.84) brightness(.95)}
    body.arcade-meta-flash::before{content:'';position:fixed;inset:0;background:rgba(255,255,255,.1);pointer-events:none;z-index:9998;animation:metaFlash .18s ease-out}
    @keyframes metaPopIn{to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes metaPopOut{to{opacity:0;transform:translateY(-16px) scale(1.03)}}
    @keyframes metaWarn{0%{filter:none}100%{filter:drop-shadow(0 0 7px rgba(255,79,209,.35))}}
    @keyframes metaShake{0%{transform:translate(0,0)}25%{transform:translate(2px,-1px)}50%{transform:translate(-2px,1px)}75%{transform:translate(1px,1px)}100%{transform:translate(0,0)}}
    @keyframes metaFlash{0%{opacity:.9}100%{opacity:0}}
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  if (uiRoot) return;
  injectStyles();
  uiRoot = document.createElement('div');
  uiRoot.id = 'arcade-meta-ui';
  uiRoot.innerHTML = `
    <div id="arcade-meta-hud" aria-live="polite">
      <div class="meta-row"><span>Daily</span><span class="meta-val" id="arcade-meta-daily">0</span></div>
      <div class="meta-row"><span>Quests</span><span class="meta-val" id="arcade-meta-quests">0</span></div>
      <div class="meta-row"><span>Streak</span><span class="meta-val" id="arcade-meta-streak">0</span></div>
      <div class="meta-row"><span>Multiplier</span><span class="meta-val" id="arcade-meta-multiplier">x1.00</span></div>
      <div id="arcade-meta-streak-pressure">
        <div class="meta-row"><span>Decay</span><span class="meta-val" id="arcade-meta-streak-countdown">--:--</span></div>
        <div id="arcade-meta-streak-bar"><div id="arcade-meta-streak-bar-inner"></div></div>
      </div>
    </div>
    <div id="arcade-meta-popup-root"></div>
    <div id="arcade-meta-near-miss">SO CLOSE</div>
  `;
  document.body.appendChild(uiRoot);
  popupRoot = uiRoot.querySelector('#arcade-meta-popup-root');
  nearMissHint = uiRoot.querySelector('#arcade-meta-near-miss');
  hudDaily = uiRoot.querySelector('#arcade-meta-daily');
  hudQuests = uiRoot.querySelector('#arcade-meta-quests');
  hudStreak = uiRoot.querySelector('#arcade-meta-streak');
  hudMultiplier = uiRoot.querySelector('#arcade-meta-multiplier');
  streakBarInner = uiRoot.querySelector('#arcade-meta-streak-bar-inner');
  streakCountdown = uiRoot.querySelector('#arcade-meta-streak-countdown');
}

function pulseScreen(className, ms = 220) {
  document.body.classList.add(className);
  setTimeout(() => document.body.classList.remove(className), ms);
}

function showPopup({ title, reward, rarity = 'common', durationMs = 1800 }) {
  ensureUi();
  const popup = document.createElement('div');
  popup.className = `arcade-meta-popup ${rarity}`;
  popup.style.animationDuration = `200ms, 260ms`;
  popup.style.animationDelay = `0ms, ${Math.max(200, durationMs - 260)}ms`;
  popup.innerHTML = `${title}<span class="sub">${reward || ''}</span>`;
  popupRoot.appendChild(popup);
  setTimeout(() => popup.remove(), Math.max(500, durationMs + 50));
}

function showNearMiss(text) {
  ensureUi();
  if (!nearMissHint) return;
  nearMissHint.textContent = text || 'SO CLOSE';
  nearMissHint.classList.add('active');
  safePlay('meta-near-miss');
  if (hintTimeout) clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => nearMissHint.classList.remove('active'), 1200);
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function currentUiMultiplier(state) {
  const streak = Math.max(0, Number(state?.streak?.session_chain) || 0);
  const streakBase = 1 + Math.min(0.45, streak * 0.05);
  const live = activeLiveEvent ? Number(activeLiveEvent.uiMultiplier || 1) : 1;
  return (streakBase * live).toFixed(2);
}

function updateHud() {
  ensureUi();
  let state = null;
  try { state = ArcadeMeta.getState(); } catch (_) {}
  if (!state) return;

  const activeCount = Array.isArray(state?.quests?.active) ? state.quests.active.length : 0;
  const streak = Math.max(0, Number(state?.streak?.session_chain) || 0);
  hudDaily.textContent = String(Math.floor(Number(state?.daily?.points) || 0));
  hudQuests.textContent = String(activeCount);
  hudStreak.textContent = String(streak);
  hudMultiplier.textContent = `x${currentUiMultiplier(state)}`;

  const pressureRoot = uiRoot.querySelector('#arcade-meta-streak-pressure');
  const lastPlayed = Number(state?.streak?.last_played_at) || 0;
  if (!lastPlayed || streak <= 0) {
    streakCountdown.textContent = '--:--';
    streakBarInner.style.width = '0%';
    pressureRoot.classList.remove('warning');
    return;
  }
  const remaining = Math.max(0, (lastPlayed + STREAK_GAP_MS) - Date.now());
  const pct = clamp((remaining / STREAK_GAP_MS) * 100, 0, 100);
  streakCountdown.textContent = formatCountdown(remaining);
  streakBarInner.style.width = `${pct}%`;
  if (pct <= 18) {
    pressureRoot.classList.add('warning');
    if (pct > 0) showNearMiss('SO CLOSE • Keep streak alive');
  } else {
    pressureRoot.classList.remove('warning');
  }
}

function emitHook(name, payload = {}) {
  document.dispatchEvent(new CustomEvent('arcade-meta-hook', { detail: { hook: name, ...payload } }));
  const hooks = window.ArcadeMetaGameplayHooks;
  if (hooks && typeof hooks[name] === 'function') {
    try { hooks[name](payload); } catch (_) {}
  }
}

function maybeNearMissByScore(scoreNow) {
  let state = null;
  try { state = ArcadeMeta.getState(); } catch (_) {}
  if (!state) return;
  const game = detectGameId();
  const scoreQuest = (state?.quests?.active || []).find((q) => q.type === 'score_target' && q.game === game);
  if (!scoreQuest) return;
  const target = Math.max(1, Number(scoreQuest.target) || 1);
  const ratio = scoreNow / target;
  if (ratio >= 0.8 && ratio < 1) {
    emitHook('onNearMiss', { game, kind: 'score_target', ratio, score: scoreNow, target });
    showNearMiss(`SO CLOSE • ${Math.floor(ratio * 100)}% of target`);
  }
}

function maybeNearMissByCombo(comboNow) {
  if (comboNow >= 1.8 && comboNow < 2) {
    emitHook('onNearMiss', { game: detectGameId(), kind: 'combo', ratio: comboNow / 2, combo: comboNow, target: 2 });
    showNearMiss('SO CLOSE • Combo x2');
  }
}

function maybeTriggerLiveEvent(context = {}) {
  if (!runActive || runPaused) return;
  ArcadeMeta.triggerLiveEvent({ ...context, auto: true });
}

function setupScoreHooks() {
  const scoreNode = document.getElementById('score');
  if (scoreNode && !scoreObserver) {
    lastScore = parseNumeric(scoreNode.textContent);
    scoreObserver = new MutationObserver(() => {
      const next = parseNumeric(scoreNode.textContent);
      if (next > lastScore) {
        const delta = next - lastScore;
        emitHook('onScore', { game: detectGameId(), score: next, delta });
        maybeNearMissByScore(next);
        maybeTriggerLiveEvent({ source: 'score', score: next, delta });
      }
      lastScore = next;
      updateHud();
    });
    scoreObserver.observe(scoreNode, { childList: true, subtree: true, characterData: true });
  }

  const comboNode = document.getElementById('combo') || document.getElementById('chain') || document.getElementById('streakCount');
  if (comboNode && !comboObserver) {
    lastComboValue = parseNumeric(comboNode.textContent) || 1;
    comboObserver = new MutationObserver(() => {
      const next = parseNumeric(comboNode.textContent) || 1;
      if (next > lastComboValue) {
        emitHook('onCombo', { game: detectGameId(), combo: next, previous: lastComboValue });
        maybeNearMissByCombo(next);
      }
      lastComboValue = next;
    });
    comboObserver.observe(comboNode, { childList: true, subtree: true, characterData: true });
  }
}

function clearLiveEventVisuals() {
  document.body.classList.remove('arcade-meta-slow', 'arcade-meta-glitch', 'arcade-meta-shake');
  if (chaosPulseTimer) {
    clearInterval(chaosPulseTimer);
    chaosPulseTimer = null;
  }
}

function endLiveEvent() {
  if (!activeLiveEvent) return;
  const ended = activeLiveEvent;
  activeLiveEvent = null;
  clearLiveEventVisuals();
  if (liveEventTimer) {
    clearTimeout(liveEventTimer);
    liveEventTimer = null;
  }
  document.dispatchEvent(new CustomEvent('arcade-meta-live-event-end', { detail: ended }));
  updateHud();
}

function applyLiveEvent(event) {
  clearLiveEventVisuals();
  if (event.id === 'invert_controls') {
    document.body.classList.add('arcade-meta-glitch');
  } else if (event.id === 'slow_time') {
    document.body.classList.add('arcade-meta-slow');
  } else if (event.id === 'chaos_mode') {
    document.body.classList.add('arcade-meta-glitch');
    chaosPulseTimer = setInterval(() => pulseScreen('arcade-meta-shake', 240), 700);
  }
}

function chooseLiveEvent() {
  const pool = LIVE_EVENTS;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function triggerLiveEvent(context = {}) {
  const now = Date.now();
  if (!runActive && !context.force) {
    return { triggered: false, reason: 'run_not_active' };
  }
  if (activeLiveEvent) {
    return { triggered: false, reason: 'already_active', active: activeLiveEvent };
  }
  if (!context.force && now - lastLiveEventAt < LIVE_EVENT_COOLDOWN_MS) {
    return { triggered: false, reason: 'cooldown' };
  }

  const source = String(context.source || 'manual');
  let chance = 0.02;
  if (source === 'survival') chance = 0.012;
  if (source === 'combo') chance = 0.03;
  if (!context.force && Math.random() > chance) {
    return { triggered: false, reason: 'rng_miss' };
  }

  const picked = chooseLiveEvent();
  if (!picked) return { triggered: false, reason: 'no_event' };
  const durationMs = Math.max(2000, Number(picked.durationMs) || 4000);
  activeLiveEvent = {
    ...picked,
    context,
    startedAt: now,
    endsAt: now + durationMs,
  };
  lastLiveEventAt = now;
  applyLiveEvent(activeLiveEvent);
  showPopup({
    title: `⚡ ${activeLiveEvent.label}`,
    reward: `${Math.round(durationMs / 1000)}s LIVE`,
    rarity: activeLiveEvent.rarity || 'rare',
    durationMs: 1800,
  });
  safePlay('meta-event-trigger');
  pulseScreen('arcade-meta-flash', 200);
  document.dispatchEvent(new CustomEvent('arcade-meta-live-event', { detail: activeLiveEvent }));
  liveEventTimer = setTimeout(endLiveEvent, durationMs);
  updateHud();
  return { triggered: true, event: activeLiveEvent };
}

function wireInputModifiers() {
  let remapping = false;
  const invertMap = {
    ArrowUp: 'ArrowDown',
    ArrowDown: 'ArrowUp',
    ArrowLeft: 'ArrowRight',
    ArrowRight: 'ArrowLeft',
    w: 's',
    s: 'w',
    a: 'd',
    d: 'a',
    W: 'S',
    S: 'W',
    A: 'D',
    D: 'A',
  };

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || remapping || !activeLiveEvent || activeLiveEvent.id !== 'invert_controls') return;
    if (!event.isTrusted) return;
    const target = event.target;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    const mapped = invertMap[event.key];
    if (!mapped) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    remapping = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: mapped, bubbles: true, cancelable: true }));
    remapping = false;
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.defaultPrevented || remapping || !activeLiveEvent || activeLiveEvent.id !== 'invert_controls') return;
    if (!event.isTrusted) return;
    const mapped = invertMap[event.key];
    if (!mapped) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    remapping = true;
    document.dispatchEvent(new KeyboardEvent('keyup', { key: mapped, bubbles: true, cancelable: true }));
    remapping = false;
  }, true);
}

function wireTrackResultPopups() {
  if (ArcadeMeta.__metaUiWrappedTrackResult) return;
  const original = ArcadeMeta.trackGameResult.bind(ArcadeMeta);
  ArcadeMeta.trackGameResult = function wrappedTrackGameResult(payload = {}) {
    let beforeState = null;
    try { beforeState = ArcadeMeta.getState(); } catch (_) {}
    const result = original(payload);
    let afterState = null;
    try { afterState = ArcadeMeta.getState(); } catch (_) {}

    if (result && result.tracked && afterState) {
      const beforeActive = new Set((beforeState?.quests?.active || []).map((q) => q.id));
      const afterActive = (afterState?.quests?.active || []);
      for (const quest of afterActive) {
        if (!beforeActive.has(quest.id)) {
          showPopup({
            title: `🎯 QUEST ACTIVE`,
            reward: quest.title || 'New objective',
            rarity: 'common',
            durationMs: 1700,
          });
        }
      }

      const beforeCompleted = new Set((beforeState?.quests?.completed || []).map((q) => q.id));
      const afterCompleted = (afterState?.quests?.completed || []);
      for (const quest of afterCompleted) {
        if (!beforeCompleted.has(quest.id)) {
          showPopup({
            title: `✅ QUEST COMPLETE`,
            reward: `${quest.title || 'Quest'} • +${Math.round((Number(quest.bonus_multiplier) || 0) * 100)}%`,
            rarity: (Number(quest.bonus_multiplier) || 0) >= 0.2 ? 'epic' : 'rare',
            durationMs: 2200,
          });
          safePlay('meta-quest-complete');
          pulseScreen('arcade-meta-flash', 220);
        }
      }

      const near = evaluateQuestNearMiss(afterState);
      if (near) {
        emitHook('onNearMiss', {
          game: result.game,
          kind: 'quest',
          ratio: near.progress,
          quest: near.quest,
        });
        showNearMiss(`SO CLOSE • ${Math.floor(near.progress * 100)}%`);
      }

      const beforeStreak = Number(beforeState?.streak?.session_chain) || 0;
      if (Number(result.streak) > beforeStreak) {
        safePlay('meta-streak-up');
      }
    }

    updateHud();
    return result;
  };
  ArcadeMeta.__metaUiWrappedTrackResult = true;
}

function startSurvivalTicks() {
  if (survivalTimer) return;
  survivalTimer = setInterval(() => {
    if (!runActive || runPaused) return;
    emitHook('onSurvivalTick', { game: detectGameId(), ts: Date.now() });
    maybeTriggerLiveEvent({ source: 'survival' });
  }, 1000);
}

function wireRunLifecycle() {
  document.addEventListener('arcade-run-start', () => {
    runActive = true;
    runPaused = false;
    setupScoreHooks();
    startSurvivalTicks();
    updateHud();
  });

  document.addEventListener('arcade-pause-change', (event) => {
    runPaused = !!event?.detail?.paused;
  });

  const stopRun = () => {
    runActive = false;
    runPaused = false;
    endLiveEvent();
    updateHud();
  };
  document.addEventListener('arcade-run-reset', stopRun);
  document.addEventListener('arcade-run-game-over', stopRun);
  document.addEventListener('arcade-overlay-exit', stopRun);
}

function initGlobalHooks() {
  if (!window.ArcadeMetaGameplayHooks) {
    window.ArcadeMetaGameplayHooks = {
      onScore() {},
      onNearMiss() {},
      onCombo() {},
      onSurvivalTick() {},
    };
  }
}

function init() {
  if (!isArcadeGamePage()) return;
  ensureUi();
  initGlobalHooks();
  wireInputModifiers();
  wireTrackResultPopups();
  wireRunLifecycle();
  ArcadeMeta.triggerLiveEvent = triggerLiveEvent;
  window.__arcadeMetaTriggerLiveEvent = triggerLiveEvent;
  setupScoreHooks();
  updateHud();
  setInterval(updateHud, 250);
}

if (typeof window !== 'undefined') {
  init();
}

