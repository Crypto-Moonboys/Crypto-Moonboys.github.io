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

  // ── Gravatar ─────────────────────────────────────────────────

  function avatarUrl(hash, size) {
    return 'https://www.gravatar.com/avatar/' + (hash || '0') +
           '?d=identicon&s=' + (size || 40);
  }

  // ── Comment list renderer ────────────────────────────────────

  function renderComments(listEl, comments) {
    if (!comments || !comments.length) {
      listEl.innerHTML = '<div class="comments-empty">No comments yet — drop your knowledge! 🧠</div>';
      return;
    }
    listEl.innerHTML = comments.map(function (c) {
      var tgBadge = c.telegram_username
        ? '<span class="comment-tg">@' + c.telegram_username + '</span>'
        : '';
      return '<div class="comment-item">' +
        '<img class="comment-avatar" src="' + avatarUrl(c.email_hash, 40) + '" alt="' + c.name + '" loading="lazy">' +
        '<div class="comment-body">' +
          '<div class="comment-header">' +
            '<span class="comment-name">' + c.name + '</span>' +
            tgBadge +
            '<span class="comment-time">' + (c.time_ago || '') + '</span>' +
          '</div>' +
          '<div class="comment-text">' + c.text + '</div>' +
          '<div class="comment-actions">' +
            '<button class="comment-vote-btn" data-comment-id="' + c.id + '" data-vote="up" aria-label="Upvote">👍 ' + (c.votes_up || 0) + '</button>' +
            '<button class="comment-vote-btn" data-comment-id="' + c.id + '" data-vote="down" aria-label="Downvote">👎 ' + (c.votes_down || 0) + '</button>' +
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
          '<label for="cm-email-' + pageId + '">Email <span class="cm-note">(Gravatar only, never displayed)</span></label>' +
          '<input type="email" id="cm-email-' + pageId + '" name="email" placeholder="you@example.com" maxlength="120" autocomplete="email">' +
        '</div>' +
        '<div class="comment-form-field">' +
          '<label for="cm-tg-' + pageId + '">Telegram <span class="cm-note">(optional)</span></label>' +
          '<input type="text" id="cm-tg-' + pageId + '" name="telegram_username" placeholder="@yourhandle" maxlength="60">' +
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
      var status = form.querySelector('.comment-form-status');
      var name   = form.querySelector('[name=name]').value.trim();
      var email  = form.querySelector('[name=email]').value.trim();
      var tg     = form.querySelector('[name=telegram_username]').value.trim();
      var text   = form.querySelector('[name=text]').value.trim();

      if (!name || !text) {
        status.textContent = '⚠️ Name and comment are required.';
        status.className   = 'comment-form-status cm-error';
        return;
      }

      if (!BASE || !FEATURES.COMMENTS) {
        status.textContent = '⚠️ Comments API not configured. Set MOONBOYS_API.BASE_URL in js/api-config.js.';
        status.className   = 'comment-form-status cm-error';
        return;
      }

      status.textContent = 'Posting…';
      status.className   = 'comment-form-status cm-loading';

      var payload = { page_id: pageId, name: name, text: text };
      if (email)  payload.email             = email;
      if (tg)     payload.telegram_username = tg;

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

    var apiNotice = BASE
      ? '<div class="comments-loading">Loading comments…</div>'
      : '<div class="comments-api-notice">💡 Comments require an external API. ' +
          'Configure <code>MOONBOYS_API.BASE_URL</code> in <code>js/api-config.js</code>.</div>';

    el.innerHTML =
      '<section class="comments-section" aria-label="Comments">' +
        '<h2 class="comments-heading">💬 Comments &amp; Battle Layer</h2>' +
        '<div class="comments-list" id="comments-list-' + pageId + '">' + apiNotice + '</div>' +
        buildForm(pageId) +
      '</section>';

    wireForm(el, pageId);
    wireVotes(el);

    if (!BASE || !FEATURES.COMMENTS) return;

    var listEl = el.querySelector('#comments-list-' + pageId);

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
    document.querySelectorAll('.wiki-comments').forEach(initSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
