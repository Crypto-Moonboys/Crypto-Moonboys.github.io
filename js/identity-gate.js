/**
 * Crypto Moonboys Wiki — Identity Gate
 * ======================================
 * Manages the four-tier identity model for competitive participation:
 *
 *   guest           — browse + casual local game play only; no leaderboard submission
 *   gravatar        — can post comments (email/Gravatar only); no votes, no XP
 *   telegram        — identified via Telegram auth; not yet competition-active
 *   telegram_linked — Telegram auth + bot link completed; fully competition-active
 *                     (Battle Chamber, community XP, voting, seasonal leaderboard)
 *
 * IMPORTANT: completing the bot link flow is the required final activation step for
 * full competitive participation. Raw Telegram presence alone is NOT enough.
 *
 * Sync model
 * ----------
 *   Step 1 — Telegram auth                               → tier becomes 'telegram'
 *   Step 2 — /gkstart → /gklink → click one-time link   → tier becomes 'telegram_linked'
 *            (the bot sends a link that opens community.html?gklink=… and finishes activation)
 *
 * Usage
 * -----
 *   window.MOONBOYS_IDENTITY.requireTelegramSync(fn);   // gate on Telegram auth (Step 1)
 *   window.MOONBOYS_IDENTITY.requireLinkedAccount(fn);  // gate on bot link (Step 2, competition)
 *   window.MOONBOYS_IDENTITY.saveTelegramIdentity(id, name);
 *   window.MOONBOYS_IDENTITY.setTelegramLinked();       // call after bot link completes
 *   window.MOONBOYS_IDENTITY.isTelegramLinked();        // → boolean
 *   window.MOONBOYS_IDENTITY.getTelegramId();           // → string | null
 *   window.MOONBOYS_IDENTITY.getIdentityTier();         // → 'guest'|'telegram'|'telegram_linked'
 *
 * localStorage keys
 * -----------------
 *   moonboys_tg_id     — verified Telegram numeric ID (string)
 *   moonboys_tg_name   — Telegram display name
 *   moonboys_tg_linked — '1' when bot link has been completed (competition-active)
 *
 * Include this script before any engagement JS (engagement.js, comments.js,
 * battle-layer.js, leaderboard-client.js) on every page that has competitive
 * actions.
 */
(function () {
  'use strict';

  var LS_TG_ID     = 'moonboys_tg_id';
  var LS_TG_NAME   = 'moonboys_tg_name';
  var LS_TG_LINKED = 'moonboys_tg_linked';
  var MODAL_ID     = 'tg-sync-gate-modal';
  var STYLE_ID     = 'tg-sync-gate-styles';

  // ── localStorage helpers ────────────────────────────────────

  function lsGet(key) {
    try { return localStorage.getItem(key) || null; } catch { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }

  // ── Public API ───────────────────────────────────────────────

  function getTelegramId() {
    return lsGet(LS_TG_ID);
  }

  function getTelegramName() {
    return lsGet(LS_TG_NAME);
  }

  /**
   * Returns true when both Telegram auth (Step 1) AND the bot link flow (Step 2) are complete.
   * Only a linked account is fully competition-active.
   */
  function isTelegramLinked() {
    return !!(lsGet(LS_TG_ID) && lsGet(LS_TG_LINKED));
  }

  /**
   * Mark the current Telegram identity as bot-link-completed (competition-active).
   * Call this after the /gklink flow succeeds (e.g. redirect from community.html?gklink=…).
   */
  function setTelegramLinked() {
    if (getTelegramId()) lsSet(LS_TG_LINKED, '1');
  }

  /**
   * Persist a verified Telegram identity after a successful /telegram/auth flow.
   * Called by comments.js after the Telegram Login Widget callback succeeds.
   */
  function saveTelegramIdentity(telegramId, displayName) {
    if (telegramId) lsSet(LS_TG_ID, telegramId);
    if (displayName) lsSet(LS_TG_NAME, displayName);
  }

  /**
   * Determine the current user's identity tier:
   *   'telegram_linked' — Telegram auth completed AND bot link completed (competition-active)
   *   'telegram'        — Telegram auth only; identified but NOT yet competition-active
   *   'guest'           — anonymous; browsing and local gameplay only
   *
   * Note: Gravatar accounts (email-only commenters) are treated as 'guest' here
   * because there is no localStorage token for Gravatar identity. Gravatar users
   * can still post comments via the comment form.
   *
   * Full competitive actions (leaderboard scores, likes, votes, faction, XP) require
   * 'telegram_linked'. Basic Telegram auth ('telegram') grants identity but NOT
   * competition-active status until the bot link flow is completed.
   */
  function getIdentityTier() {
    if (isTelegramLinked()) return 'telegram_linked';
    if (getTelegramId())    return 'telegram';
    return 'guest';
  }

  /**
   * Gate a basic Telegram-identified action (e.g. comments, reading private content).
   * Requires Step 1 (Telegram auth) only.
   * If the user has a Telegram ID, calls onAllowed() immediately.
   * Otherwise opens the sync gate modal.
   */
  function requireTelegramSync(onAllowed) {
    if (getTelegramId()) {
      onAllowed();
    } else {
      showSyncGateModal(false);
    }
  }

  /**
   * Gate a fully competitive action (leaderboard scores, votes, likes, faction, XP).
   * Requires BOTH Step 1 (Telegram auth) AND Step 2 (bot link completed).
   * If the user is linked, calls onAllowed() immediately.
   * Otherwise opens the sync gate modal with bot activation instructions.
   */
  function requireLinkedAccount(onAllowed) {
    if (isTelegramLinked()) {
      onAllowed();
    } else {
      showSyncGateModal(true);
    }
  }

  // ── Sync gate modal ─────────────────────────────────────────

  var BOT_URL = 'https://t.me/WIKICOMSBOT';

  function getBotUrl() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.BOT_URL || BOT_URL;
  }

  function getSyncGateUrl() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.SYNC_GATE_URL || 'https://crypto-moonboys.github.io/gkniftyheads-incubator.html';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.tg-sync-gate-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);',
        'z-index:9999;align-items:center;justify-content:center;padding:16px}',
      '.tg-sync-gate-box{background:#0d0d16;border:1px solid #2a2a4a;border-radius:12px;',
        'padding:32px 24px;max-width:420px;width:100%;text-align:center;',
        'position:relative;color:#e0e0ff;box-shadow:0 8px 40px rgba(0,0,0,.7)}',
      '.tg-sync-gate-close{position:absolute;top:12px;right:12px;background:transparent;',
        'border:none;color:#888;cursor:pointer;font-size:18px;line-height:1;padding:4px 8px;',
        'border-radius:4px}',
      '.tg-sync-gate-close:hover{color:#fff;background:#1a1a2e}',
      '.tg-sync-gate-icon{font-size:48px;margin-bottom:12px;line-height:1}',
      '.tg-sync-gate-title{font-size:20px;font-weight:700;margin:0 0 12px;color:#fff}',
      '.tg-sync-gate-body{font-size:14px;line-height:1.6;color:#a0a0c0;margin:0 0 20px}',
      '.tg-sync-gate-btn{display:inline-block;background:#3d5afe;color:#fff;',
        'text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;',
        'font-size:14px;margin-bottom:16px;transition:background .2s}',
      '.tg-sync-gate-btn:hover{background:#5c77ff;color:#fff}',
      '.tg-sync-gate-secondary{display:block;font-size:12px;color:#666;',
        'text-decoration:underline;margin-bottom:12px}',
      '.tg-sync-gate-secondary:hover{color:#999}',
      '.tg-sync-gate-note{font-size:12px;color:#555;margin:0;line-height:1.5}',
    ].join('');
    (document.head || document.body).appendChild(style);
  }

  function injectModal() {
    if (document.getElementById(MODAL_ID)) return;
    injectStyles();
    var div = document.createElement('div');
    div.id = MODAL_ID;
    div.className = 'tg-sync-gate-overlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Telegram sync required');
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML =
      '<div class="tg-sync-gate-box">' +
        '<button class="tg-sync-gate-close" aria-label="Close">✕</button>' +
        '<div class="tg-sync-gate-icon" aria-hidden="true">🔐</div>' +
        '<h2 class="tg-sync-gate-title" id="tg-gate-title">Battle Chamber Sync Required</h2>' +
        '<p class="tg-sync-gate-body" id="tg-gate-body"></p>' +
        '<a href="' + getBotUrl() + '" class="tg-sync-gate-btn" ' +
           'target="_blank" rel="noopener noreferrer" id="tg-gate-btn">Open @WIKICOMSBOT →</a>' +
        '<a href="' + getSyncGateUrl() + '" class="tg-sync-gate-secondary" ' +
           'target="_blank" rel="noopener noreferrer" id="tg-gate-secondary">View incubator info page</a>' +
        '<p class="tg-sync-gate-note" id="tg-gate-note"></p>' +
      '</div>';
    document.body.appendChild(div);
    div.querySelector('.tg-sync-gate-close').addEventListener('click', dismissSyncGateModal);
    div.addEventListener('click', function (e) {
      if (e.target === div) dismissSyncGateModal();
    });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dismissSyncGateModal();
    });
  }

  function showSyncGateModal(needsLink) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { showSyncGateModal(needsLink); });
      return;
    }
    injectModal();
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    var hasTg = !!getTelegramId();

    // Determine which message to show based on state + what is needed
    var title, body, note;

    if (needsLink && hasTg) {
      // Has Telegram auth but hasn't completed the bot link — needs Step 2
      title = 'Battle Chamber Sync Required';
      body  =
        'Your Telegram identity is connected, but full competitive activation ' +
        'must be completed via the bot. The website cannot finish this step on its own — ' +
        'the bot generates a one-time link that completes activation.' +
        '<br><br>' +
        '<strong>1.</strong> Open <strong>@WIKICOMSBOT</strong> on Telegram<br>' +
        '<strong>2.</strong> Run <strong>/gkstart</strong><br>' +
        '<strong>3.</strong> Run <strong>/gklink</strong><br>' +
        '<strong>4.</strong> Click the one-time link the bot sends';
      note  = 'Gravatar accounts can still post comments.';
    } else if (!hasTg) {
      // No Telegram at all — needs both steps
      title = 'Battle Chamber Sync Required';
      body  =
        'This action requires a linked Telegram identity. ' +
        'The bot generates a one-time link that activates your account — ' +
        'the website cannot complete this step by itself.' +
        '<br><br>' +
        '<strong>1.</strong> Open <strong>@WIKICOMSBOT</strong> on Telegram<br>' +
        '<strong>2.</strong> Run <strong>/gkstart</strong><br>' +
        '<strong>3.</strong> Run <strong>/gklink</strong><br>' +
        '<strong>4.</strong> Click the one-time link the bot sends' +
        '<br><br>' +
        'The link opens <em>community.html?gklink=…</em> and finishes activation.';
      note  = 'Gravatar accounts can still post comments.';
    } else {
      // Fallback: has Telegram, needs link
      title = 'Activate Competition Access';
      body  =
        'Open <strong>@WIKICOMSBOT</strong>, run <strong>/gkstart</strong> then ' +
        '<strong>/gklink</strong>, and click the one-time link the bot sends to unlock ' +
        'Battle Chamber, leaderboard, and seasonal scoring.';
      note  = 'Gravatar accounts can still post comments.';
    }

    var titleEl     = document.getElementById('tg-gate-title');
    var bodyEl      = document.getElementById('tg-gate-body');
    var noteEl      = document.getElementById('tg-gate-note');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl)  bodyEl.innerHTML    = body;
    if (noteEl)  noteEl.innerHTML    = note;

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    var closeBtn = modal.querySelector('.tg-sync-gate-close');
    if (closeBtn) closeBtn.focus();
  }

  function dismissSyncGateModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // ── Expose public API ────────────────────────────────────────

  window.MOONBOYS_IDENTITY = {
    /**
     * Identity tier: 'guest' | 'telegram' | 'telegram_linked'
     *   guest           — no Telegram auth
     *   telegram        — Telegram auth only (Step 1 complete); NOT competition-active
     *   telegram_linked — Telegram auth + bot link complete (Step 2 done); fully competition-active
     */
    getIdentityTier:      getIdentityTier,
    /** Verified Telegram ID (string) or null */
    getTelegramId:        getTelegramId,
    /** Telegram display name or null */
    getTelegramName:      getTelegramName,
    /** Whether the bot link flow has been completed (competition-active) */
    isTelegramLinked:     isTelegramLinked,
    /** Mark bot link as completed (call after successful /gklink one-time link flow) */
    setTelegramLinked:    setTelegramLinked,
    /** Persist after a successful /telegram/auth round-trip (Step 1) */
    saveTelegramIdentity: saveTelegramIdentity,
    /**
     * Gate on Telegram auth (Step 1 only): calls onAllowed() if user has Telegram ID,
     * otherwise shows the sync gate modal explaining both steps.
     */
    requireTelegramSync:  requireTelegramSync,
    /**
     * Gate on full competition activation (Step 1 + Step 2):
     * requires BOTH Telegram auth AND bot link completion (/gkstart → /gklink → one-time link).
     * Use this for leaderboard scores, votes, likes, faction, XP.
     */
    requireLinkedAccount: requireLinkedAccount,
    showSyncGateModal:    showSyncGateModal,
    dismissSyncGateModal: dismissSyncGateModal,
  };

}());
