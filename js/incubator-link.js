(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || '';
  var HASH_KEY = 'telegram_auth';
  var AUTH_STORAGE_KEY = 'MOONBOYS_TELEGRAM_AUTH';

  // Resolved text constants — fall back to literals so no type="module" is needed.
  var COPY = window.UI_STATUS_COPY || {
    UNLINKED:        'Telegram not linked \u2014 run /gklink',
    API_UNAVAILABLE: 'Core API unavailable',
  };

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

  function clearStoredPayload() {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem('moonboys_tg_auth');
    } catch (_) {}
  }

  function scrubTelegramHash() {
    try {
      var url = new URL(window.location.href);
      if (!url.hash || url.hash.indexOf(HASH_KEY + '=') === -1) return;
      url.hash = '';
      var scrubbed = url.pathname + url.search + url.hash;
      window.history.replaceState({}, '', scrubbed || url.pathname);
    } catch (_) {}
  }

  function getHashPayload() {
    var hash = window.location.hash || '';
    if (!hash) return null;
    var trimmed = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    if (!trimmed) return null;
    var params = new URLSearchParams(trimmed);
    return params.get(HASH_KEY);
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

  function syncPendingArcadeProgressAfterLink() {
    function runSync(api) {
      if (!api || typeof api.syncPendingArcadeProgress !== 'function') return;
      api.syncPendingArcadeProgress().then(function (summary) {
        debug('pending_arcade_sync', summary || {});
      }).catch(function (error) {
        debug('pending_arcade_sync_failed', { message: error && error.message ? error.message : String(error) });
      });
    }
    if (window.MOONBOYS_ARCADE_SYNC) {
      runSync(window.MOONBOYS_ARCADE_SYNC);
      return;
    }
    try {
      import('/js/arcade-sync.js').then(function (mod) {
        if (mod && mod.ArcadeSync) {
          window.MOONBOYS_ARCADE_SYNC = mod.ArcadeSync;
          runSync(mod.ArcadeSync);
        }
      }).catch(function (error) {
        debug('pending_arcade_sync_import_failed', { message: error && error.message ? error.message : String(error) });
      });
    } catch (error) {
      debug('pending_arcade_sync_import_unsupported', { message: error && error.message ? error.message : String(error) });
    }
  }

  function boot() {
    if (!BASE) return;
    var rawPayload = getHashPayload();
    scrubTelegramHash();
    if (!rawPayload) {
      debug('payload_missing');
      // Normal page visit (no #telegram_auth in URL) — do NOT show "Invalid link".
      // Show the current identity state: linked-ready, or neutral unlinked prompt.
      var gate = window.MOONBOYS_IDENTITY;
      var isLinked = gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked();
      if (isLinked) {
        var name = (typeof gate.getTelegramName === 'function' && gate.getTelegramName()) || 'Linked Telegram';
        var syncState = typeof gate.getSyncState === 'function' ? gate.getSyncState() : null;
        if (syncState && syncState.good) {
          setStatus(name, 'Telegram linked. XP and Block Topia progression sync is ready.', true);
          emitSyncState('good', 'already_linked');
        } else {
          setStatus(name, 'Sync may need refreshing \u2014 run /gklink again to restore server sync.', false);
          emitSyncState('bad', 'sync_stale');
        }
      } else {
        setStatus(COPY.UNLINKED, 'Run /gklink in Telegram to link your account and enable server-side sync.', false);
        emitSyncState('bad', 'not_linked');
      }
      return;
    }

    var parsedPayload = parseTelegramAuthParam(rawPayload);
    debug('payload_received', { hasPayload: !!parsedPayload });

    if (!parsedPayload || typeof parsedPayload !== 'object') {
      clearStoredPayload();
      setStatus(COPY.UNLINKED, 'Invalid link. Use /gklink again.', false);
      emitSyncState('bad', 'invalid_payload');
      debug('payload_parse_failed', { rawLength: rawPayload.length });
      return;
    }

    setStatus(getDisplayName(parsedPayload), 'Confirming your Telegram link...', false);

    fetch(String(BASE).replace(/\/$/, '') + '/telegram/link/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedPayload),
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
          clearStoredPayload();
          setStatus(COPY.UNLINKED, errorMessage, false);
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
          clearStoredPayload();
          setStatus(COPY.UNLINKED, 'Signed Telegram auth is missing or expired. Run /gklink again.', false);
          emitSyncState('bad', 'link_persist_failed');
          debug('link_persist_failed', { telegramId: result.data.telegram_id || null });
          return;
        }

        persistRawPayload(JSON.stringify(canonicalPayload));
        setStatus(displayName, 'Telegram linked successfully. XP and Block Topia progression are now sync-live.', true);
        emitSyncState('good', 'linked_ready', result.data.telegram_id);
        syncPendingArcadeProgressAfterLink();
        debug('verify_success', { telegramId: result.data.telegram_id });
      })
      .catch(function (error) {
        clearStoredPayload();
        setStatus(COPY.UNLINKED, COPY.API_UNAVAILABLE + ' \u2014 run /gklink again if this persists.', false);
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
