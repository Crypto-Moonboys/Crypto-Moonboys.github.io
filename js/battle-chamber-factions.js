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
 *   window.MOONBOYS_WAR          (faction-war-system.js — module; accessed via event/data)
 *   window.FACTION_DEFS          (faction-effect-system.js — module; accessed via data cache)
 *   window.MOONBOYS_MISSIONS     (faction-missions.js — module; accessed via event/data)
 *
 * Because faction-war-system.js and faction-missions.js are ES modules, this
 * IIFE reads the rendered data they place onto window.MOONBOYS_WAR_DATA and
 * window.MOONBOYS_MISSION_DATA if set, and re-renders when faction events fire.
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

  // ── HTML escape ───────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function setHtml(id, html) {
    var node = el(id);
    if (node) node.innerHTML = html;
  }

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
    // Build fallback from faction roster
    return LIVE_FACTIONS.map(function (f) {
      return { faction: f.key, power: 0, daily: 0, weekly: 0, momentum: 0 };
    });
  }

  function getDominant() {
    var standings = getStandings().slice().sort(function (a, b) { return b.power - a.power; });
    return standings.length ? standings[0].faction : 'hard-fork-rockers';
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

    var standings = getStandings().slice().sort(function (a, b) { return b.power - a.power; });
    var dominant = standings.length ? standings[0].faction : '';

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
        '<a class="bc-faction-chamber-link" href="/battle-chamber/factions/' + esc(row.faction) + '.html" aria-label="Enter ' + esc(meta.label) + ' Chamber">Enter Faction Chamber →</a>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<p class="bc-standings-note">Standings reflect local display cache. Telegram-linked users sync activity to server.</p>' +
      '<div class="bc-faction-standings-list">' + rows + '</div>';
  }

  // ── 2. Weekly Faction War ─────────────────────────────────────────────────

  function renderWeeklyWar() {
    var container = el('battle-weekly-war');
    if (!container) return;

    var standings = getStandings().slice().sort(function (a, b) { return b.weekly - a.weekly; });
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
      '<div class="bc-weekly-reset-note">Weekly war resets every Monday at 00:00 UTC.</div>' +
      '<div class="bc-weekly-prizes">' +
        '<strong>Weekly prizes (display):</strong> ' +
        'Top weekly factions unlock stronger roguelite options, Battle Chamber badges, and XP prize pool eligibility.' +
      '</div>';
  }

  // ── 3. Monthly Clout Chase ────────────────────────────────────────────────

  function renderMonthlyClout() {
    var container = el('battle-monthly-clout');
    if (!container) return;

    container.innerHTML =
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
        '<p class="bc-rewards-disclaimer">Rewards are gameplay/status rewards, not cash or investment rewards.</p>' +
      '</div>';
  }

  // ── 4. Seasonal Campaign ──────────────────────────────────────────────────

  function renderSeasonalCampaign() {
    var container = el('battle-seasonal-campaign');
    if (!container) return;

    container.innerHTML =
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
        '<p class="bc-rewards-disclaimer">Rewards are gameplay/status rewards, not cash or investment rewards.</p>' +
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
      container.innerHTML =
        '<div class="bc-aligned-panel" style="--faction-color:' + esc(meta.color) + '">' +
          '<div class="bc-aligned-header">' + meta.icon + ' <strong>' + esc(meta.label) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Faction XP:</span> <strong>' + (Number(cached.faction_xp) || 0) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Active bonus:</span> <strong>' + esc((cached.bonuses && cached.bonuses.bonus) || meta.perkTeaser) + '</strong></div>' +
          '<div class="bc-aligned-row"><span>Playstyle:</span> <strong>' + esc(meta.playstyle) + '</strong></div>' +
          '<div class="bc-aligned-actions">' +
            '<a class="bc-cta-btn" href="/games/index.html">Play Arcade</a>' +
            '<a class="bc-cta-btn bc-cta-secondary" href="#battle-active-missions">View Daily Missions</a>' +
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
        '<p class="bc-join-intro">Join a faction to make your arcade activity count for something bigger. Your runs build clout. Your faction earns pressure.</p>' +
        '<div class="bc-join-grid">' + cards + '</div>';

      // Wire join buttons to MOONBOYS_FACTION.joinFaction if available
      var btns = container.querySelectorAll('.bc-join-btn[data-faction]');
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var targetFaction = btn.getAttribute('data-faction');
          if (!targetFaction) return;
          var api = window.MOONBOYS_FACTION;
          if (!api || typeof api.joinFaction !== 'function') {
            // Redirect to Telegram link if not connected
            window.location.href = '/gkniftyheads-incubator.html';
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Joining…';
          api.joinFaction(targetFaction).then(function () {
            renderJoinFaction(null);
          }).catch(function () {
            btn.disabled = false;
            btn.textContent = 'Join ' + (factionMeta(targetFaction).label);
          });
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
      // Read effect metadata from FACTION_DEFS cache if available
      var defs = window.FACTION_EFFECT_DEFS;
      var def = defs && defs[f.key];
      var xpMeta = def ? def.xpModifier : null;
      var scoreMulti = def ? def.scoreMultiplier : null;

      return '<div class="bc-perk-card" style="--faction-color:' + esc(f.color) + '">' +
        '<div class="bc-perk-icon">' + f.icon + '</div>' +
        '<div class="bc-perk-name">' + esc(f.label) + '</div>' +
        '<div class="bc-perk-playstyle">' + esc(f.playstyle) + '</div>' +
        '<div class="bc-perk-text">' + esc(f.perkTeaser) + '</div>' +
        (xpMeta !== null ? '<div class="bc-perk-xp-meta">XP modifier metadata: ×' + esc(String(xpMeta)) + ' <em>(display only — not applied to XP base math)</em></div>' : '') +
        (scoreMulti !== null ? '<div class="bc-perk-score-meta">Score modifier: ×' + esc(String(scoreMulti)) + '</div>' : '') +
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
      '<p class="bc-rewards-disclaimer"><strong>Rewards are gameplay/status rewards, not cash or investment rewards.</strong> All rewards are clout, badges, stickers, titles, and roguelite options — never cash, token, or investment claims.</p>';
  }

  // ── 9. Faction Proof Feed headline ───────────────────────────────────────

  function renderProofFeedHeader() {
    var container = el('battle-faction-proof-feed');
    if (!container) return;
    container.innerHTML =
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
    renderProofFeedHeader();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialisation
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    // Initial render pass (works offline / pre-auth)
    renderAll(null);

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
  };

})();
