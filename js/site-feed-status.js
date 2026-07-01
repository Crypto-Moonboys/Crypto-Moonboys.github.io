(function () {
  'use strict';

  var STATUS_URL = '/data/feed-status.json';

  function label(status) {
    if (!status) return 'Feed status unavailable';
    if (status.feed_id === 'gkniftyheads_rarity') {
      var notes = (status.notes || []).join(' ');
      if (/\b[1-9]\d*\/\d+\s+live supply counts ok\b/i.test(notes)) {
        return 'Rarity snapshot active - live supply counted - burn baseline active';
      }
      return 'Rarity snapshot active - issued-supply fallback - live burn scan pending';
    }
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
    if (status.last_error) parts.push('last error: ' + status.last_error);
    return parts.join(' - ');
  }

  function render(statuses) {
    var feeds = statuses && statuses.feeds ? statuses.feeds : {};
    document.querySelectorAll('[data-feed-status-id]').forEach(function (node) {
      var feedId = node.getAttribute('data-feed-status-id');
      var status = feeds[feedId];
      node.classList.toggle('is-stale', !!(status && status.stale));
      node.classList.toggle('is-error', !!(status && status.status === 'error'));
      node.textContent = label(status);
      node.setAttribute('title', detailLabel(status));
    });
  }

  fetch(STATUS_URL, { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('feed status HTTP ' + response.status);
      return response.json();
    })
    .then(render)
    .catch(function () {
      render({ feeds: {} });
    });
}());
