/**
 * Crypto Moonboys Wiki — Homepage Battle / Activity Widgets
 * ==========================================================
 * Renders five optional API-driven homepage widgets. Missing containers or
 * disabled feature flags are treated as expected states and do not break the page.
 */
(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Allow same-origin root-relative paths and absolute HTTPS URLs only.
  function safeHref(url) {
    var value = String(url || '').trim();
    if (/^\/(?!\/)/.test(value) || /^https:\/\//i.test(value)) return esc(value);
    return '#';
  }

  function avatarUrl(hash, size) {
    var safeHash = /^[a-f0-9]{32}$/i.test(String(hash || '')) ? String(hash) : '0';
    return 'https://www.gravatar.com/avatar/' + safeHash + '?d=identicon&s=' + (size || 32);
  }

  function placeholder(icon, text) {
    return '<div class="widget-placeholder">' +
      '<div class="widget-ph-icon">' + icon + '</div>' +
      '<div class="widget-ph-text">' + text + '</div>' +
    '</div>';
  }

  function initSamStatus() {
    var el = document.getElementById('sam-status-widget');
    if (!el) return;

    if (!BASE || !FEATURES.SAM_STATUS) {
      el.innerHTML =
        '<div class="sam-status-inner">' +
          '<div class="sam-status-icon" aria-hidden="true">🤖</div>' +
          '<div class="sam-status-body">' +
            '<div class="sam-status-title">SAM — Wiki Intelligence Agent</div>' +
            '<div class="sam-status-sub">Status feed requires external API. ' +
              '<a href="agent.html">Learn about SAM →</a>' +
            '</div>' +
          '</div>' +
          '<div class="sam-status-badge sam-offline">OFFLINE</div>' +
        '</div>';
      return;
    }

    el.innerHTML = placeholder('🤖', 'Checking SAM status…');

    fetch(BASE + '/sam/status')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) {
          el.innerHTML = '<div class="widget-error">SAM status unavailable</div>';
          return;
        }
        el.innerHTML =
          '<div class="sam-status-inner">' +
            '<div class="sam-status-icon" aria-hidden="true">🤖</div>' +
            '<div class="sam-status-body">' +
              '<div class="sam-status-title">SAM — Wiki Intelligence Agent</div>' +
              '<div class="sam-status-sub">' + esc(data.message || 'Active and monitoring') + '</div>' +
            '</div>' +
            '<div class="sam-status-badge sam-online">ACTIVE</div>' +
          '</div>';
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">SAM status unavailable</div>';
      });
  }

  function initLiveFeed() {
    var el = document.getElementById('live-feed-widget');
    if (!el) return;

    if (!BASE || !FEATURES.LIVE_FEED) {
      el.innerHTML =
        '<div class="live-activity-panel">' +
          '<p class="live-activity-desc">Activity feed unavailable. ' +
            'Use the live Arcade and Battle Chamber routes below while this panel has no current feed data.</p>' +
          '<div class="swarmsy-action-grid swarmsy-action-grid--compact">' +
            '<a href="/games/" class="swarmsy-action-card swarmsy-action-card--gold"><strong>Play Arcade</strong><span>Open the live games index.</span></a>' +
            '<a href="/community.html" class="swarmsy-action-card"><strong>Open Battle Chamber</strong><span>Enter community signal and proof routes.</span></a>' +
          '</div>' +
        '</div>';
      return;
    }

    el.innerHTML = placeholder('📡', 'Loading activity feed…');

    fetch(BASE + '/feed?limit=5')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.items || !data.items.length) {
          el.innerHTML = '<div class="feed-empty">No activity yet — be the first! ⚡️</div>';
          return;
        }
        el.innerHTML = data.items.map(function (item) {
          return '<div class="feed-item">' +
            '<span class="feed-icon" aria-hidden="true">' + esc(item.icon || '⚡️') + '</span>' +
            '<div class="feed-body">' +
              '<div class="feed-text">' + esc(item.text) + '</div>' +
              '<div class="feed-time">' + esc(item.time_ago || '') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">Feed unavailable</div>';
      });
  }

  function initLeaderboard() {
    var el = document.getElementById('leaderboard-widget');
    if (!el) return;

    if (!BASE || !FEATURES.LEADERBOARD) {
      el.innerHTML = '<div class="widget-unavailable"><p>Engagement leaderboard unavailable.</p>' +
        '<a href="/games/leaderboard.html" class="swarmsy-action-card"><strong>Open arcade leaderboard</strong><span>View the full leaderboard route.</span></a></div>';
      return;
    }

    el.innerHTML = placeholder('🏆', 'Loading leaderboard…');

    fetch(BASE + '/leaderboard?limit=5')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.entries || !data.entries.length) {
          el.innerHTML = '<div class="leaderboard-empty">No entries yet</div>';
          return;
        }
        el.innerHTML = data.entries.map(function (entry, index) {
          return '<div class="lb-row">' +
            '<span class="lb-rank">' + (index + 1) + '</span>' +
            '<img class="lb-avatar" src="' + esc(avatarUrl(entry.email_hash, 32)) + '" alt="' + esc(entry.name) + '" loading="lazy">' +
            '<span class="lb-name">' + esc(entry.name) + '</span>' +
            '<span class="lb-score">' + esc(entry.score) + ' pts</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">Leaderboard unavailable</div>';
      });
  }

  function initActivityPanel() {
    var el = document.getElementById('activity-panel');
    if (!el) return;

    if (!BASE || !FEATURES.ACTIVITY_PANEL) {
      el.innerHTML =
        '<div class="explore-wiki-panel">' +
          '<p class="explore-wiki-desc">Explore the Living Wiki</p>' +
          '<ul class="explore-wiki-links">' +
            '<li><a href="/search.html">📖 All Articles</a></li>' +
            '<li><a href="/timeline.html">📅 Timeline</a></li>' +
            '<li><a href="/graph.html">🌐 Entity Graph</a></li>' +
            '<li><a href="/wiki/hodl-wars.html">⚔️ HODL Wars</a></li>' +
            '<li><a href="/how-to-play.html">◆ How To Play</a></li>' +
          '</ul>' +
        '</div>';
      return;
    }

    el.innerHTML = placeholder('🔥', 'Loading trending pages…');

    fetch(BASE + '/activity/hot?limit=5')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.pages || !data.pages.length) {
          el.innerHTML = '<div class="activity-empty">No activity data yet</div>';
          return;
        }
        el.innerHTML = data.pages.map(function (page) {
          return '<div class="activity-row">' +
            '<span class="activity-icon" aria-hidden="true">' + esc(page.icon || '🔥') + '</span>' +
            '<a href="' + safeHref(page.url) + '" class="activity-title">' + esc(page.title) + '</a>' +
            '<span class="activity-heat">' + esc(page.views || 0) + ' views</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">Activity unavailable</div>';
      });
  }

  function initCommentsTeaser() {
    var el = document.getElementById('comments-teaser');
    if (!el) return;

    if (!BASE || !FEATURES.COMMENTS) {
      el.innerHTML =
        '<div class="battle-teaser">' +
          '<div class="bt-icon" aria-hidden="true">⚔️</div>' +
          '<div class="bt-body">' +
            '<div class="bt-title">Battle Chamber</div>' +
            '<div class="bt-sub">Community comments are unavailable here. ' +
              'Open the Battle Chamber for the current proof wall and faction entry points.</div>' +
            '<div class="bt-cta"><a href="/community.html" class="swarmsy-action-card swarmsy-action-card--gold"><strong>Open Battle Chamber</strong><span>Enter community comments and faction routes.</span></a></div>' +
          '</div>' +
        '</div>';
      return;
    }

    el.innerHTML = placeholder('⚔️', 'Loading recent battles…');

    fetch(BASE + '/comments/recent?limit=3')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.comments || !data.comments.length) {
          el.innerHTML = '<div class="comments-empty">No comments yet — start the battle! ⚔️</div>';
          return;
        }
        el.innerHTML =
          '<div class="teaser-comments">' +
          data.comments.map(function (comment) {
            return '<div class="teaser-comment">' +
              '<img class="tc-avatar" src="' + esc(avatarUrl(comment.email_hash, 28)) + '" alt="' + esc(comment.name) + '" loading="lazy">' +
              '<div class="tc-body">' +
                '<span class="tc-name">' + esc(comment.name) + '</span> ' +
                '<span class="tc-text">' + esc(comment.text) + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
          '<a href="articles.html" class="swarmsy-action-card teaser-see-all"><strong>See all battles</strong><span>Open the full article and comment list.</span></a>' +
          '</div>';
      })
      .catch(function () {
        el.innerHTML = '<div class="comments-empty">No comments yet — start the battle! ⚔️</div>';
      });
  }

  function init() {
    initSamStatus();
    initLiveFeed();
    initLeaderboard();
    initActivityPanel();
    initCommentsTeaser();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
