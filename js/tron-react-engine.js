/**
 * Global Tron React Engine
 * Two-state visual life layer for idle and wake/event activity.
 */
(function () {
  'use strict';

  if (window.TRON) return;

  const EVENT_DECAY_MS = 8000;
  const BURST_MS = 700;
  const HOME_POLL_MS = 30000;
  const DEFAULT_POLL_MS = 90000;
  const HEALTH_TIMEOUT_MS = 4500;
  const DEMO_WAKEUP_IDLE_MS = 95000;
  const HOVER_AUDIO_COOLDOWN_MS = 120;
  const CLICKABLE_SELECTOR = 'a,button,.btn,[role="button"],.article-card,.category-card,.article-list-item,.home-widget,[data-clickable="true"]';

  const root = document.body;
  if (!root) return;

  const state = {
    mode: 'idle',
    connected: false,
    lastEventAt: 0,
    eventBoostUntil: 0
  };

  let healthTimer = null;
  let modeTimer = null;
  let idlePulseTimer = null;
  let hoverCooldownAt = 0;

  const WAKE_FALLBACK = {
    score: [
      'Score packet accepted in Battle Chamber.',
      'Chain momentum surged from recent score input.'
    ],
    leaderboard: [
      'Leaderboard surge incoming.',
      'Ranking matrix just shifted.'
    ],
    sam: [
      'SAM noticing elevated movement.',
      'SAM relay picked up a fresh signal.'
    ],
    wakeup: [
      'District pressure rising.',
      'A watcher just crossed the wire.'
    ],
    api: [
      'System wake-up detected.',
      'Core uplink restored.'
    ],
    generic: [
      'Signal spike detected in Battle Chamber.',
      'Reactive layer heartbeat elevated.'
    ]
  };

  function now() {
    return Date.now();
  }

  function isReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function updateBodyClasses() {
    root.classList.toggle('tron-idle', state.mode === 'idle');
    root.classList.toggle('tron-event', state.mode === 'event');
    root.classList.toggle('tron-api-online', !!state.connected);
    root.classList.toggle('tron-api-offline', !state.connected);
    root.classList.toggle('tron-reduced-motion', isReducedMotion());
  }

  function setMode(mode) {
    state.mode = mode === 'event' ? 'event' : 'idle';
    updateBodyClasses();
  }

  function applyBurst(type) {
    const cls = `tron-burst-${String(type || 'generic').replace(/[^a-z0-9_-]/gi, '')}`;
    root.classList.add(cls, 'tron-burst-active');
    setTimeout(() => {
      root.classList.remove(cls, 'tron-burst-active');
    }, BURST_MS);
  }

  function randomFrom(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)] || '';
  }

  // AI wake-up hook: no network call made from the browser.
  // When a server-side /api/ai-wakeup-proxy route is fully implemented with proper
  // authentication and abuse protection, the call can be restored by replacing
  // pickWakeLine with a fetch to that route and falling back to WAKE_FALLBACK on error.
  function pickWakeLine(type) {
    const bucket = WAKE_FALLBACK[type] || WAKE_FALLBACK.generic;
    return randomFrom(bucket);
  }

  function ensureWakeToast() {
    let el = document.getElementById('tron-wake-toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tron-wake-toast';
    el.className = 'tron-wake-toast';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    return el;
  }

  function showWakeLine(type, data = {}) {
    if (isReducedMotion()) return;
    const toast = ensureWakeToast();
    let message = '';
    if (data && typeof data.message === 'string' && data.message.trim()) {
      message = data.message.trim();
    } else {
      message = pickWakeLine(type);
    }
    if (!message) return;
    toast.textContent = `⚡ ${message}`;
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function playAudioFor(type) {
    if (!window.TRON_AUDIO || typeof window.TRON_AUDIO.play !== 'function') return;
    if (type === 'score' || type === 'leaderboard') {
      window.TRON_AUDIO.play('event');
      return;
    }
    if (type === 'wakeup' || type === 'api-online' || type === 'sam') {
      window.TRON_AUDIO.play('wake');
      return;
    }
    window.TRON_AUDIO.play('click');
  }

  function reconcileMode() {
    if (state.eventBoostUntil > now()) {
      setMode('event');
      return;
    }
    setMode('idle');
  }

  function scheduleIdlePulse() {
    if (idlePulseTimer) clearTimeout(idlePulseTimer);
    const delay = 20000 + Math.floor(Math.random() * 20000);
    idlePulseTimer = setTimeout(() => {
      if (state.mode === 'idle') {
        root.classList.add('tron-soft-pulse');
        setTimeout(() => root.classList.remove('tron-soft-pulse'), 1200);
      }
      scheduleIdlePulse();
    }, delay);
  }

  function pulse(type = 'generic', data = {}) {
    const t = String(type || 'generic');
    const ts = now();
    const baseDuration = data.durationMs && Number.isFinite(data.durationMs)
      ? Number(data.durationMs)
      : (t === 'api-online' ? 6200 : EVENT_DECAY_MS);

    state.lastEventAt = ts;
    state.eventBoostUntil = ts + Math.max(2500, baseDuration);
    setMode('event');
    applyBurst(t);
    playAudioFor(t);

    if (t === 'wakeup' || t === 'sam' || t === 'leaderboard' || t === 'score' || t === 'api-online') {
      showWakeLine(t === 'api-online' ? 'api' : t, data);
    }
  }

  function trigger(type, data = {}) {
    pulse(type, data);
  }

  function setConnected(isConnected) {
    const prev = state.connected;
    state.connected = !!isConnected;
    updateBodyClasses();
    if (!prev && state.connected) {
      pulse('api-online', { message: 'Core API uplink online.' });
    }
    if (prev && !state.connected) {
      root.classList.add('tron-api-drop');
      setTimeout(() => root.classList.remove('tron-api-drop'), 1200);
    }
  }

  function resolveHealthCandidates() {
    const candidates = [];
    const cfgBase = window.MOONBOYS_API && window.MOONBOYS_API.BASE_URL
      ? String(window.MOONBOYS_API.BASE_URL).replace(/\/$/, '')
      : '';
    if (cfgBase) candidates.push(`${cfgBase}/health`);
    if (!candidates.length) candidates.push('https://api.cryptomoonboys.com/health');
    return candidates;
  }

  async function checkApiHealth() {
    const candidates = resolveHealthCandidates();
    let ok = false;
    for (const url of candidates) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (res.ok) {
          ok = true;
          break;
        }
      } catch (_) {
        // continue fallback chain
      } finally {
        clearTimeout(timeout);
      }
    }
    setConnected(ok);
  }

  function pollIntervalMs() {
    const p = window.location.pathname || '/';
    return (p === '/' || p === '/index.html') ? HOME_POLL_MS : DEFAULT_POLL_MS;
  }

  function startHealthPolling() {
    checkApiHealth();
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = setInterval(checkApiHealth, pollIntervalMs());
  }

  function ensureAmbientAgents() {
    if (document.querySelector('.tron-agent-field')) return;
    const field = document.createElement('div');
    field.className = 'tron-agent-field';
    field.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) {
      const node = document.createElement('span');
      node.className = 'tron-agent-node';
      node.style.setProperty('--tron-x', `${Math.random() * 100}%`);
      node.style.setProperty('--tron-y', `${Math.random() * 100}%`);
      node.style.setProperty('--tron-size', `${3 + Math.random() * 8}px`);
      node.style.setProperty('--tron-drift', `${16 + Math.random() * 22}s`);
      node.style.setProperty('--tron-delay', `${Math.random() * -18}s`);
      field.appendChild(node);
    }
    document.body.appendChild(field);
  }

  function createCursorPulse(x, y) {
    if (isReducedMotion()) return;
    const pulse = document.createElement('span');
    pulse.className = 'tron-cursor-pulse';
    pulse.style.left = `${x}px`;
    pulse.style.top = `${y}px`;
    document.body.appendChild(pulse);
    setTimeout(() => pulse.remove(), 480);
  }

  function isClickable(el) {
    return !!(el && el.closest(CLICKABLE_SELECTOR));
  }

  function initHoverReactions() {
    document.addEventListener('mouseover', (event) => {
      const target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!isClickable(target)) return;
      const clickable = target.closest(CLICKABLE_SELECTOR);
      if (!clickable) return;
      clickable.classList.add('tron-hover-pulse');
      setTimeout(() => clickable.classList.remove('tron-hover-pulse'), 280);

      const stamp = now();
      if (stamp - hoverCooldownAt < HOVER_AUDIO_COOLDOWN_MS) return;
      hoverCooldownAt = stamp;
      if (window.TRON_AUDIO && typeof window.TRON_AUDIO.play === 'function') {
        window.TRON_AUDIO.play('hover');
      }
      if (event.clientX > 0 || event.clientY > 0) {
        createCursorPulse(event.clientX, event.clientY);
      }
    }, { passive: true });

    document.addEventListener('click', () => {
      if (window.TRON_AUDIO && typeof window.TRON_AUDIO.play === 'function') {
        window.TRON_AUDIO.play('click');
      }
    }, { passive: true });
  }

  function wireEventBus() {
    window.addEventListener('tron:event', (ev) => {
      const detail = (ev && ev.detail) || {};
      pulse(detail.type || 'generic', detail.data || {});
    });
    window.addEventListener('tron:wakeup', (ev) => pulse('wakeup', (ev && ev.detail) || {}));
    window.addEventListener('tron:sam', (ev) => pulse('sam', (ev && ev.detail) || {}));
    window.addEventListener('tron:leaderboard', (ev) => pulse('leaderboard', (ev && ev.detail) || {}));
    window.addEventListener('tron:score', (ev) => pulse('score', (ev && ev.detail) || {}));
    window.addEventListener('tron:api-online', () => setConnected(true));
    window.addEventListener('tron:api-offline', () => setConnected(false));

    document.addEventListener('arcade-meta-live-event', (ev) => pulse('wakeup', (ev && ev.detail) || {}));
    document.addEventListener('arcade-meta-streak-updated', (ev) => pulse('score', (ev && ev.detail) || {}));
  }

  function startModeLoop() {
    if (modeTimer) clearInterval(modeTimer);
    modeTimer = setInterval(() => {
      reconcileMode();
      if (state.connected && now() - state.lastEventAt > DEMO_WAKEUP_IDLE_MS) {
        pulse('wakeup', { message: 'Quiet line detected. Running wake-up demo pulse.' });
      }
    }, 1000);
  }

  function init() {
    root.classList.add('tron-engine');
    updateBodyClasses();
    ensureAmbientAgents();
    wireEventBus();
    initHoverReactions();
    scheduleIdlePulse();
    startHealthPolling();
    startModeLoop();

    if (window.TRON_AUDIO && typeof window.TRON_AUDIO.init === 'function') {
      window.TRON_AUDIO.init();
    }
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', updateBodyClasses);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(updateBodyClasses);
    }
  }

  window.TRON = {
    get mode() { return state.mode; },
    get connected() { return state.connected; },
    get lastEventAt() { return state.lastEventAt; },
    get eventBoostUntil() { return state.eventBoostUntil; },
    trigger,
    setConnected,
    pulse
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
