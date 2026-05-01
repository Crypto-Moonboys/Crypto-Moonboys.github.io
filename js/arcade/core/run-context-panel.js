/**
 * run-context-panel.js — Pre-run faction/modifier context panel.
 *
 * Renders a small informational panel before a run starts, showing:
 *  - Player's faction and active perk
 *  - Active cross-game modifier (if any)
 *  - Active daily mission target (if any)
 *  - Best score / mastery blurb
 *  - "Why this run matters" context line
 *
 * Usage:
 *   import { mountRunContextPanel, unmountRunContextPanel } from '/js/arcade/core/run-context-panel.js';
 *
 *   // On game init / reset screen
 *   mountRunContextPanel({
 *     containerId: 'runContextPanel',   // id of host element in the game's HTML
 *     gameId: 'invaders',
 *     crossGameTags: ['shooter'],
 *   });
 *
 *   // On run start (hide the panel)
 *   unmountRunContextPanel('runContextPanel');
 *
 * The host element should already exist in the game's HTML. If it does not
 * exist the helper silently no-ops; no exceptions are thrown.
 *
 * XP wording rules (enforced here — never claim XP was awarded):
 *  ✅ "Submit score to qualify for Arcade XP."
 *  ✅ "Accepted runs can sync Arcade XP when Telegram is linked."
 *  ✅ "Faction signal updates after accepted activity."
 */

import { getPlayerFaction, getFactionEffects } from '/js/arcade/systems/faction-effect-system.js';
import { getActiveModifier, getModifierDef } from '/js/arcade/systems/cross-game-modifier-system.js';
import { getDailyMissions } from '/js/arcade/systems/faction-missions.js';
import { ArcadeSync } from '/js/arcade-sync.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount the pre-run context panel into the host element.
 *
 * @param {object} opts
 * @param {string}   opts.containerId    — id of the DOM element to render into
 * @param {string}   opts.gameId         — current game id
 * @param {string[]} [opts.crossGameTags] — game's crossGameTags for modifier check
 */
export function mountRunContextPanel(opts) {
  try {
    var containerId = (opts && opts.containerId) || 'runContextPanel';
    var gameId      = (opts && opts.gameId)      || '';
    var tags        = Array.isArray(opts && opts.crossGameTags) ? opts.crossGameTags : [];

    var el = document.getElementById(containerId);
    if (!el) return;

    var factionId = getPlayerFaction();
    var fxDef     = getFactionEffects(factionId);
    var modId     = getActiveModifier();
    var modDef    = modId ? getModifierDef(modId) : null;
    var missions  = _getSafeMissions(factionId);
    var bestScore = _getSafeBest(gameId);

    el.innerHTML = _buildPanelHTML(factionId, fxDef, modDef, missions, bestScore, gameId);
    el.removeAttribute('hidden');
    el.style.display = '';
  } catch (_) {}
}

/**
 * Hide the pre-run context panel.
 *
 * @param {string} [containerId] — defaults to 'runContextPanel'
 */
export function unmountRunContextPanel(containerId) {
  try {
    var el = document.getElementById(containerId || 'runContextPanel');
    if (!el) return;
    el.setAttribute('hidden', '');
    el.style.display = 'none';
  } catch (_) {}
}

// ── Panel HTML builder ────────────────────────────────────────────────────────

function _buildPanelHTML(factionId, fxDef, modDef, missions, bestScore, gameId) {
  var factionLabel = fxDef ? fxDef.label : 'Unaligned';
  var perkText     = (fxDef && fxDef.bonusText) ? fxDef.bonusText : 'No faction perk active.';
  var isLinked     = _isLinked();

  var modLine = '';
  if (modDef) {
    modLine = '<p class="rcp-modifier"><span class="rcp-label">Modifier:</span> '
      + _esc(modDef.label) + ' — ' + _esc(modDef.description) + '</p>';
  }

  var missionLine = '';
  if (missions.length > 0) {
    var m = missions[0];
    if (!m.complete) {
      missionLine = '<p class="rcp-mission"><span class="rcp-label">Mission:</span> '
        + _esc(m.label) + ' (' + Math.min(m.progress, m.target) + ' / ' + m.target + ')</p>';
    } else {
      missionLine = '<p class="rcp-mission rcp-mission--done"><span class="rcp-label">Mission:</span> '
        + _esc(m.label) + ' ✅ Complete</p>';
    }
  }

  var bestLine = '';
  if (bestScore > 0) {
    bestLine = '<p class="rcp-best"><span class="rcp-label">Best:</span> ' + bestScore + '</p>';
  }

  var whyLine = _buildWhyLine(missions, modDef, isLinked);

  return '<div class="run-context-panel" aria-label="Run context">'
    + '<div class="rcp-faction">'
    +   '<span class="rcp-faction-badge">' + _esc(factionLabel) + '</span>'
    +   '<span class="rcp-perk-text">' + _esc(perkText) + '</span>'
    + '</div>'
    + modLine
    + missionLine
    + bestLine
    + '<p class="rcp-why">' + _esc(whyLine) + '</p>'
    + '</div>';
}

function _buildWhyLine(missions, modDef, isLinked) {
  if (missions.length > 0 && !missions[0].complete) {
    return 'Complete today\'s mission to grow faction signal.';
  }
  if (modDef) {
    return 'Your modifier is active — ' + modDef.label + ' applies this run.';
  }
  if (isLinked) {
    return 'Accepted runs can sync Arcade XP when Telegram is linked.';
  }
  return 'Submit score to qualify for Arcade XP. Faction signal updates after accepted activity.';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isLinked() {
  try {
    var identity = (typeof window !== 'undefined') && window.MOONBOYS_IDENTITY;
    return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
  } catch (_) { return false; }
}

function _getSafeMissions(factionId) {
  try {
    return getDailyMissions(factionId) || [];
  } catch (_) { return []; }
}

function _getSafeBest(gameId) {
  try {
    return ArcadeSync.getHighScore(gameId) || 0;
  } catch (_) { return 0; }
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
