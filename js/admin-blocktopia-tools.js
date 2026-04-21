(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var API_BASE = cfg.BASE_URL || '';
  var identity = window.MOONBOYS_IDENTITY || {};

  var accessState = document.getElementById('access-state');
  var panel = document.getElementById('admin-panel');
  var form = document.getElementById('grant-form');
  var adminTelegramIdEl = document.getElementById('admin-telegram-id');
  var targetTelegramIdEl = document.getElementById('target-telegram-id');
  var xpEl = document.getElementById('grant-xp');
  var gemsEl = document.getElementById('grant-gems');
  var secretEl = document.getElementById('admin-secret');
  var reasonEl = document.getElementById('grant-reason');
  var resultState = document.getElementById('result-state');
  var resultJson = document.getElementById('result-json');

  function setState(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = 'state state--' + (tone || 'warn');
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

  function handleQuickFill(kind, selfTelegramId) {
    if (kind === 'me' && selfTelegramId) {
      targetTelegramIdEl.value = selfTelegramId;
      return;
    }
    if (kind === 'xp50k') {
      xpEl.value = '50000';
      return;
    }
    if (kind === 'gems50k') {
      gemsEl.value = '50000';
      return;
    }
    if (kind === 'both50k') {
      xpEl.value = '50000';
      gemsEl.value = '50000';
    }
  }

  async function boot() {
    if (!API_BASE) {
      setState(accessState, 'API base is not configured.', 'bad');
      return;
    }

    if (!identity.isTelegramLinked || !identity.isTelegramLinked()) {
      setState(accessState, 'Denied: linked Telegram identity required.', 'bad');
      return;
    }

    var adminTelegramId = identity.getTelegramId ? String(identity.getTelegramId() || '').trim() : '';
    var telegramAuth = identity.getTelegramAuth ? identity.getTelegramAuth() : null;

    if (!adminTelegramId || !telegramAuth) {
      setState(accessState, 'Denied: Telegram auth payload is missing. Re-auth with Telegram.', 'bad');
      return;
    }

    adminTelegramIdEl.value = adminTelegramId;
    targetTelegramIdEl.value = adminTelegramId;

    var access;
    try {
      access = await postJson('/admin/blocktopia/access', { telegram_auth: telegramAuth });
    } catch {
      setState(accessState, 'Denied: cannot verify admin access right now.', 'bad');
      return;
    }

    if (!access.ok) {
      setState(accessState, 'Denied: admin verification failed (' + access.status + ').', 'bad');
      resultJson.textContent = stringifyPayload(access.payload);
      return;
    }

    var accessPayload = access.payload || {};
    if (!accessPayload.admin_allowlisted) {
      setState(accessState, 'Denied: this linked Telegram ID is not in the admin allowlist.', 'bad');
      resultJson.textContent = stringifyPayload(accessPayload);
      return;
    }
    if (!accessPayload.admin_secret_configured) {
      setState(accessState, 'Denied: backend admin secret is not configured.', 'bad');
      resultJson.textContent = stringifyPayload(accessPayload);
      return;
    }

    setState(accessState, 'Access approved. Admin-only Block Topia grant panel unlocked.', 'good');
    panel.classList.remove('hidden');

    document.querySelectorAll('[data-fill]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleQuickFill(btn.getAttribute('data-fill'), adminTelegramId);
      });
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      var targetTelegramId = String(targetTelegramIdEl.value || '').trim();
      var xp = readInt(xpEl);
      var gems = readInt(gemsEl);
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
      if ((xp === null || xp === 0) && (gems === null || gems === 0)) {
        setState(resultState, 'Enter a positive XP and/or gems amount.', 'bad');
        return;
      }
      if (Number.isNaN(xp) || Number.isNaN(gems)) {
        setState(resultState, 'XP and gems must be whole numbers.', 'bad');
        return;
      }

      var body = {
        telegram_id: targetTelegramId,
        admin_telegram_id: adminTelegramId,
      };
      if (xp !== null && xp > 0) body.xp = xp;
      if (gems !== null && gems > 0) body.gems = gems;
      if (reason) body.reason = reason;

      setState(resultState, 'Submitting grant request…', 'warn');
      try {
        var outcome = await postJson('/admin/blocktopia/grant-xp', body, { 'X-Admin-Secret': secret });
        var payload = outcome.payload || {};
        var reasonText = payload.error || payload.message || '';
        if (outcome.ok) {
          setState(resultState, 'Grant succeeded. ' + (reasonText ? reasonText : 'XP/Gems updated.'), 'good');
        } else {
          setState(resultState, 'Grant failed (' + outcome.status + '). ' + (reasonText || 'See response payload.'), 'bad');
        }
        resultJson.textContent = stringifyPayload(payload);
      } catch {
        setState(resultState, 'Grant failed: network/server unreachable.', 'bad');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
