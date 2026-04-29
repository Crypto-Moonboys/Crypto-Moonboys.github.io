(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var API_BASE = cfg.BASE_URL || '';
  var identity = window.MOONBOYS_IDENTITY || {};

  var accessState = document.getElementById('access-state');
  var refreshAuthBtn = document.getElementById('refresh-auth-state');
  var panel = document.getElementById('admin-panel');

  // Arcade XP grant form elements
  var arcadeGrantForm = document.getElementById('arcade-grant-form');
  var adminTelegramUsernameEl = document.getElementById('admin-telegram-username');
  var adminTelegramIdEl = document.getElementById('admin-telegram-id');
  var arcadeTargetTelegramIdEl = document.getElementById('arcade-target-telegram-id');
  var arcadeXpEl = document.getElementById('arcade-grant-xp');
  var arcadeSecretEl = document.getElementById('arcade-admin-secret');
  var arcadeReasonEl = document.getElementById('arcade-grant-reason');
  var arcadeResultState = document.getElementById('arcade-result-state');
  var arcadeResultJson = document.getElementById('arcade-result-json');

  // Block Topia XP grant form elements
  var btGrantForm = document.getElementById('bt-grant-form');
  var btTargetTelegramIdEl = document.getElementById('bt-target-telegram-id');
  var xpEl = document.getElementById('grant-xp');
  var secretEl = document.getElementById('admin-secret');
  var reasonEl = document.getElementById('grant-reason');
  var resultState = document.getElementById('result-state');
  var resultJson = document.getElementById('result-json');

  var activeAdminTelegramId = '';

  function setState(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = 'state state--' + (tone || 'warn');
  }

  function hidePanel() {
    if (panel) panel.classList.add('hidden');
    activeAdminTelegramId = '';
  }

  function showPanel() {
    if (panel) panel.classList.remove('hidden');
  }

  function readInt(input) {
    var raw = String(input && input.value != null ? input.value : '').trim();
    if (!raw) return null;
    var n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return NaN;
    return n;
  }

  function stringifyPayload(payload) {
    try { return JSON.stringify(payload || {}, null, 2); } catch { return '{}'; }
  }

  async function postJson(path, body, headers) {
    var response = await fetch(API_BASE + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body || {}),
    });
    var payload = null;
    try { payload = await response.json(); } catch { payload = {}; }
    return { ok: response.ok, status: response.status, payload: payload };
  }

  function handleQuickFill(kind) {
    if (kind === 'arcade-me' && activeAdminTelegramId) {
      arcadeTargetTelegramIdEl.value = activeAdminTelegramId;
      return;
    }
    if (kind === 'arcade-xp50k') {
      arcadeXpEl.value = '50000';
      return;
    }
    if (kind === 'bt-me' && activeAdminTelegramId) {
      btTargetTelegramIdEl.value = activeAdminTelegramId;
      return;
    }
    if (kind === 'bt-xp50k') {
      xpEl.value = '50000';
      return;
    }
  }

  function getAuthContext() {
    var sync = identity.getSyncState ? identity.getSyncState() : null;
    var authStatus = identity.getTelegramAuthStatus ? identity.getTelegramAuthStatus() : null;
    var linked = sync ? !!sync.linked : false;
    var authPayload = identity.getSignedTelegramAuth ? identity.getSignedTelegramAuth() : null;
    var hasAuthPayload = !!authPayload;
    var authExpired = !!(authStatus && authStatus.expired);
    var telegramId = String(identity.getTelegramId ? (identity.getTelegramId() || '') : '').trim();

    return {
      linked: linked,
      sync: sync,
      authPayload: authPayload,
      hasAuthPayload: hasAuthPayload,
      authExpired: authExpired,
      telegramId: telegramId,
    };
  }

  function authErrorMessage(ctx) {
    if (!ctx.linked) return 'Denied: Telegram account is not linked yet. Run /gklink first.';
    if (!ctx.hasAuthPayload) return 'Denied: linked account found, but signed Telegram auth payload is missing. Re-auth with Telegram.';
    if (ctx.authExpired) return 'Denied: Telegram auth payload expired. Re-auth with Telegram and retry.';
    if (!ctx.telegramId) return 'Denied: Telegram ID is missing from local identity state. Re-auth with Telegram.';
    return '';
  }

  async function checkAccess() {
    hidePanel();

    if (!API_BASE) {
      setState(accessState, 'API base is not configured.', 'bad');
      return;
    }

    var ctx = getAuthContext();
    var localError = authErrorMessage(ctx);
    if (localError) {
      setState(accessState, localError, 'bad');
      return;
    }

    var telegramAuth = ctx.authPayload;
    var adminTelegramId = ctx.telegramId;
    var username = telegramAuth && telegramAuth.username ? '@' + String(telegramAuth.username).replace(/^@/, '') : '';

    if (adminTelegramIdEl) adminTelegramIdEl.value = adminTelegramId;
    if (adminTelegramUsernameEl) adminTelegramUsernameEl.value = username || 'Not available';
    if (arcadeTargetTelegramIdEl) arcadeTargetTelegramIdEl.value = adminTelegramId;
    if (btTargetTelegramIdEl) btTargetTelegramIdEl.value = adminTelegramId;

    var access;
    try {
      access = await postJson('/admin/blocktopia/access', { telegram_auth: telegramAuth });
    } catch {
      setState(accessState, 'Denied: cannot verify admin access right now.', 'bad');
      return;
    }

    var accessPayload = access.payload || {};
    var backendMessage = String(accessPayload.error || accessPayload.message || '').toLowerCase();

    if (!access.ok) {
      var denied = 'Denied: admin verification failed (' + access.status + ').';
      if (access.status === 401 && backendMessage.indexOf('expired') !== -1) {
        denied = 'Denied: Telegram auth payload expired. Re-auth with Telegram and retry.';
      } else if (access.status === 401 && backendMessage.indexOf('required') !== -1) {
        denied = 'Denied: signed Telegram auth payload is missing or incomplete. Re-auth with Telegram.';
      }
      setState(accessState, denied, 'bad');
      var serialized = stringifyPayload(accessPayload);
      arcadeResultJson.textContent = serialized;
      resultJson.textContent = serialized;
      return;
    }

    if (!accessPayload.admin_allowlisted) {
      setState(accessState, 'Denied: linked and authenticated, but this Telegram ID is not in the admin allowlist.', 'bad');
      var serialized = stringifyPayload(accessPayload);
      arcadeResultJson.textContent = serialized;
      resultJson.textContent = serialized;
      return;
    }
    if (!accessPayload.admin_secret_configured) {
      setState(accessState, 'Denied: linked and allowlisted, but backend admin secret is not configured.', 'bad');
      var serialized = stringifyPayload(accessPayload);
      arcadeResultJson.textContent = serialized;
      resultJson.textContent = serialized;
      return;
    }

    activeAdminTelegramId = adminTelegramId;
    setState(accessState, 'Access approved. Admin-only grant panel unlocked.', 'good');
    showPanel();
  }

  function wireQuickFill() {
    document.querySelectorAll('[data-fill]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleQuickFill(btn.getAttribute('data-fill'));
      });
    });
  }

  function wireArcadeSubmit() {
    arcadeGrantForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      var targetTelegramId = String(arcadeTargetTelegramIdEl.value || '').trim();
      var xp = readInt(arcadeXpEl);
      var reason = String(arcadeReasonEl.value || '').trim();
      var secret = String(arcadeSecretEl.value || '');

      if (!/^\d{5,20}$/.test(targetTelegramId)) {
        setState(arcadeResultState, 'Invalid target Telegram ID.', 'bad');
        return;
      }
      if (!secret) {
        setState(arcadeResultState, 'Admin secret is required at submit time.', 'bad');
        return;
      }
      if (xp === null || xp === 0) {
        setState(arcadeResultState, 'Enter a positive Arcade XP amount.', 'bad');
        return;
      }
      if (Number.isNaN(xp)) {
        setState(arcadeResultState, 'Arcade XP must be a whole number.', 'bad');
        return;
      }
      if (!activeAdminTelegramId) {
        setState(arcadeResultState, 'Admin session is not active. Refresh auth state and retry.', 'bad');
        return;
      }

      var body = {
        telegram_id: targetTelegramId,
        admin_telegram_id: activeAdminTelegramId,
        xp: xp,
      };
      if (reason) body.reason = reason;

      setState(arcadeResultState, 'Submitting Arcade XP grant…', 'warn');
      try {
        var outcome = await postJson('/admin/arcade/grant-xp', body, { 'X-Admin-Secret': secret });
        var payload = outcome.payload || {};
        var reasonText = payload.error || payload.message || '';
        if (outcome.ok) {
          var after = payload.arcade_progression && payload.arcade_progression.arcade_xp_total_after != null
            ? ' arcade_xp_total now: ' + payload.arcade_progression.arcade_xp_total_after
            : '';
          setState(arcadeResultState, 'Arcade XP grant succeeded.' + after, 'good');
        } else {
          setState(arcadeResultState, 'Arcade XP grant failed (' + outcome.status + '). ' + (reasonText || 'See response payload.'), 'bad');
        }
        arcadeResultJson.textContent = stringifyPayload(payload);
      } catch {
        setState(arcadeResultState, 'Arcade XP grant failed: network/server unreachable.', 'bad');
      }
    });
  }

  function wireBtSubmit() {
    btGrantForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      var targetTelegramId = String(btTargetTelegramIdEl.value || '').trim();
      var xp = readInt(xpEl);
      var reason = String(reasonEl.value || '').trim();
      var secret = String(secretEl.value || '');

      if (!/^\d{5,20}$/.test(targetTelegramId)) {
        setState(resultState, 'Invalid target Telegram ID.', 'bad');
        return;
      }
      if (!secret) {
        setState(resultState, 'Admin secret is required at submit time.', 'bad');
        return;
      }
      if (xp === null || xp === 0) {
        setState(resultState, 'Enter a positive XP amount.', 'bad');
        return;
      }
      if (Number.isNaN(xp)) {
        setState(resultState, 'XP must be a whole number.', 'bad');
        return;
      }
      if (!activeAdminTelegramId) {
        setState(resultState, 'Admin session is not active. Refresh auth state and retry.', 'bad');
        return;
      }

      var body = {
        telegram_id: targetTelegramId,
        admin_telegram_id: activeAdminTelegramId,
      };
      if (xp !== null && xp > 0) body.xp = xp;
      if (reason) body.reason = reason;

      setState(resultState, 'Submitting Block Topia grant request…', 'warn');
      try {
        var outcome = await postJson('/admin/blocktopia/grant-xp', body, { 'X-Admin-Secret': secret });
        var payload = outcome.payload || {};
        var reasonText = payload.error || payload.message || '';
        if (outcome.ok) {
          setState(resultState, 'Grant succeeded. ' + (reasonText ? reasonText : 'XP updated.'), 'good');
        } else {
          setState(resultState, 'Grant failed (' + outcome.status + '). ' + (reasonText || 'See response payload.'), 'bad');
        }
        resultJson.textContent = stringifyPayload(payload);
      } catch {
        setState(resultState, 'Grant failed: network/server unreachable.', 'bad');
      }
    });
  }

  function wireAutoRefresh() {
    if (refreshAuthBtn) {
      refreshAuthBtn.addEventListener('click', function () {
        checkAccess();
      });
    }
    window.addEventListener('storage', function (event) {
      var key = event && event.key ? String(event.key) : '';
      if (key === 'moonboys_tg_id' || key === 'moonboys_tg_linked' || key === 'moonboys_tg_auth' || key === 'moonboys_tg_sync_health') {
        checkAccess();
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkAccess();
    });
  }

  function boot() {
    if (!arcadeGrantForm || !btGrantForm) return;
    wireQuickFill();
    wireArcadeSubmit();
    wireBtSubmit();
    wireAutoRefresh();
    checkAccess();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
