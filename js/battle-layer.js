(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};
  var WIKI_MISSION_WINDOW = 'daily';
  var WIKI_MISSION_EVENT = 'moonboys:wiki-mission-complete';
  var BATTLE_MEDIA_BY_PAGE = {
    wuffi: {
      src: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXJ4dHVlaHJ0ZWdvem92dW1zanFyYnc5bmxmM3Fyb2N6Z2YxbG55dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GwigOL3Iw4kAa2ugsZ/giphy.gif',
      alt: 'WUFFI battle heat animation'
    }
  };
  var MISSION_DEFINITIONS = [
    {
      id: 'engage',
      tag: 'Engage',
      text: 'Leave a strategic comment on this page to influence the narrative.',
      feature: 'COMMENTS',
      actionLabel: 'Comment'
    },
    {
      id: 'signal',
      tag: 'Signal',
      text: 'Like this article to boost its standing in the Moonboys ecosystem.',
      feature: 'LIKES',
      actionLabel: 'Like'
    },
    {
      id: 'cite',
      tag: 'Cite',
      text: 'Vote on citations to strengthen the credibility of this intelligence file.',
      feature: 'CITATION_VOTES',
      actionLabel: 'Vote'
    }
  ];

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function defaultPageId() {
    return document.location.pathname.split('/').pop().replace(/\.html$/, '') || 'home';
  }

  function ensureCommentsContainer(pageId) {
    if (document.querySelector('.wiki-comments')) return;
    var main = document.querySelector('main');
    if (!main) return;
    var div = document.createElement('div');
    div.className = 'wiki-comments';
    div.dataset.pageId = pageId;
    main.appendChild(div);
    // Initialise the section now that it exists in the DOM
    if (window.MOONBOYS_COMMENTS && window.MOONBOYS_COMMENTS.initSection) {
      window.MOONBOYS_COMMENTS.initSection(div);
    }
  }

  function enhanceCitations(pageId) {
    var list = document.querySelectorAll('.citations-list li, .source-ref-list li');
    if (!list.length) return;
    list.forEach(function (li, index) {
      if (li.querySelector('.cite-vote')) return;
      var wrap = document.createElement('div');
      wrap.className = 'cite-vote-wrap';
      var span = document.createElement('span');
      span.className = 'cite-vote';
      span.dataset.citeId = String(index + 1);
      span.dataset.pageId = pageId;
      wrap.appendChild(span);
      li.appendChild(wrap);
      if (window.MOONBOYS_ENGAGEMENT && window.MOONBOYS_ENGAGEMENT.initCiteVote) {
        window.MOONBOYS_ENGAGEMENT.initCiteVote(span);
      }
    });
  }

  function ensurePageLikeWidget(pageId) {
    var existing = document.querySelector('.page-like-widget');
    if (existing) {
      if (!existing.dataset.pageId) existing.dataset.pageId = pageId;
      return;
    }
    var target = document.querySelector('.article-meta');
    if (!target) return;
    var div = document.createElement('div');
    div.className = 'page-like-widget';
    div.dataset.pageId = pageId;
    target.insertAdjacentElement('afterend', div);
    if (window.MOONBOYS_ENGAGEMENT && window.MOONBOYS_ENGAGEMENT.initPageLike) {
      window.MOONBOYS_ENGAGEMENT.initPageLike(div);
    }
  }

  function getMissionWindowKey() {
    if (WIKI_MISSION_WINDOW === 'daily') {
      return new Date().toISOString().slice(0, 10);
    }
    return WIKI_MISSION_WINDOW;
  }

  function getMissionStorageKey(pageId, missionId) {
    return [
      'moonboys_wiki_mission',
      getMissionWindowKey(),
      pageId || defaultPageId(),
      missionId
    ].join(':');
  }

  function isMissionComplete(pageId, missionId) {
    try {
      return window.sessionStorage &&
        window.sessionStorage.getItem(getMissionStorageKey(pageId, missionId)) === 'complete';
    } catch (_) {
      return false;
    }
  }

  function setMissionComplete(pageId, missionId) {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(getMissionStorageKey(pageId, missionId), 'complete');
      }
    } catch (_) {}
  }

  function isTelegramLinked() {
    var gate = window.MOONBOYS_IDENTITY;
    if (!gate) return false;
    if (gate.isTelegramLinked) return !!gate.isTelegramLinked();
    return !!(gate.getTelegramId && gate.getTelegramId());
  }

  function missionStatusHTML(mission, pageId) {
    var complete = isMissionComplete(pageId, mission.id);
    if (!BASE || !FEATURES[mission.feature]) {
      return '<span class="mission-status mission-status--unavailable">Unavailable</span>';
    }
    if (complete) {
      return '<span class="mission-status mission-status--complete">Complete</span>';
    }
    if (!isTelegramLinked()) {
      return '<span class="mission-status mission-status--locked">Telegram sync required</span>';
    }
    return '<span class="mission-status mission-status--ready">' + esc(mission.actionLabel) + ' to complete</span>';
  }

  function updateMissionStatus(pageId, missionId, state) {
    var row = document.querySelector('.mission-row[data-mission-id="' + esc(missionId) + '"]');
    if (!row) return;
    var status = row.querySelector('.mission-status');
    if (!status) return;
    status.className = 'mission-status mission-status--' + state;
    status.textContent = state === 'complete' ? 'Complete' : state;
  }

  function emitMissionReward(pageId, missionId, source) {
    var gate = window.MOONBOYS_IDENTITY;
    var payload = {
      page_id: pageId,
      mission_id: missionId,
      mission_window: getMissionWindowKey(),
      source: source || 'wiki-engagement'
    };
    if (gate && gate.getTelegramId) {
      var telegramId = gate.getTelegramId();
      if (telegramId) payload.telegram_id = telegramId;
    }
    document.dispatchEvent(new CustomEvent(WIKI_MISSION_EVENT, { detail: payload }));
  }

  function completeMission(pageId, missionId, source) {
    if (isMissionComplete(pageId, missionId)) return;
    setMissionComplete(pageId, missionId);
    updateMissionStatus(pageId, missionId, 'complete');
    emitMissionReward(pageId, missionId, source);
  }

  function wireMissionEvents(pageId) {
    if (wireMissionEvents.bound) return;
    wireMissionEvents.bound = true;
    document.addEventListener('moonboys:comment-posted', function (event) {
      var detail = event.detail || {};
      completeMission(detail.page_id || pageId, 'engage', 'comments');
    });
    document.addEventListener('moonboys:page-liked', function (event) {
      var detail = event.detail || {};
      completeMission(detail.page_id || pageId, 'signal', 'likes');
    });
    document.addEventListener('moonboys:citation-voted', function (event) {
      var detail = event.detail || {};
      completeMission(detail.page_id || pageId, 'cite', 'citation-votes');
    });
  }

  async function renderCommunityFactionPanel() {
    var container = document.getElementById('community-faction-selector');
    var factionApi = window.MOONBOYS_FACTION;
    if (!container || !factionApi) return;
    container.innerHTML = '<div class="community-loading">Loading faction alignment…</div>';
    var status;
    try {
      status = await factionApi.loadStatus();
    } catch {
      status = factionApi.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 };
    }
    container.innerHTML = factionApi.renderPlayerCard(status, { showJoinActions: true });
    container.querySelectorAll('.faction-join-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gate = window.MOONBOYS_IDENTITY;
        var joinAction = function () {
          factionApi.joinFaction(btn.dataset.faction)
            .then(function () { return factionApi.loadStatus(); })
            .then(function (latest) {
              container.innerHTML = factionApi.renderPlayerCard(latest, { showJoinActions: true });
              renderCommunityFactionPanel();
            })
            .catch(function (error) {
              var msg = (error && error.message) ? error.message : 'Unable to join faction right now.';
              container.insertAdjacentHTML('beforeend', '<div class="community-empty">' + esc(msg) + '</div>');
            });
        };
        if (gate && gate.requireLinkedAccount) gate.requireLinkedAccount(joinAction);
        else joinAction();
      });
    });
  }

  function buildMissionHTML(pageId) {
    return '<div class="battle-shell"><div class="battle-shell-inner">' +
      '<h3>Daily Missions</h3>' +
      '<div class="mission-stack">' +
      MISSION_DEFINITIONS.map(function (m) {
        return '<div class="mission-row" data-mission-id="' + esc(m.id) + '">' +
          '<div>' +
            '<span class="mission-tag">' + esc(m.tag) + '</span>' +
            '<div class="mission-text">' + esc(m.text) + '</div>' +
          '</div>' +
          missionStatusHTML(m, pageId) +
        '</div>';
      }).join('') +
      '</div>' +
      '<p class="battle-copy">Rewards sync only for Telegram-linked users after supported actions are accepted by the live backend.</p>' +
      '</div></div>';
  }

  function buildBattleMediaHTML(pageId) {
    var media = BATTLE_MEDIA_BY_PAGE[pageId];
    if (!media || !media.src) return '';
    return '<figure class="battle-page-media">' +
      '<img src="' + esc(media.src) + '" alt="' + esc(media.alt || '') + '" loading="lazy">' +
    '</figure>';
  }

  function buildBattleMeterHTML(engagement, pageId) {
    var level = 'Calm';
    if (engagement > 60) level = 'Hot';
    else if (engagement > 30) level = 'Warming Up';

    return '<div class="battle-shell"><div class="battle-shell-inner">' +
      '<h3>Battle Heat</h3>' +
      '<div class="battle-meter-shell"><div class="battle-bar-fill" style="width:' + engagement + '%"></div></div>' +
      '<div class="battle-meter-meta"><span>' + esc(level) + ' engagement</span><span>' + engagement + '%</span></div>' +
      '<p class="battle-copy">Derived from accepted comments, likes, and citation activity when the engagement backend is available.</p>' +
      buildBattleMediaHTML(pageId) +
      '</div></div>';
  }

  async function computeEngagement(pageId) {
    if (!BASE || !FEATURES.COMMENTS) return 25;
    try {
      var res = await fetch(BASE + '/comments?page_id=' + encodeURIComponent(pageId) + '&limit=50');
      if (!res.ok) return 25;
      var data = await res.json();
      var count = (data.comments || []).length;
      return Math.min(100, count * 5);
    } catch {
      return 25;
    }
  }

  async function injectArticleBattleLayer() {
    if (!window.location.pathname.startsWith('/wiki/')) return;

    var pageId = defaultPageId();
    ensureCommentsContainer(pageId);
    enhanceCitations(pageId);
    ensurePageLikeWidget(pageId);
    wireMissionEvents(pageId);

    var target = document.querySelector('.article-meta');
    if (!target || document.querySelector('.battle-deck')) return;

    var engagement = await computeEngagement(pageId);

    var deck = document.createElement('div');
    deck.className = 'battle-deck';
    deck.innerHTML =
      buildBattleMeterHTML(engagement, pageId) +
      buildMissionHTML(pageId);

    target.insertAdjacentElement('afterend', deck);
  }

  function injectCommunityNav() {
    var headerNav = document.querySelector('.header-nav');
    if (headerNav && !headerNav.querySelector('a[href="/community.html"]')) {
      var link = document.createElement('a');
      link.href = '/community.html';
      link.textContent = '⚔️ Battle';
      headerNav.appendChild(link);
    }

    var sidebar = document.querySelector('#sidebar .sidebar-nav');
    if (sidebar && !sidebar.querySelector('a[href="/community.html"]')) {
      var link2 = document.createElement('a');
      link2.href = '/community.html';
      link2.innerHTML = '<span class="nav-icon">⚔️</span> Battle Chamber';
      sidebar.appendChild(link2);
    }
  }

  // ── Community page API hydration ────────────────────────────────────────

  // Minimum hex-string length that constitutes a real stored hash (MD5=32, SHA-256=64).
  var MIN_HASH_LENGTH = 32;

  function avatarUrl(emailHash, size) {
    var gCfg = (window.MOONBOYS_API && window.MOONBOYS_API.GRAVATAR) || {};
    var base  = gCfg.BASE || 'https://www.gravatar.com/avatar/';
    var s     = size || gCfg.SIZE || 40;
    var d     = gCfg.DEFAULT || 'identicon';
    var r     = gCfg.RATING || 'g';
    var hash  = emailHash && emailHash.length >= MIN_HASH_LENGTH ? emailHash : '0';
    return base + esc(hash) + '?s=' + s + '&d=' + d + '&r=' + r;
  }

  function loadCommunityLeaderboard() {
    var el = document.getElementById('community-leaderboard');
    if (!el) return;
    if (!BASE) {
      el.innerHTML = '<div class="community-empty">Core API unavailable — leaderboard cannot load.</div>';
      return;
    }
    if (!FEATURES.LEADERBOARD) {
      el.innerHTML = (window.UI_STATUS_COPY && window.UI_STATUS_COPY.panels)
        ? window.UI_STATUS_COPY.panels.leaderboardUnavailable()
        : '<div class="widget-unavailable"><p>Arcade leaderboard temporarily unavailable.</p>'
          + '<a href="/games/leaderboard.html" class="btn btn-secondary">Open full leaderboard \u2192</a></div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading contributors…</div>';
    fetch(BASE + '/leaderboard?limit=10')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.entries || !data.entries.length) {
          el.innerHTML = '<div class="community-empty">No contributors yet — be the first! 🚀</div>';
          return;
        }
        el.innerHTML = data.entries.map(function (e, i) {
          return '<div class="community-row">' +
            '<span class="community-rank">' + (i + 1) + '</span>' +
            '<img class="community-avatar" src="' + avatarUrl(e.email_hash, 32) + '" alt="" loading="lazy">' +
            '<span class="community-name">' + esc(e.name || 'Unknown') + '</span>' +
            '<span class="community-score">💬 ' + (e.score || 0) + '</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="community-empty">Core API unavailable.</div>';
      });
  }

  function loadCommunityFeed() {
    var el = document.getElementById('community-feed');
    if (!el) return;
    if (!BASE) {
      el.innerHTML = '<div class="community-empty">Core API unavailable — live feed cannot load.</div>';
      return;
    }
    if (!FEATURES.LIVE_FEED) {
      var noActivity = (window.UI_STATUS_COPY && window.UI_STATUS_COPY.panels)
        ? window.UI_STATUS_COPY.panels.noActivityYet()
        : '<p>No visible activity yet. Play an arcade run, link Telegram, or join a faction to create movement.</p>';
      el.innerHTML = '<div class="community-empty">' + noActivity + '</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading activity…</div>';
    fetch(BASE + '/feed?limit=5')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.items || !data.items.length) {
          el.innerHTML = '<div class="community-empty">No activity yet — the battle is just beginning.</div>';
          return;
        }
        el.innerHTML = data.items.map(function (item) {
          return '<div class="community-row">' +
            '<span class="community-icon">' + esc(item.icon || '📌') + '</span>' +
            '<span class="community-text">' + esc(item.text || '') + '</span>' +
            '<span class="community-time">' + esc(item.time_ago || '') + '</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="community-empty">Core API unavailable.</div>';
      });
  }

  function loadCommunityStats() {
    var el = document.getElementById('community-stats-grid');
    if (!el) return;
    if (!BASE) {
      el.innerHTML = '<div class="community-empty">Core API unavailable — activity panel cannot load.</div>';
      return;
    }
    if (!FEATURES.ACTIVITY_PANEL) {
      el.innerHTML =
        '<div class="community-stat-card community-stat-info">' +
          '<p>Your engagement snapshot will reflect Telegram-linked status, Arcade XP, faction alignment, and leaderboard rank once data is available.</p>' +
          '<p class="status-hint">' +
            '<a href="/gkniftyheads-incubator.html">Link Telegram</a> to persist Arcade XP \u00b7 ' +
            '<a href="/games/">Play Arcade</a> to create activity \u00b7 ' +
            '<a href="/community.html#faction">Choose a faction</a> to join the crew layer.' +
          '</p>' +
        '</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading trending pages…</div>';
    fetch(BASE + '/activity/hot?limit=5')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.pages || !data.pages.length) {
          el.innerHTML = '<div class="community-empty">No trending pages yet — start engaging! 🔥</div>';
          return;
        }
        el.innerHTML = data.pages.map(function (p) {
          return '<a href="' + esc(p.url || '#') + '" class="community-stat-card">' +
            '<span class="community-stat-icon">' + esc(p.icon || '🔥') + '</span>' +
            '<span class="community-stat-title">' + esc(p.title || p.url || '') + '</span>' +
            '<span class="community-stat-value">' + (p.views || 0) + ' interactions</span>' +
          '</a>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="community-empty">Core API unavailable.</div>';
      });
  }

  function populateCommunityPage() {
    var isCommunity = window.location.pathname === '/community.html' ||
      window.location.pathname.endsWith('/community.html');
    if (!isCommunity) return;

    renderCommunityFactionPanel();

    var missionsContainer = document.getElementById('community-missions');
    if (missionsContainer && !missionsContainer.hasChildNodes()) {
      var localBadge = (window.UI_STATUS_COPY && window.UI_STATUS_COPY.panels)
        ? window.UI_STATUS_COPY.panels.localMissionOnly()
        : '<span class="mission-scope-badge">Guest mission \u2014 link Telegram to persist progress.</span>';
      var communityMissions = [
        {
          tag: 'Daily Arcade',
          // "Accepted" means a completed run submitted via the arcade sync flow.
          // Run acceptance is determined by the arcade-sync system (score > 0).
          text: 'Play one accepted arcade run today.',
          href: '/games/',
          local: true
        },
        {
          tag: 'Faction',
          text: 'Choose a faction and contribute score through supported games.',
          href: '/community.html',
          local: true
        },
        {
          tag: 'Block Topia Gate',
          text: 'Reach 50 Arcade XP and link Telegram to unlock Block Topia Multiplayer.',
          href: '/games/block-topia/',
          local: false
        },
        {
          tag: 'System',
          text: 'Read How To Play, then enter the arcade.',
          href: '/how-to-play.html',
          local: false
        }
      ];
      missionsContainer.innerHTML = communityMissions.map(function (m) {
        var link = m.href
          ? ' <a href="' + esc(m.href) + '" class="mission-cta-link">Start \u2192</a>'
          : '';
        var scope = m.local ? localBadge : '';
        return '<div class="mission-row">' +
          '<span class="mission-tag">' + esc(m.tag) + '</span>' +
          '<div class="mission-text">' + esc(m.text) + link + '</div>' +
          scope +
        '</div>';
      }).join('');
    }

    loadCommunityLeaderboard();
    loadCommunityFeed();
    loadCommunityStats();
  }

  function init() {
    injectCommunityNav();
    injectArticleBattleLayer();
    populateCommunityPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
