(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const dialog = byId('swarmsy-wiki-chat');
  const form = byId('swarmsy-wiki-search');
  if (!form || typeof dialog?.showModal !== 'function') return;
  const opener = byId('swarmsy-wiki-open');
  const close = byId('swarmsy-wiki-close');
  const search = byId('search-page-input');
  const question = byId('swarmsy-wiki-question');
  const sent = byId('swarmsy-wiki-sent');
  const thread = byId('swarmsy-wiki-thread');
  const status = byId('swarmsy-wiki-status');
  const answer = byId('swarmsy-wiki-answer');
  const reply = byId('swarmsy-wiki-reply');
  const sources = byId('swarmsy-wiki-sources');
  const sourceList = byId('swarmsy-wiki-source-list');
  const button = form.querySelector('button[type="submit"]');
  let active;

  function announce(message) {
    status.textContent = message;
  }

  function sourceLink(source, label = source?.title) {
    const url = typeof source?.url === 'string' && URL.parse(source.url);
    if (url?.protocol !== 'https:' || url.username || url.password || typeof label !== 'string') return null;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  }

  function render(data) {
    const text = typeof data.answer === 'string' ? data.answer : '';
    reply.textContent = text;
    for (const source of Array.isArray(data.wiki_sources) ? data.wiki_sources : []) {
      const link = sourceLink(source);
      if (!link || new URL(link.href).origin !== 'https://cryptomoonboys.com') continue;
      const item = document.createElement('li');
      item.append(link);
      sourceList.append(item);
    }
    sources.hidden = !sourceList.childElementCount;
    answer.hidden = !text && sources.hidden;
    byId('swarmsy-wiki-answer-title').textContent = text ? 'SWARMSY answer' : 'Related wiki pages';
  }

  function clearAnswer() {
    active?.abort();
    active = null;
    button.disabled = false;
    sent.hidden = true;
    sent.textContent = '';
    answer.hidden = true;
    reply.textContent = '';
    sourceList.replaceChildren();
    announce('');
  }

  opener.addEventListener('click', () => {
    if (dialog.open) return;
    clearAnswer();
    question.value = search.value.trim().slice(0, question.maxLength);
    dialog.showModal();
    if (question.value.length >= question.minLength) form.requestSubmit();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearAnswer();
    opener.focus({ preventScroll: true });
  });
  opener.hidden = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = question.value.trim();
    if (!dialog.open || active) return;
    if (query.length < question.minLength) {
      announce('Enter at least two characters.');
      question.focus();
      return;
    }
    clearAnswer();
    sent.textContent = query;
    sent.hidden = false;
    thread.scrollTop = 0;
    question.value = '';
    question.focus();
    const base = window.MOONBOYS_API?.getApiBase?.({ mode: 'read' });
    const unavailable = 'SWARMSY is unavailable. Close the chat to browse the Wiki.';
    if (!base) {
      announce(unavailable);
      return;
    }
    const controller = new AbortController();
    active = controller;
    button.disabled = true;
    announce('SWARMSY is checking the Wiki…');
    try {
      const response = await fetch(base.replace(/\/$/, '') + '/swarmsy/wiki-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ question: query }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
      });
      const data = await response.json();
      if (!dialog.open || active !== controller) return;
      render(data);
      if (response.status === 429) {
        announce(data.error === 'daily_limit' ? 'SWARMSY reached its daily limit. Close the chat to browse the Wiki.'
          : 'Too many requests. Try again in a minute.');
      } else if (!response.ok || typeof data.answer !== 'string') {
        announce(unavailable);
      } else {
        announce('SWARMSY answer ready.');
      }
    } catch {
      if (dialog.open && active === controller) announce(unavailable);
    } finally {
      if (active === controller) {
        active = null;
        button.disabled = false;
      }
    }
  });
})();
