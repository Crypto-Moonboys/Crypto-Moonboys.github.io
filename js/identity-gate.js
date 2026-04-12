/**
 * Crypto Moonboys Wiki — Identity Gate
 * ======================================
 * Manages the three-tier identity model for competitive participation:
 *
 *   guest        — browse + play games locally; no leaderboard submission
 *   gravatar     — can post comments (email/Gravatar only); cannot vote or earn XP
 *   telegram     — full access: Battle Chamber, community XP, voting, seasonal scores
 *
 * Provides a reusable Telegram sync gate modal that surfaces whenever an
 * unauthenticated user attempts a competitive action.  The modal links to
 * the Telegram Sync / Incubator page so users can connect their identity.
 *
 * Usage
 * -----
 *   window.MOONBOYS_IDENTITY.requireTelegramSync(function () { doCompetitiveAction(); });
 *   window.MOONBOYS_IDENTITY.saveTelegramIdentity(telegramId, displayName);
 *   window.MOONBOYS_IDENTITY.getTelegramId();   // → string | null
 *   window.MOONBOYS_IDENTITY.getIdentityTier(); // → 'guest' | 'gravatar' | 'telegram'
 *
 * localStorage keys
 * -----------------
 *   moonboys_tg_id    — verified Telegram numeric ID (string)
 *   moonboys_tg_name  — Telegram display name
 *
 * Include this script before any engagement JS (engagement.js, comments.js,
 * battle-layer.js, leaderboard-client.js) on every page that has competitive
 * actions.
 */
(function () {
  'use strict';

  var LS_TG_ID   = 'moonboys_tg_id';
  var LS_TG_NAME = 'moonboys_tg_name';
  var MODAL_ID   = 'tg-sync-gate-modal';
  var STYLE_ID   = 'tg-sync-gate-styles';

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
   * Persist a verified Telegram identity after a successful /telegram/auth flow.
   * Called by comments.js after the Telegram Login Widget callback succeeds.
   */
  function saveTelegramIdentity(telegramId, displayName) {
    if (telegramId) lsSet(LS_TG_ID, telegramId);
    if (displayName) lsSet(LS_TG_NAME, displayName);
  }

  /**
   * Determine the current user's identity tier:
   *   'telegram' — has a stored Telegram ID (verified via /telegram/auth)
   *   'guest'     — anonymous; browsing and local gameplay only
   *
   * Note: Gravatar accounts (email-only commenters) are treated as 'guest' here
   * because there is no localStorage token for Gravatar identity — the email is
   * never stored for privacy reasons. Frontend code checks getTelegramId()
   * directly for competitive gating; this function is a convenience helper.
   *
   * Competitive actions (likes, votes, faction, seasonal scores) require
   * 'telegram'.  Gravatar accounts can still post comments.
   */
  function getIdentityTier() {
    if (getTelegramId()) return 'telegram';
    return 'guest';
  }

  /**
   * Gate a competitive action behind Telegram sync.
   * If the user is synced, calls onAllowed() immediately.
   * Otherwise opens the sync gate modal.
   */
  function requireTelegramSync(onAllowed) {
    if (getTelegramId()) {
      onAllowed();
    } else {
      showSyncGateModal();
    }
  }

  // ── Sync gate modal ─────────────────────────────────────────

  function getSyncGateUrl() {
    var cfg = window.MOONBOYS_API || {};
    // SYNC_GATE_URL is set in api-config.js; defaults to the Telegram Sync / Incubator page.
    // This is the production onboarding page for linking a Telegram identity.
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
        '<h2 class="tg-sync-gate-title">Telegram Sync Required</h2>' +
        '<p class="tg-sync-gate-body">' +
          'This action is part of the competitive Battle Chamber system. ' +
          'Sync your Telegram identity to unlock voting, page likes, faction alignment, ' +
          'and seasonal leaderboard rankings.' +
        '</p>' +
        '<a href="' + getSyncGateUrl() + '" class="tg-sync-gate-btn" ' +
           'target="_blank" rel="noopener noreferrer">Sync Your Telegram Identity →</a>' +
        '<p class="tg-sync-gate-note">' +
          'Gravatar accounts can still post comments. ' +
          'Telegram sync unlocks all competitive features.' +
        '</p>' +
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

  function showSyncGateModal() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showSyncGateModal);
      return;
    }
    injectModal();
    var modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      var closeBtn = modal.querySelector('.tg-sync-gate-close');
      if (closeBtn) closeBtn.focus();
    }
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
    /** 'guest' | 'telegram' — gravatar users are classified as 'guest' (no localStorage token for email) */
    getIdentityTier:      getIdentityTier,
    /** Verified Telegram ID (string) or null */
    getTelegramId:        getTelegramId,
    /** Telegram display name or null */
    getTelegramName:      getTelegramName,
    /** Persist after a successful /telegram/auth round-trip */
    saveTelegramIdentity: saveTelegramIdentity,
    /**
     * Gate competitive actions: calls onAllowed() if synced,
     * otherwise shows the sync gate modal.
     */
    requireTelegramSync:  requireTelegramSync,
    showSyncGateModal:    showSyncGateModal,
    dismissSyncGateModal: dismissSyncGateModal,
  };

}());
