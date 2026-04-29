/**
 * cross-game-modifier-ui.js — Arcade-wide modifier panel.
 *
 * Renders a small, collapsible panel below the game card showing:
 *   • Currently active modifier (with effect description)
 *   • All unlocked modifiers as selectable buttons
 *   • Modifier rarity and effect summary
 *
 * Usage (in each game page's <script type="module">):
 *   import { mountModifierPanel } from '/js/arcade/systems/cross-game-modifier-ui.js';
 *   mountModifierPanel();
 *
 * The panel is entirely display-side — it never calls any game code.
 */

import {
  MODIFIER_DEFS,
  getUnlockedModifiers,
  getActiveModifier,
  setActiveModifier,
  clearActiveModifier,
  getModifierDef,
} from '/js/arcade/systems/cross-game-modifier-system.js';

// ── Rarity colours (matches upgrade-system palette) ─────────────────────────

const RARITY_COLORS = {
  common:    '#88ccee',
  uncommon:  '#3fb950',
  rare:      '#f7c948',
  legendary: '#ff4fd1',
};

// ── CSS injected once per page ───────────────────────────────────────────────

let _cssInjected = false;

function _injectStyles() {
  if (_cssInjected) return;
  _cssInjected = true;

  const style = document.createElement('style');
  style.id = 'cm-modifier-panel-styles';
  style.textContent = [
    '#cm-modifier-panel{margin-top:14px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:0;overflow:hidden}',
    '#cm-modifier-panel .cm-mod-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;border-bottom:1px solid transparent;transition:border-color .2s}',
    '#cm-modifier-panel .cm-mod-header:hover{border-bottom-color:var(--color-border,#333)}',
    '#cm-modifier-panel .cm-mod-title{font-weight:700;font-size:.85rem;letter-spacing:.04em;color:#f7c948}',
    '#cm-modifier-panel .cm-mod-toggle{background:none;border:none;color:var(--color-text-muted,#888);cursor:pointer;font-size:.85rem;padding:0 2px;line-height:1}',
    '#cm-modifier-panel .cm-mod-body{padding:12px 14px 14px}',
    '#cm-modifier-panel .cm-mod-active-banner{display:flex;align-items:flex-start;gap:8px;background:rgba(255,255,255,.05);border:1px solid var(--color-border,#333);border-radius:12px;padding:10px 12px;margin-bottom:10px}',
    '#cm-modifier-panel .cm-mod-active-info{flex:1;min-width:0}',
    '#cm-modifier-panel .cm-mod-active-label{font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#cm-modifier-panel .cm-mod-active-desc{font-size:.78rem;color:var(--color-text-muted,#888);margin-top:2px}',
    '#cm-modifier-panel .cm-mod-clear-btn{padding:3px 10px;border:1px solid var(--color-border,#333);border-radius:8px;background:rgba(255,255,255,.07);color:var(--color-text-muted,#aaa);font-size:.76rem;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}',
    '#cm-modifier-panel .cm-mod-clear-btn:hover{background:rgba(255,255,255,.13);color:#fff}',
    '#cm-modifier-panel .cm-mod-none{font-size:.8rem;color:var(--color-text-muted,#888);margin-bottom:10px}',
    '#cm-modifier-panel .cm-mod-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:7px}',
    '#cm-modifier-panel .cm-mod-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:7px 10px;border:1px solid var(--color-border,#333);border-radius:10px;background:rgba(255,255,255,.04);cursor:pointer;text-align:left;transition:background .15s,border-color .15s,box-shadow .15s;font-family:inherit}',
    '#cm-modifier-panel .cm-mod-item:hover:not(:disabled){background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.18)}',
    '#cm-modifier-panel .cm-mod-item.cm-mod-selected{border-color:rgba(247,201,72,.55);box-shadow:0 0 0 1px rgba(247,201,72,.25),0 0 10px rgba(247,201,72,.1)}',
    '#cm-modifier-panel .cm-mod-item:disabled{opacity:.38;cursor:not-allowed}',
    '#cm-modifier-panel .cm-mod-item-name{font-size:.82rem;font-weight:700;line-height:1.15}',
    '#cm-modifier-panel .cm-mod-item-rarity{font-size:.69rem;text-transform:uppercase;letter-spacing:.06em;opacity:.85}',
    '@media(max-width:540px){#cm-modifier-panel .cm-mod-list{grid-template-columns:repeat(2,minmax(0,1fr))}}',
  ].join('\n');
  document.head.appendChild(style);
}

// ── Panel mount ──────────────────────────────────────────────────────────────

/**
 * Mount the modifier panel.
 *
 * By default it inserts itself immediately after the first `.game-card` element.
 * Pass a specific DOM element to override the insertion container.
 *
 * @param {Element} [container] - optional explicit parent element
 * @returns {{ unmount: function }|null}
 */
export function mountModifierPanel(container) {
  if (typeof document === 'undefined') return null;

  // Avoid double-mount
  if (document.getElementById('cm-modifier-panel')) return null;

  _injectStyles();

  const panel = document.createElement('div');
  panel.id = 'cm-modifier-panel';

  if (!container) {
    const gameCard = document.querySelector('.game-card');
    if (!gameCard) return null;
    gameCard.parentNode.insertBefore(panel, gameCard.nextSibling);
  } else {
    container.appendChild(panel);
  }

  let _collapsed = false;

  function render() {
    const unlocked = getUnlockedModifiers();
    const activeId = getActiveModifier();
    const activeDef = activeId ? getModifierDef(activeId) : null;

    var html = '';

    // Header
    html += '<div class="cm-mod-header" id="cm-mod-header-btn" role="button" tabindex="0" aria-expanded="' + (!_collapsed) + '" aria-controls="cm-mod-body">';
    html += '<span class="cm-mod-title">⚡ Arcade Modifiers</span>';
    html += '<button class="cm-mod-toggle" aria-label="' + (_collapsed ? 'Expand' : 'Collapse') + ' modifier panel">' + (_collapsed ? '▼' : '▲') + '</button>';
    html += '</div>';

    // Body (collapsed = hidden)
    html += '<div class="cm-mod-body" id="cm-mod-body"' + (_collapsed ? ' hidden' : '') + '>';

    // Active modifier banner
    if (activeDef) {
      var aColor = RARITY_COLORS[activeDef.rarity] || '#fff';
      html += '<div class="cm-mod-active-banner">';
      html += '<div class="cm-mod-active-info">';
      html += '<div class="cm-mod-active-label" style="color:' + aColor + '">' + _esc(activeDef.label) + '</div>';
      html += '<div class="cm-mod-active-desc">' + _esc(activeDef.description) + '</div>';
      html += '</div>';
      html += '<button class="cm-mod-clear-btn" data-action="clear">Clear</button>';
      html += '</div>';
    } else {
      html += '<div class="cm-mod-none">No modifier active — select one below to apply to your next run.</div>';
    }

    // Modifier list
    html += '<div class="cm-mod-list">';
    for (var i = 0; i < MODIFIER_DEFS.length; i++) {
      var mod = MODIFIER_DEFS[i];
      var isUnlocked = unlocked.indexOf(mod.id) !== -1;
      var isSelected = mod.id === activeId;
      var color = RARITY_COLORS[mod.rarity] || '#fff';
      html += '<button class="cm-mod-item' + (isSelected ? ' cm-mod-selected' : '') + '"';
      html += ' data-mod-id="' + _esc(mod.id) + '"';
      html += ' title="' + _esc(mod.description) + '"';
      if (!isUnlocked) html += ' disabled';
      html += '>';
      html += '<span class="cm-mod-item-name" style="color:' + color + '">' + _esc(mod.label) + '</span>';
      html += '<span class="cm-mod-item-rarity" style="color:' + color + '">' + _esc(mod.rarity) + '</span>';
      html += '</button>';
    }
    html += '</div>';

    html += '</div>'; // end .cm-mod-body

    panel.innerHTML = html;

    // Wire events
    const headerBtn = panel.querySelector('#cm-mod-header-btn');
    if (headerBtn) {
      headerBtn.addEventListener('click', function () {
        _collapsed = !_collapsed;
        render();
      });
      headerBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _collapsed = !_collapsed; render(); }
      });
    }

    const clearBtn = panel.querySelector('[data-action="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearActiveModifier();
        render();
      });
    }

    const modBtns = panel.querySelectorAll('.cm-mod-item:not([disabled])');
    modBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.modId;
        if (id === activeId) {
          clearActiveModifier();
        } else {
          setActiveModifier(id);
        }
        render();
      });
    });
  }

  render();

  return {
    unmount: function () {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
    refresh: function () {
      render();
    },
  };
}

// ── HTML escaping helper ─────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
