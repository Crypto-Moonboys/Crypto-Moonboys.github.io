/**
 * Crypto Moonboys Wiki — Telegram Community Widgets
 * ==================================================
 * Powers the Telegram community panels on community.html:
 *   - Community XP leaderboard
 *   - Active quest panel
 *   - Telegram profile card
 *   - Daily claim status badge
 *   - Linked Telegram badge on comment profile (picked up by comments.js)
 *
 * All data fetched from moonboys-api; gracefully degrades to placeholders
 * when BASE_URL is null or TELEGRAM_COMMUNITY feature flag is false.
 *
 * No hardcoded secrets. All Telegram auth uses the existing /telegram/auth flow.
 *
 * Usage: include after api-config.js on any page that contains the
 * following hook elements:
 *   <div id="tg-community-leaderboard"></div>
 *   <div id="tg-quest-panel"></div>
 *   <div id="tg-profile-card" data-telegram-id="..."></div>
 *   <div id="tg-daily-status" data-telegram-id="..."></div>
 *   <div id="tg-activity-feed"></div>
 */
(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};

  // ── HTML escape (XSS prevention) ─────────────────────────────

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function gravatar(emailHash, size) {
    return 'https://www.gravatar.com/avatar/' + esc(emailHash || '0') + '?d=identicon&s=' + (size || 40);
  }

  // ── Fetch helpers ─────────────────────────────────────────────

  function apiFetch(path) {
    return fetch(BASE + path)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── Telegram Community XP Leaderboard ────────────────────────

  function initTgLeaderboard(el) {
    if (!BASE || !FEATURES.TELEGRAM_COMMUNITY) {
      el.innerHTML = '<div class="community-empty">Telegram leaderboard coming soon.</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading community leaderboard…</div>';

    apiFetch('/telegram/leaderboard?limit=10').then(function (data) {
      if (!data || !data.entries || !data.entries.length) {
        el.innerHTML = '<div class="community-empty">No community XP recorded yet. Be the first! 🚀</div>';
        return;
      }
      var rows = data.entries.map(function (e, i) {
        var avatar = e.avatar_url
          ? '<img class="tg-avatar" src="' + esc(e.avatar_url) + '" alt="" loading="lazy">'
          : '<img class="tg-avatar" src="' + gravatar('', 32) + '" alt="" loading="lazy">';
        var faction = e.faction ? ' <span class="tg-faction">' + esc(e.faction) + '</span>' : '';
        var name = esc(e.display_name || e.username || 'Unknown Moonboy');
        return '<div class="tg-lb-row">' +
          '<span class="tg-lb-rank">' + (i + 1) + '</span>' +
          avatar +
          '<span class="tg-lb-name">' + name + faction + '</span>' +
          '<span class="tg-lb-xp">⚡ ' + (e.xp_total || 0) + ' XP</span>' +
        '</div>';
      }).join('');

      el.innerHTML =
        '<div class="tg-lb-header">Community XP <span class="tg-lb-note">(separate from arcade scores)</span></div>' +
        '<div class="tg-lb-list">' + rows + '</div>';
    });
  }

  // ── Active Quest Panel ────────────────────────────────────────

  function initTgQuestPanel(el) {
    if (!BASE || !FEATURES.TELEGRAM_COMMUNITY) {
      el.innerHTML = '<div class="community-empty">Quest board coming soon.</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading quests…</div>';

    apiFetch('/telegram/quests').then(function (data) {
      if (!data || !data.quests || !data.quests.length) {
        el.innerHTML =
          '<div class="community-empty">No active quests right now.<br>' +
          '<span class="tg-quest-hint">Watch the Telegram group for new lore drops.</span></div>';
        return;
      }
      var cards = data.quests.map(function (q) {
        var ends = q.ends_at ? ' <span class="tg-quest-ends">Ends: ' + esc(q.ends_at.slice(0, 10)) + '</span>' : '';
        return '<div class="tg-quest-card">' +
          '<div class="tg-quest-title">' + esc(q.title) + ends + '</div>' +
          '<div class="tg-quest-type">Type: ' + esc(q.quest_type) + ' &nbsp;|&nbsp; Reward: ⚡' + (q.xp_reward || 0) + ' XP</div>' +
          '<div class="tg-quest-desc">' + esc(q.description) + '</div>' +
          '<div class="tg-quest-solve">Solve via Telegram: <code>/solve ' + esc(q.slug) + ' &lt;answer&gt;</code></div>' +
        '</div>';
      }).join('');

      el.innerHTML = '<div class="tg-quest-list">' + cards + '</div>';
    });
  }

  // ── Telegram Profile Card ─────────────────────────────────────

  function initTgProfileCard(el) {
    var telegramId = el.dataset.telegramId;
    if (!telegramId || !BASE || !FEATURES.TELEGRAM_COMMUNITY) {
      el.innerHTML = '<div class="community-empty">Connect Telegram to see your profile here.</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading profile…</div>';

    apiFetch('/telegram/profile?telegram_id=' + encodeURIComponent(telegramId)).then(function (data) {
      if (!data || !data.profile) {
        el.innerHTML = '<div class="community-empty">Profile not found. Use /start in the Telegram bot.</div>';
        return;
      }
      var p = data.profile;
      var avatar = p.avatar_url
        ? '<img class="tg-profile-avatar" src="' + esc(p.avatar_url) + '" alt="' + esc(p.display_name) + '" loading="lazy">'
        : '<img class="tg-profile-avatar" src="' + gravatar('', 64) + '" alt="" loading="lazy">';
      var linked = p.linked_email_hash
        ? '<span class="tg-badge tg-badge-linked">✅ Website Linked</span>'
        : '<span class="tg-badge tg-badge-unlinked">❌ Not Linked</span>';
      var faction = p.faction
        ? '<span class="tg-badge tg-badge-faction">⚔️ ' + esc(p.faction) + '</span>'
        : '';

      el.innerHTML =
        '<div class="tg-profile-card">' +
          avatar +
          '<div class="tg-profile-info">' +
            '<div class="tg-profile-name">' + esc(p.display_name || p.username || 'Unknown') + '</div>' +
            '<div class="tg-profile-badges">' + linked + faction + '</div>' +
            '<div class="tg-profile-xp">⚡ ' + (p.xp_total || 0) + ' XP total &nbsp;|&nbsp; ' +
              (p.xp_seasonal || 0) + ' seasonal &nbsp;|&nbsp; ' +
              (p.xp_yearly || 0) + ' yearly</div>' +
          '</div>' +
        '</div>';
    });
  }

  // ── Daily Claim Status ────────────────────────────────────────

  function initTgDailyStatus(el) {
    var telegramId = el.dataset.telegramId;
    if (!telegramId || !BASE || !FEATURES.TELEGRAM_COMMUNITY) {
      el.innerHTML = '';
      return;
    }

    apiFetch('/telegram/daily-status?telegram_id=' + encodeURIComponent(telegramId)).then(function (data) {
      if (!data) { el.innerHTML = ''; return; }
      if (data.claimed) {
        el.innerHTML = '<span class="tg-daily-claimed">✅ Daily XP claimed (' + esc(data.date) + ')</span>';
      } else {
        el.innerHTML =
          '<span class="tg-daily-unclaimed">🎁 Daily XP available! Use <code>/daily</code> in the Telegram bot.</span>';
      }
    });
  }

  // ── Telegram Activity Feed ────────────────────────────────────

  function initTgActivityFeed(el) {
    if (!BASE || !FEATURES.TELEGRAM_COMMUNITY) {
      el.innerHTML = '<div class="community-empty">No Telegram activity yet.</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading activity…</div>';

    apiFetch('/telegram/activity?limit=10').then(function (data) {
      if (!data || !data.items || !data.items.length) {
        el.innerHTML = '<div class="community-empty">No community XP activity yet. Start earning!</div>';
        return;
      }
      var rows = data.items.map(function (item) {
        return '<div class="feed-item">' +
          '<span class="feed-icon">' + esc(item.icon || '⚡') + '</span>' +
          '<span class="feed-text">' + esc(item.text) + '</span>' +
          '<span class="feed-time">' + esc(item.time_ago || '') + '</span>' +
        '</div>';
      }).join('');
      el.innerHTML = rows;
    });
  }

  // ── Boot ──────────────────────────────────────────────────────

  function init() {
    var lb  = document.getElementById('tg-community-leaderboard');
    var qp  = document.getElementById('tg-quest-panel');
    var pc  = document.getElementById('tg-profile-card');
    var ds  = document.getElementById('tg-daily-status');
    var af  = document.getElementById('tg-activity-feed');

    if (lb)  initTgLeaderboard(lb);
    if (qp)  initTgQuestPanel(qp);
    if (pc)  initTgProfileCard(pc);
    if (ds)  initTgDailyStatus(ds);
    if (af)  initTgActivityFeed(af);
  }

  // Expose for external callers (e.g. after Telegram auth)
  window.MOONBOYS_TG_COMMUNITY = {
    initLeaderboard:  initTgLeaderboard,
    initQuestPanel:   initTgQuestPanel,
    initProfileCard:  initTgProfileCard,
    initDailyStatus:  initTgDailyStatus,
    initActivityFeed: initTgActivityFeed,
    init:             init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
