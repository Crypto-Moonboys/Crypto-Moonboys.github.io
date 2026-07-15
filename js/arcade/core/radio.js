/**
 * radio.js — GraffPUNKS Radio for the Arcade HUD.
 *
 * Mounts a compact radio widget below the game card that lets players toggle
 * the GraffPUNKS live stream on/off while playing.  The ON/OFF state is
 * persisted to localStorage so the player's preference survives navigation.
 *
 * Usage (called automatically by game-shell.js after mountGame):
 *   import { mountArcadeRadio } from '/js/arcade/core/radio.js';
 *   mountArcadeRadio();
 *
 * Safe to call multiple times — only mounts once per page load.
 */

const RADIO_URL       = 'http://stream.radiojar.com/2qm1fc5kb';
const STORAGE_KEY     = 'arcade_radio_on';
const PANEL_ID        = 'arcade-radio-panel';
const LABEL_ON        = '📻 GraffPUNKS Radio  ·  ON';
const LABEL_OFF       = '📻 GraffPUNKS Radio  ·  OFF';

// ── CSS ────────────────────────────────────────────────────────────────────────

var _cssInjected = false;

function _injectStyles() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  var style = document.createElement('style');
  style.id = 'arcade-radio-styles';
  style.textContent = [
    '#' + PANEL_ID + '{margin-top:12px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;font-family:inherit}',
    '#arcade-radio-toggle{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--color-border,#444);border-radius:10px;padding:5px 12px;cursor:pointer;font-family:inherit;font-size:.8rem;color:var(--color-text-muted,#aaa);transition:background .15s,border-color .15s,color .15s;line-height:1.3;flex-shrink:0}',
    '#arcade-radio-toggle:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.22);color:#fff}',
    '#arcade-radio-toggle.radio-on{border-color:#7dff72;color:#7dff72;background:rgba(125,255,114,.07)}',
    '#arcade-radio-toggle.radio-on:hover{background:rgba(125,255,114,.13)}',
    '#arcade-radio-indicator{width:8px;height:8px;border-radius:50%;background:var(--color-text-muted,#555);flex-shrink:0;transition:background .2s,box-shadow .2s}',
    '#arcade-radio-indicator.radio-on{background:#7dff72;box-shadow:0 0 6px #7dff72}',
    '#arcade-radio-label{font-size:.78rem;color:var(--color-text-muted,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '@keyframes arcade-radio-pulse{0%,100%{opacity:1}50%{opacity:.5}}',
    '#arcade-radio-indicator.radio-on{animation:arcade-radio-pulse 1.8s ease-in-out infinite}',
  ].join('');
  document.head.appendChild(style);
}

// ── State helpers ──────────────────────────────────────────────────────────────

function _loadState() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function _saveState(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  } catch (_) {}
}

// ── Mount ──────────────────────────────────────────────────────────────────────

var _mounted = false;

/**
 * Mount the GraffPUNKS Radio panel.
 *
 * Inserts the panel after the faction HUD if present, else after the
 * modifier panel, else after the game card.  Only mounts once per page.
 */
export function mountArcadeRadio() {
  if (_mounted || typeof document === 'undefined') return;

  function _doMount() {
    if (_mounted) return;
    _mounted = true;

    if (document.getElementById(PANEL_ID)) return;

    _injectStyles();

    var audio = document.createElement('audio');
    audio.preload = 'none';
    audio.src = RADIO_URL;
    // Keep volume reasonable on first play; player can adjust via OS controls.
    audio.volume = 0.5;

    var isOn = _loadState();

    var panel   = document.createElement('div');
    panel.id    = PANEL_ID;

    var indicator = document.createElement('span');
    indicator.id  = 'arcade-radio-indicator';

    var toggle = document.createElement('button');
    toggle.id  = 'arcade-radio-toggle';
    toggle.setAttribute('aria-pressed', String(isOn));
    toggle.setAttribute('aria-label', 'Toggle GraffPUNKS Radio');

    var label = document.createElement('span');
    label.id  = 'arcade-radio-label';

    toggle.appendChild(indicator);
    toggle.appendChild(label);
    panel.appendChild(toggle);

    function _applyState(on) {
      if (on) {
        audio.play().catch(function () {
          // Autoplay blocked — silently flip back off so UI stays honest.
          _applyState(false);
        });
        toggle.classList.add('radio-on');
        indicator.classList.add('radio-on');
        label.textContent = LABEL_ON;
        toggle.setAttribute('aria-pressed', 'true');
      } else {
        audio.pause();
        toggle.classList.remove('radio-on');
        indicator.classList.remove('radio-on');
        label.textContent = LABEL_OFF;
        toggle.setAttribute('aria-pressed', 'false');
      }
      _saveState(on);
    }

    toggle.addEventListener('click', function () {
      isOn = !isOn;
      _applyState(isOn);
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

    // Apply persisted state (must happen after panel is in DOM).
    _applyState(isOn);

    // Stop stream on page unload to avoid background audio leaks.
    window.addEventListener('pagehide', function () {
      try { audio.pause(); audio.src = ''; } catch (_) {}
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doMount, { once: true });
  } else {
    _doMount();
  }
}
