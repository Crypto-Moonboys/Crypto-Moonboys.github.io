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
 *   Step 2 — /gkstart → /gklink → click signed link     → tier becomes 'telegram_linked'
 *            (the bot sends a link that opens gkniftyheads-incubator.html#telegram_auth=… and finishes activation)
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
  var LS_TG_AUTH   = 'moonboys_tg_auth';
  var LS_TG_AUTH_LEGACY = 'MOONBOYS_TELEGRAM_AUTH';
  var LS_SYNC_HEALTH = 'moonboys_tg_sync_health';
  var TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400;
  var MODAL_ID     = 'tg-sync-gate-modal';
  var STYLE_ID     = 'tg-sync-gate-styles';
  var bootstrapPromise = null;

  // ── localStorage helpers ────────────────────────────────────

  function lsGet(key) {
    try { return localStorage.getItem(key) || null; } catch { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }

  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function getStoredTelegramAuthRaw() {
    return lsGet(LS_TG_AUTH) || lsGet(LS_TG_AUTH_LEGACY);
  }

  function setStoredTelegramAuthRaw(value) {
    if (!value) return;
    lsSet(LS_TG_AUTH, value);
    lsSet(LS_TG_AUTH_LEGACY, value);
  }

  function clearStoredTelegramAuthRaw() {
    lsRemove(LS_TG_AUTH);
    lsRemove(LS_TG_AUTH_LEGACY);
  }

  function getRawTelegramAuthEvidence() {
    return getStoredTelegramAuthRaw();
  }

  function getApiBase() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, '') : '';
  }

  // ── Public API ───────────────────────────────────────────────

  function getTelegramId() {
    return lsGet(LS_TG_ID);
  }

  function getTelegramName() {
    return lsGet(LS_TG_NAME);
  }

  function getTelegramAuth() {
    var raw = getStoredTelegramAuthRaw();
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize a Telegram auth payload into the stored shape and require signed essentials.
   * Returns null when id/hash/auth_date are missing; otherwise returns a safe payload object.
   */
  function normalizeTelegramAuthPayload(authPayload, telegramId) {
    if (!authPayload || typeof authPayload !== 'object') return null;
    var safeAuth = {
      id:         authPayload.id || telegramId || null,
      first_name: authPayload.first_name || null,
      last_name:  authPayload.last_name || null,
      username:   authPayload.username || null,
      photo_url:  authPayload.photo_url || null,
      auth_date:  authPayload.auth_date || null,
      hash:       authPayload.hash || null,
    };
    if (!safeAuth.id || !safeAuth.hash || !safeAuth.auth_date) return null;
    return safeAuth;
  }

  function hasAuthPayload() {
    var auth = getTelegramAuth();
    return !!(auth && auth.hash && auth.auth_date);
  }

  function getTelegramAuthAgeSeconds(auth) {
    if (!auth || !auth.auth_date) return null;
    var authDate = Number(auth.auth_date);
    if (!Number.isFinite(authDate) || authDate <= 0) return null;
    return Math.floor(Date.now() / 1000) - Math.floor(authDate);
  }

  function isTelegramAuthExpired(auth) {
    var age = getTelegramAuthAgeSeconds(auth);
    if (age == null) return true;
    if (age < -300) return true;
    return age > TELEGRAM_AUTH_MAX_AGE_SECONDS;
  }

  function getTelegramAuthStatus() {
    var auth = getTelegramAuth();
    var hasPayload = !!(auth && auth.hash && auth.auth_date);
    var expired = hasPayload ? isTelegramAuthExpired(auth) : false;
    var ageSeconds = hasPayload ? getTelegramAuthAgeSeconds(auth) : null;
    return {
      has_payload: hasPayload,
      expired: !!expired,
      age_seconds: ageSeconds,
      max_age_seconds: TELEGRAM_AUTH_MAX_AGE_SECONDS,
      auth: auth,
    };
  }

  function setSyncHealth(state, reason) {
    var safeState = state === 'bad' ? 'bad' : 'good';
    var payload = {
      state: safeState,
      reason: reason ? String(reason) : '',
      updated_at: Date.now(),
    };
    lsSet(LS_SYNC_HEALTH, JSON.stringify(payload));
    return payload;
  }

  function getSyncHealth() {
    var raw = lsGet(LS_SYNC_HEALTH);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        state: parsed.state === 'bad' ? 'bad' : 'good',
        reason: parsed.reason ? String(parsed.reason) : '',
        updated_at: Number(parsed.updated_at) || null,
      };
    } catch {
      return null;
    }
  }

  function getSyncState() {
    var linked = isTelegramLinked();
    var authStatus = getTelegramAuthStatus();
    var auth = authStatus.has_payload;
    var sync = getSyncHealth();
    var bad = !!(sync && sync.state === 'bad');
    var expired = !!authStatus.expired || bad;
    var reason = '';
    if (expired) {
      reason = authStatus.expired ? 'auth_expired' : (sync.reason || 'auth_expired');
    }
    var ready = linked && auth && !expired;
    return {
      linked: linked,
      auth: auth,
      auth_expired: !!authStatus.expired,
      auth_age_seconds: authStatus.age_seconds,
      auth_max_age_seconds: authStatus.max_age_seconds,
      good: ready,
      status: !linked ? 'not_linked' : (!auth ? 'missing_auth_payload' : (expired ? 'auth_expired' : 'linked_ready')),
      reason: reason,
      sync: sync,
      auth_status: authStatus,
    };
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
   * Call this after the /gklink flow succeeds (e.g. redirect from gkniftyheads-incubator.html#telegram_auth=…).
   * Fail-closed: returns false and does not set linked when ID/payload is missing or payload is expired.
   *
   * @param {string|number} [telegramId] — persisted Telegram ID.
   * @param {object} [authPayload] — signed Telegram auth payload to persist atomically.
   * @param {string} [displayName] — optional display name to persist.
   * @returns {boolean} true only when a fresh signed payload exists and linked state is ready.
   */
  function setTelegramLinked(telegramId, authPayload, displayName) {
    var currentTelegramId = getTelegramId();
    var resolvedTelegramId = String(
      telegramId || (authPayload && authPayload.id) || currentTelegramId || ''
    ).trim() || null;
    var resolvedDisplayName = displayName || getTelegramName() || null;
    var auth = authPayload && typeof authPayload === 'object'
      ? normalizeTelegramAuthPayload(authPayload, resolvedTelegramId)
      : getTelegramAuth();
    var hasPayload = !!(auth && auth.id && auth.hash && auth.auth_date);
    if (!resolvedTelegramId) {
      lsRemove(LS_TG_LINKED);
      setSyncHealth('bad', 'missing_telegram_id');
      return false;
    }
    if (!hasPayload) {
      lsRemove(LS_TG_LINKED);
      clearStoredTelegramAuthRaw();
      setSyncHealth('bad', 'missing_auth_payload');
      return false;
    }
    if (isTelegramAuthExpired(auth)) {
      lsRemove(LS_TG_LINKED);
      setStoredTelegramAuthRaw(JSON.stringify(auth));
      setSyncHealth('bad', 'auth_expired');
      return false;
    }
    lsSet(LS_TG_ID, resolvedTelegramId);
    if (resolvedDisplayName) lsSet(LS_TG_NAME, resolvedDisplayName);
    if (authPayload && typeof authPayload === 'object') {
      setStoredTelegramAuthRaw(JSON.stringify(auth));
      setSyncHealth('good', 'auth_verified');
    }
    lsSet(LS_TG_LINKED, '1');
    setSyncHealth('good', 'linked');
    return true;
  }

  /**
   * Persist a verified Telegram identity after a successful /telegram/auth flow.
   * Called by comments.js after the Telegram Login Widget callback succeeds.
   */
  function saveTelegramIdentity(telegramId, displayName, authPayload) {
    if (telegramId) lsSet(LS_TG_ID, telegramId);
    if (displayName) lsSet(LS_TG_NAME, displayName);
    if (authPayload && typeof authPayload === 'object') {
      var safeAuth = normalizeTelegramAuthPayload(authPayload, telegramId);
      if (safeAuth) {
        setStoredTelegramAuthRaw(JSON.stringify(safeAuth));
      }
    }
    if (telegramId) setSyncHealth('good', 'auth_verified');
  }

  /**
   * Return the shared secure Telegram auth payload for protected routes.
   * Guarantees: payload exists, is not expired, and payload.id matches stored Telegram ID.
   * Returns null when any guard fails.
   */
  function getSignedTelegramAuth() {
    var authStatus = getTelegramAuthStatus();
    if (!authStatus.has_payload) return null;
    if (authStatus.expired) return null;
    var auth = authStatus.auth;
    if (!auth || !auth.id || !auth.hash || !auth.auth_date) return null;
    var telegramId = getTelegramId();
    if (!telegramId) return null;
    if (String(telegramId) !== String(auth.id)) return null;
    return auth;
  }

  function restoreLinkedTelegramAuth(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var force = !!opts.force;
    var currentAuth = getSignedTelegramAuth();
    if (!force && currentAuth) {
      return Promise.resolve({
        ok: true,
        source: 'cached_auth',
        telegram_id: String(currentAuth.id),
        telegram_auth: currentAuth,
      });
    }

    var apiBase = getApiBase();
    var telegramId = getTelegramId();
    var authEvidence = getRawTelegramAuthEvidence();
    if (!apiBase) {
      return Promise.resolve({
        ok: false,
        reason: 'missing_api_base',
      });
    }

    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = fetch(apiBase + '/telegram/user/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: telegramId || null,
        telegram_auth: authEvidence || null,
        linked: isTelegramLinked(),
        telegram_name: getTelegramName() || null,
        sync: getSyncHealth(),
      }),
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { ok: response.ok, status: response.status, data: data || {} };
        });
      })
      .then(function (result) {
        var data = result.data || {};
        var restoredAuth = data.telegram_auth && typeof data.telegram_auth === 'object'
          ? normalizeTelegramAuthPayload(data.telegram_auth, data.telegram_id || telegramId)
          : null;
        var linked = data.linked === true || data.link_confirmed === true;
        var displayName = data.display_name || data.telegram_name || getTelegramName() || null;

        if (!result.ok) {
          setSyncHealth('bad', data && data.error ? String(data.error) : 'bootstrap_failed');
          return {
            ok: false,
            reason: data && data.error ? String(data.error) : 'bootstrap_failed',
            status: result.status,
          };
        }

        if (!linked || !restoredAuth) {
          setSyncHealth('bad', linked ? 'missing_bootstrap_auth' : 'not_linked');
          return {
            ok: false,
            reason: linked ? 'missing_bootstrap_auth' : 'not_linked',
            status: result.status,
          };
        }

        saveTelegramIdentity(data.telegram_id || telegramId, displayName, restoredAuth);
        var linkedOk = setTelegramLinked(data.telegram_id || telegramId, restoredAuth, displayName);
        if (!linkedOk) {
          setSyncHealth('bad', 'bootstrap_persist_failed');
          return {
            ok: false,
            reason: 'bootstrap_persist_failed',
            status: result.status,
          };
        }

        setSyncHealth('good', 'server_bootstrap');
        return {
          ok: true,
          source: 'server_bootstrap',
          telegram_id: String(data.telegram_id || telegramId),
          telegram_auth: restoredAuth,
          linked: true,
        };
      })
      .catch(function (error) {
        setSyncHealth('bad', 'bootstrap_network_error');
        return {
          ok: false,
          reason: error && error.message ? error.message : String(error),
          status: 0,
        };
      })
      .finally(function () {
        bootstrapPromise = null;
      });

    return bootstrapPromise;
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
   * Also checks the anti-cheat status: if the account is blocked, the action is
   * rejected with a clear message instead of calling onAllowed().
   * If the user is linked and not blocked, calls onAllowed() immediately.
   * Otherwise opens the sync gate modal with bot activation instructions.
   */
  function requireLinkedAccount(onAllowed) {
    if (!isTelegramLinked()) {
      showSyncGateModal(true);
      return;
    }

    var telegramId = getTelegramId();
    var base = (window.MOONBOYS_API || {}).BASE_URL || null;

    // If we have an API base and a telegram ID, verify the account is not blocked.
    if (base && telegramId) {
      fetch(base + '/telegram/user/status?telegram_id=' + encodeURIComponent(telegramId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.anticheat && data.anticheat.is_blocked === true) {
            var reason = data.anticheat.blocked_reason || 'Competitive activity violation detected.';
            showBlockedModal(reason);
          } else {
            onAllowed();
          }
        })
        .catch(function () {
          // If the status check fails (network error etc.), allow the action
          // to avoid false positives from transient failures.
          onAllowed();
        });
    } else {
      onAllowed();
    }
  }

  // ── Blocked account modal ────────────────────────────────────

  function showBlockedModal(reason) {
    injectStyles();
    var BLOCKED_ID = 'tg-blocked-gate-modal';
    var existing = document.getElementById(BLOCKED_ID);
    if (existing) {
      existing.style.display = 'flex';
      existing.setAttribute('aria-hidden', 'false');
      return;
    }

    var div = document.createElement('div');
    div.id = BLOCKED_ID;
    div.className = 'tg-sync-gate-overlay';
    div.setAttribute('role', 'alertdialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Account blocked');
    div.setAttribute('aria-hidden', 'false');
    div.innerHTML =
      '<div class="tg-sync-gate-box">' +
        '<button class="tg-sync-gate-close" aria-label="Close" id="tg-blocked-close">✕</button>' +
        '<div class="tg-sync-gate-icon" aria-hidden="true">🚫</div>' +
        '<p class="tg-sync-gate-title">Competitive Access Blocked</p>' +
        '<p class="tg-sync-gate-body">' +
          'Your account has been flagged by the anti-cheat system. Competitive actions ' +
          '(leaderboard submissions, votes, XP, likes) are currently unavailable.<br><br>' +
          '<strong>Reason:</strong> ' + escapeModalText(reason) +
        '</p>' +
        '<p class="tg-sync-gate-note">Contact the Moonboys community via Telegram to appeal.</p>' +
      '</div>';
    document.body.appendChild(div);
    div.style.display = 'flex';

    div.querySelector('#tg-blocked-close').addEventListener('click', function () {
      div.style.display = 'none';
      div.setAttribute('aria-hidden', 'true');
    });
    div.addEventListener('click', function (e) {
      if (e.target === div) {
        div.style.display = 'none';
        div.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function escapeModalText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Sync gate modal ─────────────────────────────────────────

  var BOT_URL = 'https://t.me/WIKICOMSBOT';

  function getBotUrl() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.BOT_URL || BOT_URL;
  }

  function getSyncGateUrl() {
    var cfg = window.MOONBOYS_API || {};
    return cfg.SYNC_GATE_URL || 'https://cryptomoonboys.com/gkniftyheads-incubator.html';
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
        'The link opens <em>gkniftyheads-incubator.html#telegram_auth=…</em> and finishes activation.';
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
    /** Last verified Telegram auth payload or null */
    getTelegramAuth:      getTelegramAuth,
    /** Last verified signed Telegram auth payload when fresh and ID-matched; otherwise null. */
    getSignedTelegramAuth:getSignedTelegramAuth,
    /** Recover a fresh signed Telegram auth payload from backend-linked identity state when possible. */
    restoreLinkedTelegramAuth: restoreLinkedTelegramAuth,
    /** Telegram auth payload presence/expiry details for consistent gating. */
    getTelegramAuthStatus:getTelegramAuthStatus,
    /** True when the stored Telegram auth payload is missing/expired/invalid. */
    isTelegramAuthExpired:isTelegramAuthExpired,
    /** Lightweight sync state shared across pages. */
    getSyncState:         getSyncState,
    /** Lightweight sync health marker (good|bad) for cross-page consistency. */
    getSyncHealth:        getSyncHealth,
    /** Update sync health marker after server responses. */
    setSyncHealth:        setSyncHealth,
    /** Whether the bot link flow has been completed (competition-active) */
    isTelegramLinked:     isTelegramLinked,
    /** Mark bot link as completed (call after successful /gklink one-time link flow). */
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
