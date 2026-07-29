(function () {
  'use strict';

  const ranking = document.querySelector('[data-gkniftyheads-rarity="true"]');
  if (!ranking) return;

  const fallback = ranking.querySelector('[data-rarity-fallback]');
  const commandDeck = ranking.querySelector('.gk-command-deck');
  const audit = ranking.querySelector('[data-rarity-audit]');
  const mainRows = Array.from(ranking.querySelectorAll('.gk-rarity-table tbody [data-rarity-filter]'));
  const rankedCards = Array.from(ranking.querySelectorAll('.gk-command-deck [data-rarity-filter]'));
  const auditCards = Array.from(ranking.querySelectorAll('[data-rarity-audit] .gk-audit-card[data-rarity-filter]'));
  const auditGroups = Array.from(ranking.querySelectorAll('[data-rarity-audit] .gk-audit-card-group'));
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
    const matchingRankedCards = rankedCards.filter((card) => matchesFilter(card, normalized));
    if (commandDeck) commandDeck.hidden = focusingUtility || focusingUnissued || matchingRankedCards.length === 0;
    if (audit) {
      audit.hidden = focusingUtility || focusingUnissued;
      if (normalized !== 'all-ranked' && !focusingUtility && !focusingUnissued) audit.open = true;
    }
    if (utilitySection) utilitySection.hidden = !(normalized === 'all-ranked' || focusingUtility);
    if (unissuedSection) unissuedSection.hidden = !(normalized === 'all-ranked' || focusingUnissued);
    for (const row of mainRows) row.hidden = !matchesFilter(row, normalized);
    for (const card of rankedCards) card.hidden = !matchesFilter(card, normalized);
    for (const card of auditCards) card.hidden = !matchesFilter(card, normalized);
    for (const group of auditGroups) {
      const visibleCards = Array.from(group.querySelectorAll('.gk-audit-card[data-rarity-filter]')).filter((card) => !card.hidden);
      group.hidden = visibleCards.length === 0;
    }
    for (const row of utilityRows) row.hidden = !(normalized === 'utility-open-mint' || normalized === 'all-ranked');
    for (const row of unissuedRows) row.hidden = !(normalized === 'unissued' || normalized === 'all-ranked');
    for (const button of filterButtons) {
      button.classList.toggle('is-active', button.getAttribute('data-gk-rarity-filter') === normalized);
    }
  }

  function firstNumber(value, keys) {
    const payload = value && typeof value === 'object' && value.data ? value.data : value;
    for (const key of keys) {
      const raw = payload && payload[key];
      const number = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function formatNumber(value, options) {
    if (!Number.isFinite(value)) return 'Temporarily unavailable';
    const config = options || {};
    const formatted = new Intl.NumberFormat('en-GB', {
      maximumFractionDigits: config.maximumFractionDigits == null ? 0 : config.maximumFractionDigits,
    }).format(value);
    return `${config.prefix || ''}${formatted}${config.suffix || ''}`;
  }

  function topTemplateNames(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows.slice(0, 5).map((row) => {
      const template = row && row.template;
      if (!template || typeof template !== 'object') return '';
      return String(template.name || template.template_name || template.template_id || '').trim();
    }).filter(Boolean);
  }

  function topUserNames(value) {
    const payload = value && typeof value === 'object' && !Array.isArray(value) && value.data ? value.data : value;
    const rows = Array.isArray(payload)
      ? payload
      : [payload && payload.users, payload && payload.rows, payload && payload.results].find(Array.isArray) || [];
    return rows.slice(0, 5).map((row) => {
      if (typeof row === 'string' || typeof row === 'number') return String(row).trim();
      if (!row || typeof row !== 'object') return '';
      return String(row.account || row.owner || row.user || row.name || '').trim();
    }).filter(Boolean);
  }

  function endpointSucceeded(status, key) {
    return Boolean(status && status[key] && status[key].ok === true);
  }

  function replaceStat(section, label, value) {
    const cards = Array.from(section.querySelectorAll('.wiki-stat'));
    const card = cards.find((item) => {
      const span = item.querySelector('span');
      return span && span.textContent.trim() === label;
    });
    const strong = card && card.querySelector('strong');
    if (strong) strong.textContent = value;
  }

  function snapshotLabel(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
      : 'time unavailable';
  }

  function hydrateMarketAnalytics(payload) {
    const section = ranking.querySelector('.nft-market-analytics');
    if (!section || !payload || typeof payload !== 'object') return;
    const data = payload.data || {};
    const endpointStatus = payload.endpoint_status || {};

    const totalAssets = endpointSucceeded(endpointStatus, 'num_assets')
      ? firstNumber(data.num_assets, ['numberOfAssets', 'numAssets'])
      : endpointSucceeded(endpointStatus, 'collection_stats')
        ? firstNumber(data.collection_stats, ['numAssets'])
        : null;
    const marketCapUsd = endpointSucceeded(endpointStatus, 'marketcap')
      ? firstNumber(data.marketcap, ['usdMarketCap', 'marketCap'])
      : endpointSucceeded(endpointStatus, 'collection_stats')
        ? firstNumber(data.collection_stats, ['usdMarketCap'])
        : null;
    const volumeWax = endpointSucceeded(endpointStatus, 'volume')
      ? firstNumber(data.volume, ['waxVolume'])
      : null;
    const templateNames = endpointSucceeded(endpointStatus, 'top_templates') ? topTemplateNames(data.top_templates) : [];
    const userNames = endpointSucceeded(endpointStatus, 'top_users') ? topUserNames(data.top_users) : [];

    replaceStat(section, 'Total assets', formatNumber(totalAssets));
    replaceStat(section, 'Market cap', formatNumber(marketCapUsd, { prefix: 'US$', maximumFractionDigits: 2 }));
    replaceStat(section, `Volume (${payload.days || 30}d)`, formatNumber(volumeWax, { suffix: ' WAXP', maximumFractionDigits: 2 }));
    replaceStat(section, 'Top users', userNames.length ? userNames.join(', ') : 'Temporarily unavailable');
    replaceStat(section, 'Top templates', templateNames.length ? templateNames.join(', ') : 'Temporarily unavailable');

    const status = section.querySelector('.lore-paragraph small');
    if (status) {
      const failed = Object.entries(endpointStatus)
        .filter(([, row]) => !row || !row.ok)
        .map(([key]) => key === 'top_users' ? 'top users' : key.replaceAll('_', ' '));
      const generated = snapshotLabel(payload.generated_at);
      status.textContent = failed.length
        ? `24-hour snapshot generated ${generated}. Analytics status: ${payload.analytics_status || payload.status || 'degraded'}. Temporarily unavailable: ${failed.join(', ')}. Every displayed value came from a successful endpoint in this snapshot.`
        : `24-hour snapshot generated ${generated}. Analytics status: ${payload.analytics_status || payload.status || 'ok'}. Every displayed value came from this completed snapshot.`;
    }
  }

  function loadMarketAnalytics() {
    fetch('/data/gkniftyheads/market-analytics.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`market analytics ${response.status}`);
        return response.json();
      })
      .then(hydrateMarketAnalytics)
      .catch(() => {
        const section = ranking.querySelector('.nft-market-analytics');
        const status = section && section.querySelector('.lore-paragraph small');
        if (status) status.textContent = 'Market analytics are temporarily unavailable. AtomicAssets rarity data is unaffected.';
      });
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => applyFilter(button.getAttribute('data-gk-rarity-filter')));
  }

  applyFilter('all-ranked');
  loadMarketAnalytics();

  fetch('/data/gkniftyheads/template-rarity.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`rarity json ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      ranking.dataset.rarityJsonStatus = payload?.live_data_status || 'loaded';
      ranking.dataset.raritySnapshotGeneratedAt = payload?.generated_at || '';
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
