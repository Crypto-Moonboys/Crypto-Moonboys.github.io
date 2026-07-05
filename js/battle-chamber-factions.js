/**
 * battle-chamber-factions.js — Battle Chamber Faction Wars hub renderer.
 *
 * Responsibilities:
 *   - Render faction war standings (using faction-war-system.js data)
 *   - Render faction join cards for unaligned players
 *   - Render current player faction panel
 *   - Render active faction missions preview (using faction-missions.js data)
 *   - Render faction perks / roguelite options (using faction-effect-system.js data)
 *   - Render clout rewards board
 *   - Listen for faction:update / moonboys:faction-status / moonboys:faction-boost events
 *
 * This file reads from existing faction systems and must not re-implement
 * or duplicate faction logic.  All data flows through:
 *   window.MOONBOYS_FACTION      (faction-alignment.js)
 *   window.MOONBOYS_WAR_DATA     (faction-war-system.js — set by battle-chamber-faction-bridge.js)
 *   window.FACTION_EFFECT_DEFS   (faction-effect-system.js — set by battle-chamber-faction-bridge.js)
 *   window.MOONBOYS_MISSION_DATA (faction-missions.js — set by battle-chamber-faction-bridge.js)
 *
 * battle-chamber-faction-bridge.js (type="module") imports the real ES-module
 * faction systems, populates those window caches, and dispatches
 * 'battle-chamber:faction-data-ready' so this IIFE can re-render with real data.
 *
 * Hook elements this file targets (all optional — renders only if present):
 *   #battle-faction-standings
 *   #battle-weekly-war
 *   #battle-monthly-clout
 *   #battle-seasonal-campaign
 *   #battle-join-faction
 *   #battle-active-missions
 *   #battle-faction-perks
 *   #battle-clout-rewards
 *   #battle-faction-proof-feed  (headline/copy only — feed is tg-activity-feed)
 *   #battle-todays-active-options
 *   #battle-missed-perks-history
 */
(function () {
  'use strict';

  // ── Faction roster ────────────────────────────────────────────────────────

  var LIVE_FACTIONS = [
    { key: 'hard-fork-rockers',   label: 'Hard Fork Rockers',  icon: '🪨', color: '#56dcff',
      playstyle: 'Endurance · Stability · Streak Protection',
      perkTeaser: 'Reduced chaos exposure, long-run bonus branches, streak protection',
      rewardBias: 'endurance' },
    { key: 'rugpull-miners',      label: 'Rugpull Miners',     icon: '⛏️', color: '#ff6ad5',
      playstyle: 'Defensive Recovery · Shield Support · Resource Pressure',
      perkTeaser: 'Shield bonus, comeback branches, resource-recovery quests',
      rewardBias: 'contribution' },
    { key: 'graffpunks',          label: 'GraffPUNKS',         icon: '🎨', color: '#7dff72',
      playstyle: 'Chaos · Combos · High-Risk Clout',
      perkTeaser: 'Higher chaos bursts, bigger combo paths, high-risk rabbit holes',
      rewardBias: 'chaos' },
    { key: 'blockchain-furies',   label: 'Blockchain Furies',  icon: '🔥', color: '#ff9f43',
      playstyle: 'Speed · Aggression · Revenge Momentum',
      perkTeaser: 'Fast-run missions, burst windows, revenge bonuses after failed runs',
      rewardBias: 'chaos' },
    { key: 'crypto-moongirls',    label: 'Crypto Moongirls',   icon: '🌙', color: '#b88dff',
      playstyle: 'Control · Precision · Signal Dominance',
      perkTeaser: 'Precision missions, leaderboard control, elite faction titles',
      rewardBias: 'contribution' },
    { key: 'blockstars',          label: 'The Blockstars',     icon: '⭐', color: '#ffd166',
      playstyle: 'Celebrity Clout · Spotlight Events · Public Ranking',
      perkTeaser: 'Featured player chances, clout multipliers, monthly fame tracks',
      rewardBias: 'contribution' },
    { key: 'all-city-bulls',      label: 'All City Bulls',     icon: '🐂', color: '#ff6b6b',
      playstyle: 'Brute Force · High-Score Pressure · Territory Dominance',
      perkTeaser: 'Score target branches, weekly war contribution boosts',
      rewardBias: 'contribution' },
    { key: 'nomad-bears',         label: 'Nomad Bears',        icon: '🐻', color: '#8ecf7a',
      playstyle: 'Exploration · Consistency · Multi-Game Variety',
      perkTeaser: 'Variety bonuses, multi-game rabbit holes, daily/weekly route bonuses',
      rewardBias: 'endurance' },
    { key: 'crypto-stoned-boys',  label: 'Crypto Stoned Boys', icon: '😶‍🌫️', color: '#8fd3ff',
      playstyle: 'Chill Grind · Weird Events · Randomizer Energy',
      perkTeaser: 'Random bonus branches, rare event chances, low-pressure XP paths',
      rewardBias: 'endurance' },
  ];

  var MOMENTUM_LABELS = ['—', 'Rising', 'Hot', 'Dominant'];

  var CHAMBER_ROUTES = Object.freeze({
    'hard-fork-rockers': '/battle-chamber/factions/hard-fork-rockers.html',
    'rugpull-miners': '/battle-chamber/factions/rugpull-miners.html',
    graffpunks: '/battle-chamber/factions/graffpunks.html',
    'blockchain-furies': '/battle-chamber/factions/blockchain-furies.html',
    'crypto-moongirls': '/battle-chamber/factions/crypto-moongirls.html',
    blockstars: '/battle-chamber/factions/blockstars.html',
    'all-city-bulls': '/battle-chamber/factions/all-city-bulls.html',
    'nomad-bears': '/battle-chamber/factions/nomad-bears.html',
    'crypto-stoned-boys': '/battle-chamber/factions/crypto-stoned-boys.html',
  });

  // ── HTML escape ───────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  var PLATFORM = window.BATTLE_CHAMBER_PLATFORM || null;
  var CONTENT = PLATFORM && PLATFORM.content ? PLATFORM.content : {};
  var SECTION_STATE = PLATFORM && PLATFORM.sections ? PLATFORM.sections : null;
  var IDENTITY_PROVIDER = PLATFORM && PLATFORM.identityProvider ? PLATFORM.identityProvider : null;
  var DISCLOSURE_STORAGE_KEY = PLATFORM && PLATFORM.disclosureStorageKey
    ? PLATFORM.disclosureStorageKey
    : 'moonboys:battle-chamber:disclosures:v1';
  var SECTION_IDS = [
    'battle-faction-standings',
    'battle-weekly-war',
    'battle-monthly-clout',
    'battle-seasonal-campaign',
    'battle-join-faction',
    'battle-active-missions',
    'battle-faction-perks',
    'battle-clout-rewards',
    'battle-faction-reward-unlocks',
    'battle-faction-proof-feed',
    'battle-todays-active-options',
    'battle-missed-perks-history',
  ];
  var renderController = null;
  var hashOpenTimer = null;

  // ── War data helpers ──────────────────────────────────────────────────────

  /**
   * Read cached war standings.  faction-war-system.js is an ES module so
   * we cannot call it directly from a non-module IIFE.  It writes standings
   * to window.MOONBOYS_WAR_DATA when it initialises (bridge set up in html),
   * or we fall back to an all-zero placeholder so the page renders either way.
   */
  function getStandings() {
    var cache = window.MOONBOYS_WAR_DATA;
    if (cache && Array.isArray(cache.standings)) return cache.standings;
    // Build fallback from faction roster until bridge sets the real data
    return LIVE_FACTIONS.map(function (f) {
      return { faction: f.key, power: 0, daily: 0, weekly: 0, momentum: 0 };
    });
  }

  function getServerStatus() {
    var status = window.MOONBOYS_BATTLE_CHAMBER_SERVER_STATUS;
    return status && typeof status === 'object' ? status : { available: false, fallback: true };
  }

  function getServerPeriodRows(period) {
    var standings = window.MOONBOYS_BATTLE_CHAMBER_STANDINGS;
    if (!standings || !standings[period] || !Array.isArray(standings[period].rows)) return null;
    return standings[period].rows.slice();
  }

  function getServerActivity() {
    var rows = window.MOONBOYS_BATTLE_CHAMBER_ACTIVITY;
    return Array.isArray(rows) ? rows.slice() : [];
  }

  function getRogueliteDailyState() {
    var state = window.MOONBOYS_ROGUELITE_DAILY_STATE;
    return state && typeof state === 'object' ? state : null;
  }

  function getRogueliteMissedHistory() {
    var rows = window.MOONBOYS_ROGUELITE_MISSED_HISTORY;
    return Array.isArray(rows) ? rows.slice() : [];
  }

  function isTelegramLinked() {
    if (IDENTITY_PROVIDER && typeof IDENTITY_PROVIDER.isLinked === 'function') {
      return IDENTITY_PROVIDER.isLinked();
    }
    try {
      var identity = window.MOONBOYS_IDENTITY;
      return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
    } catch (_) {
      return false;
    }
  }

  function toWarRowsFromServerPeriod(periodRows) {
    if (!Array.isArray(periodRows)) return [];
    return periodRows.map(function (row) {
      return {
        faction: row.faction_id,
        power: Number(row.clout_total) || 0,
        weekly: Number(row.clout_total) || 0,
        daily: 0,
        momentum: row.momentum == null ? 0 : Number(row.momentum) || 0,
      };
    });
  }

  // ── Mission data helpers ──────────────────────────────────────────────────

  function getMissions(factionKey) {
    var cache = window.MOONBOYS_MISSION_DATA;
    var factions = cache && cache.factions ? cache.factions : cache;
    if (factions && factions[factionKey] && Array.isArray(factions[factionKey].daily)) {
      return factions[factionKey].daily.slice(0, 3);
    }
    return null;
  }

  // ── Faction meta lookup ───────────────────────────────────────────────────

  function factionMeta(key) {
    for (var i = 0; i < LIVE_FACTIONS.length; i++) {
      if (LIVE_FACTIONS[i].key === key) return LIVE_FACTIONS[i];
    }
    return LIVE_FACTIONS[0];
  }

  function sectionState(id, state, message) {
    if (SECTION_STATE && typeof SECTION_STATE.setState === 'function') {
      SECTION_STATE.setState(id, state, message);
    }
  }

  function renderSection(id, fn, status) {
    if (renderController && typeof renderController.runSection === 'function') {
      renderController.runSection(id, fn, status);
      return;
    }
    try {
      fn(status || null);
      sectionState(id, 'loaded');
    } catch (_) {
      if (SECTION_STATE && typeof SECTION_STATE.showFallback === 'function') {
        SECTION_STATE.showFallback(id, 'failed', CONTENT.failed || 'This section could not load.');
      }
    }
  }

  function requestRender(reason, status) {
    if (renderController && typeof renderController.request === 'function') {
      renderController.request(reason, status || null);
      return;
    }
    renderAll(status || null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section renderers
  // ─────────────────────────────────────────────────────────────────────────

  // ── 1. Faction War Standings ──────────────────────────────────────────────

  function renderStandings() {
    var container = el('battle-faction-standings');
    if (!container) return;

    var serverWeekly = getServerPeriodRows('weekly');
    var usingServer = !!(serverWeekly && serverWeekly.length);
    var standings = usingServer
      ? toWarRowsFromServerPeriod(serverWeekly).sort(function (a, b) { return b.power - a.power; })
      : getStandings().slice().sort(function (a, b) { return b.power - a.power; });
    var dominant = standings.length ? standings[0].faction : '';
    var serverStatus = getServerStatus();

    var rows = standings.map(function (row, idx) {
      var meta = factionMeta(row.faction);
      var rank = idx + 1;
      var momentumLabel = MOMENTUM_LABELS[Math.min(3, row.momentum || 0)];
      var isDominant = row.faction === dominant;
      return '<div class="bc-faction-row' + (isDominant ? ' bc-faction-row--dominant' : '') + '" style="--faction-color:' + esc(meta.color) + '">' +
        '<span class="bc-faction-rank">#' + rank + '</span>' +
        '<span class="bc-faction-icon">' + meta.icon + '</span>' +
        '<span class="bc-faction-name">' + esc(meta.label) + (isDominant ? ' <span class="bc-dominant-badge">⚔ LEADING</span>' : '') + '</span>' +
        '<span class="bc-faction-power">Power: <strong>' + (row.power || 0) + '</strong></span>' +
        '<span class="bc-faction-daily">Today: <strong>' + (row.daily || 0) + '</strong></span>' +
        '<span class="bc-faction-weekly">Week: <strong>' + (row.weekly || 0) + '</strong></span>' +
        '<span class="bc-faction-momentum">Momentum: <strong>' + esc(momentumLabel) + '</strong></span>' +
        '<span class="bc-faction-perk-teaser">' + esc(meta.perkTeaser) + '</span>' +
        '<a class="bc-faction-chamber-link" href="' + esc(CHAMBER_ROUTES[row.faction] || '/battle-chamber/factions/index.html') + '" aria-label="Enter ' + esc(meta.label) + ' Chamber">Enter Faction Chamber →</a>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<p class="bc-standings-note">' + esc(usingServer
        ? 'Standings are using Battle Chamber server authority.'
        : (serverStatus.message || 'Live server standings unavailable. Showing local display state.')) + '</p>' +
      '<div class="bc-faction-standings-list">' + rows + '</div>';
  }

  // ── 2. Weekly Faction War ─────────────────────────────────────────────────

  function renderWeeklyWar() {
    var container = el('battle-weekly-war');
    if (!container) return;

    var serverWeekly = getServerPeriodRows('weekly');
    var usingServer = !!(serverWeekly && serverWeekly.length);
    var standings = usingServer
      ? toWarRowsFromServerPeriod(serverWeekly).sort(function (a, b) { return b.weekly - a.weekly; })
      : getStandings().slice().sort(function (a, b) { return b.weekly - a.weekly; });
    var leader = standings.length ? standings[0] : null;
    var leaderMeta = leader ? factionMeta(leader.faction) : null;

    container.innerHTML =
      '<div class="bc-weekly-header">' +
        '<div class="bc-weekly-leader">' +
          (leaderMeta
            ? '<span class="bc-weekly-icon">' + leaderMeta.icon + '</span> <strong>' + esc(leaderMeta.label) + '</strong> — Weekly Leader'
            : 'No weekly data yet') +
        '</div>' +
      '</div>' +
      '<div class="bc-weekly-rows">' +
        standings.slice(0, 5).map(function (row, idx) {
          var meta = factionMeta(row.faction);
          return '<div class="bc-weekly-row">' +
            '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
            '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
            '<span class="bc-weekly-score">Weekly contribution: <strong>' + (row.weekly || 0) + '</strong></span>' +
            '</div>';
        }).join('') +
      '</div>' +
      '<div class="bc-weekly-reset-note">' + esc(usingServer
        ? 'Weekly war reflects server-backed clout authority.'
        : 'Weekly war resets every Monday at 00:00 UTC.') + '</div>' +
      '<div class="bc-weekly-prizes">' +
        '<strong>Weekly prizes (display):</strong> ' +
        'Top weekly factions unlock stronger roguelite options, Battle Chamber badges, and XP prize pool eligibility.' +
      '</div>';
  }

  // ── 3. Monthly Clout Chase ────────────────────────────────────────────────

  function renderMonthlyClout() {
    var container = el('battle-monthly-clout');
    if (!container) return;

    var monthlyRows = getServerPeriodRows('monthly');
    var serverStatus = getServerStatus();
    var usingServer = !!(monthlyRows && monthlyRows.length);

    // Always render bc-weekly-rows regardless of data source so DOM shape never changes.
    var rowsHtml;
    if (usingServer) {
      rowsHtml = monthlyRows
        .slice()
        .sort(function (a, b) { return (Number(b.clout_total) || 0) - (Number(a.clout_total) || 0); })
        .slice(0, 5)
        .map(function (row, idx) {
          var meta = factionMeta(row.faction_id);
          return '<div class="bc-weekly-row">' +
            '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
            '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
            '<span class="bc-weekly-score">Monthly clout: <strong>' + (Number(row.clout_total) || 0) + '</strong></span>' +
            '</div>';
        }).join('');
    } else {
      rowsHtml = getStandings()
        .slice()
        .sort(function (a, b) { return b.power - a.power; })
        .slice(0, 5)
        .map(function (row, idx) {
          var meta = factionMeta(row.faction);
          return '<div class="bc-weekly-row">' +
            '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
            '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
            '<span class="bc-weekly-score">Monthly clout: <strong>0</strong></span>' +
            '</div>';
        }).join('');
    }

    container.innerHTML =
      '<p class="bc-standings-note">' + esc(usingServer
        ? 'Monthly clout standings are server-backed when available.'
        : (serverStatus.message || 'Live server standings unavailable. Showing local display state.')) + '</p>' +
      '<div class="bc-weekly-rows">' + rowsHtml + '</div>' +
      '<div class="bc-monthly-target"><strong>' + (usingServer ? 'Live monthly source:' : 'Current monthly target:') + '</strong> ' +
        esc(usingServer ? 'Battle Chamber authority layer' : 'Monthly standings update live — keep building faction clout.') + '</div>';
  }

  // ── 4. Seasonal Campaign ──────────────────────────────────────────────────

  function renderSeasonalCampaign() {
    var container = el('battle-seasonal-campaign');
    if (!container) return;

    var seasonalRows = getServerPeriodRows('seasonal');
    var serverStatus = getServerStatus();
    var usingServer = !!(seasonalRows && seasonalRows.length);

    // Always render bc-weekly-rows regardless of data source so DOM shape never changes.
    var rowsHtml;
    if (usingServer) {
      rowsHtml = seasonalRows
        .slice()
        .sort(function (a, b) { return (Number(b.clout_total) || 0) - (Number(a.clout_total) || 0); })
        .slice(0, 5)
        .map(function (row, idx) {
          var meta = factionMeta(row.faction_id);
          return '<div class="bc-weekly-row">' +
            '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
            '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
            '<span class="bc-weekly-score">Seasonal clout: <strong>' + (Number(row.clout_total) || 0) + '</strong></span>' +
            '</div>';
        }).join('');
    } else {
      rowsHtml = getStandings()
        .slice()
        .sort(function (a, b) { return b.power - a.power; })
        .slice(0, 5)
        .map(function (row, idx) {
          var meta = factionMeta(row.faction);
          return '<div class="bc-weekly-row">' +
            '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
            '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
            '<span class="bc-weekly-score">Seasonal clout: <strong>0</strong></span>' +
            '</div>';
        }).join('');
    }

    container.innerHTML =
      '<p class="bc-standings-note">' + esc(usingServer
        ? 'Seasonal campaign standings are server-backed when available.'
        : (serverStatus.message || 'Live server standings unavailable. Showing local display state.')) + '</p>' +
      '<div class="bc-weekly-rows">' + rowsHtml + '</div>' +
      '<div class="bc-season-current">' +
        '<strong>Season 1: The Clout War</strong>' +
        '<p>Each season runs a full cross-faction campaign. Complete seasonal missions, build maximum clout, and secure your faction\'s place in the Battle Chamber record.</p>' +
      '</div>' +
      '<p class="bc-hall-of-fame">Seasonal winners become part of the Battle Chamber record. Hall of Fame placement is permanent.</p>';
  }

  // ── 5. Join Faction Panel ─────────────────────────────────────────────────

  function renderJoinFaction(status) {
    var container = el('battle-join-faction');
    if (!container) return;

    var factionApi = window.MOONBOYS_FACTION;
    var cached = status || (factionApi && typeof factionApi.getCachedStatus === 'function' ? factionApi.getCachedStatus() : null);
    var currentFaction = (cached && cached.faction) ? cached.faction : 'unaligned';
    var isAligned = currentFaction !== 'unaligned';

    if (isAligned) {
      var meta = factionMeta(currentFaction);
      var chamberLink = CHAMBER_ROUTES[currentFaction] || '/battle-chamber/factions/index.html';
      var seasonKey = (cached && cached.season_key) ? cached.season_key : null;
      var seasonDisplay = seasonKey
        ? '<div class="bc-aligned-row bc-aligned-season-note"><span>Current season:</span> <strong>' + esc(seasonKey) + '</strong></div>'
        : '';
      container.innerHTML =
        '<div class="bc-aligned-panel" style="--faction-color:' + esc(meta.color) + '">' +
          '<div class="bc-aligned-header">' + meta.icon + ' <strong>' + esc(meta.label) + '</strong></div>' +
          '<div class="bc-aligned-season-lock">You are locked to ' + esc(meta.label) + ' for this season.</div>' +
          '<div class="bc-aligned-row"><span>Faction XP:</span> <strong>' + (Number(cached.faction_xp) || 0) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Active bonus:</span> <strong>' + esc((cached.bonuses && cached.bonuses.bonus) || meta.perkTeaser) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Playstyle:</span> <strong>' + esc(meta.playstyle) + '</strong></div>' +
          '<div class="bc-aligned-row bc-aligned-clout-note">Your runs, missions, and proof events now count toward this faction.</div>' +
          seasonDisplay +
          '<div class="bc-aligned-actions">' +
            '<a class="bc-cta-btn" href="/games/index.html">Play Arcade</a>' +
            '<a class="bc-cta-btn bc-cta-secondary" href="#battle-active-missions">View Daily Missions</a>' +
            '<a class="bc-cta-btn bc-cta-chamber" href="' + esc(chamberLink) + '">View Faction Chamber</a>' +
          '</div>' +
        '</div>';
    } else {
      var cards = LIVE_FACTIONS.map(function (f) {
        return '<div class="bc-join-card" style="--faction-color:' + esc(f.color) + '">' +
          '<div class="bc-join-card-icon">' + f.icon + '</div>' +
          '<div class="bc-join-card-name">' + esc(f.label) + '</div>' +
          '<div class="bc-join-card-playstyle">' + esc(f.playstyle) + '</div>' +
          '<div class="bc-join-card-perk">' + esc(f.perkTeaser) + '</div>' +
          '<button class="bc-join-btn faction-join-btn interactive" data-faction="' + esc(f.key) + '">Join ' + esc(f.label) + '</button>' +
          '</div>';
      }).join('');

      container.innerHTML =
        '<div class="bc-join-season-notice">' +
          '<p class="bc-join-season-lock-copy">' + esc(CONTENT.factionLock || 'Choose carefully. Your faction is locked for the current season.') + '</p>' +
          '<p class="bc-join-season-reset-copy">' + esc(CONTENT.factionReset || 'At season reset, your faction lock clears and you can join again or pick a new side.') + '</p>' +
          '<p class="bc-join-link-copy">' + esc(CONTENT.factionIdentityRequired || 'Faction clout only counts when you are Telegram-linked. No faction, no faction clout.') + '</p>' +
        '</div>' +
        '<p class="bc-join-intro">' + esc(CONTENT.joinIntro || 'Join a faction to make your arcade activity count for something bigger. Your runs build clout. Your faction earns pressure.') + '</p>' +
        '<div class="bc-join-grid">' + cards + '</div>';

      // Wire join buttons
      var btns = container.querySelectorAll('.bc-join-btn[data-faction]');
      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener('click', function () {
          var targetFaction = btn.getAttribute('data-faction');
          if (!targetFaction) return;

          // Check linked identity first. Unlinked users must connect before joining.
          var isLinked = isTelegramLinked();

          var api = window.MOONBOYS_FACTION;

          if (!isLinked || !api || typeof api.joinFaction !== 'function') {
            // Not linked — redirect to the identity link CTA page
            window.location.href = '/gkniftyheads-incubator.html';
            return;
          }

          // Show inline confirmation panel
          var targetMeta = factionMeta(targetFaction);
          container.innerHTML =
            '<div class="bc-join-confirm-panel" style="--faction-color:' + esc(targetMeta.color) + '">' +
              '<div class="bc-join-confirm-icon">' + targetMeta.icon + '</div>' +
              '<div class="bc-join-confirm-title">Confirm faction choice</div>' +
              '<div class="bc-join-confirm-faction"><strong>' + esc(targetMeta.label) + '</strong></div>' +
              '<div class="bc-join-confirm-lock">You will be locked to this faction for the current season.</div>' +
              '<div class="bc-join-confirm-reset">You can choose again when the next season starts.</div>' +
              '<div class="bc-join-confirm-actions">' +
                '<button class="bc-join-confirm-btn interactive" id="bc-confirm-join">Confirm — Join ' + esc(targetMeta.label) + '</button>' +
                '<button class="bc-join-cancel-btn interactive" id="bc-cancel-join">Cancel</button>' +
              '</div>' +
            '</div>';

          var confirmBtn = container.querySelector('#bc-confirm-join');
          var cancelBtn = container.querySelector('#bc-cancel-join');

          if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
              renderJoinFaction(null);
            });
          }

          if (confirmBtn) {
            confirmBtn.addEventListener('click', function () {
              confirmBtn.disabled = true;
              confirmBtn.textContent = 'Joining\u2026';

              api.joinFaction(targetFaction).then(function (data) {
                var seasonKey = data && data.season_key ? data.season_key : null;
                var successStatus = {
                  faction: targetFaction,
                  faction_xp: (data && data.faction_xp) || 0,
                  bonuses: (data && data.bonuses) || null,
                  season_key: seasonKey,
                };
                // Show success message before re-rendering
                container.innerHTML =
                  '<div class="bc-join-success-panel" style="--faction-color:' + esc(targetMeta.color) + '">' +
                    '<div class="bc-join-success-icon">' + targetMeta.icon + '</div>' +
                    '<div class="bc-join-success-msg">You joined ' + esc(targetMeta.label) + '. Your faction clout now counts for this season.</div>' +
                  '</div>';
                // Reload full status and re-render after brief delay.
                // Merge season_key from join response when loadStatus() doesn't return it.
                if (typeof api.loadStatus === 'function') {
                  api.loadStatus().then(function (freshStatus) {
                    var merged = freshStatus
                      ? (freshStatus.season_key ? freshStatus : Object.assign({}, freshStatus, { season_key: seasonKey }))
                      : successStatus;
                    window.dispatchEvent(new CustomEvent('moonboys:faction-status', {
                      detail: merged,
                    }));
                  }).catch(function () {
                    window.dispatchEvent(new CustomEvent('moonboys:faction-status', {
                      detail: successStatus,
                    }));
                  });
                } else {
                  window.dispatchEvent(new CustomEvent('moonboys:faction-status', {
                    detail: successStatus,
                  }));
                }
              }).catch(function (err) {
                var errMsg = err && err.message ? err.message : String(err || '');
                var errMsgLower = errMsg.toLowerCase();
                var errCode = err && err.code ? String(err.code).toLowerCase() : '';
                var errStatus = Number(err && err.status) || 0;
                // Handle season lock rejection from server (check both error code and message)
                var isSeasonLock = errMsg.indexOf('faction_locked_for_season') !== -1 ||
                  errCode === 'faction_locked_for_season';
                var isBackendUnavailable = errStatus === 503 ||
                  errCode === 'missing_required_table' ||
                  errCode === 'battle_chamber_unavailable' ||
                  errMsgLower.indexOf('http 503') !== -1 ||
                  errMsgLower.indexOf('service unavailable') !== -1 ||
                  errMsgLower.indexOf('migration_pending') !== -1 ||
                  errMsgLower.indexOf('schema is pending migration') !== -1;
                if (isSeasonLock) {
                  container.innerHTML =
                    '<div class="bc-join-locked-panel">' +
                      '<div class="bc-join-locked-msg">Faction switch blocked. You are already locked to a faction until the next season.</div>' +
                      '<button class="bc-join-cancel-btn interactive" id="bc-locked-back">Back</button>' +
                    '</div>';
                  var backBtn = container.querySelector('#bc-locked-back');
                  if (backBtn) {
                    backBtn.addEventListener('click', function () { renderJoinFaction(null); });
                  }
                } else if (isBackendUnavailable) {
                  container.innerHTML =
                    '<div class="bc-join-locked-panel">' +
                      '<div class="bc-join-locked-msg">' + esc(CONTENT.backendUnavailable || 'Faction backend is updating. Your Telegram link is active, but faction join is temporarily unavailable. Try again after deployment.') + '</div>' +
                      '<button class="bc-join-cancel-btn interactive" id="bc-backend-back">Back</button>' +
                    '</div>';
                  var backendBackBtn = container.querySelector('#bc-backend-back');
                  if (backendBackBtn) {
                    backendBackBtn.addEventListener('click', function () { renderJoinFaction(null); });
                  }
                } else {
                  // General error — restore button
                  renderJoinFaction(null);
                }
              });
            });
          }
        });
      });
    }
  }

  // ── 6. Active Faction Missions ────────────────────────────────────────────

  function renderActiveMissions(status) {
    var container = el('battle-active-missions');
    if (!container) return;

    var factionApi = window.MOONBOYS_FACTION;
    var cached = status || (factionApi && typeof factionApi.getCachedStatus === 'function' ? factionApi.getCachedStatus() : null);
    var currentFaction = (cached && cached.faction) ? cached.faction : 'unaligned';

    if (currentFaction === 'unaligned') {
      container.innerHTML = '<p class="bc-missions-empty">Join a faction to unlock daily missions and build faction war contribution.</p>';
      return;
    }

    var meta = factionMeta(currentFaction);
    var missions = getMissions(currentFaction);

    var rows = '';
    if (missions && missions.length) {
      rows = missions.map(function (m) {
        var missionCache = window.MOONBOYS_MISSION_DATA || {};
        var missionFactions = missionCache.factions || missionCache;
        var progress = (missionFactions[currentFaction] && missionFactions[currentFaction].progress)
          ? (missionFactions[currentFaction].progress[m.id] || { progress: 0, complete: false })
          : { progress: 0, complete: false };
        return '<div class="bc-mission-row' + (progress.complete ? ' bc-mission-row--done' : '') + '">' +
          '<span class="bc-mission-label">' + esc(m.label) + '</span>' +
          '<span class="bc-mission-desc">' + esc(m.description) + '</span>' +
          '<span class="bc-mission-progress">' + (progress.complete ? '✔ Complete' : (progress.progress || 0) + ' / ' + (m.target || '?')) + '</span>' +
          '<span class="bc-mission-reward">+' + (m.reward && m.reward.warContrib ? m.reward.warContrib + ' war contribution' : 'clout') + '</span>' +
          '</div>';
      }).join('');
    } else {
      rows = '<div class="bc-missions-loading">' + esc(CONTENT.missionsLoading || 'Loading faction missions... (connect your identity provider to sync live data)') + '</div>';
    }

    container.innerHTML =
      '<div class="bc-missions-header">' + meta.icon + ' ' + esc(meta.label) + ' — Today\'s Missions</div>' +
      '<div class="bc-missions-list">' + rows + '</div>' +
      '<div class="bc-missions-note">' + esc(CONTENT.missionsNote || 'Mission rewards are clout/war contribution only. Linked identity users sync mission progress to server.') + '</div>';
  }

  // ── 7. Faction Perks + Roguelite Options ─────────────────────────────────

  function renderFactionPerks() {
    var container = el('battle-faction-perks');
    if (!container) return;

    var cards = LIVE_FACTIONS.map(function (f) {
      // Read effect metadata from FACTION_EFFECT_DEFS (set by bridge from FACTION_DEFS)
      // Also accepts window.FACTION_DEFS directly for resilience
      var defs = window.FACTION_EFFECT_DEFS || window.FACTION_DEFS;
      var def = defs && defs[f.key];
      var xpMeta = def != null ? def.xpModifier : null;
      var scoreMulti = def != null ? def.scoreMultiplier : null;

      return '<div class="bc-perk-card" style="--faction-color:' + esc(f.color) + '">' +
        '<div class="bc-perk-icon">' + f.icon + '</div>' +
        '<div class="bc-perk-name">' + esc(f.label) + '</div>' +
        '<div class="bc-perk-playstyle">' + esc(f.playstyle) + '</div>' +
        '<div class="bc-perk-text">' + esc(f.perkTeaser) + '</div>' +
        '<div class="bc-perk-xp-meta">XP metadata: ' + (xpMeta != null ? '×' + esc(String(xpMeta)) + ' <em>display only</em>' : '<em>—</em>') + '</div>' +
        '<div class="bc-perk-score-meta">Score modifier: ' + (scoreMulti != null ? '×' + esc(String(scoreMulti)) : '<em>—</em>') + '</div>' +
        '<a class="bc-frc-link" href="' + esc(CHAMBER_ROUTES[f.key] || '/battle-chamber/factions/index.html') + '">View faction →</a>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<p class="bc-perks-intro">Each faction unlocks a specific gameplay playstyle and roguelite modifiers. Perks activate when you join and play arcade runs as that faction.</p>' +
      '<div class="bc-perk-grid">' + cards + '</div>' +
      '<p class="bc-perks-note">XP metadata is display-only and is not applied to XP base math unless the server explicitly backs it.</p>';
  }

  // ── 8. Clout Rewards Board ────────────────────────────────────────────────

  function renderCloutRewards() {
    var container = el('battle-clout-rewards');
    if (!container) return;

    container.innerHTML =
      '<p class="bc-rewards-intro">Weekly and monthly winners get visibility, badges, stickers, and roguelite advantages. No action, no proof. More action, more clout.</p>' +
      '<div class="bc-rewards-grid">' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🏅</span><strong>Weekly Badges</strong><p>Top weekly factions earn Battle Chamber badges.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🖼</span><strong>Monthly Profile Borders</strong><p>Monthly top performers unlock a profile border for their faction.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🏆</span><strong>Seasonal Titles</strong><p>Seasonal campaign winners earn permanent faction titles.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🎨</span><strong>Faction Stickers</strong><p>Unlock unique faction sticker packs through mission and war activity.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">📋</span><strong>Battle Chamber Placement</strong><p>Top contributors appear publicly on the Battle Chamber proof board.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🔦</span><strong>Faction Page Spotlight</strong><p>Leading factions get spotlight placement on the Battle Chamber hub.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🌿</span><strong>Bonus Roguelite Branches</strong><p>Winning factions unlock extra bonus roguelite branch paths for the next period.</p></div>' +
        '<div class="bc-reward-item"><span class="bc-reward-icon">🎯</span><strong>XP Prize Pool Eligibility</strong><p>Active faction members become eligible for XP prize pool participation.</p></div>' +
      '</div>' +
      '<p class="bc-rewards-disclaimer"><strong>Rewards stay focused on clout and gameplay status progression only.</strong> All rewards are clout, badges, stickers, titles, and roguelite options only.</p>';
  }

  // ── 9. Faction Reward Unlocks ─────────────────────────────────────────────

  function getFactionRewardCopyHtml() {
    var copyTemplate = el('battle-faction-reward-copy');
    if (copyTemplate && 'innerHTML' in copyTemplate) {
      return copyTemplate.innerHTML;
    }
    return '<p class="bc-rew-intro"><strong>Faction reward unlocks</strong></p>';
  }

  function renderFactionRewardUnlocks() {
    var container = el('battle-faction-reward-unlocks');
    if (!container) return;

    var rewardData = window.MOONBOYS_FACTION_REWARD_DATA;
    var factions = rewardData && rewardData.factions ? rewardData.factions : null;

    // Build per-faction reward status cards
    var factionCards = '';
    for (var fi = 0; fi < LIVE_FACTIONS.length; fi++) {
      var f = LIVE_FACTIONS[fi];
      var fReward = factions && factions[f.key] ? factions[f.key] : null;
      var weeklyBadge = fReward && fReward.weekly && fReward.weekly.badge ? fReward.weekly.badge : '—';
      var monthlyTitle = fReward && fReward.monthly && fReward.monthly.title ? fReward.monthly.title : '—';
      var seasonalTrophy = fReward && fReward.seasonal && fReward.seasonal.trophy ? fReward.seasonal.trophy : '—';
      var roguelitePerks = '—';
      if (fReward && Array.isArray(fReward.roguelite)) {
        var perks = fReward.roguelite.slice(0, 3);
        var truncated = fReward.roguelite.length > 3;
        roguelitePerks = perks.join(', ') + (truncated ? ', …' : '');
      }

      factionCards += '<div class="bc-faction-reward-card" style="--faction-color:' + esc(f.color) + '">' +
        '<div class="bc-frc-header">' + f.icon + ' ' + esc(f.label) + '</div>' +
        '<div class="bc-frc-row"><span>Weekly badge:</span> <strong>' + esc(weeklyBadge) + '</strong></div>' +
        '<div class="bc-frc-row"><span>Monthly title:</span> <strong>' + esc(monthlyTitle) + '</strong></div>' +
        '<div class="bc-frc-row"><span>Seasonal trophy:</span> <strong>' + esc(seasonalTrophy) + '</strong></div>' +
        '<div class="bc-frc-row"><span>Roguelite options:</span> <strong>' + esc(roguelitePerks) + '</strong></div>' +
        '<a class="bc-frc-link" href="' + esc(CHAMBER_ROUTES[f.key] || '/battle-chamber/factions/index.html') + '">View faction →</a>' +
        '</div>';
    }

    container.innerHTML =
      getFactionRewardCopyHtml() +
      '<div class="bc-faction-reward-grid">' + factionCards + '</div>';
  }

  // ── 10. Faction Proof Feed headline ──────────────────────────────────────

  function renderProofFeedHeader() {
    var container = el('battle-faction-proof-feed');
    if (!container) return;
    var activity = getServerActivity().slice(0, 8);
    if (activity.length) {
      container.innerHTML =
        '<p class="bc-proof-intro">Server-backed Battle Chamber proof feed:</p>' +
        '<ul>' + activity.map(function (item) {
          return '<li>' + esc(item.event_text || '') + '</li>';
        }).join('') + '</ul>';
      return;
    }
    container.innerHTML =
      '<p class="bc-proof-intro">Live server standings unavailable. Showing local display state.</p>' +
      '<p class="bc-proof-intro">' + esc(CONTENT.proofFallback || 'Faction activity, XP movement, and public proof appear below where wired. Linked identity users sync activity to the server.') + '</p>';
  }

  function renderTodaysActiveOptions(status) {
    var container = el('battle-todays-active-options');
    if (!container) return;
    var linked = isTelegramLinked();
    if (!linked) {
      container.innerHTML =
        '<p>Today’s active opportunities reset at UTC midnight.</p>' +
        '<p>Complete missions, runs, and proof actions to unlock more choices.</p>' +
        '<p>' + esc(CONTENT.identityRequired || 'Connect an identity provider to load linked account state.') + '</p>' +
        '<p><a class="bc-cta-btn" href="/gkniftyheads-incubator.html">Link Identity</a></p>';
      return;
    }
    var dailyState = getRogueliteDailyState();
    if (!dailyState || !dailyState.today_active) {
      container.innerHTML =
        '<p>Today’s active opportunities reset at UTC midnight.</p>' +
        '<p>Complete missions, runs, and proof actions to unlock more choices.</p>' +
        '<p>Daily state is syncing. Refresh shortly.</p>';
      return;
    }
    var active = dailyState.today_active || {};
    var missionRows = Array.isArray(active.mission_opportunities) ? active.mission_opportunities : [];
    var missionHtml = missionRows.length
      ? '<ul>' + missionRows.slice(0, 3).map(function (mission) {
          return '<li><strong>' + esc(mission.title || mission.mission_id || 'Mission') + ':</strong> ' +
            esc((mission.completed ? 'complete' : ((mission.progress || 0) + ' / ?'))) +
            ' · ' + esc(mission.contribution_preview || 'clout/status opportunity') + '</li>';
        }).join('') + '</ul>'
      : '<p>No mission opportunities synced yet for today.</p>';
    container.innerHTML =
      '<p><strong>Today’s active opportunities reset at UTC midnight.</strong></p>' +
      '<p>Complete missions, runs, and proof actions to unlock more choices.</p>' +
      '<p><strong>UTC day:</strong> ' + esc(dailyState.utc_day || active.utc_day || '—') + '</p>' +
      '<p><strong>Daily seed:</strong> ' + esc(active.daily_seed || '—') + '</p>' +
      '<p><strong>Chain depth:</strong> ' + esc(active.chain_depth == null ? 0 : active.chain_depth) + '</p>' +
      missionHtml +
      '<div class="bc-aligned-actions">' +
        '<a class="bc-cta-btn" href="/community.html">Open Battle Chamber</a>' +
        '<a class="bc-cta-btn bc-cta-secondary" href="/games/index.html">Play Arcade</a>' +
        '<a class="bc-cta-btn bc-cta-secondary" href="/battle-chamber/factions/index.html">View Faction Chamber</a>' +
      '</div>';
  }

  function renderMissedPerksHistory() {
    var container = el('battle-missed-perks-history');
    if (!container) return;
    var linked = isTelegramLinked();
    if (!linked) {
      container.innerHTML =
        '<p><strong>This does not reset.</strong></p>' +
        '<p>The city kept moving while you were away.</p>' +
        '<p>Missed perks history builds over time.</p>' +
        '<p>Log in daily to stop the missed list growing.</p>' +
        '<p><a class="bc-cta-btn" href="/gkniftyheads-incubator.html">Link Identity</a></p>';
      return;
    }
    var dailyState = getRogueliteDailyState();
    var rows = getRogueliteMissedHistory();
    var total = dailyState && typeof dailyState.missed_history_count === 'number'
      ? dailyState.missed_history_count
      : rows.length;
    var previewRows = rows.length
      ? rows.slice(0, 6).map(function (item) {
          return '<li><strong>' + esc(item.title || 'Missed chance') + '</strong> — ' +
            esc(item.utc_day || '') + (item.faction_id ? ' · ' + esc(item.faction_id) : '') + '</li>';
        }).join('')
      : '<li>No missed entries yet. Keep checking in daily.</li>';
    container.innerHTML =
      '<p><strong>This does not reset.</strong></p>' +
      '<p>The city kept moving while you were away.</p>' +
      '<p>Missed perks history builds over time.</p>' +
      '<p>Log in daily to stop the missed list growing.</p>' +
      '<p><strong>Total missed opportunities:</strong> ' + esc(total) + '</p>' +
      '<ul>' + previewRows + '</ul>';
  }

  var lastAutoOpenedDisclosureHash = '';

  function readDisclosureState() {
    try {
      return JSON.parse(window.localStorage.getItem(DISCLOSURE_STORAGE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeDisclosureState(state) {
    try {
      window.localStorage.setItem(DISCLOSURE_STORAGE_KEY, JSON.stringify(state || {}));
    } catch (_) {}
  }

  function disclosureKey(details, index) {
    if (details.id) return details.id;
    var target = details.querySelector('[id]');
    if (target && target.id) return target.id;
    return 'bc-disclosure-' + index;
  }

  function restoreDisclosureState() {
    var state = readDisclosureState();
    var disclosures = document.querySelectorAll('details.bc-disclosure');
    for (var i = 0; i < disclosures.length; i++) {
      var key = disclosureKey(disclosures[i], i);
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        disclosures[i].open = !!state[key];
      }
      disclosures[i].dataset.bcDisclosureKey = key;
    }
  }

  function bindDisclosureState() {
    var disclosures = document.querySelectorAll('details.bc-disclosure');
    for (var i = 0; i < disclosures.length; i++) {
      disclosures[i].addEventListener('toggle', function (event) {
        var details = event.currentTarget;
        var key = details.dataset.bcDisclosureKey || disclosureKey(details, 0);
        var state = readDisclosureState();
        state[key] = !!details.open;
        writeDisclosureState(state);
      });
    }
  }

  function openDisclosureForHash(force) {
    var hash = window.location.hash;
    if (!hash) return;
    if (!force && hash === lastAutoOpenedDisclosureHash) return;
    var id = hash.slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    var disclosure = target.closest ? target.closest('details.bc-disclosure') : null;
    if (disclosure) {
      disclosure.open = true;
      lastAutoOpenedDisclosureHash = hash;
      window.setTimeout(function () {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 30);
    }
  }

  function scheduleHashOpen(force) {
    if (hashOpenTimer) clearTimeout(hashOpenTimer);
    hashOpenTimer = setTimeout(function () {
      hashOpenTimer = null;
      openDisclosureForHash(!!force);
      window.setTimeout(function () { openDisclosureForHash(!!force); }, 160);
    }, 80);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Full render pass
  // ─────────────────────────────────────────────────────────────────────────

  function renderAll(status) {
    renderSection('battle-faction-standings', renderStandings, status);
    renderSection('battle-weekly-war', renderWeeklyWar, status);
    renderSection('battle-monthly-clout', renderMonthlyClout, status);
    renderSection('battle-seasonal-campaign', renderSeasonalCampaign, status);
    renderSection('battle-join-faction', renderJoinFaction, status);
    renderSection('battle-active-missions', renderActiveMissions, status);
    renderSection('battle-faction-perks', renderFactionPerks, status);
    renderSection('battle-clout-rewards', renderCloutRewards, status);
    renderSection('battle-faction-reward-unlocks', renderFactionRewardUnlocks, status);
    renderSection('battle-faction-proof-feed', renderProofFeedHeader, status);
    renderSection('battle-todays-active-options', renderTodaysActiveOptions, status);
    renderSection('battle-missed-perks-history', renderMissedPerksHistory, status);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialisation
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    if (PLATFORM && typeof PLATFORM.createRenderController === 'function') {
      renderController = PLATFORM.createRenderController({
        sections: SECTION_IDS,
        debounceMs: 90,
        callbacks: {
          renderAll: renderAll,
          afterRender: function () { scheduleHashOpen(false); },
        },
      });
      renderController.markLoading();
    }
    restoreDisclosureState();
    bindDisclosureState();
    document.addEventListener('click', function (event) {
      var retry = event.target && event.target.closest ? event.target.closest('[data-bc-retry]') : null;
      if (!retry) return;
      if (renderController && typeof renderController.retry === 'function') {
        renderController.retry();
      } else {
        requestRender('retry', null);
      }
    });

    // Initial render pass (works offline / pre-auth / before bridge fires)
    requestRender('initial', null);
    scheduleHashOpen(false);

    // Hydrate faction status — triggers a re-render with current server state
    var factionApi = window.MOONBOYS_FACTION;
    if (factionApi && typeof factionApi.loadStatus === 'function') {
      factionApi.loadStatus().then(function (status) {
        requestRender('faction-status-loaded', status || null);
      }).catch(function () {
        // Failure is safe — page already rendered with cached/placeholder data
      });
    }

    // Re-render when the faction data bridge has populated window globals
    window.addEventListener('battle-chamber:faction-data-ready', function () {
      requestRender('faction-data-ready', null);
    });

    // Re-render when reward data is ready
    window.addEventListener('battle-chamber:faction-rewards-ready', function () {
      requestRender('faction-rewards-ready', null);
    });
    window.addEventListener('battle-chamber:activity-ready', function () {
      requestRender('activity-ready', null);
    });

    // Re-render when faction status is loaded or updated
    window.addEventListener('moonboys:faction-status', function (e) {
      requestRender('moonboys:faction-status', e && e.detail ? e.detail : null);
    });
    window.addEventListener('moonboys:faction-boost', function (e) {
      requestRender('moonboys:faction-boost', e && e.detail ? e.detail : null);
    });

    // Also listen on the global event bus if available
    var bus = window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.on === 'function') {
      bus.on('faction:update', function (payload) {
        requestRender('bus:faction:update', payload || null);
      });
    }
    window.addEventListener('hashchange', function () { scheduleHashOpen(true); });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external callers / tests
  window.BATTLE_CHAMBER_FACTIONS = {
    renderAll: renderAll,
    renderStandings: renderStandings,
    renderJoinFaction: renderJoinFaction,
    renderActiveMissions: renderActiveMissions,
    renderFactionPerks: renderFactionPerks,
    renderCloutRewards: renderCloutRewards,
    renderFactionRewardUnlocks: renderFactionRewardUnlocks,
    renderTodaysActiveOptions: renderTodaysActiveOptions,
    renderMissedPerksHistory: renderMissedPerksHistory,
  };

})();
