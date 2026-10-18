/* My Moonboy PR3 (#1552). Private, read-only client of POST /player/action-plan.
 * No private plan is stored in localStorage, public globals, URLs, or analytics.
 * A task link NEVER invokes a game mutation, award or claim endpoint. */
(function () {
  'use strict';

  const root = document.getElementById('my-moonboy');
  if (!root) return;

  const byId = id => document.getElementById(id);
  const gatePanel = byId('mm-gate');
  const privatePanel = byId('mm-private');
  const tabs = Array.from(root.querySelectorAll('[data-mm-tab]'));
  const TABS = new Set(tabs.map(button => button.dataset.mmTab));
  const READY = new Set(['ready', 'active', 'claim_ready']);
  const DONE = new Set(['complete', 'claimed']);
  const FAILURE = new Set(['query_failed', 'migration_pending', 'unavailable']);
  const PERIOD_WEEKLY = new Set(['faction_week', 'pet_journey_week']);
  const PERIOD_LONG = new Set(['once', 'permanent', 'pet_age', 'season_lock', 'faction_season', 'utc_competition']);
  const REFRESH_EVENTS = [
    'moonboys:sync-state', 'moonboys:score-updated',
    'moonboys:faction-status', 'moonboys:faction-boost',
    'moonboys:wtf-event-checkin', 'moonboys:wtf-event-complete',
    'moonboys:wiki-mission-complete', 'moonboys:wiki-mission-completed',
    'moonboys:roguelite-options-unlocked', 'battle-chamber:activity-ready',
    'moonpet:action-accepted', 'moonboys:pet-changed',
  ];
  const REQUEST_TIMEOUT_MS = 12500;
  const STALE_AFTER_MS = 45000;
  const VISIBLE_POLL_MS = 120000;
  const PAGE_SIZE = 100;

  // In-memory private state only. Every identity transition increments epoch,
  // aborts old network requests and hides previous-owner DOM immediately.
  const state = {
    epoch: 0, plan: null, tasks: [], nextCursor: null, ownerKey: null,
    requestKey: null, pending: null, paging: null, pagingController: null, controllers: new Set(),
    lastSuccess: 0, lastFailure: null, stale: false,
    serverTime: NaN, clockStart: 0, tab: 'now', status: 'all', search: '',
    refreshTimer: 0, petFilterRef: null, lastUtcDay: new Date().toISOString().slice(0, 10),
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function getIdentity() { return window.MOONBOYS_IDENTITY || null; }
  function identityKey() {
    const identity = getIdentity();
    if (!identity || typeof identity.isTelegramLinked !== 'function' ||
      !identity.isTelegramLinked() || typeof identity.getTelegramId !== 'function') return null;
    const id = identity.getTelegramId();
    return id == null || id === '' ? null : String(id);
  }

  function getApiBase() {
    const config = window.MOONBOYS_API || {};
    const base = typeof config.getApiBase === 'function'
      ? config.getApiBase({ mode: 'write' }) : config.BASE_URL;
    if (!base || !/^https?:\/\//i.test(String(base))) return null;
    try {
      const url = new URL(String(base));
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        && !url.search && !url.hash
        ? url.href.replace(/\/+$/u, '') : null;
    } catch (_) { return null; }
  }

  function safeDestination(task) {
    const raw = task && task.destination && task.destination.path;
    if (typeof raw !== 'string' || !raw.startsWith('/') ||
      raw.startsWith('//') || raw.includes('\\')) return null;
    try {
      const parsed = new URL(raw, window.location.origin);
      const forbidden = ['telegram_auth', 'auth_evidence', 'telegram_id', 'pet_id', 'token'];
      if (parsed.origin !== window.location.origin || parsed.username || parsed.password ||
        forbidden.some(key => parsed.searchParams.has(key))) return null;
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (_) { return null; }
  }

  function formatName(value) {
    return String(value == null ? '' : value).replace(/[_-]+/g, ' ').trim();
  }

  function niceCount(value) {
    return Number.isFinite(Number(value)) && value !== null
      ? String(Math.max(0, Math.floor(Number(value)))) : '—';
  }

  function sourceTime(value) {
    const ms = Date.parse(String(value || ''));
    if (!Number.isFinite(ms)) return 'Source time unavailable';
    const date = new Date(ms);
    const local = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(date);
    const utc = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
    return local + ' (local) · ' + utc + ' UTC';
  }

  function serverNow() {
    if (!Number.isFinite(state.serverTime)) return NaN;
    const elapsed = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? Math.max(0, performance.now() - state.clockStart) : 0;
    return state.serverTime + elapsed;
  }

  function remainingText(iso) {
    const until = Date.parse(String(iso || ''));
    const now = serverNow();
    if (!Number.isFinite(now) || !Number.isFinite(until)) return 'Refresh for current time';
    const ms = until - now;
    if (ms <= 0) return 'Boundary reached — refresh for source-confirmed status';
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return 'In ' + mins + ' min (server clock)';
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    if (hours < 48) return 'In ' + hours + 'h ' + remainder + 'm (server clock)';
    return 'In ' + Math.ceil(mins / 1440) + ' days (server clock)';
  }

  function timedMarkup(label, iso) {
    if (!iso) return '<p><strong>' + esc(label) + ':</strong> No recorded expiry / long-term</p>';
    if (!Number.isFinite(Date.parse(iso))) return '<p class="mm-source-warning">Source time unavailable — refresh</p>';
    return '<p><strong>' + esc(label) + ':</strong> ' + esc(sourceTime(iso)) +
      ' <span class="mm-muted" data-mm-until="' + esc(iso) + '"></span></p>';
  }

  function timeStatus(task) {
    let times = '';
    if (task.expires_at) times += timedMarkup('Expires / window ends', task.expires_at);
    else times += '<p><strong>Deadline:</strong> No recorded expiry / long-term</p>';
    if (task.available_at && task.status === 'waiting')
      times += timedMarkup('Scheduled from', task.available_at);
    if (task.next_ready_at && !READY.has(task.status))
      times += timedMarkup('Source next-ready estimate', task.next_ready_at);
    return times;
  }

  function rewardLabel(task) {
    const evidence = task.reward || {};
    if (evidence.confirmed !== true || !Array.isArray(evidence.items) || !evidence.items.length)
      return 'Reward: not confirmed by this source';
    const parts = evidence.items.map(item => {
      const amount = item.amount == null ? 'Amount not supplied' : niceCount(item.amount);
      return amount + ' ' + formatName(item.unit || item.type || 'units');
    });
    return 'Source reward: ' + parts.join(' · ');
  }

  function costLabel(task) {
    const items = task.cost && Array.isArray(task.cost.items) ? task.cost.items : [];
    if (!items.length) return 'Cost: not specified in this projection';
    return 'Source cost: ' + items.map(item =>
      niceCount(item.amount) + ' ' + formatName(item.unit || item.type || 'units')).join(' · ');
  }

  function progressMarkup(task) {
    const p = task.progress || {};
    const current = p.current == null || !Number.isFinite(Number(p.current)) ? null : Number(p.current);
    const target = p.target == null || !Number.isFinite(Number(p.target)) ? null : Number(p.target);
    const unit = formatName(p.unit || 'actions');
    if (current == null && target == null) return '<p>Progress: source has not supplied a measure</p>';
    const visible = (current == null ? '?' : niceCount(current)) + (target == null ? '' : ' / ' + niceCount(target)) + ' ' + unit;
    return '<p><strong>Progress:</strong> ' + esc(visible) + '</p>' +
      (target > 0 && current != null
        ? '<progress value="' + esc(Math.max(0, Math.min(target, current))) +
          '" max="' + esc(target) + '" aria-label="' + esc('Progress: ' + visible) + '"></progress>'
        : '');
  }

  function evidenceLabel(task) {
    const kind = task.evidence && task.evidence.kind;
    const health = task.source_health;
    if (FAILURE.has(health) || task.status === 'sync_unavailable') return 'Source unavailable — not verified';
    if (health === 'preview' || kind === 'client_mirror' ||
      kind === 'schedule_preview' || kind === 'advisory' || task.status === 'preview')
      return 'Advisory / preview only';
    if (kind === 'server_receipt' && task.evidence.verified_completion === true)
      return 'Accepted server receipt';
    if (kind === 'server_receipt') return 'Receipt-based source; not yet complete';
    if (kind === 'server_projection') return 'Read-only server projection';
    return 'Verification not supplied';
  }

  function taskActionable(task) {
    if (!task || !READY.has(task.status) || task.blocking_reason_code) return false;
    const evidence = task.evidence && task.evidence.kind;
    if (evidence !== 'server_projection' && evidence !== 'server_receipt') return false;
    return task.source_health === 'live' ||
      task.source_health === 'live_empty' &&
      (task.source_key === 'onboarding.faction' || task.source_key === 'telegram.daily-claim');
  }

  function petDirectory() {
    const directory = new Map();
    const roster = state.plan && state.plan.owner && state.plan.owner.pets;
    const rosterKnown = Array.isArray(roster);
    (rosterKnown ? roster : []).forEach((pet, index) => {
      const ref = String(pet.pet_ref || '');
      if (!/^pap_[a-f0-9]{24}$/u.test(ref)) return;
      const number = Number(pet.slot_number);
      const slot = Number.isInteger(number) && number > 0 ? number : index + 1;
      directory.set(ref, { pet, label: 'MoonPet slot ' + slot, membership: 'active' });
    });
    // Preserve original earning pet identity without leaking the opaque ref
    // or claiming that it is archived when the live roster could not be read.
    const others = state.tasks.concat(state.plan && Array.isArray(state.plan.top_actions)
      ? state.plan.top_actions : []);
    others.forEach(task => {
      const ref = String(task && task.source_pet_ref || '');
      if (!/^pap_[a-f0-9]{24}$/u.test(ref) || directory.has(ref)) return;
      if (task.owner_scope !== 'pet' && task.owner_scope !== 'original_pet') return;
      const number = directory.size + 1;
      const title = task.owner_scope === 'original_pet'
        ? 'Original-earning MoonPet ' + number : 'Source MoonPet ' + number;
      directory.set(ref, { pet: null,
        label: title + (rosterKnown ? ' (not in active roster)' : ' (membership unknown)'),
        membership: rosterKnown ? 'not_active' : 'unknown' });
    });
    return directory;
  }

  function petScopeLabel(task, directory) {
    if (!task || !['pet', 'original_pet'].includes(task.owner_scope)) return null;
    const entry = directory.get(String(task.source_pet_ref || ''));
    const category = task.owner_scope === 'original_pet' ? 'Original earning MoonPet' : 'MoonPet';
    return category + ': ' + (entry ? entry.label : 'source attribution unavailable');
  }

  function taskMarkup(task, compact, directory = petDirectory()) {
    const action = safeDestination(task);
    const status = String(task.status || 'sync_unavailable');
    const reason = task.blocking_reason_code
      ? '<p class="mm-source-warning"><strong>Reason:</strong> ' + esc(formatName(task.blocking_reason_code)) + '</p>' : '';
    const period = task.period && task.period.key
      ? ' · ' + formatName(task.period.kind) + ': ' + String(task.period.key)
      : task.period && task.period.kind ? ' · ' + formatName(task.period.kind) : '';
    const sourceState = String(task.source_health || 'unavailable');
    const scopeLabel = petScopeLabel(task, directory);
    const unavailable = FAILURE.has(sourceState) || status === 'sync_unavailable' ||
      sourceState === 'preview' || status === 'preview';
    const tag = !state.stale && taskActionable(task) ? ' mm-tag--action' :
      state.stale || unavailable ? ' mm-tag--unknown' : '';
    const readiness = state.stale ? 'Saved at last successful sync; refresh required' : formatName(status);
    const open = action
      ? '<a class="mm-button" href="' + esc(action) + '" aria-label="' +
        esc('Open source for ' + (task.title || 'task') +
          (scopeLabel ? ' — ' + scopeLabel : '')) + '">OPEN TASK</a>'
      : '<p class="mm-source-warning">Verified destination unavailable — cannot open task</p>';
    return '<article class="mm-task">' +
      '<div class="mm-task-tags"><span class="mm-tag' + tag + '">' + esc(readiness) + '</span>' +
      '<span class="mm-tag">' + esc(task.source_key || 'unknown source') + '</span>' +
      '<span class="mm-tag">' + esc(sourceState) + '</span>' +
      (task.optional ? '<span class="mm-tag">Optional</span>' : '') +
      '</div><h3>' + esc(task.title || 'Unknown task') + '</h3>' +
      (scopeLabel ? '<p class="mm-task-scope"><strong>' + esc(scopeLabel) +
        '</strong> · Open Task navigates only; confirm the original pet inside the game.</p>' : '') +
      '<p class="mm-task-why"><strong>Why:</strong> ' + esc(task.why || 'No reason supplied') + '</p>' +
      (compact ? '' : '<p><strong>What:</strong> ' + esc(task.what || task.description || 'Open the original source') + '</p>') +
      progressMarkup(task) +
      '<p>' + esc(rewardLabel(task)) + '</p>' +
      (compact ? '' : '<p>' + esc(costLabel(task)) + '</p>') +
      timeStatus(task) + reason +
      '<p><strong>Evidence:</strong> ' + esc(evidenceLabel(task)) + esc(period) + '</p>' +
      open + '</article>';
  }

  function sourceWarnings(plan) {
    const health = plan.source_status || {};
    const failed = Object.entries(health).filter(([, status]) => FAILURE.has(status && status.state));
    if (!failed.length) return '';
    return String(failed.length) + ' source(s) unavailable. Missing evidence is not completion; retry to reconcile.';
  }

  function setSync(message, status) {
    const element = byId('mm-sync');
    element.textContent = message;
    element.dataset.state = status || 'ok';
  }

  function showGate(title, description) {
    byId('mm-gate-title').textContent = title;
    byId('mm-gate-description').textContent = description;
    gatePanel.hidden = false;
    privatePanel.hidden = true;
  }

  function cancelPagination() {
    if (state.pagingController) {
      state.pagingController.abort();
      state.controllers.delete(state.pagingController);
    }
    state.pagingController = null;
    state.paging = null;
    // A new account or first-page snapshot must not inherit the previous
    // request's disabled Load more control, even if its finally runs later.
    byId('mm-load-more').disabled = false;
  }

  function clearPrivate(title, description) {
    state.epoch++;
    cancelPagination();
    state.controllers.forEach(controller => controller.abort());
    state.controllers.clear();
    state.pending = null;
    state.plan = null;
    state.petFilterRef = null;
    state.tasks = [];
    state.nextCursor = null;
    state.ownerKey = null;
    state.requestKey = null;
    state.lastFailure = null;
    state.lastSuccess = 0;
    state.stale = false;
    state.serverTime = NaN;
    byId('mm-next').replaceChildren();
    byId('mm-results').replaceChildren();
    byId('mm-pets').replaceChildren();
    byId('mm-pet-filter').hidden = true;
    byId('mm-pet-filter-label').textContent = '';
    ['mm-ready-count','mm-claim-count','mm-today-count','mm-done-count',
      'mm-unavailable-count'].forEach(id => { byId(id).textContent = '—'; });
    byId('mm-player-name').textContent = 'Linked Moonboy';
    byId('mm-link-state').textContent = 'Telegram credential required';
    byId('mm-arcade-xp').textContent = 'Not confirmed';
    byId('mm-pet-xp').textContent = 'Not confirmed';
    byId('mm-clout').textContent = 'Not confirmed';
    byId('mm-faction').textContent = 'Faction: sign in to view';
    byId('mm-sync').textContent = 'No verified plan loaded.';
    byId('mm-page-count').textContent = '0 tasks loaded';
    byId('mm-ledger-note').textContent = 'Sign in to view the source ledger.';
    showGate(title || 'Log in to My Moonboy',
      description || 'Verified Telegram login is required. No private plan is shown to visitors.');
  }

  function isRequestCurrent(epoch, id, day) {
    return epoch === state.epoch && identityKey() === id &&
      new Date().toISOString().slice(0, 10) === day;
  }

  async function getFreshAuth() {
    const identity = getIdentity();
    if (!identity || typeof identity.getFreshTelegramAuth !== 'function') return null;
    return identity.getFreshTelegramAuth();
  }

  async function postPlan(auth, cursor, controller) {
    const base = getApiBase();
    if (!base) throw new Error('Action-plan API not configured for this website');
    const body = { telegram_auth: auth, view: 'tasks', limit: PAGE_SIZE };
    if (cursor) body.cursor = cursor;
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(base + '/player/action-plan', {
        method: 'POST', mode: 'cors', credentials: 'omit',
        cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = new Error(response.status === 401 || response.status === 403
          ? 'Telegram login expired. Log in again.'
          : 'Action-plan source failed (HTTP ' + String(response.status) + ').');
        failure.status = response.status;
        throw failure;
      }
      if (!data || data.ok !== true || data.schema_version !== 1 ||
        !data.owner || data.owner.authenticated !== true ||
        !Array.isArray(data.tasks) || !Array.isArray(data.top_actions) ||
        !data.source_status || !data.pagination)
        throw new Error('Action-plan response schema unavailable');
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function applyPlan(payload, ownerId, append) {
    const previous = append ? state.tasks : [];
    const seen = new Set(previous.map(task => task.task_id));
    const newTasks = payload.tasks.filter(task => task && typeof task.task_id === 'string' && !seen.has(task.task_id));
    state.tasks = previous.concat(newTasks);
    if (!append) {
      state.plan = payload;
      state.lastSuccess = Date.now();
      state.lastFailure = null;
      state.stale = false;
      state.serverTime = Date.parse(payload.generated_at);
      state.clockStart = typeof performance !== 'undefined' && performance.now
        ? performance.now() : 0;
    }
    state.ownerKey = ownerId;
    state.lastUtcDay = String(payload.period && payload.period.utc_day || state.lastUtcDay);
    state.nextCursor = payload.pagination.next_cursor || null;
    gatePanel.hidden = true;
    privatePanel.hidden = false;
    render();
  }

  async function refresh(options) {
    const opts = options || {};
    const ownerId = identityKey();
    if (!ownerId) {
      clearPrivate('Log in to My Moonboy', 'Connect a verified Telegram account to view your private missions.');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const key = ownerId + ':' + day + ':tasks';
    if (state.ownerKey && state.ownerKey !== ownerId) {
      clearPrivate('Checking another account', 'Private tasks will reload for the newly verified owner.');
    }
    if (state.pending && state.requestKey === key) return state.pending;
    if (!opts.force && state.plan && !state.stale && state.requestKey === key &&
      Date.now() - state.lastSuccess < STALE_AFTER_MS) return;
    // A fresh first page owns a new immutable pagination snapshot. Quarantine
    // any old cursor response, even if both snapshots use the same cursor.
    if (state.paging) {
      state.epoch++;
      cancelPagination();
    }
    const epoch = state.epoch;
    const operation = (async () => {
      let auth;
      try { auth = await getFreshAuth(); }
      catch (_) { auth = null; }
      if (epoch !== state.epoch) return;
      if (!auth || String(auth.id || '') !== ownerId || identityKey() !== ownerId) {
        clearPrivate('Fresh Telegram login required',
          'Your signed credential is missing, expired or belongs to another account. Log in again.');
        return;
      }
      const controller = new AbortController();
      state.controllers.add(controller);
      state.requestKey = key;
      byId('mm-refresh').disabled = true;
      if (state.plan) {
        state.stale = true;
        setSync('Refreshing saved plan — timestamps and readiness are not yet current.', 'stale');
        render(); // Hide stale Top 3 immediately, never leave old readiness live.
      } else {
        showGate('Retrieving verified missions', 'Reading the authenticated source projection. No gameplay actions are being performed.');
      }
      try {
        const payload = await postPlan(auth, null, controller);
        if (!isRequestCurrent(epoch, ownerId, day)) return;
        applyPlan(payload, ownerId, false);
      } catch (error) {
        if (!isRequestCurrent(epoch, ownerId, day)) return;
        if (error && (error.status === 401 || error.status === 403)) {
          clearPrivate('Telegram login expired', 'Log in again to reopen your private missions. Old account data has been cleared.');
        } else if (state.plan) {
          state.lastFailure = error.message || 'Action-plan refresh unavailable';
          state.stale = true;
          render();
        } else {
          showGate('Unable to load private mission plan',
            (error.message || 'The authenticated Worker is unavailable.') + ' Use Telegram login or retry a fresh page load.');
        }
      } finally {
        state.controllers.delete(controller);
        if (epoch === state.epoch) byId('mm-refresh').disabled = false;
      }
    })();
    state.pending = operation;
    try { return await operation; }
    finally { if (state.pending === operation) state.pending = null; }
  }

  async function loadMore() {
    if (!state.plan || !state.nextCursor || state.paging || state.pending) return;
    const ownerId = identityKey();
    const day = new Date().toISOString().slice(0, 10);
    if (!ownerId || ownerId !== state.ownerKey) {
      clearPrivate('Account changed', 'Log in again to continue private pagination.');
      return;
    }
    const epoch = state.epoch;
    const cursor = state.nextCursor;
    const firstPage = state.plan;
    const operation = (async () => {
      let auth;
      try { auth = await getFreshAuth(); } catch (_) { auth = null; }
      if (epoch !== state.epoch) return;
      if (!auth || String(auth.id || '') !== ownerId) {
        clearPrivate('Fresh Telegram login required', 'Refresh your signed Telegram identity before loading more tasks.');
        return;
      }
      const controller = new AbortController();
      state.controllers.add(controller);
      state.pagingController = controller;
      byId('mm-load-more').disabled = true;
      try {
        const payload = await postPlan(auth, cursor, controller);
        if (!isRequestCurrent(epoch, ownerId, day) || state.nextCursor !== cursor ||
          state.plan !== firstPage) return;
        // A changed source period must restart the list, never append data
        // from another period or a different authenticated account.
        if (payload.period && payload.period.utc_day !== state.plan.period.utc_day) {
          invalidate('source_period_changed');
          return;
        }
        applyPlan(payload, ownerId, true);
      } catch (error) {
        if (isRequestCurrent(epoch, ownerId, day)) {
          if (error && (error.status === 401 || error.status === 403)) {
            clearPrivate('Telegram login expired', 'Previous owner data cleared; log in again.');
          } else {
            state.lastFailure = 'More tasks unavailable: ' + (error.message || 'retry');
            render();
          }
        }
      } finally {
        state.controllers.delete(controller);
        if (state.pagingController === controller) state.pagingController = null;
      }
    })();
    state.paging = operation;
    try { return await operation; }
    finally {
      if (state.paging === operation) {
        state.paging = null;
        byId('mm-load-more').disabled = false;
      }
    }
  }

  function isNow(task) { return taskActionable(task) && !state.stale; }
  function matchesTab(task) {
    const key = String(task.source_key || '');
    const period = task.period && task.period.kind || '';
    const status = task.status;
    switch (state.tab) {
      case 'now': return isNow(task);
      case 'today': return (period === 'utc_day' || period === 'event_window') &&
        task.period && state.plan && task.period.key === state.plan.period.utc_day;
      case 'claims': return ['claim_ready', 'claimed'].includes(status) ||
        key === 'moonpet.claimable-rewards' || key === 'moonpet.seven-of-seven-claim';
      case 'moonpet': return key.startsWith('moonpet.');
      case 'faction': return key.startsWith('faction.') || key === 'onboarding.faction';
      case 'games': return key.startsWith('games.') || key.startsWith('arcade.');
      case 'weekly': return PERIOD_WEEKLY.has(period) || (period === 'source_defined' && /^\d{4}-W\d{2}$/u.test(String(task.period.key || '')));
      case 'long-term': return PERIOD_LONG.has(period);
      case 'history': return DONE.has(status) || status === 'expired' || period === 'history';
      default: return false;
    }
  }

  function matchesStatus(task) {
    switch (state.status) {
      case 'actionable': return isNow(task);
      case 'waiting': return task.status === 'waiting' || task.status === 'in_progress';
      case 'blocked': return ['blocked', 'sync_unavailable', 'preview', 'expired'].includes(task.status);
      case 'completed': return DONE.has(task.status);
      default: return true;
    }
  }

  function filteredTasks() {
    const search = state.search.trim().toLowerCase();
    return state.tasks.filter(task => matchesTab(task) && matchesStatus(task) &&
      (state.tab !== 'moonpet' || !state.petFilterRef ||
        task.source_pet_ref === state.petFilterRef) &&
      (!search || [task.title, task.source_key, task.why, task.what, task.description]
        .some(value => String(value || '').toLowerCase().includes(search))));
  }

  function renderPets(directory) {
    const container = byId('mm-pets');
    const source = state.plan && state.plan.owner && state.plan.owner.pets;
    const rosterKnown = Array.isArray(source);
    const warning = rosterKnown ? '' :
      '<p class="mm-empty mm-source-warning" role="status">' +
      'Owned MoonPet roster unavailable. Saved source-pet claim evidence below ' +
      'does not establish current slot membership, deletion or archival; retry to verify.' +
      '</p>';
    if (!directory.size) {
      container.innerHTML = warning || '<p class="mm-empty">No active MoonPets reported by the verified roster. ' +
        'Any historic saved claims remain in the Claims tab. Open the game for adoption or restoration.</p>';
      return;
    }
    const cards = Array.from(directory.entries()).map(([ref, entry], index) => {
      const pet = entry.pet;
      const assigned = state.tasks.filter(task => task.source_pet_ref === ref);
      const verifiedAvailable = assigned.filter(taskActionable).length;
      const stage = pet ? formatName(pet.life_stage || 'Not supplied') : null;
      const phase = pet ? formatName(pet.lifecycle_phase || 'Not supplied') : null;
      const level = pet && pet.level != null ? ' · Level ' + niceCount(pet.level) : '';
      const marks = pet ? (pet.selected
        ? '<span class="mm-tag mm-tag--action">Selected in game</span>'
        : '<span class="mm-tag">Owned MoonPet</span>')
        : '<span class="mm-tag mm-tag--unknown">' +
          (entry.membership === 'unknown'
            ? 'Active membership unknown' : 'Not in active roster') + '</span>';
      const info = pet
        ? '<p>Life stage: ' + esc(stage) + esc(level) + '</p>' +
          '<p>Lifecycle phase: ' + esc(phase) + '</p>' +
          '<p>Evolution stage: ' + (pet.evolution_stage == null
            ? 'Not supplied' : esc(niceCount(pet.evolution_stage))) +
          ' · Pet XP: ' + esc(niceCount(pet.pet_xp)) + '</p>' +
          '<p>Species identity is kept hidden until the MoonPet reveal stage.</p>'
        : '<p>Saved task attributed to this original MoonPet. ' +
          (entry.membership === 'unknown'
            ? 'The active roster could not be read; membership cannot be determined.'
            : 'This original earning MoonPet is not present in the verified active roster.') +
          ' No claim or pet switch happens here.</p>';
      const list = assigned.slice(0, 5).map(task =>
        '<li>' + esc(task.title) + ' — ' +
        esc(state.stale ? 'last confirmed: ' + formatName(task.status) : formatName(task.status)) +
        '</li>').join('');
      const availability = state.stale
        ? '<p class="mm-source-warning">Last-confirmed snapshot only. ' + verifiedAvailable +
          ' formerly actionable item(s); current availability unknown until refresh.</p>'
        : '<p>' + verifiedAvailable + ' source-verified action(s) available at last sync</p>';
      return '<article class="mm-pet"><h3>' + esc(entry.label) + '</h3>' +
        marks + info + '<p>' + assigned.length + ' source task(s)</p>' +
        availability +
        (list ? '<ul>' + list + '</ul>' : '<p>No source tasks currently loaded for this MoonPet.</p>') +
        (assigned.length > 5 ? '<p>+' + (assigned.length - 5) +
          ' more tasks. Filter the MoonPet tab to view them all.</p>' : '') +
        '<button type="button" class="mm-button" data-mm-open-moonpet ' +
          'data-mm-pet-index="' + index + '" aria-label="' +
          esc('View source tasks for ' + entry.label) +
          '">View this MoonPet’s tasks</button></article>';
    }).join('');
    // The warning must remain visible even when source-specific pending
    // original-pet claims are independently verified and rendered below it.
    container.innerHTML = warning + cards;
  }

  function renderSummary() {
    const plan = state.plan;
    const owner = plan.owner || {};
    const summary = plan.summary || {};
    const ids = {
      'mm-ready-count': summary.ready_count,
      'mm-claim-count': summary.claims_ready,
      'mm-today-count': summary.eligible_today,
      'mm-done-count': summary.completed_today,
      'mm-unavailable-count': summary.unavailable_sources,
    };
    Object.entries(ids).forEach(([id, value]) => { byId(id).textContent = niceCount(value); });
    const identity = getIdentity();
    const displayName = identity && typeof identity.getTelegramName === 'function'
      ? identity.getTelegramName() : null;
    byId('mm-player-name').textContent = displayName || 'Linked Moonboy';
    byId('mm-link-state').textContent = state.stale ? 'Linked · refresh pending' : 'Signed Telegram credential verified';
    byId('mm-arcade-xp').textContent = niceCount(owner.lifetime_arcade_xp) === '—'
      ? 'Not confirmed' : niceCount(owner.lifetime_arcade_xp) + ' Arcade XP';
    const active = Array.isArray(owner.pets) ? owner.pets.find(pet => pet.selected) : null;
    byId('mm-pet-xp').textContent = active && active.pet_xp != null
      ? niceCount(active.pet_xp) + ' Pet XP' : 'Not confirmed';
    const clout = state.tasks.find(task => task.source_key === 'championship.verified-clout');
    byId('mm-clout').textContent = clout && clout.source_health === 'live' &&
      clout.progress && clout.progress.current != null
      ? niceCount(clout.progress.current) + ' (saved source projection; production verification separate)'
      : 'Not confirmed';
    const faction = owner.faction;
    const factionNote = byId('mm-faction');
    if (faction === null || faction === undefined) factionNote.textContent = 'Faction: source unavailable; no membership assumed.';
    else if (!faction.joined) factionNote.textContent = 'Faction: not yet assigned. Choose your faction in Battle Chamber.';
    else factionNote.textContent = 'Faction: ' + (faction.name || 'joined, name not supplied') + '. View faction tasks below.';
    const warnings = sourceWarnings(plan);
    const timestamp = sourceTime(plan.generated_at);
    if (state.stale) setSync('STALE / LAST CONFIRMED ' + timestamp +
      '. Server readiness must refresh before trusting a countdown. ' + (state.lastFailure || ''), 'stale');
    else setSync('Last verified read: ' + timestamp + (warnings ? ' · ' + warnings : ''), warnings ? 'error' : 'ok');
  }

  function render() {
    if (!state.plan || !privatePanel || privatePanel.hidden) return;
    renderSummary();
    const plan = state.plan;
    const directory = petDirectory();
    const top = state.stale ? [] : plan.top_actions.filter(taskActionable).slice(0, 3);
    byId('mm-next-note').textContent = state.stale
      ? 'This snapshot is stale; Top 3 hidden until server refresh. Use Retry.'
      : 'Only live, owner-verified source projections are actionable. Preview tasks cannot enter this list.';
    byId('mm-next').innerHTML = top.length
      ? top.map(task => taskMarkup(task, true, directory)).join('')
      : '<p class="mm-empty">' + (state.stale
        ? 'Top recommendations temporarily unavailable; refresh verified evidence.'
        : 'No immediately eligible verified actions. Check Today, Claims or source availability.') + '</p>';
    renderPets(directory);
    const filterEntry = state.petFilterRef && directory.get(state.petFilterRef);
    const petFilterActive = state.tab === 'moonpet' && Boolean(state.petFilterRef);
    byId('mm-pet-filter').hidden = !petFilterActive;
    byId('mm-pet-filter-label').textContent = petFilterActive
      ? 'Showing only ' + (filterEntry ? filterEntry.label : 'the chosen source MoonPet') + '.'
      : '';
    tabs.forEach(button => {
      const selected = button.dataset.mmTab === state.tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const filtered = filteredTasks();
    byId('mm-results').innerHTML = filtered.length
      ? filtered.map(task => taskMarkup(task, false, directory)).join('')
      : '<p class="mm-empty">No tasks match this category and filter in the currently loaded source pages. ' +
        'A missing item does not mean completed.</p>';
    byId('mm-page-count').textContent = state.tasks.length +
      ' tasks loaded · ' + filtered.length + ' shown' + (state.nextCursor ? ' · more available' : '');
    byId('mm-ledger-note').textContent = state.lastFailure
      ? state.lastFailure + ' · Previously loaded tasks remain clearly marked as a past snapshot.'
      : 'Statuses, progress and deadlines come from the signed-in Worker; this page never marks a mission completed.';
    byId('mm-load-more').hidden = !state.nextCursor;
    byId('mm-load-more').disabled = Boolean(state.paging);
    renderCountdowns();
  }

  function renderCountdowns() {
    root.querySelectorAll('[data-mm-until]').forEach(node => {
      node.textContent = state.stale
        ? '· Last-confirmed time only — refresh for current source status'
        : '· ' + remainingText(node.getAttribute('data-mm-until'));
    });
  }

  function selectTab(tab, remember) {
    if (!TABS.has(tab)) return;
    state.tab = tab;
    if (remember) {
      const path = window.location.pathname + '?tab=' + encodeURIComponent(tab);
      window.history.replaceState(null, '', path);
    }
    render();
  }

  function invalidate(reason) {
    if (!identityKey()) {
      clearPrivate('Telegram login required', 'Sign in to see the private plan.');
      return;
    }
    state.epoch++;
    cancelPagination();
    state.controllers.forEach(controller => controller.abort());
    state.controllers.clear();
    state.pending = null;
    state.lastFailure = null;
    state.stale = Boolean(state.plan);
    if (state.stale) render();
    if (document.hidden) return;
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refresh({ force: true }), 650);
  }

  function onIdentityChanged() {
    clearPrivate('Checking verified Telegram account', 'Previous owner data has been removed; refreshing identity.');
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refresh({ force: true }), 0);
  }

  async function initialise() {
    root.querySelectorAll('[data-mm-tab]').forEach(button => {
      button.addEventListener('click', () => selectTab(button.dataset.mmTab, true));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = tabs.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next].dataset.mmTab, true);
        tabs[next].focus();
      });
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-mm-open-moonpet]');
      if (!button) return;
      const index = Number(button.getAttribute('data-mm-pet-index'));
      const refs = Array.from(petDirectory().keys());
      if (!Number.isInteger(index) || index < 0 || index >= refs.length) return;
      // Filter only local in-memory opaque refs; never send a pet selector or
      // add any pet ID/ref to the URL or to a gameplay action.
      state.petFilterRef = refs[index];
      state.status = 'all';
      state.search = '';
      byId('mm-search').value = '';
      byId('mm-status-filter').value = 'all';
      selectTab('moonpet', true);
      byId('mm-results').focus();
    });
    byId('mm-clear-pet-filter').addEventListener('click', () => {
      state.petFilterRef = null;
      render();
    });
    byId('mm-status-filter').addEventListener('change', event => {
      state.status = event.target.value;
      render();
    });
    byId('mm-search').addEventListener('input', event => {
      state.search = String(event.target.value || '').slice(0, 180);
      render();
    });
    byId('mm-refresh').addEventListener('click', () => refresh({ force: true }));
    byId('mm-gate-retry').addEventListener('click', () => refresh({ force: true }));
    byId('mm-load-more').addEventListener('click', loadMore);
    const hintedTab = new URLSearchParams(window.location.search).get('tab');
    if (TABS.has(hintedTab)) selectTab(hintedTab, false);
    window.addEventListener('moonboys:identity-change', onIdentityChanged);
    window.addEventListener('moonboys:telegram-session', onIdentityChanged);
    window.addEventListener('storage', event => {
      if (/^moonboys_tg_/u.test(String(event.key || ''))) onIdentityChanged();
    });
    REFRESH_EVENTS.forEach(name => window.addEventListener(name, () => invalidate(name)));
    window.addEventListener('focus', () => {
      if (Date.now() - state.lastSuccess > STALE_AFTER_MS) refresh({ force: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - state.lastSuccess > STALE_AFTER_MS)
        refresh({ force: true });
    });
    window.addEventListener('pagehide', () => clearPrivate('Session closed', 'Private data cleared.'));
    window.setInterval(() => {
      if (document.hidden) return;
      const utcDay = new Date().toISOString().slice(0, 10);
      if (state.lastUtcDay !== utcDay && state.plan) {
        invalidate('utc_day_rolled_over');
        state.lastUtcDay = utcDay;
      } else if (state.plan && Date.now() - state.lastSuccess > VISIBLE_POLL_MS &&
        !state.pending && !state.paging) refresh({ force: true });
      renderCountdowns(); // cosmetic only; never changes availability or reward status.
    }, 30000);
    const identity = getIdentity();
    if (identity && identity.ready && typeof identity.ready.then === 'function')
      await identity.ready.catch(() => null);
    refresh({ force: true });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
}());
