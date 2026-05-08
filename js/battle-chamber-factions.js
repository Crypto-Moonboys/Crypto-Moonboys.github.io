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
 */
(function () {
  'use strict';

  // ── Faction roster ────────────────────────────────────────────────────────

  var LIVE_FACTIONS = [
    { key: 'hard-fork-rockers',   label: 'Hard Fork Rockers',  icon: '🪨', color: '#56dcff',
      playstyle: 'Endurance · Stability · Streak Protection',
      perkTeaser: 'Reduced chaos exposure, long-run bonus branches, streak protection',
      rewardBias: 'endurance' },
    { key: 'rugpull-minors',      label: 'Rugpull Minors',     icon: '⛏️', color: '#ff6ad5',
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
    'rugpull-minors': '/battle-chamber/factions/rugpull-minors.html',
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
    if (cache && cache[factionKey] && Array.isArray(cache[factionKey].daily)) {
      return cache[factionKey].daily.slice(0, 3);
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
    if (monthlyRows && monthlyRows.length) {
      var top = monthlyRows
        .slice()
        .sort(function (a, b) { return (Number(b.clout_total) || 0) - (Number(a.clout_total) || 0); })
        .slice(0, 5);
      container.innerHTML =
        '<p>Monthly clout standings are server-backed when available.</p>' +
        '<div class="bc-weekly-rows">' +
          top.map(function (row, idx) {
            var meta = factionMeta(row.faction_id);
            return '<div class="bc-weekly-row">' +
              '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
              '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
              '<span class="bc-weekly-score">Monthly clout: <strong>' + (Number(row.clout_total) || 0) + '</strong></span>' +
              '</div>';
          }).join('') +
        '</div>' +
        '<div class="bc-monthly-target"><strong>Live monthly source:</strong> Battle Chamber authority layer</div>';
      return;
    }

    container.innerHTML =
      '<p class="bc-standings-note">' + esc(serverStatus.message || 'Live server standings unavailable. Showing local display state.') + '</p>' +
      '<p>Monthly clout rankings track cumulative faction power, daily mission completions, weekly placements, top-player scores, activity streaks, leaderboard appearances, and quest completions across the full calendar month.</p>' +
      '<div class="bc-monthly-target"><strong>Current monthly target:</strong> <span class="bc-placeholder">Monthly standings update live — keep building faction clout.</span></div>' +
      '<div class="bc-monthly-rewards">' +
        '<h3>Monthly Clout Rewards</h3>' +
        '<ul>' +
        '<li>Faction title upgrade</li>' +
        '<li>Monthly champion badge</li>' +
        '<li>Profile border</li>' +
        '<li>Faction sticker pack</li>' +
        '<li>Battle Chamber top placement</li>' +
        '<li>Bonus roguelite branch for next month</li>' +
        '<li>Monthly Hall of Fame placement</li>' +
        '</ul>' +
        '<p class="bc-rewards-disclaimer">Rewards stay focused on clout and gameplay status progression only.</p>' +
      '</div>';
  }

  // ── 4. Seasonal Campaign ──────────────────────────────────────────────────

  function renderSeasonalCampaign() {
    var container = el('battle-seasonal-campaign');
    if (!container) return;

    var seasonalRows = getServerPeriodRows('seasonal');
    var serverStatus = getServerStatus();
    if (seasonalRows && seasonalRows.length) {
      var top = seasonalRows
        .slice()
        .sort(function (a, b) { return (Number(b.clout_total) || 0) - (Number(a.clout_total) || 0); })
        .slice(0, 5);
      container.innerHTML =
        '<p>Seasonal campaign standings are server-backed when available.</p>' +
        '<div class="bc-weekly-rows">' +
          top.map(function (row, idx) {
            var meta = factionMeta(row.faction_id);
            return '<div class="bc-weekly-row">' +
              '<span class="bc-weekly-rank">#' + (idx + 1) + '</span>' +
              '<span class="bc-weekly-name">' + meta.icon + ' ' + esc(meta.label) + '</span>' +
              '<span class="bc-weekly-score">Seasonal clout: <strong>' + (Number(row.clout_total) || 0) + '</strong></span>' +
              '</div>';
          }).join('') +
        '</div>' +
        '<p class="bc-hall-of-fame">Seasonal winners become part of the Battle Chamber record. Hall of Fame placement is permanent.</p>';
      return;
    }

    container.innerHTML =
      '<p class="bc-standings-note">' + esc(serverStatus.message || 'Live server standings unavailable. Showing local display state.') + '</p>' +
      '<p>Each season runs a full cross-faction campaign. Complete seasonal missions, build maximum clout, and secure your faction\'s place in the Battle Chamber record.</p>' +
      '<div class="bc-season-current">' +
        '<strong>Season 1: The Clout War</strong>' +
        '<p>The first war for Battle Chamber dominance. Every run counts. Every mission builds proof. Seasonal winners become part of the permanent Battle Chamber record.</p>' +
      '</div>' +
      '<div class="bc-season-rewards">' +
        '<h3>Seasonal Rewards</h3>' +
        '<ul>' +
        '<li>Seasonal badge</li>' +
        '<li>Season title</li>' +
        '<li>Faction archive placement</li>' +
        '<li>Permanent clout record</li>' +
        '<li>Special roguelite modifier</li>' +
        '<li>Special faction page trophy</li>' +
        '<li>Legendary clout badge</li>' +
        '</ul>' +
        '<p class="bc-rewards-disclaimer">Rewards stay focused on clout and gameplay status progression only.</p>' +
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
      var nextReset = seasonKey ? 'Season: ' + esc(seasonKey) : 'next season reset';
      container.innerHTML =
        '<div class="bc-aligned-panel" style="--faction-color:' + esc(meta.color) + '">' +
          '<div class="bc-aligned-header">' + meta.icon + ' <strong>' + esc(meta.label) + '</strong></div>' +
          '<div class="bc-aligned-season-lock">You are locked to ' + esc(meta.label) + ' for this season.</div>' +
          '<div class="bc-aligned-row"><span>Faction XP:</span> <strong>' + (Number(cached.faction_xp) || 0) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Active bonus:</span> <strong>' + esc((cached.bonuses && cached.bonuses.bonus) || meta.perkTeaser) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Playstyle:</span> <strong>' + esc(meta.playstyle) + '</strong></div>' +
          '<div class="bc-aligned-row bc-aligned-clout-note">Your runs, missions, and proof events now count toward this faction.</div>' +
          '<div class="bc-aligned-row bc-aligned-reset-note">Next reset: <strong>' + nextReset + '</strong></div>' +
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
          '<p class="bc-join-season-lock-copy">Choose carefully. Your faction is locked for the current season.</p>' +
          '<p class="bc-join-season-reset-copy">At season reset, your faction lock clears and you can join again or pick a new side.</p>' +
          '<p class="bc-join-link-copy">Faction clout only counts when you are Telegram-linked. No faction, no faction clout.</p>' +
        '</div>' +
        '<p class="bc-join-intro">Join a faction to make your arcade activity count for something bigger. Your runs build clout. Your faction earns pressure.</p>' +
        '<div class="bc-join-grid">' + cards + '</div>';

      // Wire join buttons
      var btns = container.querySelectorAll('.bc-join-btn[data-faction]');
      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener('click', function () {
          var targetFaction = btn.getAttribute('data-faction');
          if (!targetFaction) return;

          // Check Telegram linked state first.  Unlinked users must link before joining.
          var identity = window.MOONBOYS_IDENTITY;
          var isLinked = identity && typeof identity.isTelegramLinked === 'function'
            ? identity.isTelegramLinked()
            : false;

          var api = window.MOONBOYS_FACTION;

          if (!isLinked || !api || typeof api.joinFaction !== 'function') {
            // Not linked — redirect to Telegram link CTA page
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
                // Reload full status and re-render after brief delay
                if (typeof api.loadStatus === 'function') {
                  api.loadStatus().then(function (freshStatus) {
                    window.dispatchEvent(new CustomEvent('moonboys:faction-status', {
                      detail: freshStatus || successStatus,
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
                // Handle season lock rejection from server (check both error code and message)
                var isSeasonLock = errMsg.indexOf('faction_locked_for_season') !== -1 ||
                  (err && err.code === 'faction_locked_for_season');
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
        var progress = (window.MOONBOYS_MISSION_DATA && window.MOONBOYS_MISSION_DATA[currentFaction] && window.MOONBOYS_MISSION_DATA[currentFaction].progress)
          ? (window.MOONBOYS_MISSION_DATA[currentFaction].progress[m.id] || { progress: 0, complete: false })
          : { progress: 0, complete: false };
        return '<div class="bc-mission-row' + (progress.complete ? ' bc-mission-row--done' : '') + '">' +
          '<span class="bc-mission-label">' + esc(m.label) + '</span>' +
          '<span class="bc-mission-desc">' + esc(m.description) + '</span>' +
          '<span class="bc-mission-progress">' + (progress.complete ? '✔ Complete' : (progress.progress || 0) + ' / ' + (m.target || '?')) + '</span>' +
          '<span class="bc-mission-reward">+' + (m.reward && m.reward.warContrib ? m.reward.warContrib + ' war contribution' : 'clout') + '</span>' +
          '</div>';
      }).join('');
    } else {
      rows = '<div class="bc-missions-loading">Loading faction missions… (connect Telegram to sync live data)</div>';
    }

    container.innerHTML =
      '<div class="bc-missions-header">' + meta.icon + ' ' + esc(meta.label) + ' — Today\'s Missions</div>' +
      '<div class="bc-missions-list">' + rows + '</div>' +
      '<div class="bc-missions-note">Mission rewards are clout/war contribution only. Telegram-linked users sync mission progress to server.</div>';
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
        (xpMeta != null ? '<div class="bc-perk-xp-meta">XP modifier metadata: ×' + esc(String(xpMeta)) + ' <em>(display only — not applied to XP base math)</em></div>' : '') +
        (scoreMulti != null ? '<div class="bc-perk-score-meta">Score modifier: ×' + esc(String(scoreMulti)) + '</div>' : '') +
        '</div>';
    }).join('');

    container.innerHTML =
      '<p class="bc-perks-intro">Each faction unlocks a specific gameplay playstyle and roguelite modifiers. Perks activate when you join and play arcade runs as that faction.</p>' +
      '<div class="bc-perk-grid">' + cards + '</div>' +
      '<p class="bc-perks-note">xpModifier values are display-only metadata — they are never applied to the XP base math or submitScore path unless server-backed.</p>';
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
      '<p class="bc-rew-intro"><strong>Win the week. Own the chamber.</strong></p>' +
      '<p>Monthly clout puts your faction on the board. Seasonal winners become part of the Battle Chamber record. Badges, stickers, titles, and roguelite options prove your faction moved.</p>' +
      '<div class="bc-faction-reward-grid">' + factionCards + '</div>' +
      '<p class="bc-rew-disclaimer"><strong>Faction rewards are gameplay/status rewards only.</strong> These are clout, badges, stickers, titles, and roguelite branch eligibility only.</p>';
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
      '<p class="bc-proof-intro">Faction activity, XP movement, and public proof appear below where wired. Telegram-linked users sync activity to the server.</p>';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Full render pass
  // ─────────────────────────────────────────────────────────────────────────

  function renderAll(status) {
    renderStandings();
    renderWeeklyWar();
    renderMonthlyClout();
    renderSeasonalCampaign();
    renderJoinFaction(status);
    renderActiveMissions(status);
    renderFactionPerks();
    renderCloutRewards();
    renderFactionRewardUnlocks();
    renderProofFeedHeader();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialisation
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    // Initial render pass (works offline / pre-auth / before bridge fires)
    renderAll(null);

    // Hydrate faction status — triggers a re-render with current server state
    var factionApi = window.MOONBOYS_FACTION;
    if (factionApi && typeof factionApi.loadStatus === 'function') {
      factionApi.loadStatus().then(function (status) {
        renderAll(status || null);
      }).catch(function () {
        // Failure is safe — page already rendered with cached/placeholder data
      });
    }

    // Re-render when the faction data bridge has populated window globals
    window.addEventListener('battle-chamber:faction-data-ready', function () {
      renderAll(null);
    });

    // Re-render when reward data is ready
    window.addEventListener('battle-chamber:faction-rewards-ready', function () {
      renderFactionRewardUnlocks();
    });
    window.addEventListener('battle-chamber:activity-ready', function () {
      renderProofFeedHeader();
    });

    // Re-render when faction status is loaded or updated
    window.addEventListener('moonboys:faction-status', function (e) {
      renderAll(e && e.detail ? e.detail : null);
    });
    window.addEventListener('moonboys:faction-boost', function (e) {
      renderAll(e && e.detail ? e.detail : null);
    });

    // Also listen on the global event bus if available
    var bus = window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.on === 'function') {
      bus.on('faction:update', function (payload) {
        renderAll(payload || null);
      });
    }
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
  };

})();
