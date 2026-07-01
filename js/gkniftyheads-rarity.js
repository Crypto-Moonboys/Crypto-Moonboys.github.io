(function () {
  'use strict';

  const ranking = document.querySelector('[data-gkniftyheads-rarity="true"]');
  if (!ranking) return;

  const fallback = ranking.querySelector('[data-rarity-fallback]');
  const mainTableWrap = ranking.querySelector('.gk-rarity-table-wrap');
  const mainRows = Array.from(ranking.querySelectorAll('.gk-rarity-table tbody [data-rarity-filter]'));
  const utilitySection = ranking.querySelector('.gk-rarity-utility');
  const unissuedSection = ranking.querySelector('.gk-rarity-unissued');
  const filterButtons = Array.from(ranking.querySelectorAll('[data-gk-rarity-filter]'));

  function applyFilter(filter) {
    const normalized = filter || 'all-ranked';
    const focusingUtility = normalized === 'utility-open-mint';
    const focusingUnissued = normalized === 'unissued';
    if (mainTableWrap) mainTableWrap.hidden = focusingUtility || focusingUnissued;
    if (utilitySection) utilitySection.hidden = focusingUnissued;
    if (unissuedSection) unissuedSection.hidden = focusingUtility;
    for (const row of mainRows) {
      const tokens = String(row.getAttribute('data-rarity-filter') || '').split(/\s+/);
      const show = normalized === 'all-ranked'
        ? tokens.includes('ranked')
        : tokens.includes(normalized);
      row.hidden = !show;
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
        '.gk-rarity-stats, .gk-rarity-method, .gk-rarity-status, .gk-rarity-filters, .gk-rarity-table-wrap, .gk-rarity-utility, .gk-rarity-unissued, .gk-rarity-source-note'
      );
      for (const section of generatedSections) section.hidden = true;
      if (fallback) fallback.hidden = false;
    });
}());
