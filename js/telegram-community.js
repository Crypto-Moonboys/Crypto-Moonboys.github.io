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

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function gravatar(emailHash, size) {
    return 'https://www.gravatar.com/avatar/' + escapeHtml(emailHash || '0') + '?d=identicon&s=' + (size || 40);
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
          ? '<img class="tg-avatar" src="' + escapeHtml(e.avatar_url) + '" alt="" loading="lazy">'
          : '<img class="tg-avatar" src="' + gravatar(e.linked_email_hash || '', 32) + '" alt="" loading="lazy">';
        var faction = e.faction ? ' <span class="tg-faction">' + escapeHtml(e.faction) + '</span>' : '';
        var name = escapeHtml(e.display_name || e.username || 'Unknown Moonboy');
        return '<div class="tg-lb-row">' +
          '<span class="tg-lb-rank">' + (i + 1) + '</span>' +
          avatar +
          '<span class="tg-lb-name">' + name + faction + '</span>' +
          '<span class="tg-lb-xp">⚡ ' + (e.xp || 0) + ' XP</span>' +
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
        var ends = q.end_date ? ' <span class="tg-quest-ends">Ends: ' + escapeHtml(String(q.end_date).slice(0, 10)) + '</span>' : '';
        return '<div class="tg-quest-card">' +
          '<div class="tg-quest-title">' + escapeHtml(q.title) + ends + '</div>' +
          '<div class="tg-quest-type">Reward: ⚡' + (q.xp_reward || 0) + ' XP</div>' +
          '<div class="tg-quest-desc">' + escapeHtml(q.description || '') + '</div>' +
          '<div class="tg-quest-solve">Complete via Telegram bot: use <code>/gkquests</code> for details.</div>' +
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
      var displayName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || p.telegram_id || 'Unknown';
      var avatar = p.avatar_url
        ? '<img class="tg-profile-avatar" src="' + escapeHtml(p.avatar_url) + '" alt="' + escapeHtml(displayName) + '" loading="lazy">'
        : '<img class="tg-profile-avatar" src="' + gravatar('', 64) + '" alt="" loading="lazy">';
      var factionName = p.faction && p.faction.name ? p.faction.name : null;
      var linked = factionName || p.wallet_address
        ? '<span class="tg-badge tg-badge-linked">✅ Active</span>'
        : '<span class="tg-badge tg-badge-unlinked">Run /gklink to activate</span>';
      var factionBadge = factionName
        ? '<span class="tg-badge tg-badge-faction">⚔️ ' + escapeHtml(factionName) + '</span>'
        : '';

      el.innerHTML =
        '<div class="tg-profile-card">' +
          avatar +
          '<div class="tg-profile-info">' +
            '<div class="tg-profile-name">' + escapeHtml(displayName) + '</div>' +
            '<div class="tg-profile-badges">' + linked + factionBadge + '</div>' +
            '<div class="tg-profile-xp">⚡ ' + (p.xp || 0) + ' XP &nbsp;|&nbsp; Level ' + (p.level || 1) + '</div>' +
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
        el.innerHTML = '<span class="tg-daily-claimed">✅ Daily XP claimed (' + escapeHtml(data.date) + ')</span>';
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
          '<span class="feed-icon">' + escapeHtml(item.icon || '⚡') + '</span>' +
          '<span class="feed-text">' + escapeHtml(item.text) + '</span>' +
          '<span class="feed-time">' + escapeHtml(item.time_ago || '') + '</span>' +
        '</div>';
      }).join('');
      el.innerHTML = rows;
    });
  }

  // ── GK Link token confirmation ────────────────────────────────

  /**
   * Detect ?gklink=<token> in the URL.
   * Calls /telegram/link/confirm, then marks the local identity as linked.
   * Shows a brief inline status message on the page if a banner element exists.
   */
  function handleGkLinkToken() {
    if (!BASE) return;
    var params = new URLSearchParams(window.location.search);
    var token  = params.get('gklink');
    if (!token) return;

    // Remove the token from the URL bar without reloading
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete('gklink');
      var clean = u.toString();
      window.history.replaceState({}, '', clean);
    } catch (e) { /* ignore */ }

    // Show banner if available
    var banner = document.getElementById('gklink-status');
    if (banner) {
      banner.textContent = '🔗 Confirming your link…';
      banner.style.display = '';
    }

    fetch(BASE + '/telegram/link/confirm?token=' + encodeURIComponent(token))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          // Persist the telegram_id returned by the server, then mark linked.
          // This ensures isTelegramLinked() returns true even from a clean browser
          // state where no prior Telegram widget auth was performed.
          if (window.MOONBOYS_IDENTITY) {
            var tid = result.data.telegram_id;
            if (tid && window.MOONBOYS_IDENTITY.saveTelegramIdentity) {
              window.MOONBOYS_IDENTITY.saveTelegramIdentity(tid, result.data.telegram_name || null);
            }
            if (window.MOONBOYS_IDENTITY.setTelegramLinked) {
              window.MOONBOYS_IDENTITY.setTelegramLinked(tid || null);
            }
          }
          if (banner) {
            banner.textContent = '✅ Account linked! Competitive features are now active.';
            banner.className = (banner.className || '') + ' gklink-success';
          }
        } else {
          if (banner) {
            banner.textContent = '❌ Link failed: ' + (result.data && result.data.error ? result.data.error : 'invalid or expired token');
            banner.className = (banner.className || '') + ' gklink-error';
          }
        }
      })
      .catch(function () {
        if (banner) {
          banner.textContent = '⚠️ Could not reach the server. Please try again.';
          banner.className = (banner.className || '') + ' gklink-error';
        }
      });
  }

  // ── Boot ──────────────────────────────────────────────────────

  function init() {
    handleGkLinkToken();

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
    initLeaderboard:   initTgLeaderboard,
    initQuestPanel:    initTgQuestPanel,
    initProfileCard:   initTgProfileCard,
    initDailyStatus:   initTgDailyStatus,
    initActivityFeed:  initTgActivityFeed,
    handleGkLinkToken: handleGkLinkToken,
    init:              init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
