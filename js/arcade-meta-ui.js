import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { playSound } from '/js/arcade/core/audio.js';

// Keep in sync with the default ArcadeMeta streak session gap (45 minutes).
const STREAK_GAP_MS = 45 * 60 * 1000;
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
let hudChaos = null;
let hudComeback = null;
let hudLoop = null;
let hudMission = null;
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
let activeLiveEvent = null;
let lastHintAt = 0;
let lastHintKey = '';

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
    #arcade-meta-chaos,#arcade-meta-comeback,#arcade-meta-loop,#arcade-meta-mission{font-size:.66rem;color:#d4dcff}
    #arcade-meta-chaos .meta-val,#arcade-meta-comeback .meta-val,#arcade-meta-loop .meta-val,#arcade-meta-mission .meta-val{max-width:128px;text-align:right;line-height:1.2}
    #arcade-meta-mission.pulse .meta-val{animation:metaWarn .45s ease-in-out infinite alternate}
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
      <div class="meta-row" id="arcade-meta-chaos"><span>Chaos</span><span class="meta-val" id="arcade-meta-chaos-val">--:--</span></div>
      <div class="meta-row" id="arcade-meta-comeback"><span>Pressure</span><span class="meta-val" id="arcade-meta-comeback-val">stable</span></div>
      <div class="meta-row" id="arcade-meta-loop"><span>Loop</span><span class="meta-val" id="arcade-meta-loop-val">idle</span></div>
      <div class="meta-row" id="arcade-meta-mission"><span>Mission</span><span class="meta-val" id="arcade-meta-mission-val">none</span></div>
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
  hudChaos = uiRoot.querySelector('#arcade-meta-chaos-val');
  hudComeback = uiRoot.querySelector('#arcade-meta-comeback-val');
  hudLoop = uiRoot.querySelector('#arcade-meta-loop-val');
  hudMission = uiRoot.querySelector('#arcade-meta-mission-val');
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

function showNearMiss(text, hintKey = 'default', cooldownMs = 1400) {
  ensureUi();
  if (!nearMissHint) return;
  const now = Date.now();
  if (hintKey === lastHintKey && (now - lastHintAt) < cooldownMs) return;
  lastHintKey = hintKey;
  lastHintAt = now;
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
  let liveContext = null;
  let retentionContext = null;
  try { state = ArcadeMeta.getState(); } catch (_) {}
  try {
    if (typeof ArcadeMeta.getLiveContext === 'function') liveContext = ArcadeMeta.getLiveContext();
  } catch (_) {}
  try {
    if (window.ArcadeRetentionEngine && typeof window.ArcadeRetentionEngine.getLiveContext === 'function') {
      retentionContext = window.ArcadeRetentionEngine.getLiveContext();
    }
  } catch (_) {}
  if (!state) return;

  const activeCount = Array.isArray(state?.quests?.active) ? state.quests.active.length : 0;
  const streak = Math.max(0, Number(state?.streak?.session_chain) || 0);
  hudDaily.textContent = String(Math.floor(Number(state?.daily?.points) || 0));
  hudQuests.textContent = String(activeCount);
  hudStreak.textContent = String(streak);
  hudMultiplier.textContent = `x${currentUiMultiplier(state)}`;
  if (hudChaos) {
    const endsAt = Number(liveContext?.featured_chaos?.ends_at) || 0;
    const remaining = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
    hudChaos.textContent = remaining ? formatCountdown(remaining) : '--:--';
  }
  if (hudComeback) {
    const comeback = liveContext?.comeback || null;
    hudComeback.textContent = comeback?.label ? String(comeback.label) : 'stable';
  }
  if (hudLoop) {
    const runs = Number(retentionContext?.session_metrics?.runs) || 0;
    const switches = Number(retentionContext?.session_metrics?.game_switches) || 0;
    hudLoop.textContent = runs > 0 ? `${runs} runs • ${switches} switches` : 'Warming up';
  }
  if (hudMission) {
    const missionRow = uiRoot.querySelector('#arcade-meta-mission');
    const mission = retentionContext?.comeback_mission || null;
    if (mission && Number(mission.expires_at) > Date.now() && !mission.completed) {
      hudMission.textContent = formatCountdown(Math.max(0, Number(mission.expires_at) - Date.now()));
      missionRow?.classList.add('pulse');
    } else {
      hudMission.textContent = 'none';
      missionRow?.classList.remove('pulse');
    }
  }

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
    if (pct > 0) showNearMiss('SO CLOSE • Keep streak alive', 'streak-warning', 10000);
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
    showNearMiss(`SO CLOSE • ${Math.floor(ratio * 100)}% of target`, 'score-target', 2000);
  }
}

function maybeNearMissByCombo(comboNow) {
  if (comboNow >= 1.8 && comboNow < 2) {
    emitHook('onNearMiss', { game: detectGameId(), kind: 'combo', ratio: comboNow / 2, combo: comboNow, target: 2 });
    showNearMiss('SO CLOSE • Combo x2', 'combo-near', 1800);
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

function endLiveEventLocal() {
  activeLiveEvent = null;
  clearLiveEventVisuals();
  if (liveEventTimer) {
    clearTimeout(liveEventTimer);
    liveEventTimer = null;
  }
  updateHud();
}

function handleLiveEventStarted(payload) {
  const event = payload?.event || payload;
  if (!event) return;
  activeLiveEvent = event;
  applyLiveEvent(event);
  const endsAt = Number(event.ends_at || event.endsAt) || 0;
  const durationMs = endsAt ? Math.max(0, endsAt - Date.now()) : Math.max(2000, Number(event.durationMs) || 4000);
  showPopup({
    title: `⚡ ${event.label || 'LIVE EVENT'}`,
    reward: `${Math.max(1, Math.round(durationMs / 1000))}s LIVE`,
    rarity: event.rarity || 'rare',
    durationMs: 1800,
  });
  safePlay('meta-event-trigger');
  pulseScreen('arcade-meta-flash', 200);
  if (liveEventTimer) clearTimeout(liveEventTimer);
  if (durationMs > 0) {
    liveEventTimer = setTimeout(() => endLiveEventLocal(), durationMs + 100);
  }
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
  const codeMap = {
    ArrowUp: 'ArrowDown',
    ArrowDown: 'ArrowUp',
    ArrowLeft: 'ArrowRight',
    ArrowRight: 'ArrowLeft',
    KeyW: 'KeyS',
    KeyS: 'KeyW',
    KeyA: 'KeyD',
    KeyD: 'KeyA',
  };
  function mapCode(code) {
    if (!code) return '';
    return codeMap[code] || '';
  }
  function mapKeyCode(key) {
    if (key === 'ArrowUp') return 38;
    if (key === 'ArrowDown') return 40;
    if (key === 'ArrowLeft') return 37;
    if (key === 'ArrowRight') return 39;
    return String(key || ' ').toUpperCase().charCodeAt(0);
  }
  function dispatchRemapped(type, mappedKey, mappedCode, mappedKeyCode) {
    const remappedEvent = new KeyboardEvent(type, {
      key: mappedKey,
      code: mappedCode || undefined,
      bubbles: true,
      cancelable: true,
    });
    try {
      Object.defineProperty(remappedEvent, 'keyCode', { get() { return mappedKeyCode; } });
      Object.defineProperty(remappedEvent, 'which', { get() { return mappedKeyCode; } });
    } catch (_) {}
    document.dispatchEvent(remappedEvent);
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || remapping || !activeLiveEvent || activeLiveEvent.id !== 'invert_controls') return;
    if (!event.isTrusted) return;
    const target = event.target;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    const mapped = invertMap[event.key];
    if (!mapped) return;
    const mappedCode = mapCode(event.code);
    const mappedKeyCode = mapKeyCode(mapped);
    event.preventDefault();
    event.stopImmediatePropagation();
    remapping = true;
    dispatchRemapped('keydown', mapped, mappedCode, mappedKeyCode);
    remapping = false;
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.defaultPrevented || remapping || !activeLiveEvent || activeLiveEvent.id !== 'invert_controls') return;
    if (!event.isTrusted) return;
    const mapped = invertMap[event.key];
    if (!mapped) return;
    const mappedCode = mapCode(event.code);
    const mappedKeyCode = mapKeyCode(mapped);
    event.preventDefault();
    event.stopImmediatePropagation();
    remapping = true;
    dispatchRemapped('keyup', mapped, mappedCode, mappedKeyCode);
    remapping = false;
  }, true);
}

function wireMetaEventListeners() {
  if (ArcadeMeta.__metaUiEventsWired) return;
  ArcadeMeta.__metaUiEventsWired = true;

  document.addEventListener('arcade-meta-quest-created', (ev) => {
    const quest = ev.detail?.quest;
    if (!quest) return;
    showPopup({
      title: '🎯 QUEST ACTIVE',
      reward: quest.title || 'New objective',
      rarity: 'common',
      durationMs: 1700,
    });
    if ((Number(quest.chain_step) || 1) > 1) safePlay('meta-chain-unlock');
  });

  const onQuestComplete = (ev) => {
    const quest = ev.detail?.quest;
    if (!quest) return;
    showPopup({
      title: '✅ QUEST COMPLETE',
      reward: `${quest.title || 'Quest'} • +${Math.round((Number(quest.bonus_multiplier) || 0) * 100)}%`,
      rarity: (Number(quest.bonus_multiplier) || 0) >= 0.2 ? 'epic' : 'rare',
      durationMs: 2200,
    });
    safePlay('meta-quest-complete');
    pulseScreen('arcade-meta-flash', 220);
  };
  document.addEventListener('arcade-meta-quest-completed', onQuestComplete);

  document.addEventListener('arcade-meta-near-miss', (ev) => {
    const progress = Number(ev.detail?.progress) || 0;
    const quest = ev.detail?.quest;
    if (!quest) return;
    emitHook('onNearMiss', {
      game: ev.detail?.game || detectGameId(),
      kind: 'quest',
      ratio: progress,
      quest,
    });
    showNearMiss(`SO CLOSE • ${Math.floor(progress * 100)}%`, 'quest-progress', 2000);
  });

  document.addEventListener('arcade-meta-streak-updated', () => {
    safePlay('meta-streak-up');
    updateHud();
  });

  document.addEventListener('arcade-meta-tracked', () => {
    updateHud();
  });

  document.addEventListener('arcade-retention-update', () => {
    updateHud();
  });

  document.addEventListener('arcade-meta-live-event', (ev) => {
    handleLiveEventStarted(ev.detail || {});
  });

  const onLiveEnded = () => {
    endLiveEventLocal();
  };
  document.addEventListener('arcade-meta-live-event-ended', onLiveEnded);
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
    endLiveEventLocal();
    if (typeof ArcadeMeta.endLiveEvent === 'function') {
      try { ArcadeMeta.endLiveEvent('run_end'); } catch (_) {}
    }
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
  wireMetaEventListeners();
  wireRunLifecycle();
  setupScoreHooks();
  updateHud();
  setInterval(updateHud, 500);
}

if (typeof window !== 'undefined') {
  init();
}
