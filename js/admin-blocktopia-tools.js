(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var API_BASE = cfg.BASE_URL || '';
  var identity = window.MOONBOYS_IDENTITY || {};

  var accessState = document.getElementById('access-state');
  var refreshAuthBtn = document.getElementById('refresh-auth-state');
  var panel = document.getElementById('admin-panel');
  var form = document.getElementById('grant-form');
  var adminTelegramUsernameEl = document.getElementById('admin-telegram-username');
  var adminTelegramIdEl = document.getElementById('admin-telegram-id');
  var targetTelegramIdEl = document.getElementById('target-telegram-id');
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
    if (kind === 'me' && activeAdminTelegramId) {
      targetTelegramIdEl.value = activeAdminTelegramId;
      return;
    }
    if (kind === 'xp50k') {
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
    if (targetTelegramIdEl) targetTelegramIdEl.value = adminTelegramId;

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
      resultJson.textContent = stringifyPayload(accessPayload);
      return;
    }

    if (!accessPayload.admin_allowlisted) {
      setState(accessState, 'Denied: linked and authenticated, but this Telegram ID is not in the admin allowlist.', 'bad');
      resultJson.textContent = stringifyPayload(accessPayload);
      return;
    }
    if (!accessPayload.admin_secret_configured) {
      setState(accessState, 'Denied: linked and allowlisted, but backend admin secret is not configured.', 'bad');
      resultJson.textContent = stringifyPayload(accessPayload);
      return;
    }

    activeAdminTelegramId = adminTelegramId;
    setState(accessState, 'Access approved. Admin-only Block Topia grant panel unlocked.', 'good');
    showPanel();
  }

  function wireQuickFill() {
    document.querySelectorAll('[data-fill]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleQuickFill(btn.getAttribute('data-fill'));
      });
    });
  }

  function wireSubmit() {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      var targetTelegramId = String(targetTelegramIdEl.value || '').trim();
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

      setState(resultState, 'Submitting grant request…', 'warn');
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
    if (!form) return;
    wireQuickFill();
    wireSubmit();
    wireAutoRefresh();
    checkAccess();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
