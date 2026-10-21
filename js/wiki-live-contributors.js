(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};
  var MAX_ROWS = 5;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var palette = ['gold', 'cyan', 'purple', 'green', 'orange'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pageIdFor(container) {
    return container.dataset.pageId ||
      window.location.pathname.split('/').pop().replace(/\.html$/, '') ||
      'wiki-page';
  }

  function identityKey(comment) {
    if (comment.telegram_id) return 'telegram:' + String(comment.telegram_id);
    if (comment.email_hash) return 'hash:' + String(comment.email_hash);
    if (comment.telegram_username) return 'telegram-name:' + String(comment.telegram_username).toLowerCase();
    if (comment.discord_username) return 'discord:' + String(comment.discord_username).toLowerCase();
    return 'name:' + String(comment.name || 'anonymous').toLowerCase();
  }

  function avatarUrl(item, size) {
    if (item.avatar_url) return String(item.avatar_url);
    var hash = item.email_hash || '0';
    return 'https://www.gravatar.com/avatar/' + encodeURIComponent(hash) + '?d=identicon&s=' + (size || 44);
  }

  function aggregate(comments, period) {
    var cutoff = Date.now() - WEEK_MS;
    var people = Object.create(null);

    (comments || []).forEach(function (comment) {
      var createdAt = Date.parse(comment.created_at || '');
      if (period === 'week' && (!createdAt || createdAt < cutoff)) return;

      var key = identityKey(comment);
      var person = people[key];
      if (!person) {
        person = people[key] = {
          name: comment.name || comment.telegram_username || comment.discord_username || 'Contributor',
          avatar_url: comment.avatar_url || '',
          email_hash: comment.email_hash || '',
          comments: 0,
          votes: 0,
          latest: createdAt || 0
        };
      }

      person.comments += 1;
      person.votes += Math.max(0, parseInt(comment.votes_up, 10) || 0);
      person.latest = Math.max(person.latest, createdAt || 0);
      if (!person.avatar_url && comment.avatar_url) person.avatar_url = comment.avatar_url;
      if (!person.email_hash && comment.email_hash) person.email_hash = comment.email_hash;
      if (comment.name) person.name = comment.name;
    });

    return Object.keys(people).map(function (key) { return people[key]; })
      .sort(function (a, b) {
        return b.comments - a.comments || b.votes - a.votes || b.latest - a.latest;
      })
      .slice(0, MAX_ROWS);
  }

  function rowHTML(item, index) {
    var countLabel = item.comments === 1 ? '1 comment' : item.comments + ' comments';
    return '<li class="top-contributor-row top-contributor-row--' + palette[index] + '">' +
      '<span class="top-contributor-rank">' + (index + 1) + '</span>' +
      '<img class="comment-robot-avatar" src="' + esc(avatarUrl(item, 44)) + '" alt="' + esc(item.name) + ' profile image" loading="lazy" referrerpolicy="no-referrer">' +
      '<span class="top-contributor-name">' + esc(item.name) + '</span>' +
      '<strong class="top-contributor-xp">' + esc(countLabel) + '</strong>' +
    '</li>';
  }

  function render(card, comments, period, failed) {
    var list = card.querySelector('.top-contributor-list');
    if (!list) return;
    var contributors = aggregate(comments, period);
    list.setAttribute('data-period', period);
    list.innerHTML = contributors.length
      ? contributors.map(rowHTML).join('')
      : '<li class="top-contributor-row top-contributor-row--empty">' +
          '<span class="top-contributor-empty-notice">' +
            (failed ? 'Approved commenter records are unavailable.' : 'No approved commenters for this period.') +
          '</span></li>';
  }

  // Only Wiki pages that deliberately load this module get this component.
  // The ordinary shared comment form must not create a global contributor board.
  function ensureOptInCard(container) {
    var card = container.querySelector('.comments-top-contributors');
    if (card) return card;
    card = document.createElement('details');
    card.className = 'comments-top-contributors comments-top-contributors--opt-in';
    card.innerHTML =
      '<summary>Article commenters (approved comments only)</summary>' +
      '<div class="top-contributor-tabs" role="group" aria-label="Commenter time period">' +
        '<button class="top-contributor-tab is-active" type="button" data-period="week" aria-pressed="true">This Week</button>' +
        '<button class="top-contributor-tab" type="button" data-period="all_time" aria-pressed="false">All Time</button>' +
      '</div>' +
      '<ol class="top-contributor-list" aria-live="polite"></ol>';
    container.appendChild(card);
    return card;
  }

  function install(container) {
    var card = container.querySelector('.comments-top-contributors');
    if (!card || card.dataset.liveContributorsReady === '1') return;
    card.dataset.liveContributorsReady = '1';

    var list = card.querySelector('.top-contributor-list');
    if (list) list.textContent = 'Checking approved commenters…';

    if (!BASE || !FEATURES.COMMENTS) return;

    var pageId = pageIdFor(container);
    var comments = [];
    var fetchFailed = false;
    var activePeriod = 'week';
    var tabs = Array.prototype.slice.call(card.querySelectorAll('.top-contributor-tab'));

    function setPeriod(period, activeTab) {
      activePeriod = period === 'all_time' ? 'all_time' : 'week';
      tabs.forEach(function (tab) {
        var active = tab === activeTab || tab.getAttribute('data-period') === activePeriod;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      render(card, comments, activePeriod, fetchFailed);
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        setPeriod(tab.getAttribute('data-period'), tab);
      });
    });

    function refresh() {
      return fetch(BASE + '/comments?page_id=' + encodeURIComponent(pageId) + '&limit=50')
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          fetchFailed = !data || !Array.isArray(data.comments);
          comments = !fetchFailed ? data.comments : [];
          render(card, comments, activePeriod, fetchFailed);
        })
        .catch(function () {
          comments = [];
          fetchFailed = true;
          render(card, comments, activePeriod, true);
        });
    }

    document.addEventListener('moonboys:comment-posted', function (event) {
      var detail = event.detail || {};
      if (!detail.page_id || detail.page_id === pageId) refresh();
    });

    refresh();
  }

  function init() {
    if (!BASE || !FEATURES.COMMENTS) return;
    Array.prototype.forEach.call(document.querySelectorAll('.wiki-comments'), function (container) {
      function mountWhenReady() {
        if (!container.querySelector('.comment-form')) return false;
        ensureOptInCard(container);
        install(container);
        return true;
      }
      if (mountWhenReady()) return;
      var observer = new MutationObserver(function () {
        if (mountWhenReady()) observer.disconnect();
      });
      observer.observe(container, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
