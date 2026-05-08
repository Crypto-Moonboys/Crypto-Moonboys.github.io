(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function getProfiles() {
    return window.MOONBOYS_FACTION_PROFILES || {};
  }

  function getProfileOrder() {
    var configuredOrder = window.MOONBOYS_FACTION_PROFILE_ORDER;
    if (Array.isArray(configuredOrder) && configuredOrder.length) return configuredOrder;
    return [
      'hard-fork-rockers',
      'rugpull-minors',
      'graffpunks',
      'blockchain-furies',
      'crypto-moongirls',
      'blockstars',
      'all-city-bulls',
      'nomad-bears',
      'crypto-stoned-boys',
    ];
  }

  function getFactionKeyFromPage() {
    var body = document.body;
    if (body && body.dataset && body.dataset.factionPage) {
      return String(body.dataset.factionPage).toLowerCase().trim();
    }
    var path = String(window.location.pathname || '');
    var match = path.match(/\/battle-chamber\/factions\/([^/]+)\.html$/i);
    return match ? String(match[1]).toLowerCase() : null;
  }

  function getFactionStatus() {
    var api = window.MOONBOYS_FACTION;
    if (!api || typeof api.getCachedStatus !== 'function') return null;
    try { return api.getCachedStatus(); } catch (_) { return null; }
  }

  function getStandings() {
    var war = window.MOONBOYS_WAR_DATA;
    if (war && Array.isArray(war.standings)) return war.standings.slice();
    var order = getProfileOrder();
    return order.map(function (key) {
      return { faction: key, power: 0, daily: 0, weekly: 0, momentum: 0 };
    });
  }

  function getFactionStanding(key) {
    var standings = getStandings().slice().sort(function (a, b) { return (b.power || 0) - (a.power || 0); });
    for (var i = 0; i < standings.length; i++) {
      if (standings[i].faction === key) {
        return {
          row: standings[i],
          rank: i + 1,
          dominantFaction: standings.length ? standings[0].faction : key,
        };
      }
    }
    return {
      row: { faction: key, power: 0, daily: 0, weekly: 0, momentum: 0 },
      rank: standings.length + 1,
      dominantFaction: standings.length ? standings[0].faction : key,
    };
  }

  function getFactionMissions(key) {
    var data = window.MOONBOYS_MISSION_DATA;
    return data && data[key] ? data[key] : { daily: [], seasonal: [], progress: {} };
  }

  function getFactionEffects(key) {
    // FACTION_EFFECT_DEFS is the bridge's canonical export.
    // FACTION_DEFS is kept as a compatibility fallback for any legacy page
    // load order where the bridge-global alias has not been hydrated yet.
    var effectDefs = window.FACTION_EFFECT_DEFS || window.FACTION_DEFS;
    return effectDefs && effectDefs[key] ? effectDefs[key] : null;
  }

  function renderDirectoryPage() {
    var grid = byId('faction-directory-grid');
    if (!grid) return;

    var profiles = getProfiles();
    var order = getProfileOrder();
    if (!profiles || typeof profiles !== 'object') return;
    if (!Array.isArray(order) || !order.length) return;
    var validKeys = order.filter(function (key) { return !!profiles[key]; });
    if (!validKeys.length) return;
    var standings = getStandings().slice().sort(function (a, b) { return (b.power || 0) - (a.power || 0); });
    var rankByFaction = {};
    standings.forEach(function (row, idx) { rankByFaction[row.faction] = idx + 1; });

    grid.innerHTML = validKeys.map(function (key) {
      var p = profiles[key];
      if (!p) return '';
      var rank = rankByFaction[key] || '—';
      var missionCount = (getFactionMissions(key).daily || []).length;
      return '' +
        '<article class="fcp-card" style="--faction-color:' + esc(p.chamberColor) + '">' +
          '<h3>' + esc(p.icon) + ' ' + esc(p.name) + '</h3>' +
          '<p class="fcp-card-tagline">' + esc(p.tagline) + '</p>' +
          '<p>' + esc(p.playstyle) + '</p>' +
          '<p><strong>Current weekly rank:</strong> #' + esc(rank) + '</p>' +
          '<p><strong>Current monthly rank:</strong> Mirror of current chamber data until monthly board authority expands.</p>' +
          '<p><strong>Current seasonal rank:</strong> Mirror of current chamber data until seasonal board authority expands.</p>' +
          '<p><strong>Perk preview:</strong> ' + esc(p.perkSummary) + '</p>' +
          '<p><strong>Active quest count:</strong> ' + esc(missionCount) + '</p>' +
          '<div class="fcp-card-actions">' +
            '<a class="fcp-btn" href="/battle-chamber/factions/' + esc(p.slug) + '.html">View faction chamber</a>' +
            '<a class="fcp-btn fcp-btn-secondary" href="/community.html#battle-join-faction">Join ' + esc(p.name) + '</a>' +
          '</div>' +
        '</article>';
    }).join('');

    var sourceLore = byId('source-lore-links');
    if (sourceLore) {
      var links = window.MOONBOYS_FACTION_SOURCE_LORE_LINKS || [];
      sourceLore.innerHTML = links.length
        ? '<ul>' + links.map(function (item) {
            return '<li><a href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer">' + esc(item.label || item.href) + '</a></li>';
          }).join('') + '</ul>'
        : '<p>Faction source lore links will be listed here as mappings are confirmed.</p>';
    }
  }

  function renderFactionPage() {
    var key = getFactionKeyFromPage();
    if (!key) return;

    var profiles = getProfiles();
    var profile = profiles[key];
    if (!profile) return;

    var standing = getFactionStanding(key);
    var row = standing.row;
    var missions = getFactionMissions(key);
    var effects = getFactionEffects(key) || {};
    var status = getFactionStatus();
    var currentFaction = status && status.faction ? status.faction : 'unaligned';
    var isCurrentFaction = currentFaction === key;

    var hero = byId('fcp-hero');
    if (hero) {
      hero.innerHTML = '' +
        '<div class="fcp-hero-card" style="--faction-color:' + esc(profile.chamberColor) + '">' +
          '<h1>' + esc(profile.icon) + ' ' + esc(profile.name) + '</h1>' +
          '<p class="fcp-hero-tagline">' + esc(profile.tagline) + '</p>' +
          '<p>' + esc(profile.joinCtaCopy) + '</p>' +
          '<div class="fcp-card-actions">' +
            '<a class="fcp-btn" href="/community.html#battle-join-faction">Join this faction</a>' +
            '<a class="fcp-btn fcp-btn-secondary" href="/community.html">Back to Battle Chamber</a>' +
            '<a class="fcp-btn fcp-btn-secondary" href="/games/">Play Arcade</a>' +
          '</div>' +
        '</div>';
    }

    var whyJoin = byId('fcp-why-join');
    if (whyJoin) {
      whyJoin.innerHTML = '<ul>' +
        '<li><strong>Playstyle:</strong> ' + esc(profile.playstyle) + '</li>' +
        '<li><strong>Player fit:</strong> ' + esc(profile.suitedFor) + '</li>' +
        '<li><strong>Unique edge:</strong> ' + esc(profile.uniqueEdge) + '</li>' +
      '</ul>';
    }

    var lore = byId('fcp-lore');
    if (lore) {
      lore.innerHTML = '<p>' + esc(profile.shortLore) + '</p>';
    }

    var perks = byId('fcp-perks');
    if (perks) {
      perks.innerHTML = '' +
        '<p><strong>Perk summary:</strong> ' + esc(profile.perkSummary) + '</p>' +
        '<ul>' +
          '<li><strong>Score style:</strong> ×' + esc(effects.scoreMultiplier != null ? effects.scoreMultiplier : '1.0') + '</li>' +
          '<li><strong>Event / chaos modifier:</strong> ×' + esc(effects.chaosModifier != null ? effects.chaosModifier : '1.0') + '</li>' +
          '<li><strong>Shield / defense:</strong> +' + esc(effects.shieldBonus != null ? effects.shieldBonus : '0') + ' starting shield support where game modes allow</li>' +
          '<li><strong>Combo modifier:</strong> ×' + esc(effects.comboModifier != null ? effects.comboModifier : '1.0') + '</li>' +
          '<li><strong>XP metadata note:</strong> xpModifier ×' + esc(effects.xpModifier != null ? effects.xpModifier : '1.0') + ' is display metadata only.</li>' +
        '</ul>';
    }

    var missionsEl = byId('fcp-missions');
    if (missionsEl) {
      var daily = Array.isArray(missions.daily) ? missions.daily : [];
      var seasonal = Array.isArray(missions.seasonal) ? missions.seasonal : [];
      var missionRows = daily.length
        ? '<ul>' + daily.map(function (m) {
            var prog = missions.progress && missions.progress[m.id] ? missions.progress[m.id] : { progress: 0, target: m.target || 0, complete: false };
            var amount = Number(prog.progress || 0);
            var target = Number(prog.target || m.target || 0);
            var complete = !!prog.complete || (target > 0 && amount >= target);
            return '<li><strong>' + esc(m.label) + ':</strong> ' + esc(m.description) + ' — ' + (complete ? 'Complete' : (amount + ' / ' + (target || '?'))) + '</li>';
          }).join('') + '</ul>'
        : '<p>Daily mission feed is loading from faction mission data.</p>';

      var seasonalRow = seasonal.length
        ? '<p><strong>Seasonal mission:</strong> ' + esc(seasonal[0].label) + ' — ' + esc(seasonal[0].description) + '</p>'
        : '<p><strong>Seasonal mission:</strong> Seasonal objective syncs in as bridge data updates.</p>';

      missionsEl.innerHTML = missionRows + seasonalRow + '<p>Complete missions to build faction pressure and clout.</p>';
    }

    var war = byId('fcp-war-status');
    if (war) {
      war.innerHTML = '<ul>' +
        '<li><strong>Faction rank:</strong> #' + esc(standing.rank) + '</li>' +
        '<li><strong>Total power:</strong> ' + esc(row.power || 0) + '</li>' +
        '<li><strong>Daily contribution:</strong> ' + esc(row.daily || 0) + '</li>' +
        '<li><strong>Weekly contribution:</strong> ' + esc(row.weekly || 0) + '</li>' +
        '<li><strong>Momentum tier:</strong> ' + esc(row.momentum || 0) + '</li>' +
        '<li><strong>Dominant faction:</strong> ' + esc((profiles[standing.dominantFaction] && profiles[standing.dominantFaction].name) || standing.dominantFaction) + '</li>' +
      '</ul>';
    }

    var clout = byId('fcp-clout-track');
    if (clout) {
      // Read reward tracks from MOONBOYS_FACTION_REWARD_DATA when available
      var rewardData = window.MOONBOYS_FACTION_REWARD_DATA;
      var rewardSummary = rewardData && rewardData.factions && rewardData.factions[key] ? rewardData.factions[key] : null;
      function getTrackOrFallback(summary, trackKey, fallback) {
        return (summary && Array.isArray(summary[trackKey])) ? summary[trackKey] : fallback;
      }
      var badgeTrack = getTrackOrFallback(rewardSummary, 'badgeTrack', profile.badgeIdeas);
      var stickerTrack = getTrackOrFallback(rewardSummary, 'stickerTrack', profile.stickerIdeas);
      var titleTrack = getTrackOrFallback(rewardSummary, 'titleTrack', profile.titleLadder);
      clout.innerHTML = '' +
        '<p><strong>Badge ladder:</strong> ' + esc(badgeTrack.join(' → ')) + '</p>' +
        '<p><strong>Sticker unlock ideas:</strong> ' + esc(stickerTrack.join(' · ')) + '</p>' +
        '<p><strong>Title ladder:</strong> ' + esc(titleTrack.join(' → ')) + '</p>' +
        '<p><strong>Placement tracks:</strong> Weekly, monthly, and seasonal clout placement updates as Battle Chamber data expands.</p>';
    }

    var rewardTracks = byId('fcp-reward-tracks');
    if (rewardTracks) {
      var rd = window.MOONBOYS_FACTION_REWARD_DATA;
      var rs = rd && rd.factions && rd.factions[key] ? rd.factions[key] : null;
      var weekly = rs && rs.weekly ? rs.weekly : null;
      var monthly = rs && rs.monthly ? rs.monthly : null;
      var seasonal = rs && rs.seasonal ? rs.seasonal : null;
      rewardTracks.innerHTML = '' +
        '<div class="fcp-reward-section">' +
          '<h3>Weekly Reward</h3>' +
          (weekly
            ? '<ul>' +
                '<li><strong>Badge eligible:</strong> ' + esc(weekly.badge) + '</li>' +
                '<li><strong>Placement:</strong> ' + esc(weekly.placement) + '</li>' +
                '<li><strong>Roguelite perk:</strong> ' + esc(weekly.roguelitePerk) + '</li>' +
                '<li><strong>Spotlight:</strong> ' + esc(weekly.spotlight) + '</li>' +
              '</ul>'
            : '<p>Weekly reward data loading.</p>') +
        '</div>' +
        '<div class="fcp-reward-section">' +
          '<h3>Monthly Reward</h3>' +
          (monthly
            ? '<ul>' +
                '<li><strong>Title eligible:</strong> ' + esc(monthly.title) + '</li>' +
                '<li><strong>Profile border:</strong> ' + esc(monthly.border) + '</li>' +
                '<li><strong>Sticker unlock:</strong> ' + esc(monthly.sticker) + '</li>' +
                '<li><strong>Chamber placement:</strong> ' + esc(monthly.chamberPlacement) + '</li>' +
              '</ul>'
            : '<p>Monthly reward data loading.</p>') +
        '</div>' +
        '<div class="fcp-reward-section">' +
          '<h3>Seasonal Reward</h3>' +
          (seasonal
            ? '<ul>' +
                '<li><strong>Trophy:</strong> ' + esc(seasonal.trophy) + '</li>' +
                '<li><strong>Title eligible:</strong> ' + esc(seasonal.title) + '</li>' +
                '<li><strong>Hall of Fame:</strong> ' + esc(seasonal.hallOfFame) + '</li>' +
                '<li><strong>Sticker set:</strong> ' + esc(seasonal.stickerSet) + '</li>' +
              '</ul>'
            : '<p>Seasonal reward data loading.</p>') +
        '</div>' +
        '<p class="fcp-reward-disclaimer"><strong>Faction rewards are gameplay/status rewards only.</strong></p>';
    }

    var rogue = byId('fcp-roguelite-identity');
    if (rogue) {
      var rd2 = window.MOONBOYS_FACTION_REWARD_DATA;
      var rs2 = rd2 && rd2.factions && rd2.factions[key] ? rd2.factions[key] : null;
      var roguelitePerks = rs2 && Array.isArray(rs2.roguelite) ? rs2.roguelite : [];
      var perksHtml = roguelitePerks.length
        ? '<ul>' + roguelitePerks.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
        : '';
      rogue.innerHTML = '<p>' + esc(profile.rogueliteIdentity) + ' defines this faction’s roguelite branch identity.</p>' +
        (perksHtml ? '<p><strong>Roguelite perk eligibility (display only, not live wired unless noted):</strong></p>' + perksHtml : '') +
        '<p>Roguelite perk options are eligibility indicators. They are shown as unlocked/eligible here and will be wired into the roguelite loop where confirmed.</p>';
    }

    var live = byId('fcp-live-proof-feed');
    if (live) {
      live.innerHTML = '<p>Faction proof feed will show linked activity where wired.</p>' +
        '<ul>' +
        '<li>Faction joins</li>' +
        '<li>Mission completions</li>' +
        '<li>Weekly war gains</li>' +
        '<li>Badge unlocks</li>' +
        '<li>Top member actions</li>' +
        '</ul>';
    }

    var topMembers = byId('fcp-top-members');
    if (topMembers) {
      topMembers.innerHTML = '<p>Top faction members, weekly clout, monthly clout, and seasonal clout board visibility is coming as Battle Chamber data expands.</p>';
    }

    var related = byId('fcp-related-links');
    if (related) {
      var links = (profile.relatedLinks || []).concat([
        { label: 'Faction directory', href: '/battle-chamber/factions/index.html' },
        { label: 'Battle Chamber hub', href: '/community.html' },
      ]);
      related.innerHTML = '<ul>' + links.map(function (item) {
        var external = /^https?:\/\//i.test(item.href);
        return '<li><a href="' + esc(item.href) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(item.label) + '</a></li>';
      }).join('') + '</ul>';
    }

    var join = byId('fcp-join-cta');
    if (join) {
      var joinCopy = isCurrentFaction
        ? 'You are currently aligned with ' + profile.name + '. Keep building contribution and clout.'
        : 'Not aligned with this faction yet. Join when ready and push the chamber.';
      join.innerHTML = '' +
        '<p>' + esc(joinCopy) + '</p>' +
        '<div class="fcp-card-actions">' +
          '<a class="fcp-btn" href="/community.html#battle-join-faction">Join this faction</a>' +
          '<a class="fcp-btn fcp-btn-secondary" href="/gkniftyheads-incubator.html">Link Telegram</a>' +
        '</div>';
    }
  }

  function renderAll() {
    renderDirectoryPage();
    renderFactionPage();
  }

  function init() {
    renderAll();

    var factionApi = window.MOONBOYS_FACTION;
    if (factionApi && typeof factionApi.loadStatus === 'function') {
      factionApi.loadStatus().then(function () { renderAll(); }).catch(function () {});
    }

    window.addEventListener('battle-chamber:faction-data-ready', renderAll);
    window.addEventListener('battle-chamber:faction-rewards-ready', renderAll);
    window.addEventListener('moonboys:faction-status', renderAll);
    window.addEventListener('moonboys:faction-boost', renderAll);

    var bus = window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.on === 'function') {
      bus.on('faction:update', renderAll);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MOONBOYS_FACTION_CHAMBER_PAGE = {
    renderAll: renderAll,
  };
})();
