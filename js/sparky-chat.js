/*
 * Crypto Moonboys — Sparky public chat client.
 * Calls the public Moonboys API bridge only. Does not expose SWARMSY admin URLs,
 * bridge tokens, sealed instructions, or workspace keys in browser code.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var root = document.querySelector('[data-sparky-chat]');
  if (!root) return;

  var SPARKY_NPC_ID = 'sparky';
  var SPARKY_LABEL = 'Sparky';
  var TELEGRAM_REQUIRED_MESSAGE = 'Telegram login required to use Sparky.';
  var TELEGRAM_PANEL_MESSAGE = 'Log in with Telegram to use Sparky AI Chat.';

  var form = root.querySelector('[data-sparky-form]');
  var input = root.querySelector('[data-sparky-input]');
  var log = root.querySelector('[data-sparky-log]');
  var sendButton = root.querySelector('[data-sparky-send]');
  var state = root.querySelector('[data-sparky-state]');
  var errorBox = root.querySelector('[data-sparky-error]');
  var loginPanel = document.querySelector('[data-sparky-login-panel]');
  var loginSlot = document.querySelector('[data-sparky-telegram-login]');
  var formPlaceholder = form ? document.createComment('sparky-telegram-auth-required') : null;
  var formParent = form ? form.parentNode : null;

  function setState(message) {
    if (state) state.textContent = message || '';
  }

  function setError(message) {
    if (!errorBox) return;
    errorBox.textContent = message || '';
    errorBox.dataset.visible = message ? 'true' : 'false';
  }

  function safeText(value) {
    return String(value == null ? '' : value);
  }

  function appendMessage(role, label, text) {
    if (!log) return;
    var message = document.createElement('div');
    message.className = 'sparky-message';
    message.dataset.role = role;

    var meta = document.createElement('span');
    meta.className = 'sparky-meta';
    meta.textContent = label;

    message.appendChild(meta);
    message.appendChild(document.createTextNode(safeText(text)));
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }

  function apiBase() {
    if (window.MOONBOYS_API && typeof window.MOONBOYS_API.getApiBase === 'function') {
      return window.MOONBOYS_API.getApiBase();
    }
    if (window.API_CONFIG && window.API_CONFIG.BASE_URL) return String(window.API_CONFIG.BASE_URL).replace(/\/$/, '');
    return '';
  }

  function endpointUrl() {
    var base = apiBase();
    if (!base) return '';
    return base.replace(/\/$/, '') + '/public/npc-chat';
  }

  function getIdentityGate() {
    return window.MOONBOYS_IDENTITY || null;
  }

  function hasSignedTelegramAuth(auth) {
    return !!(auth && auth.id && auth.auth_date && auth.hash);
  }

  function resolveTelegramAuth() {
    var gate = getIdentityGate();
    if (!gate) return Promise.resolve(null);
    if (typeof gate.getFreshTelegramAuth === 'function') {
      return Promise.resolve(gate.getFreshTelegramAuth()).then(function (auth) {
        return hasSignedTelegramAuth(auth) ? auth : null;
      }).catch(function () { return null; });
    }
    if (typeof gate.getSignedTelegramAuth === 'function') {
      var signedAuth = gate.getSignedTelegramAuth();
      return Promise.resolve(hasSignedTelegramAuth(signedAuth) ? signedAuth : null);
    }
    return Promise.resolve(null);
  }

  function mountChatForm(isAuthenticated) {
    if (!form || !formPlaceholder || !formParent) return;
    if (isAuthenticated) {
      if (!form.parentNode && formPlaceholder.parentNode) {
        formPlaceholder.parentNode.replaceChild(form, formPlaceholder);
      }
    } else if (form.parentNode) {
      form.parentNode.replaceChild(formPlaceholder, form);
    }
  }

  function setChatAuthenticated(isAuthenticated) {
    root.dataset.authenticated = isAuthenticated ? 'true' : 'false';
    root.setAttribute('aria-disabled', isAuthenticated ? 'false' : 'true');
    if (loginPanel) loginPanel.dataset.authenticated = isAuthenticated ? 'true' : 'false';
    mountChatForm(isAuthenticated);
    if (form) form.dataset.authenticated = isAuthenticated ? 'true' : 'false';
    if (input) input.disabled = !isAuthenticated;
    if (sendButton) sendButton.disabled = !isAuthenticated;
    if (!isAuthenticated) {
      setState('Telegram login required.');
      setError(TELEGRAM_PANEL_MESSAGE);
    } else {
      setError('');
      setState(endpointUrl() ? 'Ready.' : 'API bridge config required.');
    }
  }

  function refreshAuthGate() {
    return resolveTelegramAuth().then(function (auth) {
      setChatAuthenticated(!!auth);
      return auth;
    });
  }

  function injectTelegramLogin() {
    var cfg = window.MOONBOYS_API || {};
    var bot = cfg.TELEGRAM_BOT_USERNAME || null;
    var features = cfg.FEATURES || {};
    var base = apiBase();
    if (!loginSlot || loginSlot.dataset.initialized === 'true' || !bot || !features.TELEGRAM_LOGIN || !base) return;
    loginSlot.dataset.initialized = 'true';

    var callbackName = '_moonboysSparkyTgAuth';
    window[callbackName] = function (user) {
      fetch(base + '/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          if (!data || !data.ok || !data.identity) throw new Error('telegram_auth_failed');
          var id = data.identity;
          var gate = getIdentityGate();
          if (gate && typeof gate.saveTelegramIdentity === 'function' && id.telegram_id) {
            gate.saveTelegramIdentity(
              id.telegram_id,
              id.display_name,
              data.telegram_auth && typeof data.telegram_auth === 'object' ? data.telegram_auth : user
            );
          }
          return refreshAuthGate();
        })
        .catch(function () {
          setChatAuthenticated(false);
          setError(TELEGRAM_PANEL_MESSAGE);
        });
    };

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', bot);
    script.setAttribute('data-size', 'medium');
    script.setAttribute('data-onauth', callbackName + '(user)');
    script.setAttribute('data-request-access', 'write');
    loginSlot.appendChild(script);
  }

  async function sendMessage(event) {
    event.preventDefault();
    setError('');

    var telegramAuth = await resolveTelegramAuth();
    if (!telegramAuth) {
      setChatAuthenticated(false);
      appendMessage('assistant', SPARKY_LABEL, TELEGRAM_REQUIRED_MESSAGE);
      setError(TELEGRAM_REQUIRED_MESSAGE);
      return;
    }
    setChatAuthenticated(true);

    var message = safeText(input && input.value).trim();
    var endpoint = endpointUrl();

    if (!message) {
      setError('Type a message first.');
      return;
    }
    if (!endpoint) {
      setError('Moonboys Sparky bridge is not configured for this page.');
      return;
    }

    appendMessage('user', 'You', message);
    if (input) input.value = '';
    if (sendButton) sendButton.disabled = true;
    setState('Contacting Sparky through SWARMSY...');

    try {
      var response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          npcId: SPARKY_NPC_ID,
          message: message,
          pagePath: window.location.pathname || '/swarmsy.html',
          telegram_auth: telegramAuth,
        }),
      });

      var payload = null;
      try {
        payload = await response.json();
      } catch (jsonError) {
        payload = null;
      }

      if (response.status === 401) setChatAuthenticated(false);
      if (!response.ok || !payload || payload.success !== true) {
        var bridgeError = payload && (payload.reply || payload.error);
        throw new Error(bridgeError || 'The Sparky bridge is not available yet.');
      }

      appendMessage('assistant', SPARKY_LABEL, payload.reply || 'No reply returned.');
      setState(payload.sourceSummary ? 'Answered with SWARMSY context.' : 'Answered.');
    } catch (error) {
      var messageText = error && error.message ? error.message : 'Sparky could not answer right now.';
      appendMessage('assistant', SPARKY_LABEL, messageText);
      setError(messageText);
      setState('Sparky bridge unavailable.');
    } finally {
      var stillAuthenticated = root.dataset.authenticated === 'true';
      if (sendButton) sendButton.disabled = !stillAuthenticated;
      if (input) {
        input.disabled = !stillAuthenticated;
        if (stillAuthenticated) input.focus();
      }
    }
  }

  if (form) form.addEventListener('submit', sendMessage);
  if (input && !input.getAttribute('placeholder')) input.setAttribute('placeholder', 'Ask Sparky...');
  injectTelegramLogin();
  refreshAuthGate();
})();
