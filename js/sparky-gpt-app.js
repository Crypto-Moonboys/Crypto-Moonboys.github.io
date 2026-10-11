/* SPARKY public creator directory: no third-party JavaScript or tokens. */
(function (root) {
  'use strict';
  const catalog = root.SPARKY_CREATOR_CATALOG;
  if (!catalog || !Array.isArray(catalog.categories)) return;
  const BASE = 'https://cryptomoonboys.com/';
  const coreGuide = BASE + 'sparky-chatgpt-guide.txt';
  const guideFor = id => id === 'core' ? coreGuide : BASE + 'guides/sparky/' + id + '.txt';
  const moonboyGuide = BASE + 'moonboy-ai-canon-guide.txt';
  const moonboyIndex = BASE + 'moonboy-canon-index.json';
  const contextUrl = BASE + 'graffiti-kings-creative-guide.html';
  const contextPrompt = 'Before creating, browse ' + contextUrl + ' for this project\'s Graffiti Kings culture, voice and creative direction. Apply it to my chosen task while respecting my own identity and preferences. If you cannot read it, say so and ask me to paste the page text.';
  const all = catalog.categories.flatMap(c => c.activities);
  const byId = Object.fromEntries(all.map(a => [a.id, a]));
  const common = "I'm a beginner. Use plain language, make a useful first draft, and give me one practical next step. Ask one essential question if you need it; otherwise choose sensible defaults and start.";
  function find(id) { return byId[id] || byId.start; }
  function makePrompt(id) {
    const a = find(id);
    let prompt = a.title + '.\n\n' + a.goal + '\n\n' + common;
    if (a.id === 'moonboy') {
      prompt += '\n\nFor Crypto Moonboys details, use the public canon guide and source index:\n' +
        moonboyGuide + '\n' + moonboyIndex +
        '\nIf you cannot read them, ask me to supply the relevant source text before making canon claims. Keep new ideas separate from published canon.';
    }
    return prompt + '\n\n' + contextPrompt;
  }
  function makeUrl(id) { return 'https://chatgpt.com/?q=' + encodeURIComponent(makePrompt(id)); }
  root.SPARKY_CREATOR_APP = Object.freeze({catalog,all,find,makePrompt,makeUrl,guideFor,contextUrl,contextPrompt});
  if (!root.document) return;
  const doc = root.document;
  const mount = doc.getElementById('gpt-activity-groups');
  const choice = doc.getElementById('gpt-choice');
  const summary = doc.getElementById('gpt-what');
  const link = doc.getElementById('gpt-open-link');
  const textarea = doc.getElementById('gpt-prompt-preview');
  const details = doc.getElementById('gpt-prompt-details');
  const copy = doc.getElementById('gpt-copy-prompt');
  const status = doc.getElementById('gpt-copy-status');
  const guideLink = doc.getElementById('gpt-guide-link');
  const search = doc.getElementById('gpt-search');
  const count = doc.getElementById('gpt-search-count');
  const launchHeading = doc.getElementById('gpt-launch-title');
  // Older cached pages have the heading but no destination section ID.
  const launch = doc.getElementById('gpt-launch') || (launchHeading && launchHeading.closest('section'));
  if (!mount || !choice || !summary || !link || !textarea || !details || !copy || !status || !guideLink || !search || !count || !launch || !launchHeading) return;
  launchHeading.setAttribute('tabindex', '-1');
  let selected = find(new URLSearchParams(root.location ? root.location.search : '').get('activity')).id;
  const buttons = new Map();
  function element(tag, className, content) {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (content !== undefined) n.textContent = content;
    return n;
  }
  function setActivity(id) {
    const a = find(id);
    selected = a.id;
    buttons.forEach((button, key) => button.setAttribute('aria-pressed', key === selected ? 'true' : 'false'));
    choice.textContent = 'Selected: ' + a.title;
    summary.textContent = a.goal;
    const prompt = makePrompt(selected);
    textarea.value = prompt;
    link.href = makeUrl(selected);
    guideLink.href = guideFor(a.guide);
    guideLink.textContent = 'Optional ' + a.guide.replace(/-/g, ' ') + ' guide';
    status.textContent = '';
    if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      root.dispatchEvent(new root.CustomEvent('sparky-activity-change', { detail: { id: a.id, title: a.title } }));
    }
  }
  function showSection(section, heading) {
    const header = doc.getElementById('site-header');
    if (header) section.style.scrollMarginTop = Math.ceil(header.getBoundingClientRect().height) + 16 + 'px';
    const reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A repeated fragment assignment does not scroll. Move explicitly every time.
    heading.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }
  function showStarter() { showSection(launch, launchHeading); }
  function render(filter) {
    const q = String(filter || '').toLocaleLowerCase().trim();
    mount.replaceChildren();
    buttons.clear();
    let visible = 0;
    catalog.categories.forEach((category, groupNumber) => {
      const items = category.activities.filter(a => !q || (a.title + ' ' + a.goal + ' ' + category.title).toLocaleLowerCase().includes(q));
      if (!items.length) return;
      visible += items.length;
      const section = element('details','gpt-group');
      section.id = 'gpt-category-' + groupNumber;
      section.open = !!q || items.some(a => a.id === selected);
      const heading = element('summary','gpt-group-title');
      heading.appendChild(element('strong','',category.title));
      heading.appendChild(element('span','gpt-group-count',items.length + ' activities'));
      heading.addEventListener('click', event => {
        event.preventDefault();
        const open = !section.open;
        mount.querySelectorAll('.gpt-group').forEach(group => { group.open = false; });
        section.open = open;
        if (open) showSection(section, heading);
      });
      section.appendChild(heading);
      const grid = element('div','gpt-route-grid');
      for (const a of items) {
        const button = element('button','gpt-route');
        button.type = 'button';
        button.setAttribute('data-activity',a.id);
        button.setAttribute('aria-pressed',a.id === selected ? 'true' : 'false');
        button.appendChild(element('strong','',a.title));
        button.appendChild(element('span','',a.goal));
        button.addEventListener('click',() => {
          setActivity(a.id);
          showStarter();
        });
        buttons.set(a.id,button);
        grid.appendChild(button);
      }
      section.appendChild(grid);
      mount.appendChild(section);
    });
    count.textContent = visible + ' activities' + (q ? ' matching your search' : ' across 12 sections');
  }
  search.addEventListener('input',() => {
    render(search.value);
    setActivity(selected);
  });
  doc.querySelectorAll('[data-feature]').forEach(button => {
    button.addEventListener('click',() => {
      const activity = find(button.getAttribute('data-feature'));
      search.value = '';
      selected = activity.id;
      render('');
      setActivity(activity.id);
      const group = mount.querySelector('[data-activity="' + activity.id + '"]');
      if (group) {
        const holder = group.closest('details');
        if (holder) holder.open = true;
      }
      showStarter();
    });
  });
  copy.addEventListener('click',async () => {
    try {
      if (!root.navigator || !root.navigator.clipboard || !root.navigator.clipboard.writeText) throw new Error('Clipboard not available');
      await root.navigator.clipboard.writeText(textarea.value);
      status.textContent = 'Starter message copied. Paste it into ChatGPT and press Send.';
    } catch (_) {
      details.open = true;
      textarea.focus();
      textarea.select();
      status.textContent = 'Copy the highlighted message, paste it into ChatGPT and press Send.';
    }
  });
  render('');
  setActivity(selected);
  doc.querySelectorAll('[data-feature]').forEach(button => { button.disabled = false; });
  search.disabled = false;
  copy.disabled = false;
})(window);
