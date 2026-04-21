(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || '';
  var QUERY_KEY = 'telegram_auth';
  var AUTH_STORAGE_KEY = 'MOONBOYS_TELEGRAM_AUTH';

  function debug(event, context) {
    try {
      console.log('[incubator-link]', event, context || {});
    } catch (_) {}
  }

  function getStateBox() {
    return document.getElementById('incubator-sync-state');
  }

  function setStatus(identity, message, good) {
    var box = getStateBox();
    var identityEl = document.getElementById('incubator-sync-identity');
    var msgEl = document.getElementById('incubator-sync-message');
    if (identityEl && identity) identityEl.textContent = identity;
    if (msgEl && message) msgEl.textContent = message;
    if (box) {
      box.classList.remove('good', 'bad');
      box.classList.add(good ? 'good' : 'bad');
    }
    if (document.body && document.body.classList) {
      document.body.classList.toggle('sync-live', !!good);
    }
  }

  function parseTelegramAuthParam(rawValue) {
    if (!rawValue) return null;
    try {
      return JSON.parse(rawValue);
    } catch (_) {}
    try {
      var normalized = rawValue.replace(/-/g, '+').replace(/_/g, '/');
      var pad = normalized.length % 4;
      if (pad) normalized += '='.repeat(4 - pad);
      return JSON.parse(atob(normalized));
    } catch (_) {}
    return null;
  }

  function getDisplayName(payload) {
    if (!payload || typeof payload !== 'object') return 'Linked Telegram';
    var full = [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (payload.username) return '@' + String(payload.username).replace(/^@/, '');
    if (payload.id) return 'Telegram ' + payload.id;
    return 'Linked Telegram';
  }

  function cleanQueryParam() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete(QUERY_KEY);
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
  }

  function emitSyncState(state, reason, telegramId) {
    if (typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('moonboys:sync-state', {
      detail: {
        state: state,
        reason: reason || '',
        telegram_id: telegramId || null,
        source: 'incubator-link',
      },
    }));
  }

  function persistRawPayload(rawValue) {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, rawValue);
      localStorage.setItem('moonboys_tg_auth', rawValue);
    } catch (_) {}
  }

  function boot() {
    if (!BASE) return;
    console.log('URL:', window.location.href);
    var params = new URLSearchParams(window.location.search);
    var rawPayload = params.get(QUERY_KEY);
    console.log('telegram_auth:', rawPayload);
    if (!rawPayload) {
      setStatus('Not linked', 'Invalid link. Use /gklink again.', false);
      emitSyncState('bad', 'missing_payload');
      debug('payload_missing');
      return;
    }

    var parsedPayload = parseTelegramAuthParam(rawPayload);
    debug('payload_received', { hasPayload: !!parsedPayload });

    if (!parsedPayload || typeof parsedPayload !== 'object') {
      setStatus('Not linked', 'Invalid link. Use /gklink again.', false);
      emitSyncState('bad', 'invalid_payload');
      debug('payload_parse_failed', { rawLength: rawPayload.length });
      return;
    }

    persistRawPayload(JSON.stringify(parsedPayload));
    setStatus(getDisplayName(parsedPayload), 'Confirming your Telegram link...', false);

    fetch(String(BASE).replace(/\/$/, '') + '/telegram/link/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: parsedPayload }),
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { ok: response.ok, status: response.status, data: data || {} };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.ok) {
          var errorMessage = result.data && result.data.error
            ? String(result.data.error)
            : 'Sync verification failed. Run /gklink again.';
          setStatus('Not linked', errorMessage, false);
          emitSyncState('bad', 'verify_failed');
          debug('verify_failed', {
            status: result.status,
            error: result.data && result.data.error ? String(result.data.error) : 'unknown',
          });
          return;
        }

        var canonicalPayload = result.data.telegram_auth && typeof result.data.telegram_auth === 'object'
          ? result.data.telegram_auth
          : parsedPayload;
        var displayName = result.data.telegram_name || getDisplayName(canonicalPayload);
        var linkedOk = false;

        if (window.MOONBOYS_IDENTITY) {
          if (typeof window.MOONBOYS_IDENTITY.saveTelegramIdentity === 'function') {
            window.MOONBOYS_IDENTITY.saveTelegramIdentity(
              result.data.telegram_id,
              displayName,
              canonicalPayload
            );
          }
          if (typeof window.MOONBOYS_IDENTITY.setTelegramLinked === 'function') {
            linkedOk = !!window.MOONBOYS_IDENTITY.setTelegramLinked(
              result.data.telegram_id,
              canonicalPayload,
              displayName
            );
          }
        }

        if (!linkedOk) {
          setStatus('Not linked', 'Signed Telegram auth is missing or expired. Run /gklink again.', false);
          emitSyncState('bad', 'link_persist_failed');
          debug('link_persist_failed', { telegramId: result.data.telegram_id || null });
          return;
        }

        persistRawPayload(JSON.stringify(canonicalPayload));
        setStatus(displayName, 'Telegram linked successfully. XP and Block Topia progression are now sync-live.', true);
        emitSyncState('good', 'linked_ready', result.data.telegram_id);
        cleanQueryParam();
        debug('verify_success', { telegramId: result.data.telegram_id });
      })
      .catch(function (error) {
        setStatus('Not linked', 'Could not reach the sync server. Run /gklink again if this keeps happening.', false);
        emitSyncState('bad', 'network_error');
        debug('verify_exception', { message: error && error.message ? error.message : String(error) });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
