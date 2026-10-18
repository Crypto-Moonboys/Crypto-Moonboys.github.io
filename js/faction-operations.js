/* PR 4 / issue #1552 — factual faction operations on existing chamber pages.
 * Public crew catalogue: the existing faction bridge's local mission definitions
 * + independently verified server standings. Private contribution: the existing
 * owner-authenticated MOONBOYS_DAILY_LOOP singleton. This component has NO fetch
 * call, owner selector, mutation, storage cache, award, claim or local progress
 * authority of its own. */
(function () {
  'use strict';

  const crewRoot = document.querySelector('[data-fop-crew]');
  const personalRoot = document.querySelector('[data-fop-private]');
  if (!crewRoot || !personalRoot) return;

  const ORDER = Object.freeze([
    'hard-fork-rockers', 'rugpull-miners', 'graffpunks',
    'blockchain-furies', 'crypto-moongirls', 'blockstars',
    'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys',
  ]);
  const KEYS = new Set(ORDER);
  const DAY_MS = 86400000;
  const CHAMBER_PREFIX = '/battle-chamber/factions/';
  const MY_FACTION_URL = '/my-moonboy.html?tab=faction';
  const LOGIN_URL = '/gkniftyheads-incubator.html';
  const JOIN_URL = '/community.html#battle-join-faction';
  const STATUS_OK = new Set(['live', 'live_empty']);

  let snapshot = null;
  let epoch = 0;
  let loading = false;
  let subscribed = false;
  let currentOwner = null;
  let lastDay = new Date().toISOString().slice(0, 10);
  let inflight = null;
  const isCommunity = !KEYS.has(String(document.body?.dataset?.factionPage || ''));
  const chamberKey = isCommunity ? null : document.body.dataset.factionPage;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function sourceState(state, key) {
    return state?.source_status && state.source_status[key]?.state || 'unavailable';
  }

  function ownerId() {
    const gate = window.MOONBOYS_IDENTITY;
    if (!gate || typeof gate.isTelegramLinked !== 'function' || !gate.isTelegramLinked()
      || typeof gate.getTelegramId !== 'function') return null;
    const id = gate.getTelegramId();
    return id === null || id === undefined || id === '' ? null : String(id);
  }

  function utcDay() { return new Date().toISOString().slice(0, 10); }

  function verifiedOwnerState(state) {
    const id = ownerId();
    if (!id || !state || state.ok !== true || state.fetch_status !== 'ok'
      || state.utc_day !== utcDay() || state.identity?.linked !== true
      || state.identity?.auth_mode !== 'telegram_verified'
      || String(state.identity?.telegram_id ?? '') !== id) return false;
    return true;
  }

  function publicState(state) {
    if (!state || state.ok !== true || state.fetch_status !== 'ok'
      || state.utc_day !== utcDay()) return null;
    // It is safe to reuse public schedule/reset fields only if the singleton
    // has no owner, or the owner matches the current linked account.
    if (state.identity?.linked && !verifiedOwnerState(state)) return null;
    return state;
  }

  function canonicalFaction(raw) {
    const key = String(raw || '').trim().toLowerCase();
    return KEYS.has(key) ? key : null;
  }

  function getProfiles() { return window.MOONBOYS_FACTION_PROFILES || {}; }

  function factionLabel(key) {
    const profile = getProfiles()[key];
    return profile?.name || key.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(' ');
  }

  function profileLink(key) {
    return CHAMBER_PREFIX + encodeURIComponent(key) + '.html';
  }

  function getMissionCatalogue(key) {
    const data = window.MOONBOYS_MISSION_DATA;
    const record = data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    if (!record) return null;
    const daily = Array.isArray(record.daily) ? record.daily : [];
    const seasonal = Array.isArray(record.seasonal) ? record.seasonal : [];
    return { daily: daily.slice(0, 3), seasonal: seasonal.slice(0, 1) };
  }

  function finiteNonnegative(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function niceNum(value) {
    return String(Number.isInteger(value) ? value : Number(value.toFixed(2)));
  }

  function clockText(iso) {
    const millis = Date.parse(iso || '');
    if (!Number.isFinite(millis)) return 'Time not confirmed';
    const date = new Date(millis);
    const local = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(date);
    const utc = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
    return local + ' local · ' + utc + ' UTC';
  }

  function resetLabel(state) {
    const iso = state?.next_utc_reset_at;
    if (publicState(state) && Number.isFinite(Date.parse(iso || '')))
      return 'Next UTC-day reset: ' + clockText(iso) + ' (server source)';
    return 'Daily reset policy: 00:00 UTC. Next source-confirmed timestamp unavailable.';
  }

  function nextWtf(state) {
    const valid = publicState(state);
    const status = sourceState(valid, 'daily_wtf_status');
    const entries = valid?.daily_wtf_status?.events;
    if (status !== 'live' || !Array.isArray(entries))
      return '<p class="fop-note">Shared WTF windows: ' +
        (status === 'preview'
          ? 'schedule preview only; a live event has not been confirmed by its source.'
          : 'source availability unconfirmed; no active event inferred.') + '</p>';
    const now = Date.now();
    const upcoming = entries.filter(item => item && Number.isFinite(Date.parse(item.starts_at || ''))
      && Number.isFinite(Date.parse(item.ends_at || '')) && Date.parse(item.ends_at) > now)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    if (!upcoming.length) return '<p class="fop-note">Shared WTF windows: no remaining source-confirmed event for today.</p>';
    const item = upcoming[0];
    const truth = item.status === 'active' ? 'Source reports active'
      : item.status === 'upcoming' ? 'Source reports upcoming' : 'Source status unconfirmed';
    return '<p class="fop-note"><strong>Shared WTF window:</strong> ' + esc(item.title || 'WTF event') +
      ' · ' + esc(truth) + ' · Starts ' + esc(clockText(item.starts_at)) +
      ' · Ends ' + esc(clockText(item.ends_at)) +
      '. View the Battle Chamber for personal participation status.</p>';
  }

  function publicStanding(key) {
    const weekly = window.MOONBOYS_BATTLE_CHAMBER_STANDINGS?.weekly;
    if (!weekly || weekly.source !== 'server' || !Array.isArray(weekly.rows))
      return '<p class="fop-note">Weekly standings: server source unavailable; no rank or clout inferred from the local preview.</p>';
    const row = weekly.rows.find(item => canonicalFaction(item.faction_id) === key);
    if (!row) return '<p class="fop-note">Weekly standings: faction has no confirmed row in this source.</p>';
    const rank = finiteNonnegative(row.rank);
    const points = finiteNonnegative(row.clout_total);
    const members = finiteNonnegative(row.member_count);
    return '<p class="fop-note"><strong>Weekly faction standing (server):</strong> ' +
      (rank !== null && rank > 0 ? 'rank #' + niceNum(rank) : 'rank not confirmed') +
      ' · ' + (points === null ? 'clout not confirmed' : niceNum(points) + ' faction clout') +
      ' · ' + (members === null ? 'members unconfirmed' : niceNum(members) + ' recorded members') +
      (weekly.period_key ? ' · period ' + esc(weekly.period_key) : '') +
      '. This is not verified Championship Clout.</p>';
  }

  function missionMarkup(mission, index) {
    if (!mission || !mission.id || !mission.label) return '';
    const target = finiteNonnegative(mission.target);
    const possible = finiteNonnegative(mission.reward?.warContrib);
    return '<li class="fop-mission"><h3>' + esc(index + 1 + '. ' + mission.label) + '</h3>' +
      '<p>' + esc(mission.description || 'Goal details unavailable') + '</p>' +
      '<p><strong>Catalogue target:</strong> ' +
      (target === null ? 'Not supplied' : esc(niceNum(target))) +
      (mission.type ? ' ' + esc(String(mission.type).replace(/[_-]+/g, ' ')) : '') +
      ' · <strong>Listed possible faction-war contribution:</strong> ' +
      (possible === null ? 'not confirmed' : esc(niceNum(possible))) +
      ' (definition only, no awarded receipt)</p></li>';
  }

  function factionDirectory() {
    return '<p>Choose a live faction to see its three published operation definitions. ' +
      'Each chamber is public; member progress is private.</p><nav class="fop-directory" aria-label="Nine faction chambers">' +
      ORDER.map(key => '<a href="' + profileLink(key) + '">' + esc(factionLabel(key)) + '</a>').join('') +
      '</nav><p class="fop-note">A personal mission list requires verified Telegram login. ' +
      '<a href="' + MY_FACTION_URL + '">My Moonboy faction tasks</a></p>';
  }

  function selectedFaction() {
    if (chamberKey) return chamberKey;
    const valid = verifiedOwnerState(snapshot) ? snapshot : null;
    const status = sourceState(valid, 'faction_state');
    if (!STATUS_OK.has(status)) return null;
    return canonicalFaction(valid?.faction_state?.faction_id);
  }

  function renderCrew() {
    const key = selectedFaction();
    if (!key) {
      crewRoot.innerHTML = factionDirectory();
      return;
    }
    const catalogue = getMissionCatalogue(key);
    const state = publicState(snapshot);
    const missions = catalogue?.daily || [];
    const sourceLabel = '<p class="fop-note"><strong>Evidence:</strong> Local faction mission catalogue / advisory ' +
      '(not a server completion or reward receipt). Only signed-in source reads may show progress.</p>';
    const list = missions.length
      ? '<ol class="fop-mission-list">' + missions.map(missionMarkup).join('') + '</ol>'
      : '<p class="fop-unavailable">The faction mission catalogue has not hydrated. ' +
        'Its absence is not 0 missions or proof of completion.</p>';
    const seasonal = catalogue?.seasonal?.[0];
    const seasonalText = seasonal
      ? '<p class="fop-note"><strong>Long-term crew goal (catalogue):</strong> ' +
        esc(seasonal.label) + ' — ' + esc(seasonal.description || '') + '</p>'
      : '';
    crewRoot.innerHTML = '<div class="fop-row"><strong>' + esc(factionLabel(key)) +
      ' · 3 listed operations</strong><a href="' + profileLink(key) + '">Faction chamber</a></div>' +
      sourceLabel + list + seasonalText + publicStanding(key) +
      '<p class="fop-note">' + esc(resetLabel(state)) + '</p>' +
      nextWtf(state);
  }

  function renderPrivate() {
    // Absolutely no personal content for visitors or for another faction.
    const id = ownerId();
    if (!id) {
      personalRoot.innerHTML = '<p>Link Telegram to view your own saved contribution. ' +
        'No private missions are loaded for visitors.</p><p><a href="' + LOGIN_URL +
        '" data-telegram-login>Log in with Telegram</a> · <a href="' + JOIN_URL + '">Choose a faction</a></p>';
      return;
    }
    const valid = verifiedOwnerState(snapshot) ? snapshot : null;
    if (!valid) {
      personalRoot.innerHTML = '<p class="fop-unavailable">' +
        (loading ? 'Checking your signed faction state…' :
          'Private faction status unavailable or awaiting fresh signed authentication.') +
        '</p><p><button type="button" data-fop-retry>Retry verified status</button> · ' +
        '<a href="' + MY_FACTION_URL + '">Open My Moonboy</a></p>';
      return;
    }
    if (!STATUS_OK.has(sourceState(valid, 'faction_state'))) {
      personalRoot.innerHTML = '<p class="fop-unavailable">Faction membership source unavailable. ' +
        'No alignment or progress assumed.</p><button type="button" data-fop-retry>Retry verified status</button>';
      return;
    }
    const faction = canonicalFaction(valid.faction_state?.faction_id);
    if (!faction) {
      personalRoot.innerHTML = '<p>Your account is linked but no faction membership was verified.</p>' +
        '<p><a href="' + JOIN_URL + '">Choose a faction</a> · ' +
        '<a href="' + MY_FACTION_URL + '">My Moonboy faction tasks</a></p>';
      return;
    }
    if (chamberKey && chamberKey !== faction) {
      personalRoot.innerHTML = '<p>This is another faction’s public chamber. ' +
        'Your personal contribution is never shown here.</p>' +
        '<p><a href="' + profileLink(faction) + '">Open your own faction chamber</a></p>';
      return;
    }
    const catalogue = getMissionCatalogue(faction);
    const day = utcDay();
    const missionStatus = sourceState(valid, 'daily_missions');
    const rows = missionStatus === 'live' && valid.daily_missions?.utc_day === day &&
      Array.isArray(valid.daily_missions.items) ? valid.daily_missions.items : [];
    const roster = catalogue?.daily || [];
    const validSource = STATUS_OK.has(missionStatus) &&
      valid.daily_missions?.utc_day === day && Array.isArray(valid.daily_missions?.items);
    let confirmed = 0;
    let observed = 0;
    const listed = roster.map(mission => {
      const source = validSource ? rows.find(item => item.mission_id === mission.id) : null;
      if (source) observed++;
      const completed = source?.completed === true && missionStatus === 'live';
      if (completed) confirmed++;
      const current = source ? finiteNonnegative(source.progress) : null;
      const target = finiteNonnegative(mission.target);
      const stateLabel = !validSource ? 'Source unavailable' :
        !source ? 'No saved progress record' : completed ? 'Saved complete (advisory)' : 'Saved in progress (advisory)';
      return '<li class="fop-personal-task"><strong>' + esc(mission.label || mission.id) +
        '</strong> · ' + esc(stateLabel) +
        (current === null ? '' : ' · ' + esc(niceNum(current)) +
          ' source progress' + (target === null ? '' : ' / ' + esc(niceNum(target)) + ' catalogue target')) +
        '</li>';
    }).join('');
    const sourceNotice = validSource
      ? '<strong>Source:</strong> ' + (missionStatus === 'live_empty' ?
          'No server-saved daily mission records. This is not 0/3 completed.' :
          'Daily Loop / D1 saved advisory mission rows; not an accepted Championship receipt.') +
        ' · ' + confirmed + ' confirmed complete among ' + observed +
        ' saved records; ' + Math.max(0, roster.length - observed) + ' not recorded.'
      : '<strong>Source unavailable:</strong> daily mission rows were not verified. ' +
        'No completed/unfinished count is assumed.';
    const contributionStatus = sourceState(valid, 'faction_state');
    const value = valid.faction_state?.today?.[faction];
    const amount = finiteNonnegative(value);
    const contribution = STATUS_OK.has(contributionStatus)
      ? '<p><strong>Today’s Faction Signal contribution:</strong> ' +
        (amount === null ? 'No recorded amount for this faction (not zero by inference).' :
          esc(niceNum(amount)) + ' (server-saved faction contribution, not Community XP or Championship Clout)') +
        '</p>' : '<p><strong>Today’s contribution:</strong> source unavailable.</p>';
    const next = validSource && roster.length
      ? roster.find(mission => !rows.some(item => item.mission_id === mission.id && item.completed === true))
      : null;
    personalRoot.innerHTML = '<p><strong>Verified member faction:</strong> ' + esc(factionLabel(faction)) +
      ' · UTC day ' + esc(day) + '</p>' +
      (roster.length ? '<ul class="fop-personal-list">' + listed + '</ul>'
        : '<p class="fop-unavailable">The mission catalogue is unavailable; no 0/3 result inferred.</p>') +
      '<p class="fop-note">' + sourceNotice + '</p>' + contribution +
      (next ? '<p><strong>Next suggested action:</strong> ' + esc(next.label) +
        ' — ' + esc(next.description || 'Review the original game rules') +
        '. This is catalogue guidance, not a verified task award.</p>' : '') +
      '<p class="fop-actions"><a href="' + MY_FACTION_URL + '">My Moonboy — faction tasks</a>' +
      ' · <a href="/games/">Open Arcade</a> · <a href="/my-moonboy.html?tab=moonpet">MoonPet overview</a>' +
      ' · <button type="button" data-fop-retry>Refresh verified status</button></p>';
  }

  function render() {
    // Reset private content synchronously when identity changes, even before
    // the singleton emits its next event. Re-evaluate identity on every render.
    const id = ownerId();
    if (currentOwner !== id) {
      currentOwner = id;
      snapshot = null;
      epoch++;
      personalRoot.replaceChildren();
    }
    renderCrew();
    renderPrivate();
  }

  function receive(state) {
    // Singleton can notify with a previous owner's cached state. Never
    // render that state's private data under a switched account.
    const id = ownerId();
    if (currentOwner !== id) {
      currentOwner = id;
      snapshot = null;
      epoch++;
      personalRoot.replaceChildren();
    }
    snapshot = publicState(state) ? state : null;
    loading = false;
    render();
  }

  function sharedDailyLoop(force) {
    const api = window.MOONBOYS_DAILY_LOOP;
    if (!api || typeof api.getState !== 'function') {
      loading = false;
      render();
      return Promise.resolve(null);
    }
    if (inflight) return inflight;
    const generation = epoch;
    loading = true;
    render();
    const action = force && typeof api.refresh === 'function'
      ? api.refresh({ force: true }) : api.getState();
    const operation = Promise.resolve(action).then(state => {
      if (generation === epoch) receive(state);
      return state;
    }).catch(() => {
      if (generation === epoch) { snapshot = null; loading = false; render(); }
      return null;
    }).finally(() => {
      if (inflight === operation) inflight = null;
    });
    inflight = operation;
    return operation;
  }

  function onIdentityChange() {
    // Fail closed before a new auth read; never show the previous owner's
    // faction, progress, or old mission search state in a public chamber.
    epoch++;
    currentOwner = ownerId();
    snapshot = null;
    inflight = null;
    personalRoot.replaceChildren();
    loading = Boolean(currentOwner);
    render();
    sharedDailyLoop(true);
  }

  function init() {
    render();
    const api = window.MOONBOYS_DAILY_LOOP;
    if (api && typeof api.subscribe === 'function' && !subscribed) {
      subscribed = true;
      api.subscribe(receive);
    }
    // Consumes the one existing daily-loop fetch/cache owner. Does not
    // start an independent /roguelite/daily-state, /player/action-plan or
    // /faction/status network loop.
    sharedDailyLoop(false);
    window.addEventListener('battle-chamber:faction-data-ready', render);
    window.addEventListener('battle-chamber:activity-ready', render);
    window.addEventListener('moonboys:identity-change', onIdentityChange);
    window.addEventListener('moonboys:telegram-session', onIdentityChange);
    window.addEventListener('moonboys:faction-status', () => {
      // The singleton already invalidates itself on this event. Clear the
      // personal panel now and await its server-verified update.
      epoch++;
      snapshot = null;
      loading = Boolean(ownerId());
      personalRoot.replaceChildren();
      render();
    });
    personalRoot.addEventListener('click', event => {
      if (!event.target.closest('[data-fop-retry]')) return;
      sharedDailyLoop(true);
    });
    const refreshIfVisible = () => {
      if (!document.hidden) sharedDailyLoop(false);
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.setInterval(() => {
      if (document.hidden) return;
      const day = utcDay();
      if (day === lastDay) return;
      lastDay = day;
      epoch++;
      snapshot = null;
      personalRoot.replaceChildren();
      loading = Boolean(ownerId());
      render();
      sharedDailyLoop(true);
    }, 60000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
