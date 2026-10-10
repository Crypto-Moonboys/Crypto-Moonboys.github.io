// Authentication preflight for server-backed progression. Local game APIs stay
// synchronous; only unsent updates may be retried. Never replay uncertain writes.
let writeQueue = Promise.resolve();
let retryableWrites = [];
let unconfirmedWrite = false;
let accountChanged = false;
const latestSelections = new Map();

function identity() {
  return typeof window !== 'undefined' ? window.MOONBOYS_IDENTITY : null;
}

export async function getFreshPlayerAuth({ requireLinked = true } = {}) {
  const gate = identity();
  if (!gate) return null;
  const auth = typeof gate.getFreshTelegramAuth === 'function'
    ? await gate.getFreshTelegramAuth()
    : typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
  // Expired website proof temporarily makes isTelegramLinked false. Test it
  // after renewal, and retain the legacy requirement for an activated bot link.
  if (!auth || (requireLinked && !gate.isTelegramLinked?.()) || String(auth.id) !== String(gate.getTelegramId?.())) return null;
  return auth;
}

function updateNotice() {
  if (typeof document === 'undefined' || !document.body) return;
  let notice = document.getElementById('moonboys-progression-sync-notice');
  if (!retryableWrites.length && !unconfirmedWrite && !accountChanged) { notice?.remove(); return; }
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'moonboys-progression-sync-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:10001;padding:12px;background:#18202b;color:#fff;border:1px solid #ffc857;font:14px sans-serif;';
    document.body.appendChild(notice);
  }
  notice.replaceChildren();
  const message = document.createElement('span');
  message.textContent = [
    retryableWrites.length ? 'Progression updates are waiting for Telegram authentication.' : '',
    accountChanged ? 'An update was stopped because the Telegram account changed. It was not sent.' : '',
    unconfirmedWrite ? 'An update could not be confirmed. Check your server profile before continuing.' : '',
  ].filter(Boolean).join(' ') + ' ';
  notice.appendChild(message);
  if (retryableWrites.length) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry updates';
    retry.addEventListener('click', retryPendingProgression);
    notice.appendChild(retry);
  }
}

function report(job, error, retryable) {
  if (retryable) retryableWrites.push(job);
  else if (error === 'progression_identity_changed') accountChanged = true;
  else unconfirmedWrite = true;
  updateNotice();
  window.dispatchEvent?.(new CustomEvent('moonboys:progression-sync-error', {
    detail: { route: job.route, error, retryable },
  }));
  return { ok: false, error, retryable };
}

function isSuperseded(job) {
  return job.selectionKey && latestSelections.get(job.selectionKey) !== job;
}

async function submit(job) {
  if (isSuperseded(job)) return { ok: false, skipped: true };
  const gate = identity();
  let auth;
  try {
    auth = await getFreshPlayerAuth({ requireLinked: job.requireLinked });
    // One retry is safe here: no mutation request has been sent yet.
    if (!auth && /^s1_/.test(gate?.getTelegramAuth?.()?.hash || '')) auth = await getFreshPlayerAuth({ requireLinked: job.requireLinked });
  } catch (_) { return isSuperseded(job) ? { ok: false, skipped: true } : report(job, 'progression_auth_unavailable', true); }
  if (isSuperseded(job)) return { ok: false, skipped: true };
  const currentId = gate?.getTelegramId?.();
  if (job.accountId && ((currentId && String(currentId) !== job.accountId) || (auth && String(auth.id) !== job.accountId))) {
    return report(job, 'progression_identity_changed', false);
  }
  if (!auth) {
    if (!job.accountId && !currentId) return { ok: false, skipped: true };
    // Unlinked legacy players still use local progression without submission.
    if (!/^s1_/.test(gate?.getTelegramAuth?.()?.hash || '') && gate?.getSignedTelegramAuth?.()) return { ok: false, skipped: true };
    return report(job, 'progression_auth_unavailable', true);
  }
  // Pin the account for retries, including recovery from a markerless bootstrap.
  job.accountId = String(auth.id);
  const base = window.MOONBOYS_API?.BASE_URL;
  if (!base) return report(job, 'progression_api_unavailable', true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(String(base).replace(/\/$/, '') + job.route, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job.body, telegram_auth: auth }), signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || data?.ok !== true) return report(job, data?.error || 'progression_write_rejected', false);
    return data;
  } catch (_) {
    // The server might already have applied this mutation. No automatic or
    // one-click retry is safe without a server idempotency contract.
    return report(job, 'progression_write_unconfirmed', false);
  } finally { clearTimeout(timer); }
}

function enqueue(job) {
  const result = writeQueue.then(() => submit(job)).then(async data => {
    if (data.ok && job.onSuccess) {
      // Refresh/UI failure cannot authorize another already-acknowledged write.
      try { await job.onSuccess(data); } catch (_) { return { ...data, refresh_error: 'progression_refresh_unavailable' }; }
    }
    return data;
  });
  writeQueue = result.catch(() => {});
  return result;
}

export function syncPlayerProgress(route, body, { selection = false, requireLinked = true, onSuccess } = {}) {
  // A different tab may already have changed the shared display ID. Pin this
  // action to the proof that this tab's current profile was restored with.
  const accountId = identity()?.getTelegramAuth?.()?.id || identity()?.getTelegramId?.();
  const job = { route, body, requireLinked, onSuccess, accountId: accountId ? String(accountId) : null,
    selectionKey: selection ? route : null };
  if (job.selectionKey) {
    latestSelections.set(job.selectionKey, job);
    retryableWrites = retryableWrites.filter(pending => !isSuperseded(pending));
    updateNotice();
  }
  return enqueue(job);
}

export function retryPendingProgression() {
  const pending = retryableWrites;
  retryableWrites = [];
  updateNotice();
  return Promise.all(pending.map(enqueue));
}
