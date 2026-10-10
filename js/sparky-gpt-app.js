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
  const all = catalog.categories.flatMap(c => c.activities);
  const byId = Object.fromEntries(all.map(a => [a.id, a]));
  const specialMoonboy = new Set(['moonboy']);
  const common = 'Act as SPARKY, my practical beginner-friendly creative guide. Take the lead without jargon or requiring SWARMSY, coding skills or a perfect plan. Start with ONE useful draft, ask at most ONE essential question and give me one achievable next action. If I say "you choose", use sensible defaults. Make actual files or artwork only when those tools exist; do not claim publication, bookings, prints, sales or completed actions without evidence. Clearly separate ideas, user-approved decisions, verified source facts and finished proof. Physical street art and promotion must use my property or explicitly authorised locations. Explain any accounts, hosting, payments or licences needed for real-world outcomes. If a guide URL cannot be read, say so and use these included instructions; never pretend private SWARMSY workspace access. Keep a portable project record.';
  function find(id) { return byId[id] || byId.start; }
  function makePrompt(id) {
    const a = find(id);
    const guides = [coreGuide, guideFor(a.guide)];
    if (specialMoonboy.has(a.id)) guides.push(moonboyGuide, moonboyIndex);
    return 'I came from the Crypto Moonboys SPARKY Creator Studio. ' + common +
      '\n\nMY STARTER: ' + a.title + '.\nMY GOAL: ' + a.goal +
      '\n\nPUBLIC INSTRUCTIONS: Please try to read only the relevant guides below before substantial work. State which URLs you actually accessed; if browsing is unavailable, continue with the rules in this message:\n' +
      guides.join('\n') +
      '\n\nMake the first useful thing now. For websites/wikis, offer actual working files and an honest publishing path. For a Moonboy, verify supplied identity/rights before claiming canon. Do not ask me to learn a software stack before getting creative.';
  }
  function makeUrl(id) { return 'https://chatgpt.com/?q=' + encodeURIComponent(makePrompt(id)); }
  root.SPARKY_CREATOR_APP = Object.freeze({catalog,all,find,makePrompt,makeUrl,guideFor});
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
  if (!mount || !choice || !summary || !link || !textarea || !details || !copy || !status || !guideLink || !search || !count) return;
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
    guideLink.textContent = 'Read the ' + a.guide.replace(/-/g, ' ') + ' guide';
    status.textContent = '';
    if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      root.dispatchEvent(new root.CustomEvent('sparky-activity-change', { detail: { id: a.id, title: a.title } }));
    }
  }
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
      section.open = !!q || groupNumber === 0 || items.some(a => a.id === selected);
      const heading = element('summary','gpt-group-title');
      heading.appendChild(element('strong','',category.title));
      heading.appendChild(element('span','gpt-group-count',items.length + ' activities'));
      section.appendChild(heading);
      const grid = element('div','gpt-route-grid');
      for (const a of items) {
        const button = element('button','gpt-route');
        button.type = 'button';
        button.setAttribute('data-activity',a.id);
        button.setAttribute('aria-pressed',a.id === selected ? 'true' : 'false');
        button.appendChild(element('strong','',a.title));
        button.appendChild(element('span','',a.goal));
        button.addEventListener('click',() => setActivity(a.id));
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
      if (root.location) root.location.hash = 'gpt-launch-title';
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
})(window);
