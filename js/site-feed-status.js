(function () {
  'use strict';

  var STATUS_URL = '/data/feed-status.json';
  var LIVE_STATUS_OVERRIDES = {
    waxonedge_bubbles: '/api/waxonedge/live/status',
  };

  function label(status) {
    if (!status) return 'Feed status unavailable';
    if (status.feed_id === 'gkniftyheads_rarity') {
      var notes = (status.notes || []).join(' ');
      if (/\b[1-9]\d*\/\d+\s+live supply counts ok\b/i.test(notes)) {
        return 'Rarity snapshot active - live supply counted - burn baseline active';
      }
      return 'Rarity snapshot active - issued-supply fallback - live burn scan pending';
    }
    if (status.feed_id === 'waxonedge_bubbles' && status.status === 'live') {
      return 'waxonedge_bubbles - live - checked: ' + (status.last_successful_check || status.checked_at || 'current');
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

  function renderNode(node, status) {
    node.classList.toggle('is-stale', !!(status && status.stale));
    node.classList.toggle('is-error', !!(status && status.status === 'error'));
    node.textContent = label(status);
    node.setAttribute('title', detailLabel(status));
  }

  function liveStatusFromPayload(feedId, payload) {
    if (feedId !== 'waxonedge_bubbles' || !payload || typeof payload !== 'object') return null;
    var live = payload.ok === true && payload.status === 'live' && payload.stale !== true;
    var checkedAt = payload.checked_at || payload.generated_at || new Date().toISOString();
    var probe = payload.live_indexer_probe || {};
    return {
      feed_id: feedId,
      feed_mode: 'live',
      status: live ? 'live' : 'degraded',
      stale: !live,
      checked_at: checkedAt,
      last_successful_check: live ? checkedAt : null,
      source_updated_at: checkedAt,
      last_error: live ? null : (payload.error || probe.last_error || 'live status unavailable'),
    };
  }

  function refreshLiveOverrides() {
    document.querySelectorAll('[data-feed-status-id]').forEach(function (node) {
      var feedId = node.getAttribute('data-feed-status-id');
      var endpoint = LIVE_STATUS_OVERRIDES[feedId];
      if (!endpoint) return;
      fetch(endpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
        .then(function (response) {
          if (!response.ok) throw new Error('live status HTTP ' + response.status);
          return response.json();
        })
        .then(function (payload) {
          var liveStatus = liveStatusFromPayload(feedId, payload);
          if (liveStatus) renderNode(node, liveStatus);
        })
        .catch(function () {});
    });
  }

  function render(statuses) {
    var feeds = statuses && statuses.feeds ? statuses.feeds : {};
    document.querySelectorAll('[data-feed-status-id]').forEach(function (node) {
      var feedId = node.getAttribute('data-feed-status-id');
      renderNode(node, feeds[feedId]);
    });
    refreshLiveOverrides();
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
