(function () {
  'use strict';

  const ranking = document.querySelector('[data-gkniftyheads-rarity="true"]');
  if (!ranking) return;

  const fallback = ranking.querySelector('[data-rarity-fallback]');
  const commandDeck = ranking.querySelector('.gk-command-deck');
  const audit = ranking.querySelector('[data-rarity-audit]');
  const mainRows = Array.from(ranking.querySelectorAll('.gk-rarity-table tbody [data-rarity-filter]'));
  const rankedCards = Array.from(ranking.querySelectorAll('.gk-command-deck [data-rarity-filter]'));
  const utilityRows = Array.from(ranking.querySelectorAll('.gk-rarity-utility [data-rarity-filter]'));
  const unissuedRows = Array.from(ranking.querySelectorAll('.gk-rarity-unissued [data-rarity-filter]'));
  const utilitySection = ranking.querySelector('.gk-rarity-utility');
  const unissuedSection = ranking.querySelector('.gk-rarity-unissued');
  const filterButtons = Array.from(ranking.querySelectorAll('[data-gk-rarity-filter]'));

  function tokensFor(element) {
    return String(element.getAttribute('data-rarity-filter') || '').split(/\s+/);
  }

  function matchesFilter(element, normalized) {
    const tokens = tokensFor(element);
    return normalized === 'all-ranked'
      ? tokens.includes('ranked')
      : tokens.includes(normalized);
  }

  function applyFilter(filter) {
    const normalized = filter || 'all-ranked';
    const focusingUtility = normalized === 'utility-open-mint';
    const focusingUnissued = normalized === 'unissued';
    if (commandDeck) commandDeck.hidden = focusingUtility || focusingUnissued;
    if (audit) {
      audit.hidden = focusingUtility || focusingUnissued;
      if (normalized !== 'all-ranked' && !focusingUtility && !focusingUnissued) audit.open = true;
    }
    if (utilitySection) utilitySection.hidden = !(normalized === 'all-ranked' || focusingUtility);
    if (unissuedSection) unissuedSection.hidden = !(normalized === 'all-ranked' || focusingUnissued);
    for (const row of mainRows) {
      row.hidden = !matchesFilter(row, normalized);
    }
    for (const card of rankedCards) {
      card.hidden = !matchesFilter(card, normalized);
    }
    for (const row of utilityRows) {
      row.hidden = !(normalized === 'utility-open-mint' || normalized === 'all-ranked');
    }
    for (const row of unissuedRows) {
      row.hidden = !(normalized === 'unissued' || normalized === 'all-ranked');
    }
    for (const button of filterButtons) {
      button.classList.toggle('is-active', button.getAttribute('data-gk-rarity-filter') === normalized);
    }
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => applyFilter(button.getAttribute('data-gk-rarity-filter')));
  }

  applyFilter('all-ranked');

  fetch('/data/gkniftyheads/template-rarity.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`rarity json ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      ranking.dataset.rarityJsonStatus = payload?.live_data_status || 'loaded';
    })
    .catch(() => {
      ranking.dataset.rarityJsonStatus = 'unavailable';
      const generatedSections = ranking.querySelectorAll(
        '.gk-rarity-stats, .gk-command-deck, .gk-rarity-method, .gk-rarity-status, .gk-rarity-filters, .gk-rarity-audit, .gk-rarity-utility, .gk-rarity-unissued, .gk-rarity-source-note'
      );
      for (const section of generatedSections) section.hidden = true;
      if (fallback) fallback.hidden = false;
    });
}());
