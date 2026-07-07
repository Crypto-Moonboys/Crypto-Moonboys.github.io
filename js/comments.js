/**
 * Crypto Moonboys Wiki — Comments Component
 * ==========================================
 * Reusable comment section for wiki article pages.
 *
 * Identity: Gravatar-first (email hash → avatar, email never stored visibly).
 *           Room for Telegram identity field — handled server-side when backend
 *           supports it; the form collects a Telegram username if entered.
 *
 * Requirements:
 *   - No backend code in this repo.
 *   - All persistence via external API: configure MOONBOYS_API.BASE_URL in
 *     js/api-config.js.
 *   - Renders a clearly labelled placeholder when BASE_URL is null.
 *   - Does not break existing wiki pages or shared JS.
 *
 * Usage:
 *   Add to any wiki article page (before </main>):
 *     <div class="wiki-comments" data-page-id="article-slug"></div>
 *   Then include this script after wiki.js.
 */
(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};
  var TG_BOT   = cfg.TELEGRAM_BOT_USERNAME || null;
  var COMMENT_PROFILE_KEY = 'moonboys_comment_profile_v1';
  var FALLBACK_TOP_CONTRIBUTORS = [
    { rank: 1, name: 'Swarmsy', xp: 9540, color: 'gold' },
    { rank: 2, name: 'Alfie Blaze', xp: 7420, color: 'cyan' },
    { rank: 3, name: 'CrypticYuna', xp: 6180, color: 'purple' },
    { rank: 4, name: 'Boneidol INK', xp: 4860, color: 'green' },
    { rank: 5, name: 'P-Fly', xp: 3990, color: 'orange' },
  ];

  // Resolved text constants — fall back to literals so no type="module" is needed.
  var COPY = window.UI_STATUS_COPY || {
    UNLINKED:            'Telegram not linked \u2014 run /gklink',
    FEATURE_UNAVAILABLE: 'Feature unavailable',
    API_UNAVAILABLE:     'Core API unavailable',
  };

  function getFreshTelegramAuth() {
    var gate = window.MOONBOYS_IDENTITY;
    if (gate && gate.getFreshTelegramAuth) return gate.getFreshTelegramAuth();
    return Promise.resolve(null);
  }

  function getIdentityGate() {
    return window.MOONBOYS_IDENTITY || null;
  }

  function readCommentProfile() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(COMMENT_PROFILE_KEY) : null;
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveCommentProfile(profile) {
    var safe = {};
    ['name', 'email', 'telegram_username', 'discord_username', 'avatar_url'].forEach(function (key) {
      var value = profile && profile[key] != null ? String(profile[key]).trim() : '';
      if (value) safe[key] = value;
    });
    try {
      if (window.localStorage) window.localStorage.setItem(COMMENT_PROFILE_KEY, JSON.stringify(safe));
    } catch {}
    return safe;
  }

  function cleanTelegramUsername(value) {
    return String(value || '').trim().replace(/^@+/, '');
  }

  function getLinkedTelegramProfile() {
    var gate = getIdentityGate();
    if (!gate || typeof gate.isTelegramLinked !== 'function' || !gate.isTelegramLinked()) return null;
    var auth = typeof gate.getTelegramAuth === 'function' ? gate.getTelegramAuth() : null;
    var name = typeof gate.getTelegramName === 'function' ? gate.getTelegramName() : '';
    var username = auth && auth.username ? cleanTelegramUsername(auth.username) : '';
    var avatar = '';
    if (typeof gate.getTelegramPhotoUrl === 'function') avatar = gate.getTelegramPhotoUrl() || '';
    if (!avatar && auth && auth.photo_url) avatar = auth.photo_url;
    return {
      name: String(name || '').trim(),
      telegram_username: username,
      avatar_url: String(avatar || '').trim(),
    };
  }

  function fillIfEmpty(form, fieldName, value) {
    var el = form.querySelector('[name=' + fieldName + ']');
    if (el && !String(el.value || '').trim() && value) el.value = value;
  }

  function applyCommentProfile(form) {
    var profile = readCommentProfile();
    fillIfEmpty(form, 'name', profile.name);
    fillIfEmpty(form, 'email', profile.email);
    fillIfEmpty(form, 'telegram_username', profile.telegram_username);
    fillIfEmpty(form, 'discord_username', profile.discord_username);
    fillIfEmpty(form, 'avatar_url', profile.avatar_url);
  }

  function applyLinkedTelegramIdentity(form) {
    var linked = getLinkedTelegramProfile();
    if (!linked) return null;
    fillIfEmpty(form, 'name', linked.name);
    fillIfEmpty(form, 'telegram_username', linked.telegram_username);
    fillIfEmpty(form, 'avatar_url', linked.avatar_url);
    return linked;
  }

  function updateCommentIdentityCopy(form) {
    var tgStatus = form.querySelector('.cm-tg-status');
    var gravatarStatus = form.querySelector('.cm-gravatar-status');
    var gate = getIdentityGate();
    var profile = readCommentProfile();
    var linked = getLinkedTelegramProfile();
    var hasTelegramId = !!(gate && typeof gate.getTelegramId === 'function' && gate.getTelegramId());

    if (tgStatus) {
      if (linked) {
        tgStatus.textContent = 'Telegram linked: ' + (linked.name || linked.telegram_username || 'connected') + '. Email optional — Telegram identity will be used.';
        tgStatus.className = 'cm-tg-status cm-success';
      } else if (hasTelegramId) {
        tgStatus.textContent = 'Run /gklink to activate rewards.';
        tgStatus.className = 'cm-tg-status cm-warning';
      } else {
        tgStatus.textContent = 'Optional for comments. Required for rewards. Telegram quick-fill unavailable. Link through the Incubator Hub /gklink flow.';
        tgStatus.className = 'cm-tg-status';
      }
    }

    if (gravatarStatus) {
      var emailEl = form.querySelector('[name=email]');
      if (profile.email || String(emailEl ? emailEl.value : '').trim()) {
        gravatarStatus.textContent = 'Gravatar avatar ready from saved email.';
      } else {
        gravatarStatus.textContent = 'Email required for Gravatar avatar, never displayed.';
      }
    }
  }

  // ── HTML escape (prevents XSS when API data is rendered via innerHTML) ──

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatXP(value) {
    var n = parseInt(value, 10) || 0;
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' XP';
  }

  function getContributorData() {
    var live = window.MOONBOYS_TOP_CONTRIBUTORS || {};
    var week = Array.isArray(live.week) ? live.week : Array.isArray(live.this_week) ? live.this_week : null;
    var allTime = Array.isArray(live.all_time) ? live.all_time : Array.isArray(live.allTime) ? live.allTime : null;
    return {
      week: week && week.length ? week : FALLBACK_TOP_CONTRIBUTORS,
      all_time: allTime && allTime.length ? allTime : FALLBACK_TOP_CONTRIBUTORS,
    };
  }

  function robotAvatar(color, name, uid) {
    var avatarColor = normalizeContributorColor(color);
    var palette = {
      gold: ['#ffd447', '#ff9d00'],
      cyan: ['#32d7ff', '#0877ff'],
      purple: ['#d35cff', '#7d37ff'],
      green: ['#64ff76', '#0bbf61'],
      orange: ['#ff9a2f', '#ff4d18'],
    }[avatarColor];
    var gradientId = 'robot-' + avatarColor + '-' + String(uid || name || 'avatar').replace(/[^a-z0-9_-]/gi, '');
    return '<span class="comment-robot-avatar comment-robot-avatar--' + esc(avatarColor) + '" aria-hidden="true">' +
      '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">' +
        '<defs><linearGradient id="' + esc(gradientId) + '" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="' + palette[0] + '"/><stop offset="1" stop-color="' + palette[1] + '"/></linearGradient></defs>' +
        '<circle cx="32" cy="32" r="29" fill="rgba(2,8,18,.92)" stroke="url(#' + esc(gradientId) + ')" stroke-width="2"/>' +
        '<path d="M20 25c0-6 4-10 12-10s12 4 12 10v11c0 7-5 12-12 12s-12-5-12-12V25z" fill="rgba(7,18,33,.96)" stroke="url(#' + esc(gradientId) + ')" stroke-width="2"/>' +
        '<path d="M24 39h16M26 47l-4 6M38 47l4 6M32 15V9" stroke="url(#' + esc(gradientId) + ')" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="26" cy="30" r="4" fill="' + palette[0] + '"/><circle cx="38" cy="30" r="4" fill="' + palette[1] + '"/>' +
        '<path d="M27 38h10" stroke="' + palette[0] + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
    '</span>';
  }

  function normalizeContributorColor(color) {
    var key = String(color || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return ['gold', 'cyan', 'purple', 'green', 'orange'].indexOf(key) >= 0 ? key : 'cyan';
  }

  function contributorRows(list) {
    return list.slice(0, 5).map(function (item, index) {
      var rank = item.rank || index + 1;
      var color = normalizeContributorColor(item.color || ['gold', 'cyan', 'purple', 'green', 'orange'][index]);
      return '<li class="top-contributor-row top-contributor-row--' + esc(color) + '">' +
        '<span class="top-contributor-rank">' + esc(rank) + '</span>' +
        robotAvatar(color, item.name || 'Contributor', rank) +
        '<span class="top-contributor-name">' + esc(item.name || 'Contributor') + '</span>' +
        '<strong class="top-contributor-xp">' + esc(formatXP(item.xp)) + '</strong>' +
      '</li>';
    }).join('');
  }

  function buildTopContributorsHTML() {
    var data = getContributorData();
    return '<aside class="comments-top-contributors" aria-labelledby="comments-top-contributors-title">' +
      '<div class="comments-card-heading">' +
        '<span class="comments-card-icon comments-card-icon--gold" aria-hidden="true"></span>' +
        '<h3 id="comments-top-contributors-title">Top Contributors</h3>' +
      '</div>' +
      '<div class="top-contributor-tabs" aria-label="Top contributors timeframe">' +
        '<button type="button" class="top-contributor-tab is-active" data-period="week" aria-pressed="true">This Week</button>' +
        '<button type="button" class="top-contributor-tab" data-period="all_time" aria-pressed="false">All Time</button>' +
      '</div>' +
      '<ol class="top-contributor-list" data-period="week">' + contributorRows(data.week) + '</ol>' +
    '</aside>';
  }

  function buildTelegramIdentityCard(pageId) {
    return '<section class="comments-link-card comments-link-card--telegram" aria-labelledby="comments-telegram-title">' +
      '<div class="comments-card-heading">' +
        '<span class="comments-card-icon comments-card-icon--telegram" aria-hidden="true"></span>' +
        '<h3 id="comments-telegram-title">Telegram Identity</h3>' +
      '</div>' +
      '<div class="cm-tg-login" id="cm-tg-login-' + pageId + '"></div>' +
      '<span class="cm-tg-status" id="cm-tg-status-' + pageId + '">Optional for comments. Required for rewards.</span>' +
      '<p>Email optional when Telegram identity is linked.</p>' +
    '</section>';
  }

  function buildTelegramBenefitsCard() {
    return '<section class="comments-link-card comments-link-card--benefits" aria-labelledby="comments-benefits-title">' +
      '<div class="comments-card-heading">' +
        '<span class="comments-card-icon comments-card-icon--purple" aria-hidden="true"></span>' +
        '<h3 id="comments-benefits-title">Why Connect Telegram?</h3>' +
      '</div>' +
      '<div class="comments-benefit-grid">' +
        '<div><strong>Verified Identity</strong><span>Proves you are a real GKniftyHEAD in the Moonboys ecosystem.</span></div>' +
        '<div><strong>Earn More XP</strong><span>Verified users earn more XP for engagement and contributions.</span></div>' +
        '<div><strong>Climb The Ranks</strong><span>Top contributors get featured and earn exclusive rewards.</span></div>' +
      '</div>' +
    '</section>';
  }

  function buildInfoCards() {
    return '<div class="comments-info-grid" aria-label="Community engagement guide">' +
      '<article class="comments-info-card comments-info-card--xp"><h3>XP For Engagement</h3><p>Comments, likes and citations earn you XP.</p><ul><li>Comment = 10 XP</li><li>Like = 5 XP</li><li>Citation = 15 XP</li></ul></article>' +
      '<article class="comments-info-card comments-info-card--cite"><h3>Cite To Earn</h3><p>Cite facts and sources to boost credibility and XP.</p><ul><li>Add credible source</li><li>Help verify the archive</li><li>Earn more XP</li></ul></article>' +
      '<article class="comments-info-card comments-info-card--quality"><h3>Quality Matters</h3><p>High quality comments rise to the top.</p><ul><li>Helpful</li><li>Accurate</li><li>Respectful</li></ul></article>' +
      '<article class="comments-info-card comments-info-card--community"><h3>Real Community</h3><p>Real GKniftyHEADS. Real knowledge. Real culture.</p><ul><li>Build the archive</li><li>Help others</li><li>Grow together</li></ul></article>' +
    '</div>';
  }

  // ── Avatar URL resolution (priority: avatar_url → Gravatar → identicon) ──

  function resolveAvatar(comment, size) {
    if (comment.avatar_url) return esc(comment.avatar_url);
    var hash = comment.email_hash || '0';
    return 'https://www.gravatar.com/avatar/' + esc(hash) + '?d=identicon&s=' + (size || 40);
  }

  // ── Comment list renderer ────────────────────────────────────

  function renderComments(listEl, comments) {
    if (!comments || !comments.length) {
      listEl.innerHTML = '<div class="comments-empty">No comments yet — drop your knowledge! 🧠</div>';
      return;
    }
    listEl.innerHTML = comments.map(function (c) {
      var tgBadge = c.telegram_username
        ? '<span class="comment-tg">@' + esc(c.telegram_username) + '</span>'
        : '';
      var discordBadge = c.discord_username
        ? '<span class="comment-discord">' + esc(c.discord_username) + '</span>'
        : '';
      return '<div class="comment-item">' +
        '<img class="comment-avatar" src="' + resolveAvatar(c, 40) + '" alt="' + esc(c.name) + '" loading="lazy">' +
        '<div class="comment-body">' +
          '<div class="comment-header">' +
            '<span class="comment-name">' + esc(c.name) + '</span>' +
            tgBadge +
            discordBadge +
          '</div>' +
          '<div class="comment-text">' + esc(c.text) + '</div>' +
          '<div class="comment-actions">' +
            '<button class="comment-vote-btn" data-comment-id="' + esc(c.id) + '" data-vote="up" aria-label="Upvote">👍 ' + (parseInt(c.votes_up, 10) || 0) + '</button>' +
            '<button class="comment-vote-btn" data-comment-id="' + esc(c.id) + '" data-vote="down" aria-label="Downvote">👎 ' + (parseInt(c.votes_down, 10) || 0) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Submit form builder ──────────────────────────────────────

  function buildForm(pageId) {
    return '<form class="comment-form" data-page-id="' + pageId + '" novalidate>' +
      '<div class="comment-form-identity">' +
        '<div class="comment-form-field">' +
          '<label for="cm-name-' + pageId + '">Name / Handle <span class="cm-required">*</span></label>' +
          '<input type="text" id="cm-name-' + pageId + '" name="name" placeholder="Your display name" maxlength="60" required autocomplete="nickname">' +
          '<span class="cm-field-helper" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-email-' + pageId + '">Email <span class="cm-required">*</span> <span class="cm-note">(Gravatar avatar, never displayed)</span></label>' +
          '<input type="email" id="cm-email-' + pageId + '" name="email" placeholder="you@email.com" maxlength="120" required autocomplete="email">' +
          '<span class="cm-gravatar-status">Gravatar used for avatar. Email never displayed.</span>' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-tg-' + pageId + '">Telegram <span class="cm-note">(optional)</span></label>' +
          '<input type="text" id="cm-tg-' + pageId + '" name="telegram_username" placeholder="Telegram username" maxlength="60">' +
          '<span class="cm-field-helper" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-discord-' + pageId + '">Discord <span class="cm-note">(optional)</span></label>' +
          '<input type="text" id="cm-discord-' + pageId + '" name="discord_username" placeholder="@username" maxlength="60">' +
          '<span class="cm-field-helper" aria-hidden="true"></span>' +
        '</div>' +
      '</div>' +
      '<input type="hidden" name="avatar_url" value="">' +
      '<div class="comments-dashboard-grid">' +
        '<div class="comments-main-stack">' +
          '<div class="comments-link-grid">' +
            buildTelegramIdentityCard(pageId) +
            buildTelegramBenefitsCard() +
          '</div>' +
          '<div class="comment-form-field comment-form-field--take">' +
            '<label for="cm-text-' + pageId + '">Your Take <span class="cm-required">*</span></label>' +
            '<textarea id="cm-text-' + pageId + '" name="text" rows="5" maxlength="2000" placeholder="HODL or NGMI? Drop your knowledge..." required></textarea>' +
            '<span class="comment-character-counter">0 / 2000</span>' +
          '</div>' +
          '<div class="comment-form-footer">' +
            '<span class="comment-form-note">Drop facts. Share alpha. Help level up the archive.</span>' +
            '<button type="submit" class="swarmsy-form-button">Post Comment</button>' +
          '</div>' +
        '</div>' +
        buildTopContributorsHTML() +
      '</div>' +
      '<div class="comment-form-status" role="status" aria-live="polite"></div>' +
      buildInfoCards() +
    '</form>';
  }

  function wireForm(container, pageId) {
    var form     = container.querySelector('.comment-form');
    if (!form) return;
    var textEl = form.querySelector('[name=text]');
    var counterEl = form.querySelector('.comment-character-counter');
    var updateCounter = function () {
      if (!textEl || !counterEl) return;
      counterEl.textContent = String(textEl.value || '').length + ' / ' + (textEl.getAttribute('maxlength') || '2000');
    };
    applyCommentProfile(form);
    applyLinkedTelegramIdentity(form);
    updateCommentIdentityCopy(form);
    updateCounter();
    var gate = getIdentityGate();
    if (gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked() && typeof gate.getFreshTelegramAuth === 'function') {
      Promise.resolve(gate.getFreshTelegramAuth())
        .then(function (auth) {
          if (!auth) return;
          fillIfEmpty(form, 'telegram_username', cleanTelegramUsername(auth.username));
          fillIfEmpty(form, 'avatar_url', auth.photo_url || '');
          updateCommentIdentityCopy(form);
        })
        .catch(function () {});
    }

    Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) {
      input.addEventListener('input', function () {
        updateCommentIdentityCopy(form);
      });
    });
    if (textEl) textEl.addEventListener('input', updateCounter);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status  = form.querySelector('.comment-form-status');
      var name    = form.querySelector('[name=name]').value.trim();
      var email   = form.querySelector('[name=email]').value.trim();
      var tg      = cleanTelegramUsername(form.querySelector('[name=telegram_username]').value);
      var discord = form.querySelector('[name=discord_username]').value.trim();
      var avatar  = (form.querySelector('[name=avatar_url]') || {}).value || '';
      avatar      = avatar.trim();
      var text    = form.querySelector('[name=text]').value.trim();

      if (!name || !text) {
        status.textContent = 'Name and comment are required.';
        status.className   = 'comment-form-status cm-error';
        return;
      }

      if (!BASE || !FEATURES.COMMENTS) {
        status.textContent = '\u23f3 ' + COPY.FEATURE_UNAVAILABLE;
        status.className   = 'comment-form-status cm-loading';
        return;
      }

      status.textContent = 'Posting...';
      status.className   = 'comment-form-status cm-loading';

      var payload = { page_id: pageId, name: name, text: text };
      if (email)   payload.email = email;
      if (tg)      payload.telegram_username = tg;
      if (discord) payload.discord_username  = discord;
      if (avatar)  payload.avatar_url        = avatar;

      Promise.resolve(getFreshTelegramAuth())
        .then(function (telegramAuth) {
          if (!email && !telegramAuth) {
            status.textContent = 'Email required for Gravatar avatar, never displayed.';
            status.className   = 'comment-form-status cm-error';
            throw { error: 'email_required' };
          }
          saveCommentProfile({
            name: name,
            email: email,
            telegram_username: tg,
            discord_username: discord,
            avatar_url: avatar,
          });
          if (telegramAuth) payload.telegram_auth = telegramAuth;
          return fetch(BASE + '/comments', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });
        })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (d) { throw d; }); })
        .then(function (data) {
          var moderation = data && data.moderation ? String(data.moderation) : 'pending';
          status.textContent = (data && data.message) || (
            moderation === 'approved'
              ? 'Comment posted.'
              : moderation === 'rejected'
                ? 'Comment could not be published.'
                : 'Comment received and awaiting automated review.'
          );
          status.className = moderation === 'rejected'
            ? 'comment-form-status cm-error'
            : 'comment-form-status cm-success';
          document.dispatchEvent(new CustomEvent('moonboys:comment-posted', {
            detail: { page_id: pageId, comment_id: data && data.comment_id, mission: data && data.mission ? data.mission : null }
          }));
          form.reset();
          applyCommentProfile(form);
          applyLinkedTelegramIdentity(form);
          updateCommentIdentityCopy(form);
          updateCounter();
          if (moderation === 'approved') {
            var listEl = container.querySelector('#comments-list-' + pageId);
            if (listEl) loadComments(pageId, listEl);
          }
        })
        .catch(function (err) {
          if (err && err.error === 'email_required') return;
          var msg = (err && err.message) ? err.message : 'Submission failed. Try again.';
          status.textContent = 'Warning: ' + msg;
          status.className   = 'comment-form-status cm-error';
        });
    });
  }

  // Telegram identity state. The comment form avoids embedding the Telegram
  // Login Widget because domain errors can leak a broken widget message into
  // the page. Rewards still use the shared /gklink identity-gate path.

  function injectTelegramWidget(container) {
    var widgetSlot = container.querySelector('.cm-tg-login');
    var form = container.querySelector('.comment-form');
    var statusEl = container.querySelector('.cm-tg-status');
    if (!widgetSlot) return;
    var linked = form ? applyLinkedTelegramIdentity(form) : getLinkedTelegramProfile();
    if (linked) {
      widgetSlot.innerHTML = '';
      if (statusEl) {
        statusEl.textContent = 'Telegram linked: ' + (linked.name || linked.telegram_username || 'connected') + '. Email optional — Telegram identity will be used.';
        statusEl.className = 'cm-tg-status cm-success';
      }
      return;
    }
    if (statusEl) {
      var gate = getIdentityGate();
      var hasTelegramId = !!(gate && typeof gate.getTelegramId === 'function' && gate.getTelegramId());
      statusEl.textContent = hasTelegramId
        ? 'Run /gklink to activate rewards.'
        : 'Telegram quick-fill unavailable. Link through the Incubator Hub /gklink flow.';
      statusEl.className = hasTelegramId ? 'cm-tg-status cm-warning' : 'cm-tg-status';
    }
    widgetSlot.innerHTML = '';
  }

  // ── Vote button delegation ───────────────────────────────────
  // Comment voting is a competitive action — requires Telegram sync.
  // Comment *posting* (Gravatar email flow) remains open to all.

  function wireVotes(container) {
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.comment-vote-btn');
      if (!btn || !BASE || btn.disabled) return;

      var gate = window.MOONBOYS_IDENTITY;
      var doVote = function () {
        var cid  = btn.dataset.commentId;
        var vote = btn.dataset.vote;
        btn.disabled = true;
        var payload = { vote: vote };
        if (gate) {
          var tid = gate.getTelegramId();
          if (tid) payload.telegram_id = tid;
        }
        fetch(BASE + '/comments/' + cid + '/vote', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
          .then(function (r) {
            if (r.status === 403) {
              return r.json().then(function (d) {
                if (d.error === 'telegram_sync_required' && gate && gate.showSyncGateModal) {
                  gate.showSyncGateModal();
                }
                btn.disabled = false;
                throw d;
              });
            }
            // Successful vote — button stays disabled to prevent double-voting
          })
          .catch(function (err) {
            // Re-enable for network/server errors only; keep disabled for sync gate
            if (!err || err.error !== 'telegram_sync_required') btn.disabled = false;
          });
      };

      if (gate && gate.requireLinkedAccount) {
        gate.requireLinkedAccount(doVote);
      } else {
        doVote();
      }
    });
  }

  // ── Section initialiser ──────────────────────────────────────

  function loadComments(pageId, listEl) {
    listEl.innerHTML = '<div class="comments-loading">Loading comments\u2026</div>';
    return fetch(BASE + '/comments?page_id=' + encodeURIComponent(pageId) + '&limit=20')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data) {
          renderComments(listEl, data.comments || []);
        } else {
          listEl.innerHTML = '<div class="comments-error">' + COPY.API_UNAVAILABLE + ' \u2014 could not load comments.</div>';
        }
      })
      .catch(function () {
        listEl.innerHTML = '<div class="comments-error">' + COPY.API_UNAVAILABLE + ' \u2014 could not load comments.</div>';
      });
  }

  function wireTopContributors(container) {
    var card = container.querySelector('.comments-top-contributors');
    if (!card) return;
    var list = card.querySelector('.top-contributor-list');
    var tabs = Array.prototype.slice.call(card.querySelectorAll('.top-contributor-tab'));
    var data = getContributorData();
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var period = tab.getAttribute('data-period') || 'week';
        var rows = data[period] || data.week;
        tabs.forEach(function (other) {
          var active = other === tab;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (list) {
          list.setAttribute('data-period', period);
          list.innerHTML = contributorRows(rows);
        }
      });
    });
  }

  function initSection(el) {
    var pageId = el.dataset.pageId ||
      document.location.pathname.split('/').pop().replace(/\.html$/, '');

    // Always render empty state initially; real data loaded below if API is live
    var listPlaceholder = '<div class="comments-empty">No comments yet — drop your knowledge! 🧠</div>';

    el.innerHTML =
      '<section class="comments-section comments-battle-dashboard" aria-labelledby="comments-battle-title">' +
        '<header class="comments-battle-header">' +
          '<div>' +
            '<h2 id="comments-battle-title" class="comments-heading">Comments &amp; Battle Layer</h2>' +
            '<p class="comments-battle-subtitle">Share knowledge. Earn XP. Build the archive.</p>' +
          '</div>' +
        '</header>' +
        buildForm(pageId) +
        '<div class="comments-list-panel">' +
          '<h3>Latest Collector Notes</h3>' +
          '<div class="comments-list" id="comments-list-' + pageId + '">' + listPlaceholder + '</div>' +
        '</div>' +
      '</section>';

    wireForm(el, pageId);
    wireVotes(el);
    wireTopContributors(el);
    injectTelegramWidget(el);

    if (!BASE || !FEATURES.COMMENTS) return;

    var listEl = el.querySelector('#comments-list-' + pageId);
    loadComments(pageId, listEl);
  }

  // ── Boot ─────────────────────────────────────────────────────

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.wiki-comments'), initSection);
  }

  // Expose for battle-layer.js to call after dynamically injecting a container
  window.MOONBOYS_COMMENTS = { initSection: initSection };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
