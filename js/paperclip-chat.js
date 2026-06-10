/*
 * Crypto Moonboys — Sparky public chat client.
 * Calls the public Moonboys API bridge only. Does not expose SWARMSY admin URLs,
 * bridge tokens, private prompts, or workspace keys in browser code.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var root = document.querySelector('[data-paperclip-chat]');
  if (!root) return;

  var SPARKY_NPC_ID = 'sparky';
  var SPARKY_LABEL = 'Sparky';

  var form = root.querySelector('[data-paperclip-form]');
  var input = root.querySelector('[data-paperclip-input]');
  var log = root.querySelector('[data-paperclip-log]');
  var sendButton = root.querySelector('[data-paperclip-send]');
  var state = root.querySelector('[data-paperclip-state]');
  var errorBox = root.querySelector('[data-paperclip-error]');

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
    message.className = 'paperclip-message';
    message.dataset.role = role;

    var meta = document.createElement('span');
    meta.className = 'paperclip-meta';
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

  async function sendMessage(event) {
    event.preventDefault();
    setError('');

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
          pagePath: window.location.pathname || '/paperclip.html',
        }),
      });

      var payload = null;
      try {
        payload = await response.json();
      } catch (jsonError) {
        payload = null;
      }

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
      if (sendButton) sendButton.disabled = false;
      if (input) input.focus();
    }
  }

  if (form) form.addEventListener('submit', sendMessage);
  if (input && !input.getAttribute('placeholder')) input.setAttribute('placeholder', 'Ask Sparky...');
  setState(endpointUrl() ? 'Ready.' : 'API bridge config required.');
})();
