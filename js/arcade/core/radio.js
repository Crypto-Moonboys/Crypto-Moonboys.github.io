/**
 * GraffPUNKS Radio and the in-page Arcade audio controls.
 * The shared controller keeps one stream per page, including fullscreen.
 * Radio Off is respected until the player leaves the game page.
 */

// The relay keeps Radiojar's HTTP node redirects out of mobile media players.
export const ARCADE_RADIO_URL = 'https://api.cryptomoonboys.com/radio/stream';
export const ARCADE_RADIO_STORAGE_KEY = 'arcade_radio_on';
export const ARCADE_RADIO_ICON_ON = '/art/icons/soundonspeakerone.png';
export const ARCADE_RADIO_ICON_OFF = '/art/icons/mutespeakerone.png';
const RADIO_URL       = ARCADE_RADIO_URL;
const STORAGE_KEY     = ARCADE_RADIO_STORAGE_KEY;
const PANEL_ID        = 'arcade-radio-panel';
const LABEL_ON        = 'GraffPUNKS Radio  ·  ON';
const LABEL_OFF       = 'GraffPUNKS Radio  ·  OFF';
const START_SELECTOR  = '#startBtn, #overlay-btn-start, #game-over-play-again, [data-arcade-radio-start]';
const INTERACTIVE_SELECTOR = 'button, input, textarea, select, a[href], summary, [contenteditable], [role="button"]';

// ── CSS ────────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('arcade-radio-styles')) return;
  var style = document.createElement('style');
  style.id = 'arcade-radio-styles';
  style.textContent = [
    '#' + PANEL_ID + '{margin-top:12px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-family:inherit}',
    '[data-arcade-audio-controls] #' + PANEL_ID + '{margin:0;padding:0;border:0;background:none}',
    '#arcade-radio-toggle,#arcade-sound-toggle{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--color-border,#444);border-radius:10px;padding:5px 10px;min-height:36px;cursor:pointer;font-family:inherit;font-size:.8rem;color:var(--color-text-muted,#eee);transition:background .15s,border-color .15s,color .15s;line-height:1.3;flex-shrink:0}',
    '#arcade-radio-toggle:hover,#arcade-sound-toggle:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.22);color:#fff}',
    '#arcade-radio-toggle.radio-on,#arcade-sound-toggle[aria-pressed="true"]{border-color:#7dff72;color:#7dff72;background:rgba(125,255,114,.07)}',
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

function _saveUserChoice(on) {
  try {
    // Kept for older readers of the arcade radio setting.
    localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  } catch (_) {}
}

function _mountSoundToggle(panel) {
  if (typeof window._arcadeMuted === 'undefined') window._arcadeMuted = true;
  var button = document.createElement('button');
  button.id = 'arcade-sound-toggle';
  button.type = 'button';
  var icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  var label = document.createElement('span');
  button.append(icon, label);

  function sync() {
    var muted = window.ArcadeAudio?.isMuted?.() ?? window._arcadeMuted;
    icon.textContent = muted ? '🔇' : '🔊';
    label.textContent = muted ? 'Sound Off' : 'Sound On';
    button.setAttribute('aria-pressed', String(!muted));
    button.setAttribute('aria-label', muted ? 'Turn on game sound' : 'Turn off game sound');
    button.title = button.getAttribute('aria-label');
  }

  button.addEventListener('click', function () {
    var muted = button.getAttribute('aria-pressed') === 'true';
    if (typeof window.ArcadeAudio?.setMuted === 'function') {
      window.ArcadeAudio.setMuted(muted);
    } else {
      window._arcadeMuted = muted;
      document.dispatchEvent(new CustomEvent('arcade-mute-change', { detail: { muted: muted } }));
    }
    sync();
  });
  document.addEventListener('arcade-mute-change', sync);
  panel.appendChild(button);
  sync();
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
  var playGeneration = 0;
  var turnedOffByPlayer = false;

  function _notify() {
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
    audio.addEventListener('error', function () {
      if (isOn && audio.error) _setPlaying(false);
    });
    window.addEventListener('pagehide', function () {
      _setPlaying(false);
    });
    return audio;
  }

  function _setPlaying(on) {
    isOn = Boolean(on);
    var generation = ++playGeneration;
    if (isOn) {
      var stream = _ensureAudio();
      if (!stream.hasAttribute('src')) stream.src = RADIO_URL;
      var attempt;
      try { attempt = stream.play(); } catch (error) { attempt = Promise.reject(error); }
      Promise.resolve(attempt).catch(function () {
        // Ignore a rejection from a cancelled or superseded connection.
        if (generation === playGeneration) _setPlaying(false);
      });
    } else if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
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
    _mountSoundToggle(panel);

    toggle.addEventListener('click', function () {
      controller.toggle();
    });

    // Insert: faction-hud → modifier panel → game card → main → body
    var anchor =
      document.getElementById('faction-hud') ||
      document.getElementById('cm-modifier-panel') ||
      document.querySelector('.game-card');

    var host = document.querySelector('[data-arcade-audio-controls]');
    if (host) {
      host.appendChild(panel);
    } else if (anchor && anchor.parentNode) {
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
      turnedOffByPlayer = !next;
      _saveUserChoice(next);
      _setPlaying(next);
      return next;
    },
    /** Player pressed Start in a game. */
    startForGame: function () {
      if (isOn || turnedOffByPlayer) return false;
      mount();
      _setPlaying(true);
      return true;
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
  // Standalone games expose their Start control here. Leave native Enter
  // activation alone when focus is already on a control.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.repeat || event.defaultPrevented ||
        event.metaKey || event.ctrlKey || event.altKey ||
        event.target?.closest(INTERACTIVE_SELECTOR)) return;
    var start = Array.from(document.querySelectorAll('[data-arcade-enter-start]')).find(function (button) {
      return !button.disabled && !button.closest('[inert]') && button.getClientRects().length;
    });
    if (!start) return;
    event.preventDefault();
    start.click();
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

if (typeof document !== 'undefined' && document.querySelector('[data-arcade-audio-controls]')) {
  mountArcadeRadio();
}
