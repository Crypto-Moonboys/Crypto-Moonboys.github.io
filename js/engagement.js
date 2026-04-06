/**
 * Crypto Moonboys Wiki — Engagement: Page Likes + Citation Votes
 * ===============================================================
 * Frontend controls only. All persistence requires an external API.
 * No fake storage. No pretend auth. No hardcoded state.
 *
 * Configure MOONBOYS_API.BASE_URL in js/api-config.js.
 * When BASE_URL is null or feature flags are false, controls render
 * with a clear "API not connected" notice — nothing breaks.
 *
 * Usage — Page like button:
 *   <div class="page-like-widget" data-page-id="article-slug"></div>
 *
 * Usage — Citation vote (inline, inside .citations-list):
 *   <span class="cite-vote" data-cite-id="1" data-page-id="article-slug"></span>
 *
 * Include this script after wiki.js on pages that need it.
 */
(function () {
  'use strict';

  var cfg      = window.MOONBOYS_API || {};
  var BASE     = cfg.BASE_URL || null;
  var FEATURES = cfg.FEATURES || {};

  // ── Derive page ID from URL when not supplied ────────────────

  function defaultPageId() {
    return document.location.pathname.split('/').pop().replace(/\.html$/, '') || 'home';
  }

  // ── Page Like Widget ─────────────────────────────────────────

  function initPageLike(el) {
    var pageId = el.dataset.pageId || defaultPageId();

    el.innerHTML =
      '<div class="page-like-inner">' +
        '<button class="like-btn" aria-label="Like this article" data-page-id="' + pageId + '">' +
          '<span class="like-icon" aria-hidden="true">❤️</span>' +
          '<span class="like-count" aria-live="polite">—</span>' +
        '</button>' +
        '<span class="like-label">Like this article</span>' +
        '<span class="like-status" role="status" aria-live="polite"></span>' +
      '</div>';

    var btn      = el.querySelector('.like-btn');
    var countEl  = el.querySelector('.like-count');
    var statusEl = el.querySelector('.like-status');

    // Load current count
    if (BASE && FEATURES.LIKES) {
      fetch(BASE + '/likes?page_id=' + encodeURIComponent(pageId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.count !== undefined) countEl.textContent = data.count;
        })
        .catch(function () {});
    }

    btn.addEventListener('click', function () {
      if (btn.disabled) return;

      if (!BASE || !FEATURES.LIKES) {
        statusEl.textContent = '⚠️ Likes API not connected yet.';
        return;
      }

      btn.disabled = true;
      btn.classList.add('like-btn--pending');

      fetch(BASE + '/likes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ page_id: pageId }),
      })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (d) { throw d; }); })
        .then(function (data) {
          countEl.textContent  = data.count;
          btn.classList.remove('like-btn--pending');
          btn.classList.add('like-btn--active');
          statusEl.textContent = '❤️ Liked!';
        })
        .catch(function (err) {
          var msg = (err && err.message) ? err.message : 'Already liked or error.';
          statusEl.textContent = '⚠️ ' + msg;
          btn.disabled = false;
          btn.classList.remove('like-btn--pending');
        });
    });
  }

  // ── Citation Vote Widget ─────────────────────────────────────

  function initCiteVote(el) {
    var citeId = el.dataset.citeId || '0';
    var pageId = el.dataset.pageId || defaultPageId();

    el.innerHTML =
      '<span class="cite-vote-inner">' +
        '<button class="cite-vote-btn" data-action="up" aria-label="Upvote citation ' + citeId + '">▲</button>' +
        '<span class="cite-vote-score" aria-live="polite">—</span>' +
        '<button class="cite-vote-btn" data-action="down" aria-label="Downvote citation ' + citeId + '">▼</button>' +
      '</span>';

    var scoreEl = el.querySelector('.cite-vote-score');

    // Load current score
    if (BASE && FEATURES.CITATION_VOTES) {
      fetch(BASE + '/citation-votes?page_id=' + encodeURIComponent(pageId) +
            '&cite_id=' + encodeURIComponent(citeId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.score !== undefined) scoreEl.textContent = data.score;
        })
        .catch(function () {});
    }

    Array.prototype.forEach.call(el.querySelectorAll('.cite-vote-btn'), function (btn) {
      btn.addEventListener('click', function () {
        if (!BASE || !FEATURES.CITATION_VOTES || btn.disabled) return;
        btn.disabled = true;

        fetch(BASE + '/citation-votes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            page_id: pageId,
            cite_id: citeId,
            vote:    btn.dataset.action,
          }),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && data.score !== undefined) scoreEl.textContent = data.score;
          })
          .catch(function () { btn.disabled = false; });
      });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.page-like-widget'), initPageLike);
    Array.prototype.forEach.call(document.querySelectorAll('.cite-vote'), initCiteVote);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
