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

  // ── HTML escape (prevents XSS when API data is rendered via innerHTML) ──

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
            '<span class="comment-time">' + esc(c.time_ago || '') + '</span>' +
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
          '<input type="text" id="cm-name-' + pageId + '" name="name" placeholder="CryptoMoonboy" maxlength="60" required autocomplete="nickname">' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-email-' + pageId + '">Email <span class="cm-required">*</span> <span class="cm-note">(Gravatar avatar, never displayed)</span></label>' +
          '<input type="email" id="cm-email-' + pageId + '" name="email" placeholder="you@example.com" maxlength="120" required autocomplete="email">' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-tg-' + pageId + '">Telegram <span class="cm-note">(optional)</span></label>' +
          '<input type="text" id="cm-tg-' + pageId + '" name="telegram_username" placeholder="@yourhandle" maxlength="60">' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-discord-' + pageId + '">Discord <span class="cm-note">(optional)</span></label>' +
          '<input type="text" id="cm-discord-' + pageId + '" name="discord_username" placeholder="@username" maxlength="60">' +
        '</div>' +
      '</div>' +
      '<div class="comment-form-field">' +
        '<label for="cm-text-' + pageId + '">Your take <span class="cm-required">*</span></label>' +
        '<textarea id="cm-text-' + pageId + '" name="text" rows="3" maxlength="1000" placeholder="HODL or NGMI? Drop your knowledge…" required></textarea>' +
      '</div>' +
      '<div class="comment-form-footer">' +
        '<span class="comment-form-note">💡 Gravatar used for avatar. <a href="https://gravatar.com" target="_blank" rel="noopener noreferrer">Set yours up.</a></span>' +
        '<button type="submit" class="btn btn-primary">Post Comment</button>' +
      '</div>' +
      '<div class="comment-form-status" role="status" aria-live="polite"></div>' +
    '</form>';
  }

  // ── Form submit handler ──────────────────────────────────────

  function wireForm(container, pageId) {
    var form     = container.querySelector('.comment-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status  = form.querySelector('.comment-form-status');
      var name    = form.querySelector('[name=name]').value.trim();
      var email   = form.querySelector('[name=email]').value.trim();
      var tg      = form.querySelector('[name=telegram_username]').value.trim();
      var discord = form.querySelector('[name=discord_username]').value.trim();
      var text    = form.querySelector('[name=text]').value.trim();

      if (!name || !text) {
        status.textContent = '⚠️ Name and comment are required.';
        status.className   = 'comment-form-status cm-error';
        return;
      }
      if (!email) {
        status.textContent = '⚠️ Email is required (used for Gravatar avatar only).';
        status.className   = 'comment-form-status cm-error';
        return;
      }

      if (!BASE || !FEATURES.COMMENTS) {
        status.textContent = '⏳ Community comments are coming soon — backend not yet live.';
        status.className   = 'comment-form-status cm-loading';
        return;
      }

      status.textContent = 'Posting…';
      status.className   = 'comment-form-status cm-loading';

      var payload = { page_id: pageId, name: name, email: email, text: text };
      if (tg)      payload.telegram_username = tg;
      if (discord) payload.discord_username  = discord;

      fetch(BASE + '/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (d) { throw d; }); })
        .then(function () {
          status.textContent = '✅ Comment posted! It will appear after moderation.';
          status.className   = 'comment-form-status cm-success';
          form.reset();
        })
        .catch(function (err) {
          var msg = (err && err.message) ? err.message : 'Submission failed. Try again.';
          status.textContent = '⚠️ ' + msg;
          status.className   = 'comment-form-status cm-error';
        });
    });
  }

  // ── Vote button delegation ───────────────────────────────────

  function wireVotes(container) {
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.comment-vote-btn');
      if (!btn || !BASE || btn.disabled) return;
      var cid  = btn.dataset.commentId;
      var vote = btn.dataset.vote;
      btn.disabled = true;
      fetch(BASE + '/comments/' + cid + '/vote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ vote: vote }),
      }).catch(function () { btn.disabled = false; });
    });
  }

  // ── Section initialiser ──────────────────────────────────────

  function initSection(el) {
    var pageId = el.dataset.pageId ||
      document.location.pathname.split('/').pop().replace(/\.html$/, '');

    // Always render empty state initially; real data loaded below if API is live
    var listPlaceholder = '<div class="comments-empty">No comments yet — drop your knowledge! 🧠</div>';

    el.innerHTML =
      '<section class="comments-section" aria-label="Comments">' +
        '<h2 class="comments-heading">💬 Comments &amp; Battle Layer</h2>' +
        '<div class="comments-list" id="comments-list-' + pageId + '">' + listPlaceholder + '</div>' +
        buildForm(pageId) +
      '</section>';

    wireForm(el, pageId);
    wireVotes(el);

    if (!BASE || !FEATURES.COMMENTS) return;

    var listEl = el.querySelector('#comments-list-' + pageId);
    listEl.innerHTML = '<div class="comments-loading">Loading comments…</div>';

    fetch(BASE + '/comments?page_id=' + encodeURIComponent(pageId) + '&limit=20')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data) {
          renderComments(listEl, data.comments || []);
        } else {
          listEl.innerHTML = '<div class="comments-error">Could not load comments.</div>';
        }
      })
      .catch(function () {
        listEl.innerHTML = '<div class="comments-error">Could not load comments.</div>';
      });
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
