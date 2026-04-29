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
 * Identity tiers (enforced by backend + this file):
 *   guest           — button renders but action blocked (sync gate modal shown)
 *   gravatar        — same as guest for competitive actions
 *   telegram_linked — Telegram auth + /gklink completed; full access
 *
 * Usage — Page like button:
 *   <div class="page-like-widget" data-page-id="article-slug"></div>
 *
 * Usage — Citation vote (inline, inside .citations-list):
 *   <span class="cite-vote" data-cite-id="1" data-page-id="article-slug"></span>
 *
 * Include this script after identity-gate.js and wiki.js on pages that need it.
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

  // ── Identity helpers ─────────────────────────────────────────

  function getGate() { return window.MOONBOYS_IDENTITY || null; }

  function getTelegramId() {
    var gate = getGate();
    return gate ? gate.getTelegramId() : null;
  }

  /**
   * Gate a competitive action (likes, citation votes).
   * Requires BOTH Step 1 (Telegram auth) AND Step 2 (/gklink completed).
   * Falls through if identity-gate.js is absent.
   */
  function withLinkedAccount(fn) {
    var gate = getGate();
    if (gate && gate.requireLinkedAccount) {
      gate.requireLinkedAccount(fn);
    } else {
      fn();
    }
  }

  /**
   * Handle a 403 telegram_sync_required response from the worker.
   * Shows the sync gate modal and re-enables the button.
   */
  function handle403(data, btn) {
    if (data && data.error === 'telegram_sync_required') {
      var gate = getGate();
      if (gate && gate.showSyncGateModal) gate.showSyncGateModal();
    }
    if (btn) btn.disabled = false;
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

    // Load current count (public read — no auth needed)
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
        statusEl.textContent = '⚠️ Likes feature not yet available.';
        return;
      }

      // Gate: competitive action requires /gklink (telegram_linked tier)
      withLinkedAccount(function () {
        btn.disabled = true;
        btn.classList.add('like-btn--pending');

        var payload = { page_id: pageId };
        var tid = getTelegramId();
        if (tid) payload.telegram_id = tid;

        fetch(BASE + '/likes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
          .then(function (r) {
            if (r.status === 403) {
              return r.json().then(function (d) {
                handle403(d, btn);
                btn.classList.remove('like-btn--pending');
                statusEl.textContent = '🔐 Telegram sync required to like pages.';
                throw d;
              });
            }
            return r.ok ? r.json() : r.json().then(function (d) { throw d; });
          })
          .then(function (data) {
            countEl.textContent  = data.count;
            btn.classList.remove('like-btn--pending');
            btn.classList.add('like-btn--active');
            statusEl.textContent = '❤️ Liked!';
          })
          .catch(function (err) {
            // telegram_sync_required: already handled by handle403 above (modal shown,
            // status text set, button re-enabled) — no further action needed here.
            if (err && err.error === 'telegram_sync_required') return;
            var msg = (err && err.message) ? err.message : 'Already liked or error.';
            statusEl.textContent = '⚠️ ' + msg;
            btn.disabled = false;
            btn.classList.remove('like-btn--pending');
          });
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

    // Load current score (public read — no auth needed)
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

        // Gate: competitive action requires /gklink (telegram_linked tier)
        withLinkedAccount(function () {
          btn.disabled = true;

          var payload = {
            page_id: pageId,
            cite_id: citeId,
            vote:    btn.dataset.action,
          };
          var tid = getTelegramId();
          if (tid) payload.telegram_id = tid;

          fetch(BASE + '/citation-votes', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          })
            .then(function (r) {
              if (r.status === 403) {
                return r.json().then(function (d) {
                  handle403(d, btn);
                  throw d;
                });
              }
              return r.ok ? r.json() : null;
            })
            .then(function (data) {
              if (data && data.score !== undefined) scoreEl.textContent = data.score;
            })
            .catch(function (err) {
              if (err && err.error !== 'telegram_sync_required') btn.disabled = false;
            });
        });
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
