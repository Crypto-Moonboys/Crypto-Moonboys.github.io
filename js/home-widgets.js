/**
 * Crypto Moonboys Wiki — Homepage Battle / Activity Widgets
 * ==========================================================
 * Renders five homepage widgets:
 *   #sam-status-widget    — SAM agent status
 *   #live-feed-widget     — recent site activity feed
 *   #leaderboard-widget   — top contributor leaderboard
 *   #activity-panel       — hot / trending pages
 *   #comments-teaser      — recent battle comments teaser
 *
 * All widgets are API-driven.  When BASE_URL is null or a feature flag is
 * false the widget renders a labelled placeholder — the page does NOT break.
 *
 * Config: js/api-config.js  →  window.MOONBOYS_API
 */
(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};

  // ── HTML escape (prevents XSS when API data is rendered via innerHTML) ──

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Safe href: only allow relative paths and https:// URLs ──────────────

  function safeHref(url) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url) || /^\//.test(url)) return esc(url);
    return '#';
  }

  // ── Gravatar helper ──────────────────────────────────────────

  function avatarUrl(hash, size) {
    return 'https://www.gravatar.com/avatar/' + (hash || '0') +
           '?d=identicon&s=' + (size || 32);
  }

  // ── Generic placeholder renderer ────────────────────────────

  function placeholder(icon, text) {
    return '<div class="widget-placeholder">' +
      '<div class="widget-ph-icon">' + icon + '</div>' +
      '<div class="widget-ph-text">' + text + '</div>' +
    '</div>';
  }

  // ── SAM Status ───────────────────────────────────────────────

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
        if (!data) { el.innerHTML = '<div class="widget-error">SAM status unavailable</div>'; return; }
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

  // ── Live Feed ────────────────────────────────────────────────

  function initLiveFeed() {
    var el = document.getElementById('live-feed-widget');
    if (!el) return;

    if (!BASE || !FEATURES.LIVE_FEED) {
      el.innerHTML = placeholder('📡',
        'Live activity feed — community interactions will appear here once the engagement layer is live.'
      );
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

  // ── Leaderboard ──────────────────────────────────────────────

  function initLeaderboard() {
    var el = document.getElementById('leaderboard-widget');
    if (!el) return;

    if (!BASE || !FEATURES.LEADERBOARD) {
      el.innerHTML = placeholder('🏆',
        'Top contributors leaderboard — rankings will appear here once community engagement is live.'
      );
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
        el.innerHTML = data.entries.map(function (e, i) {
          return '<div class="lb-row">' +
            '<span class="lb-rank">' + (i + 1) + '</span>' +
            '<img class="lb-avatar" src="' + esc(avatarUrl(e.email_hash, 32)) + '" alt="' + esc(e.name) + '" loading="lazy">' +
            '<span class="lb-name">' + esc(e.name) + '</span>' +
            '<span class="lb-score">' + esc(e.score) + ' pts</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">Leaderboard unavailable</div>';
      });
  }

  // ── Activity / Page Heat ─────────────────────────────────────

  function initActivityPanel() {
    var el = document.getElementById('activity-panel');
    if (!el) return;

    if (!BASE || !FEATURES.ACTIVITY_PANEL) {
      el.innerHTML = placeholder('🔥',
        'Trending pages — most-viewed and most-discussed articles will surface here once engagement tracking is live.'
      );
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
        el.innerHTML = data.pages.map(function (p) {
          return '<div class="activity-row">' +
            '<span class="activity-icon" aria-hidden="true">' + esc(p.icon || '🔥') + '</span>' +
            '<a href="' + safeHref(p.url) + '" class="activity-title">' + esc(p.title) + '</a>' +
            '<span class="activity-heat">' + esc(p.views || 0) + ' views</span>' +
          '</div>';
        }).join('');
      })
      .catch(function () {
        el.innerHTML = '<div class="widget-error">Activity unavailable</div>';
      });
  }

  // ── Comments / Battle Teaser ─────────────────────────────────

  function initCommentsTeaser() {
    var el = document.getElementById('comments-teaser');
    if (!el) return;

    if (!BASE || !FEATURES.COMMENTS) {
      el.innerHTML =
        '<div class="battle-teaser">' +
          '<div class="bt-icon" aria-hidden="true">⚔️</div>' +
          '<div class="bt-body">' +
            '<div class="bt-title">Battle Layer — HODL vs NGMI</div>' +
            '<div class="bt-sub">Drop your takes directly on any wiki article. ' +
              'Community comments and article battles are launching soon.</div>' +
            '<div class="bt-cta"><a href="/search.html" class="btn btn-primary">Explore Articles →</a></div>' +
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
          data.comments.map(function (c) {
            return '<div class="teaser-comment">' +
              '<img class="tc-avatar" src="' + esc(avatarUrl(c.email_hash, 28)) + '" alt="' + esc(c.name) + '" loading="lazy">' +
              '<div class="tc-body">' +
                '<span class="tc-name">' + esc(c.name) + '</span> ' +
                '<span class="tc-text">' + esc(c.text) + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
          '<a href="articles.html" class="btn btn-secondary teaser-see-all">See all battles →</a>' +
          '</div>';
      })
      .catch(function () {
        // Comments widget uses an empty-state message on error (rather than a
        // generic "unavailable" banner) because seeing no comments yet is an
        // expected state and this phrasing encourages first engagement.
        el.innerHTML = '<div class="comments-empty">No comments yet — start the battle! ⚔️</div>';
      });
  }

  // ── Boot ─────────────────────────────────────────────────────

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
