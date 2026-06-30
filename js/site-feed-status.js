(function () {
  'use strict';

  var STATUS_URL = '/data/feed-status.json';

  function label(status) {
    if (!status) return 'Feed status unavailable';
    var parts = [status.feed_id || 'feed'];
    if (status.status) parts.push(status.status);
    if (status.stale) parts.push('stale');
    if (status.last_successful_update) parts.push('updated ' + status.last_successful_update);
    if (status.last_error) parts.push('last error: ' + status.last_error);
    return parts.join(' · ');
  }

  function render(statuses) {
    var feeds = statuses && statuses.feeds ? statuses.feeds : {};
    document.querySelectorAll('[data-feed-status-id]').forEach(function (node) {
      var feedId = node.getAttribute('data-feed-status-id');
      var status = feeds[feedId];
      node.classList.toggle('is-stale', !!(status && status.stale));
      node.classList.toggle('is-error', !!(status && status.status === 'error'));
      node.textContent = label(status);
      node.setAttribute('title', label(status));
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
