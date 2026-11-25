/**
 * radio.js — GraffPUNKS Radio for the Arcade.
 *
 * Behaviour:
 *  - The radio starts automatically when the player presses Start in any
 *    arcade game (#startBtn on the page or ▶ Start in the fullscreen toolbar).
 *  - The player can switch it off with the radio toggle under the game card or
 *    the speaker button in the fullscreen toolbar. That choice is remembered,
 *    so Start no longer turns it back on until the player switches it on again.
 *  - Muting the game (master Mute) also silences the radio, and Start does not
 *    auto-start it while the game is muted.
 *  - A failed connection only shows the radio as off; it is never recorded as
 *    the player's choice.
 *
 * Usage (called automatically by game-shell.js after mountGame, and imported
 * by game-fullscreen.js so non-shell arcade pages get the same behaviour):
 *   import { mountArcadeRadio } from '/js/arcade/core/radio.js';
 *   mountArcadeRadio();
 *
 * Safe to import under different URLs and to call multiple times: one shared
 * controller lives on window.__ARCADE_RADIO__ and only one stream is created.
 */

// The relay keeps Radiojar's HTTP node redirects out of mobile media players.
export const ARCADE_RADIO_URL = 'https://api.cryptomoonboys.com/radio/stream';
export const ARCADE_RADIO_STORAGE_KEY = 'arcade_radio_on';
export const ARCADE_RADIO_USER_OFF_KEY = 'arcade_radio_user_off';
export const ARCADE_RADIO_ICON_ON = '/art/icons/soundonspeakerone.png';
export const ARCADE_RADIO_ICON_OFF = '/art/icons/mutespeakerone.png';
const RADIO_URL       = ARCADE_RADIO_URL;
const STORAGE_KEY     = ARCADE_RADIO_STORAGE_KEY;
const USER_OFF_KEY    = ARCADE_RADIO_USER_OFF_KEY;
const PANEL_ID        = 'arcade-radio-panel';
const LABEL_ON        = 'GraffPUNKS Radio  ·  ON';
const LABEL_OFF       = 'GraffPUNKS Radio  ·  OFF';
const START_SELECTOR  = '#startBtn, #overlay-btn-start';

// ── CSS ────────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('arcade-radio-styles')) return;
  var style = document.createElement('style');
  style.id = 'arcade-radio-styles';
  style.textContent = [
    '#' + PANEL_ID + '{margin-top:12px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;font-family:inherit}',
    '#arcade-radio-toggle{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--color-border,#444);border-radius:10px;padding:5px 12px;cursor:pointer;font-family:inherit;font-size:.8rem;color:var(--color-text-muted,#aaa);transition:background .15s,border-color .15s,color .15s;line-height:1.3;flex-shrink:0}',
    '#arcade-radio-toggle:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.22);color:#fff}',
    '#arcade-radio-toggle.radio-on{border-color:#7dff72;color:#7dff72;background:rgba(125,255,114,.07)}',
    '#arcade-radio-toggle.radio-on:hover{background:rgba(125,255,114,.13)}',
    '#arcade-radio-icon{width:18px;height:18px;display:block;flex-shrink:0;object-fit:contain}',
    '#arcade-radio-indicator{width:8px;height:8px;border-radius:50%;background:var(--color-text-muted,#555);flex-shrink:0;transition:background .2s,box-shadow .2s}',
    '#arcade-radio-indicator.radio-on{background:#7dff72;box-shadow:0 0 6px #7dff72}',
    '#arcade-radio-label{font-size:.78rem;color:var(--color-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '@keyframes arcade-radio-pulse{0%,100%{opacity:1}50%{opacity:.5}}',
    '#arcade-radio-indicator.radio-on{animation:arcade-radio-pulse 1.8s ease-in-out infinite}',
  ].join('');
  document.head.appendChild(style);
}

// ── State helpers ──────────────────────────────────────────────────────────────

function _userTurnedOff() {
  try {
    return localStorage.getItem(USER_OFF_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function _saveUserChoice(on) {
  try {
    localStorage.setItem(USER_OFF_KEY, on ? 'false' : 'true');
    // Kept for older readers (e.g. the MoonPet radio preference sync).
    localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  } catch (_) {}
}

function _gameMuted() {
  try {
    var audio = window.ArcadeAudio;
    if (audio && typeof audio.isMuted === 'function') return !!audio.isMuted();
  } catch (_) {}
  return !!window._arcadeMuted;
}

// Pages with their own soundtrack (e.g. NBG London) set
// data-arcade-radio-autostart="false" on #startBtn: the radio button still
// works there, Start just does not layer the stream over the game's music.
function _pageOptedOut() {
  var start = typeof document !== 'undefined' && document.getElementById('startBtn');
  return !!(start && start.dataset && start.dataset.arcadeRadioAutostart === 'false');
}

// ── Shared controller ─────────────────────────────────────────────────────────

function _createController() {
  var audio = null;
  var isOn = false;
  var panel = null;
  var toggle = null;
  var indicator = null;
  var icon = null;
  var label = null;
  var listeners = [];

  function _notify() {
    listeners.forEach(function (fn) {
      try { fn(isOn); } catch (_) {}
    });
    try {
      document.dispatchEvent(new CustomEvent('arcade-radio-change', { detail: { on: isOn } }));
    } catch (_) {}
  }

  function _render() {
    if (!toggle) return;
    toggle.classList.toggle('radio-on', isOn);
    indicator.classList.toggle('radio-on', isOn);
    icon.src = isOn ? ARCADE_RADIO_ICON_ON : ARCADE_RADIO_ICON_OFF;
    label.textContent = isOn ? LABEL_ON : LABEL_OFF;
    toggle.setAttribute('aria-pressed', String(isOn));
    toggle.setAttribute('aria-label', (isOn ? 'Turn off' : 'Turn on') + ' GraffPUNKS Radio');
  }

  function _ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.preload = 'none';
    audio.src = RADIO_URL;
    // Keep volume reasonable on first play; player can adjust via OS controls.
    audio.volume = 0.5;
    // Stop stream on page unload to avoid background audio leaks.
    window.addEventListener('pagehide', function () {
      try { audio.pause(); audio.src = ''; } catch (_) {}
    }, { once: true });
    return audio;
  }

  function _setPlaying(on) {
    isOn = Boolean(on);
    var stream = _ensureAudio();
    if (isOn) {
      var attempt = null;
      try { attempt = stream.play(); } catch (_) { attempt = Promise.reject(); }
      Promise.resolve(attempt).catch(function () {
        // Blocked or offline — show it as off so the UI stays honest, but do
        // not record this as the player's choice.
        if (!isOn) return;
        isOn = false;
        try { stream.pause(); } catch (_) {}
        _render();
        _notify();
      });
    } else {
      try { stream.pause(); } catch (_) {}
    }
    _render();
    _notify();
  }

  function mount() {
    if (typeof document === 'undefined') return;
    if (panel && panel.isConnected) return;
    var existing = document.getElementById(PANEL_ID);
    if (existing) { panel = existing; return; }

    _injectStyles();

    panel = document.createElement('div');
    panel.id = PANEL_ID;

    toggle = document.createElement('button');
    toggle.id = 'arcade-radio-toggle';
    toggle.type = 'button';

    indicator = document.createElement('span');
    indicator.id = 'arcade-radio-indicator';

    icon = document.createElement('img');
    icon.id = 'arcade-radio-icon';
    icon.alt = '';
    icon.width = icon.height = 18;
    icon.decoding = 'async';

    label = document.createElement('span');
    label.id = 'arcade-radio-label';

    toggle.appendChild(indicator);
    toggle.appendChild(icon);
    toggle.appendChild(label);
    panel.appendChild(toggle);

    toggle.addEventListener('click', function () {
      controller.toggle();
    });

    // Insert: faction-hud → modifier panel → game card → main → body
    var anchor =
      document.getElementById('faction-hud') ||
      document.getElementById('cm-modifier-panel') ||
      document.querySelector('.game-card');

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    } else {
      var main = document.querySelector('main') || document.body;
      main.appendChild(panel);
    }

    // Never autoplay on page load: browsers block it and it surprises
    // players. The stream starts with Start or the player's own tap.
    _render();
  }

  var controller = {
    mount: mount,
    isOn: function () { return isOn; },
    /** Player pressed a radio on/off control. */
    toggle: function () {
      mount();
      var next = !isOn;
      _saveUserChoice(next);
      _setPlaying(next);
      return next;
    },
    /** Player pressed Start in a game. */
    startForGame: function () {
      if (isOn || _userTurnedOff() || _gameMuted() || _pageOptedOut()) return false;
      mount();
      _setPlaying(true);
      return true;
    },
    /** Silence without recording a player choice (e.g. master mute). */
    stop: function () {
      if (isOn) _setPlaying(false);
    },
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
  };
  return controller;
}

function _controller() {
  if (typeof window === 'undefined') return null;
  if (!window.__ARCADE_RADIO__) {
    window.__ARCADE_RADIO__ = _createController();
    _installGlobalHooks(window.__ARCADE_RADIO__);
  }
  return window.__ARCADE_RADIO__;
}

function _installGlobalHooks(controller) {
  if (typeof document === 'undefined') return;
  // Capture phase so the radio starts inside the same user gesture as Start,
  // even when the game or overlay stops the click from propagating further.
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    var start = target.closest(START_SELECTOR);
    if (!start || start.disabled) return;
    controller.startForGame();
  }, true);
  document.addEventListener('arcade-mute-change', function (event) {
    if (event && event.detail && event.detail.muted) controller.stop();
  });
}

// Install the Start hook as soon as the module loads.
_controller();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount the GraffPUNKS Radio panel.
 *
 * Inserts the panel after the faction HUD if present, else after the
 * modifier panel, else after the game card.  Only mounts once per page.
 */
export function mountArcadeRadio() {
  var controller = _controller();
  if (!controller || typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', controller.mount, { once: true });
  } else {
    controller.mount();
  }
}

export function getArcadeRadio() {
  return _controller();
}
