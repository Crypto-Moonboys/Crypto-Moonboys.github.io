/*
 * Crypto Moonboys — Paperclip/Sparky public chat client.
 * Calls the public Moonboys API bridge only. Does not expose SWARMSY admin URLs,
 * bridge tokens, private prompts, or workspace keys in browser code.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var root = document.querySelector('[data-paperclip-chat]');
  if (!root) return;

  var form = root.querySelector('[data-paperclip-form]');
  var input = root.querySelector('[data-paperclip-input]');
  var npcSelect = root.querySelector('[data-paperclip-npc]');
  var log = root.querySelector('[data-paperclip-log]');
  var sendButton = root.querySelector('[data-paperclip-send]');
  var state = root.querySelector('[data-paperclip-state]');
  var errorBox = root.querySelector('[data-paperclip-error]');

  var NPC_LABELS = {
    paperclip: 'Paperclip',
    sparky: 'Sparky',
  };

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

  function selectedNpcId() {
    var npcId = String((npcSelect && npcSelect.value) || 'paperclip').toLowerCase();
    return NPC_LABELS[npcId] ? npcId : 'paperclip';
  }

  async function sendMessage(event) {
    event.preventDefault();
    setError('');

    var message = safeText(input && input.value).trim();
    var npcId = selectedNpcId();
    var npcLabel = NPC_LABELS[npcId] || 'Paperclip';
    var endpoint = endpointUrl();

    if (!message) {
      setError('Type a message first.');
      return;
    }
    if (!endpoint) {
      setError('Moonboys API bridge is not configured for this page.');
      return;
    }

    appendMessage('user', 'You', message);
    if (input) input.value = '';
    if (sendButton) sendButton.disabled = true;
    setState('Contacting ' + npcLabel + ' through SWARMSY...');

    try {
      var response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          npcId: npcId,
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
        throw new Error(bridgeError || 'The Paperclip bridge is not available yet.');
      }

      appendMessage('assistant', payload.displayName || npcLabel, payload.reply || 'No reply returned.');
      setState(payload.sourceSummary ? 'Answered with SWARMSY context.' : 'Answered.');
    } catch (error) {
      var messageText = error && error.message ? error.message : 'Paperclip could not answer right now.';
      appendMessage('assistant', npcLabel, messageText);
      setError(messageText);
      setState('Bridge unavailable.');
    } finally {
      if (sendButton) sendButton.disabled = false;
      if (input) input.focus();
    }
  }

  if (form) form.addEventListener('submit', sendMessage);
  setState(endpointUrl() ? 'Ready.' : 'API bridge config required.');
})();
