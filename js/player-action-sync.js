/* PR 5 / #1552 — cross-tab accepted-action invalidation.
 * Carries no account, pet, auth, score, reward, receipt, text or task payload.
 * It cannot submit gameplay or mark a task complete. It only tells another
 * already-open page that its private READ projection should be reconciled. */
(function () {
  'use strict';

  if (window.MOONBOYS_ACTION_SYNC) return;

  const CHANNEL = 'moonboys-action-sync-v1';
  const ACCEPTED = Object.freeze({
    'moonpet:action-accepted': 'moonpet',
    'moonboys:server-action-accepted': 'progression',
    'moonboys:arcade-score-accepted': 'arcade',
    'moonboys:wiki-mission-complete': 'wiki',
    'moonboys:wiki-mission-completed': 'wiki',
    'moonboys:wtf-event-checkin': 'battle',
    'moonboys:wtf-event-complete': 'battle',
  });
  const DEDUPE_MS = 900;
  const instance = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const lastPublishedAt = new Map();
  const trailingTimers = new Map();
  const subscribers = new Set();
  let channel = null;
  let acceptedActivityDay = null;
  let peerCatchupRequested = false;

  function nowDay() { return new Date().toISOString().slice(0, 10); }

  function safeSource(value) {
    const source = String(value || 'progression').toLowerCase();
    return /^[a-z][a-z0-9_-]{0,31}$/u.test(source) ? source : 'progression';
  }

  function safeEvent(value) {
    const name = String(value || 'accepted');
    return /^[a-z0-9:_-]{1,80}$/iu.test(name) ? name : 'accepted';
  }

  function fingerprint(source, eventName) {
    return safeSource(source) + '|' + safeEvent(eventName);
  }

  function notify(detail) {
    const payload = Object.freeze({
      source: safeSource(detail?.source),
      event: safeEvent(detail?.event),
      remote: Boolean(detail?.remote),
      utc_day: nowDay(),
    });
    try {
      window.dispatchEvent(new CustomEvent('moonboys:player-action-accepted', { detail: payload }));
    } catch (_) {}
    subscribers.forEach(callback => {
      try { callback(payload); } catch (_) {}
    });
  }

  function publish(source, eventName) {
    source = safeSource(source);
    eventName = safeEvent(eventName);
    acceptedActivityDay = nowDay();
    const key = fingerprint(source, eventName);
    lastPublishedAt.set(key, Date.now());
    const message = { v: 1, kind: 'accepted', source, event: eventName, utc_day: nowDay(), sender: instance };
    notify({ source, event: eventName, remote: false });
    try { channel?.postMessage(message); } catch (_) {}
  }

  function broadcast(source, eventName) {
    source = safeSource(source);
    eventName = safeEvent(eventName);
    const key = fingerprint(source, eventName);
    const now = Date.now();
    const last = lastPublishedAt.get(key) || 0;
    if (!last || now - last >= DEDUPE_MS) {
      const pending = trailingTimers.get(key);
      if (pending) { clearTimeout(pending); trailingTimers.delete(key); }
      publish(source, eventName);
      return true;
    }
    // Collapse burst noise but guarantee one trailing invalidation after the
    // final accepted action, so a read started by the first event cannot stay
    // current after a second accepted action inside the dedupe window.
    const pending = trailingTimers.get(key);
    if (pending) clearTimeout(pending);
    trailingTimers.set(key, setTimeout(() => {
      trailingTimers.delete(key);
      publish(source, eventName);
    }, DEDUPE_MS));
    return false;
  }

  function requestPeerCatchup() {
    if (peerCatchupRequested) return;
    peerCatchupRequested = true;
    const detail = Object.freeze({ reason: 'action_sync_ready', utc_day: nowDay() });
    try {
      window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed', { detail }));
    } catch (_) {}
  }

  function receive(message) {
    if (!message || message.v !== 1 || message.sender === instance ||
      message.utc_day !== nowDay()) return;
    if (message.kind === 'accepted') {
      acceptedActivityDay = nowDay();
      notify({
        source: safeSource(message.source),
        event: safeEvent(message.event),
        remote: true,
      });
      return;
    }
    // BroadcastChannel does not retain accepted messages for tabs that open the
    // channel later. A new receiver asks already-open peers whether they have
    // observed any accepted activity today. Only a peer that actually has such
    // activity responds, so ordinary single-tab startup does not trigger an
    // extra auth/read cycle.
    if (message.kind === 'hello') {
      if (acceptedActivityDay !== nowDay()) return;
      try {
        channel?.postMessage({
          v: 1,
          kind: 'accepted_seen',
          utc_day: nowDay(),
          sender: instance,
          target: safeEvent(message.sender),
        });
      } catch (_) {}
      return;
    }
    if (message.kind === 'accepted_seen' &&
      safeEvent(message.target) === safeEvent(instance)) requestPeerCatchup();
  }

  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.addEventListener('message', event => receive(event.data));
    } catch (_) { channel = null; }
  }

  Object.entries(ACCEPTED).forEach(([eventName, source]) => {
    const listener = event => broadcast(event?.detail?.source || source, eventName);
    window.addEventListener(eventName, listener);
    // Wiki mission completion uses a non-bubbling document CustomEvent.
    if (eventName.startsWith('moonboys:wiki-')) document.addEventListener(eventName, listener);
  });

  // Shell/standalone loaders capture accepted events synchronously while this
  // deferred script is downloading. Remove those temporary listeners first,
  // then replay only their sanitized source/event metadata through the normal
  // dedupe + BroadcastChannel path.
  const buffered = window.__MOONBOYS_ACTION_SYNC_BUFFER__;
  if (buffered && Array.isArray(buffered.events)) {
    try { buffered.cleanup?.(); } catch (_) {}
    const queued = buffered.events.splice(0);
    try { delete window.__MOONBOYS_ACTION_SYNC_BUFFER__; }
    catch (_) { window.__MOONBOYS_ACTION_SYNC_BUFFER__ = null; }
    queued.forEach(item => broadcast(item?.source, item?.event));
  }

  // If this page has not already reconciled because of its own buffered action,
  // ask active peers whether accepted activity existed before this receiver
  // joined the channel. A positive reply closes the late-receiver gap without
  // imposing an unconditional second startup read on every page.
  if (channel && acceptedActivityDay !== nowDay()) {
    try {
      channel.postMessage({ v: 1, kind: 'hello', utc_day: nowDay(), sender: instance });
    } catch (_) {}
  }

  window.addEventListener('online', () => {
    const detail = Object.freeze({ reason: 'online', utc_day: nowDay() });
    try { window.dispatchEvent(new CustomEvent('moonboys:player-reconcile-needed', { detail })); } catch (_) {}
  });
  window.addEventListener('offline', () => {
    try { window.dispatchEvent(new CustomEvent('moonboys:player-offline', {
      detail: Object.freeze({ utc_day: nowDay() }),
    })); } catch (_) {}
  });

  window.MOONBOYS_ACTION_SYNC = Object.freeze({
    version: 1,
    markAccepted(source, eventName) { return broadcast(source, eventName); },
    subscribe(callback) {
      if (typeof callback !== 'function') return function () {};
      subscribers.add(callback);
      return function () { subscribers.delete(callback); };
    },
  });

}());
