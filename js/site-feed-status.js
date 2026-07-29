(function () {
  'use strict';

  var STATUS_URL = '/data/feed-status.json';

  function gkniftyheadsLabel(status) {
    if (!status) return 'Feed status unavailable';
    var notes = (status.notes || []).join(' ');
    var liveSupplyActive = /\b[1-9]\d*\/\d+\s+live supply counts ok\b/i.test(notes);
    var reconciliationPassed = /Rarity reconciliation passed:/i.test(notes);
    var burnBaselinePending = /Historic burn baseline is pending/i.test(notes);
    var parts = ['24-hour rarity snapshot'];

    if (status.stale) parts.push('stale');
    else if (status.status === 'degraded') parts.push('degraded');
    else parts.push('active');

    parts.push(liveSupplyActive ? 'AtomicAssets live supply counted' : 'issued-supply fallback');
    parts.push(reconciliationPassed ? 'totals reconciled' : 'reconciliation pending');
    parts.push(burnBaselinePending ? 'historic burn baseline pending' : 'burn status from latest snapshot');

    if (status.analytics_status) parts.push('market analytics ' + status.analytics_status);
    return parts.join(' - ');
  }

  function label(status) {
    if (!status) return 'Feed status unavailable';
    if (status.feed_id === 'gkniftyheads_rarity') return gkniftyheadsLabel(status);
    var parts = [status.feed_id || 'feed'];
    if (status.feed_mode) parts.push(status.feed_mode);
    if (status.status) parts.push(status.status);
    if (status.stale) parts.push('stale');
    if (status.source_updated_at) parts.push('source ' + status.source_updated_at);
    if (status.last_successful_check) parts.push('checked ' + status.last_successful_check);
    return parts.join(' - ');
  }

  function detailLabel(status) {
    if (!status) return 'Feed status unavailable';
    var parts = [label(status)];
    if (status.source_updated_at) parts.push('snapshot ' + status.source_updated_at);
    if (status.last_error) parts.push('last issue: ' + status.last_error);
    return parts.join(' - ');
  }

  function render(statuses) {
    var feeds = statuses && statuses.feeds ? statuses.feeds : {};
    document.querySelectorAll('[data-feed-status-id]').forEach(function (node) {
      var feedId = node.getAttribute('data-feed-status-id');
      var status = feeds[feedId];
      node.classList.toggle('is-stale', !!(status && status.stale));
      node.classList.toggle('is-error', !!(status && (status.status === 'error' || status.status === 'degraded')));
      node.textContent = label(status);
      node.setAttribute('title', detailLabel(status));
      node.hidden = false;
      node.removeAttribute('aria-hidden');
    });
  }

  fetch(STATUS_URL, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(function (response) {
      if (!response.ok) throw new Error('feed status HTTP ' + response.status);
      return response.json();
    })
    .then(render)
    .catch(function () {
      render({ feeds: {} });
    });
}());
