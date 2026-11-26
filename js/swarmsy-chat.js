(() => {
  'use strict';

  const root = document.querySelector('[data-swarmsy-chat]');
  if (!root) return;
  const find = name => root.querySelector(`[data-chat-${name}]`);
  const signin = find('signin');
  const login = find('login');
  const workspace = find('workspace');
  const reset = find('reset');
  const starters = find('starters');
  const log = find('log');
  const form = find('form');
  const input = find('message');
  const canon = find('canon');
  const send = find('send');
  const status = find('status');
  const gate = window.MOONBOYS_IDENTITY;
  const safeSource = /^https:\/\/cryptomoonboys\.com\/(?:wiki\/[a-z0-9-]+\.html|about\/latest-canon-and-brand-vision\.md)$/;
  if (!gate) {
    status.textContent = 'Telegram sign-in is temporarily unavailable.';
    return;
  }

  let owner = null;
  let conversationId = null;
  let active = null;
  let authProbe = 0;

  function clearConversation() {
    active?.abort();
    active = null;
    conversationId = owner ? crypto.randomUUID() : null;
    log.replaceChildren();
    input.value = '';
    canon.checked = false;
    send.disabled = false;
    input.readOnly = false;
    starters.hidden = false;
    status.textContent = '';
  }

  function setOwner(id) {
    if (owner !== id) {
      owner = id;
      clearConversation();
    }
    workspace.hidden = !id;
    signin.hidden = Boolean(id);
    reset.hidden = !id;
  }

  async function refreshIdentity() {
    const probe = ++authProbe;
    const current = gate.getTelegramId();
    if (owner && current !== owner) setOwner(null);
    const auth = await gate.getFreshTelegramAuth().catch(() => null);
    if (probe !== authProbe) return;
    setOwner(auth?.id && String(auth.id) === gate.getTelegramId() ? String(auth.id) : null);
    status.textContent = '';
  }

  function appendInline(node, text) {
    const pieces = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
    for (const piece of pieces) {
      const tag = piece.startsWith('**') && piece.endsWith('**') && piece.length > 4
        ? 'strong' : piece.startsWith('`') && piece.endsWith('`') && piece.length > 2 ? 'code' : '';
      if (!tag) {
        node.append(piece);
        continue;
      }
      const token = document.createElement(tag);
      token.textContent = tag === 'strong' ? piece.slice(2, -2) : piece.slice(1, -1);
      node.append(token);
    }
  }

  function appendReply(turn, reply) {
    let list = null;
    for (const line of reply.split('\n')) {
      const item = line.match(/^\s*(?:([-*])|(\d+)[.)])\s+(.+)/);
      if (item) {
        const type = item[1] ? 'UL' : 'OL';
        if (list?.tagName !== type) {
          list = document.createElement(type);
          if (type === 'OL') list.start = Number(item[2]);
          turn.append(list);
        }
        const entry = document.createElement('li');
        appendInline(entry, item[3]);
        list.append(entry);
        continue;
      }
      list = null;
      if (!line.trim()) continue;
      const heading = line.match(/^#{1,6}\s+(.+)/);
      const entry = document.createElement(heading ? 'h3' : 'p');
      appendInline(entry, heading?.[1] ?? line);
      turn.append(entry);
    }
  }

  function appendTurn(role, message, sources = []) {
    const turn = document.createElement('article');
    turn.className = 'swarmsy-chat-turn';
    turn.dataset.role = role;
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'You' : 'SPARKY';
    turn.append(label);
    if (role === 'user') {
      const text = document.createElement('p');
      text.textContent = message;
      turn.append(text);
    } else {
      appendReply(turn, message);
      const links = document.createElement('ul');
      for (const source of sources) {
        if (typeof source?.title !== 'string' || !safeSource.test(source.url)) continue;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title;
        item.append(link);
        links.append(item);
      }
      if (links.childElementCount) {
        const heading = document.createElement('h4');
        heading.textContent = 'Public canon sources';
        turn.append(heading, links);
      }
    }
    log.append(turn);
    log.scrollTop = log.scrollHeight;
    return turn;
  }

  login.addEventListener('click', () => {
    gate.loginWithTelegram().catch(() => { status.textContent = 'Telegram sign-in is temporarily unavailable.'; });
  });
  reset.addEventListener('click', () => {
    clearConversation();
    input.focus();
  });
  starters.addEventListener('click', event => {
    const choice = event.target.closest('button[data-starter]');
    if (!choice || active) return;
    input.value = choice.dataset.starter;
    canon.checked = choice.hasAttribute('data-canon');
    input.focus();
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });

  const errors = {
    access_denied: 'This Telegram account cannot use SPARKY chat.',
    rate_limited: 'Too many messages. Wait a minute and try again.',
    invalid_request: 'Enter a message of up to 2,000 characters.',
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (active || !owner || !message) return;
    const controller = new AbortController();
    active = controller;
    const current = () => active === controller && owner === gate.getTelegramId();
    const publicCanon = canon.checked;
    const id = conversationId;
    const base = window.MOONBOYS_API?.getApiBase({ mode: 'write' });
    let turn;
    send.disabled = true;
    input.readOnly = true;
    status.textContent = 'SPARKY is working…';
    try {
      const auth = await gate.getFreshTelegramAuth();
      if (!current()) return;
      if (!auth || String(auth.id) !== owner) {
        setOwner(null);
        status.textContent = 'Sign in again to continue.';
        return;
      }
      if (!base) throw new Error('chat_unavailable');
      turn = appendTurn('user', message);
      const response = await fetch(base.replace(/\/$/, '') + '/swarmsy/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50_000)]),
        body: JSON.stringify({ message, conversation_id: id, public_canon: publicCanon, telegram_auth: auth }),
      });
      const result = await response.json();
      if (!current()) return;
      if (response.status === 401) {
        setOwner(null);
        status.textContent = 'Your Telegram sign-in expired. Sign in again to continue.';
        return;
      }
      if (!response.ok || typeof result?.reply !== 'string') throw new Error(result?.error);
      appendTurn('assistant', result.reply, Array.isArray(result.sources) ? result.sources : []);
      input.value = '';
      starters.hidden = true;
      status.textContent = result.canon === 'unavailable' ? 'No verified public canon sources found for this question.' : '';
    } catch (error) {
      if (!current()) return;
      turn?.remove();
      status.textContent = Object.hasOwn(errors, error?.message)
        ? errors[error.message] : 'SPARKY is temporarily unavailable. Try again in a moment.';
    } finally {
      if (active === controller) {
        active = null;
        send.disabled = false;
        input.readOnly = false;
      }
    }
  });

  window.addEventListener('moonboys:identity-change', refreshIdentity);
  window.addEventListener('pageshow', event => { if (event.persisted) refreshIdentity(); });
  refreshIdentity();
})();
