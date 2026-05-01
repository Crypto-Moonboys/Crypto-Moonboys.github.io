/**
 * run-summary-panel.js — Post-run summary / game-over breakdown panel.
 *
 * Renders a structured post-run summary showing:
 *  - Score and run result
 *  - Score submission status (pending / accepted / needs Telegram)
 *  - Mission progress from this run
 *  - Faction contribution estimate
 *  - Active modifier impact
 *  - Next action buttons: Play Again, Leaderboard, Battle Chamber, Link Telegram
 *
 * Usage:
 *   import { mountRunSummaryPanel, unmountRunSummaryPanel } from '/js/arcade/core/run-summary-panel.js';
 *
 *   mountRunSummaryPanel({
 *     containerId: 'runSummaryPanel',
 *     gameId: 'invaders',
 *     score: 4200,
 *     wave: 7,
 *     elapsed: 93,        // seconds alive
 *     submitted: true,    // was submitScore called?
 *     factionContrib: 42, // estimated contribution amount
 *     modifierId: 'score_surge',
 *     missionDeltas: [    // events emitted this run
 *       { type: 'score', value: 4200 },
 *       { type: 'survive', value: 93 },
 *     ],
 *   });
 *
 * XP wording is strictly controlled here — no fake XP claims.
 */

import { getPlayerFaction, getFactionEffects } from '/js/arcade/systems/faction-effect-system.js';
import { getModifierDef } from '/js/arcade/systems/cross-game-modifier-system.js';
import { getDailyMissions } from '/js/arcade/systems/faction-missions.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the post-run summary into the host element.
 *
 * @param {object} opts
 * @param {string}   opts.containerId       — id of the DOM element to render into
 * @param {string}   opts.gameId            — game id
 * @param {number}   opts.score             — final run score
 * @param {number}   [opts.wave]            — wave reached (if applicable)
 * @param {number}   [opts.elapsed]         — seconds alive
 * @param {boolean}  [opts.submitted]       — true if submitScore was called
 * @param {number}   [opts.factionContrib]  — estimated contribution amount
 * @param {string}   [opts.modifierId]      — active modifier id (or null)
 * @param {object[]} [opts.missionDeltas]   — array of { type, value } events fired this run
 */
export function mountRunSummaryPanel(opts) {
  try {
    var containerId    = (opts && opts.containerId)    || 'runSummaryPanel';
    var gameId         = (opts && opts.gameId)         || '';
    var score          = (opts && Number(opts.score))  || 0;
    var wave           = (opts && opts.wave)           || null;
    var elapsed        = (opts && opts.elapsed)        || 0;
    var submitted      = !!(opts && opts.submitted);
    var factionContrib = (opts && opts.factionContrib) || 0;
    var modifierId     = (opts && opts.modifierId)     || null;
    var missionDeltas  = Array.isArray(opts && opts.missionDeltas) ? opts.missionDeltas : [];

    var el = document.getElementById(containerId);
    if (!el) return;

    var factionId = getPlayerFaction();
    var fxDef     = getFactionEffects(factionId);
    var modDef    = modifierId ? getModifierDef(modifierId) : null;
    var missions  = _getSafeMissions(factionId);
    var isLinked  = _isLinked();

    el.innerHTML = _buildSummaryHTML({
      gameId, score, wave, elapsed, submitted, factionContrib,
      factionId, fxDef, modDef, missions, missionDeltas, isLinked,
    });
    el.removeAttribute('hidden');
    el.style.display = '';
  } catch (_) {}
}

/**
 * Hide the post-run summary panel.
 *
 * @param {string} [containerId]
 */
export function unmountRunSummaryPanel(containerId) {
  try {
    var el = document.getElementById(containerId || 'runSummaryPanel');
    if (!el) return;
    el.setAttribute('hidden', '');
    el.style.display = 'none';
  } catch (_) {}
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function _buildSummaryHTML(d) {
  var scoreSection = '<div class="rsp-score">'
    + '<span class="rsp-score-value">' + d.score + '</span>'
    + (d.wave ? '<span class="rsp-wave">Wave ' + d.wave + '</span>' : '')
    + '</div>';

  var statusSection = _buildStatusLine(d.submitted, d.isLinked, d.score);

  var missionSection = _buildMissionSection(d.missions, d.missionDeltas);

  var contribSection = '';
  if (d.factionContrib > 0 && d.fxDef && d.fxDef.key !== 'unaligned') {
    contribSection = '<p class="rsp-contrib">'
      + _esc(d.fxDef.label) + ' signal +' + d.factionContrib + ' — faction signal updates after accepted activity.'
      + '</p>';
  }

  var modSection = '';
  if (d.modDef) {
    modSection = '<p class="rsp-modifier">Modifier active: '
      + _esc(d.modDef.label) + ' — ' + _esc(d.modDef.description)
      + '</p>';
  }

  var ctaSection = _buildCTASection(d.isLinked);

  return '<div class="run-summary-panel" aria-label="Run summary">'
    + scoreSection
    + statusSection
    + missionSection
    + contribSection
    + modSection
    + ctaSection
    + '</div>';
}

function _buildStatusLine(submitted, isLinked, score) {
  var text;
  if (score <= 0) {
    text = 'No score recorded this run.';
  } else if (!submitted) {
    text = 'Score not yet submitted.';
  } else if (isLinked) {
    text = 'Score submitted to leaderboard. Accepted runs can sync Arcade XP when Telegram is linked.';
  } else {
    text = 'Submit score to qualify for Arcade XP. Link Telegram to sync from accepted runs.';
  }
  return '<p class="rsp-status">' + _esc(text) + '</p>';
}

function _buildMissionSection(missions, deltas) {
  if (!missions || missions.length === 0) return '';

  var lines = missions.map(function (m) {
    var prog    = Math.min(m.progress, m.target);
    var pct     = m.target > 0 ? Math.round((prog / m.target) * 100) : 0;
    var status  = m.complete ? '✅' : (pct >= 100 ? '✅' : pct + '%');
    return '<li class="rsp-mission-item' + (m.complete ? ' rsp-mission--done' : '') + '">'
      + _esc(m.label) + ' — ' + status
      + '</li>';
  });

  return '<div class="rsp-missions"><p class="rsp-label">Missions:</p><ul class="rsp-mission-list">'
    + lines.join('')
    + '</ul></div>';
}

function _buildCTASection(isLinked) {
  var btLink = typeof window !== 'undefined' && window.location
    ? (window.location.origin + '/community.html')
    : '/community.html';
  var lbLink = typeof window !== 'undefined' && window.location
    ? (window.location.origin + '/games/leaderboard.html')
    : '/games/leaderboard.html';

  var telegramBtn = isLinked ? '' :
    '<a class="rsp-cta rsp-cta--link" href="/how-to-play.html#link-telegram">Link Telegram</a>';

  return '<div class="rsp-cta-row">'
    + '<button class="rsp-cta rsp-cta--primary" onclick="window.dispatchEvent(new CustomEvent(\'arcade:play-again\'))">Play Again</button>'
    + '<a class="rsp-cta" href="' + lbLink + '">Leaderboard</a>'
    + '<a class="rsp-cta" href="' + btLink + '">Battle Chamber</a>'
    + telegramBtn
    + '</div>';
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

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
