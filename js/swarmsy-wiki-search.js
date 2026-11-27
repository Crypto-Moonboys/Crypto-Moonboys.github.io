(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const form = byId('swarmsy-wiki-search');
  if (!form) return;
  const question = byId('search-page-input');
  const status = byId('swarmsy-wiki-status');
  const answer = byId('swarmsy-wiki-answer');
  const reply = byId('swarmsy-wiki-reply');
  const sources = byId('swarmsy-wiki-sources');
  const sourceList = byId('swarmsy-wiki-source-list');
  const button = form.querySelector('button[type="submit"]');
  let active;

  function announce(message) {
    status.hidden = !message;
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
    answer.hidden = true;
    reply.textContent = '';
    sourceList.replaceChildren();
    announce('');
  }

  question.addEventListener('input', clearAnswer);
  window.addEventListener('popstate', clearAnswer);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = question.value.trim();
    if (active || query.length < 2) return;
    clearAnswer();
    const base = window.MOONBOYS_API?.getApiBase?.({ mode: 'read' });
    if (!base) {
      announce('SWARMSY is unavailable. You can still browse the results below.');
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
      if (active !== controller) return;
      render(data);
      if (response.status === 429) {
        announce(data.error === 'daily_limit' ? 'SWARMSY reached its daily limit. Wiki search is still available below.'
          : 'Too many requests. Try again in a minute, or browse the Wiki results below.');
      } else if (!response.ok || typeof data.answer !== 'string') {
        announce('SWARMSY is unavailable. You can still browse the results below.');
      } else {
        announce('SWARMSY answer ready.');
      }
    } catch {
      if (active === controller) announce('SWARMSY is unavailable. You can still browse the results below.');
    } finally {
      if (active === controller) {
        active = null;
        button.disabled = false;
      }
    }
  });
})();
