(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};

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
  }

  function enhanceCitations(pageId) {
    var list = document.querySelectorAll('.citations-list li');
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
    });
  }

  function getFaction() {
    try { return localStorage.getItem('moonboysFaction'); } catch { return null; }
  }

  function setFaction(name) {
    try { localStorage.setItem('moonboysFaction', name); } catch {}
  }

  function factionSelectorHTML() {
    var factions = [
      { id: 'diamond-hands', name: 'Diamond Hands', sub: 'Hold the line through every dip.' },
      { id: 'hodl-warriors', name: 'HODL Warriors', sub: 'Guardians of the Moonboys legacy.' },
      { id: 'moon-mission', name: 'Moon Mission', sub: 'Relentless push toward new highs.' },
      { id: 'graffpunks', name: 'GraffPUNKS', sub: 'Rebels shaping the culture of Web3.' }
    ];

    var active = getFaction();

    return '<div class="battle-shell"><div class="battle-shell-inner">' +
      '<h3>Choose Your Faction</h3>' +
      '<div class="faction-grid">' +
      factions.map(function (f) {
        var isActive = active === f.id ? ' is-active' : '';
        return '<button class="faction-btn' + isActive + '" data-faction="' + esc(f.id) + '">' +
          '<span class="faction-name">' + esc(f.name) + '</span>' +
          '<span class="faction-sub">' + esc(f.sub) + '</span>' +
        '</button>';
      }).join('') +
      '</div>' +
      '<p class="battle-copy">Your faction selection is stored locally and will sync with your profile once the live engagement API is fully connected.</p>' +
      '</div></div>';
  }

  function attachFactionHandlers(container) {
    container.querySelectorAll('.faction-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var faction = btn.dataset.faction;
        setFaction(faction);
        container.querySelectorAll('.faction-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
    });
  }

  function buildMissionHTML(pageId) {
    var missions = [
      { tag: 'Engage', text: 'Leave a strategic comment on this page to influence the narrative.' },
      { tag: 'Signal', text: 'Like this article to boost its standing in the Moonboys ecosystem.' },
      { tag: 'Cite', text: 'Vote on citations to strengthen the credibility of this intelligence file.' }
    ];

    return '<div class="battle-shell"><div class="battle-shell-inner">' +
      '<h3>Daily Missions</h3>' +
      '<div class="mission-stack">' +
      missions.map(function (m) {
        return '<div class="mission-row">' +
          '<div>' +
            '<span class="mission-tag">' + esc(m.tag) + '</span>' +
            '<div class="mission-text">' + esc(m.text) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
      '<p class="battle-copy">Missions rotate as the community evolves. Complete them to build your reputation once full XP tracking is live.</p>' +
      '</div></div>';
  }

  function buildBattleMeterHTML(engagement) {
    var level = 'Calm';
    if (engagement > 60) level = 'Hot';
    else if (engagement > 30) level = 'Warming Up';

    return '<div class="battle-shell"><div class="battle-shell-inner">' +
      '<h3>Battle Heat</h3>' +
      '<div class="battle-meter-shell"><div class="battle-bar-fill" style="width:' + engagement + '%"></div></div>' +
      '<div class="battle-meter-meta"><span>' + esc(level) + ' engagement</span><span>' + engagement + '%</span></div>' +
      '<p class="battle-copy">Derived from recent comments, likes, and overall activity. Connect the engagement API to unlock real-time battle intelligence.</p>' +
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

    var target = document.querySelector('.article-meta');
    if (!target || document.querySelector('.battle-deck')) return;

    var engagement = await computeEngagement(pageId);

    var deck = document.createElement('div');
    deck.className = 'battle-deck';
    deck.innerHTML =
      buildBattleMeterHTML(engagement) +
      factionSelectorHTML() +
      buildMissionHTML(pageId);

    target.insertAdjacentElement('afterend', deck);
    attachFactionHandlers(deck);
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

  function injectHomeStrip() {
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') return;
    var hero = document.querySelector('.home-hero');
    if (!hero || document.querySelector('.battle-strip')) return;

    var strip = document.createElement('div');
    strip.className = 'battle-strip';
    strip.innerHTML =
      '<div class="battle-card"><div class="battle-card-inner">' +
        '<h3>Battle Chamber</h3>' +
        '<p class="battle-copy">Dive into the heart of community engagement — track activity, join a faction, and shape the narrative.</p>' +
        '<a href="/community.html" class="btn btn-primary">Enter the Chamber →</a>' +
      '</div></div>' +
      '<div class="battle-card"><div class="battle-card-inner">' +
        '<h3>Faction Alignment</h3>' +
        '<p class="battle-copy">Choose your allegiance and prepare for upcoming live faction wars across the Moonboys ecosystem.</p>' +
      '</div></div>' +
      '<div class="battle-card"><div class="battle-card-inner">' +
        '<h3>Daily Missions</h3>' +
        '<p class="battle-copy">Complete engagement missions to rise through the ranks once XP tracking is fully activated.</p>' +
      '</div></div>';

    hero.insertAdjacentElement('afterend', strip);
  }

  function populateCommunityPage() {
    var isCommunity = window.location.pathname === '/community.html' ||
      window.location.pathname.endsWith('/community.html');
    if (!isCommunity) return;

    var factionContainer = document.getElementById('community-faction-selector');
    if (factionContainer && !factionContainer.hasChildNodes()) {
      factionContainer.innerHTML = factionSelectorHTML();
      attachFactionHandlers(factionContainer);
    }

    var missionsContainer = document.getElementById('community-missions');
    if (missionsContainer && !missionsContainer.hasChildNodes()) {
      var communityMissions = [
        { tag: 'Engage', text: 'Post a comment on any wiki article to add to the community intelligence.' },
        { tag: 'Signal', text: 'Like an article to boost its standing in the Moonboys ecosystem.' },
        { tag: 'Cite', text: 'Vote on a citation to strengthen the credibility of the knowledge base.' },
        { tag: 'Align', text: 'Choose your faction above to register your allegiance.' }
      ];
      missionsContainer.innerHTML = communityMissions.map(function (m) {
        return '<div class="mission-row">' +
          '<div>' +
            '<span class="mission-tag">' + esc(m.tag) + '</span>' +
            '<div class="mission-text">' + esc(m.text) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  function init() {
    injectCommunityNav();
    injectHomeStrip();
    injectArticleBattleLayer();
    populateCommunityPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());