import { matchSecret, say, telegram } from './support-cases.js';

const ROUTE = '/internal/doctor-approvals';
const SHA = /^[a-f0-9]{40}$/;
const KEY = /^[a-f0-9]{64}$/;
const ID = /^[1-9]\d{0,15}$/;
const SECRET = /^[A-Za-z0-9_-]{32,256}$/;
const REPOS = new Set([
  'hodlkong64/they-call-me-the-daddy', 'hodlkong64/diz-iz-it',
  'hodlkong64/the-brain', 'hodlkong64/hay-mum-im-building-agents-of-change',
  'crypto-moonboys/crypto-moonboys.github.io', 'crypto-moonboys/swarmsy-ai'
]);
const EVENTS = Object.freeze({
  running: 'Repair started', baseline_validation: 'Baseline validation completed',
  local_ai_proposal: 'Local Qwen proposal received', api_error: 'AI provider unavailable',
  api_invalid: 'Invalid AI response; repair retried', api_patch: 'Repair proposal received',
  api_blocked: 'AI provider requested further evidence', api_approved: 'AI review passed',
  codex_only_candidate: 'Passing local candidate; Codex review required',
  codex_patch_requested: 'Requested concrete Codex fixes', codex_patch_validation: 'Codex patch tested',
  validation_passed: 'Isolated tests passed', validation_failed: 'Isolated tests did not pass',
  patch_rejected: 'Proposed patch rejected', pr_head_published: 'Validated PR commit published',
  codex_review_requested: 'Requested review of this exact commit', codex_fix_cycle: 'Applying review findings',
  pr_opened_waiting_review: 'PR waiting for review or merge policy',
  failed_with_reason: 'Repair stopped: investigation required',
  blocked_needs_human_permission: 'Repair blocked: owner intervention required',
  merged: 'GitHub confirmed the merge',
  deployment_deployed: 'Deployment job passed (live smoke test not implied)',
  deployment_failed: 'Deployment job failed', post_merge_passed: 'Post-merge CI passed',
  post_merge_needs_review: 'Post-merge CI requires investigation',
  post_merge_follow_up_queued: 'Post-merge CI follow-up queued'
});
const enabled = env => env.DOCTOR_APPROVALS_ENABLED === 'true' && env.DB && env.TELEGRAM_BOT_TOKEN
  && ID.test(env.SUPPORT_OWNER_TELEGRAM_ID || '') && SECRET.test(env.DOCTOR_APPROVAL_TOKEN || '');
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const get = (db, key) => db.prepare('SELECT * FROM doctor_merge_approvals WHERE job_key = ?').bind(key).first();
const byId = (db, id) => db.prepare('SELECT * FROM doctor_merge_approvals WHERE id = ?').bind(id).first();
const url = (repo, pr) => 'https://github.com/' + repo + '/pull/' + pr;
const identity = (body, row) => row && row.repo === body.repo && row.pr_number === body.pr_number;
const exact = (body, row) => identity(body, row) && row.head_sha === body.head_sha && row.base_sha === body.base_sha;
const state = row => ({ state: row.state, head_sha: row.head_sha, base_sha: row.base_sha, revision: row.revision });

async function notify(env, row) {
  if (!row.notice) return;
  const labels = { ready: 'Ready for merge approval', approved: 'Merge approved; final checks pending',
    rejected: 'Rejected; automatic merge blocked', fix_requested: 'Further repair requested',
    invalidated: 'Approval invalidated; fresh checks required', merged: 'Merge confirmed' };
  const message = 'DOCTOR · ' + labels[row.state] + '\n' + row.repo + ' #' + row.pr_number
    + '\n' + url(row.repo, row.pr_number) + '\nCommit: ' + row.head_sha;
  const keyboard = row.state === 'ready' ? [
    [{ text: 'Approve merge', callback_data: 'doctor:approve:' + row.id + ':' + row.revision }],
    [{ text: 'Request further fix', callback_data: 'doctor:fix:' + row.id + ':' + row.revision },
     { text: 'Reject', callback_data: 'doctor:reject:' + row.id + ':' + row.revision }]
  ] : undefined;
  await say(env, env.SUPPORT_OWNER_TELEGRAM_ID, message, keyboard);
  await env.DB.prepare('UPDATE doctor_merge_approvals SET notice = 0 WHERE id = ? AND revision = ?')
    .bind(row.id, row.revision).run();
}

async function flush(env) {
  const pending = await env.DB.prepare('SELECT * FROM doctor_progress_notices WHERE delivered = 0 ORDER BY created_at, event_key LIMIT 8').all();
  for (const row of pending.results) {
    await say(env, env.SUPPORT_OWNER_TELEGRAM_ID, row.message);
    await env.DB.prepare('UPDATE doctor_progress_notices SET delivered = 1 WHERE event_key = ?').bind(row.event_key).run();
  }
  const approvals = await env.DB.prepare('SELECT * FROM doctor_merge_approvals WHERE notice = 1 ORDER BY updated_at, id LIMIT 8').all();
  for (const row of approvals.results) await notify(env, row);
}

export async function handleDoctorApprovalRequest(request, env) {
  if (new URL(request.url).pathname !== ROUTE) return null;
  if (!enabled(env)) return json({ error: 'doctor_approvals_unavailable' }, 503);
  if (!await matchSecret(request.headers.get('X-Doctor-Approval-Token'), env.DOCTOR_APPROVAL_TOKEN)) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'body_too_large' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'invalid_body' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, 400);
  if (body.action === 'flush') {
    await flush(env);
    return json({ ok: true });
  }
  if (!REPOS.has(body.repo)) return json({ error: 'invalid_repo' }, 400);
  const now = Date.now();
  if (body.action === 'event') {
    if (!KEY.test(body.event_key || '') || !Object.hasOwn(EVENTS, body.event)
        || !Number.isSafeInteger(body.pr_number) || body.pr_number < 0
        || (body.head_sha !== '' && !SHA.test(body.head_sha || ''))) return json({ error: 'invalid_event' }, 400);
    const message = 'DOCTOR · ' + EVENTS[body.event] + '\n' + body.repo
      + (body.pr_number ? '\n' + url(body.repo, body.pr_number) : '')
      + (body.head_sha ? '\nCommit: ' + body.head_sha.slice(0, 12) : '');
    await env.DB.prepare('INSERT OR IGNORE INTO doctor_progress_notices(event_key,message,created_at) VALUES(?,?,?)')
      .bind(body.event_key, message, now).run();
    return json({ ok: true });
  }
  if (!KEY.test(body.job_key || '') || !Number.isSafeInteger(body.pr_number) || body.pr_number < 1
      || !SHA.test(body.head_sha || '') || !SHA.test(body.base_sha || '')) return json({ error: 'invalid_identity' }, 400);
  const db = env.DB;
  let row = await get(db, body.job_key);
  if (row && !identity(body, row)) return json({ error: 'identity_changed' }, 409);
  if (body.action === 'read') return json(exact(body, row) ? state(row) : { state: 'missing' });
  if (body.action === 'ready') {
    if (!row) {
      await db.prepare("INSERT OR IGNORE INTO doctor_merge_approvals(job_key,repo,pr_number,head_sha,base_sha,state,updated_at) VALUES(?,?,?,?,?,'ready',?)")
        .bind(body.job_key, body.repo, body.pr_number, body.head_sha, body.base_sha, now).run();
    } else if (!exact(body, row) || row.state === 'invalidated') {
      // Never revive a rejected or already merged job. Only a new commit can satisfy a further-fix request.
      if (row.state === 'rejected' || row.state === 'merged') return json({ error: 'terminal_decision' }, 409);
      await db.prepare("UPDATE doctor_merge_approvals SET head_sha=?,base_sha=?,state='ready',revision=revision+1,notice=1,updated_at=? WHERE id=? AND revision=?")
        .bind(body.head_sha, body.base_sha, now, row.id, row.revision).run();
    }
    row = await get(db, body.job_key);
    if (!exact(body, row)) return json({ error: 'stale_job' }, 409);
    return json(state(row));
  }
  if (!exact(body, row)) return json({ state: 'missing' });
  if (body.action === 'invalidate' && ['ready','approved'].includes(row.state)) {
    await db.prepare("UPDATE doctor_merge_approvals SET state='invalidated',revision=revision+1,notice=1,updated_at=? WHERE id=? AND revision=? AND state IN ('ready','approved')")
      .bind(now, row.id, row.revision).run();
  } else if (body.action === 'merged' && row.state === 'approved') {
    await db.prepare("UPDATE doctor_merge_approvals SET state='merged',revision=revision+1,notice=1,updated_at=? WHERE id=? AND revision=? AND state='approved'")
      .bind(now, row.id, row.revision).run();
  } else if (!['invalidate','merged'].includes(body.action)) return json({ error: 'invalid_action' }, 400);
  row = await get(db, body.job_key);
  return json(state(row));
}

export async function handleDoctorApprovalUpdate(update, env) {
  const cb = update.callback_query;
  if (typeof cb?.data !== 'string' || !cb.data.startsWith('doctor:')) return false;
  if (!enabled(env)) return true;
  const match = /^doctor:(approve|fix|reject):([1-9]\d{0,15}):([1-9]\d{0,15})$/.exec(cb.data);
  const actor = String(cb.from?.id || '');
  const privateOwner = actor === env.SUPPORT_OWNER_TELEGRAM_ID && !cb.from?.is_bot
    && cb.message?.chat?.type === 'private' && String(cb.message.chat.id) === actor;
  let accepted = false;
  if (match && privateOwner) {
    const [, action, id, revision] = match;
    const row = await byId(env.DB, id);
    if (row?.state === 'ready' && String(row.revision) === revision) {
      const next = { approve: 'approved', fix: 'fix_requested', reject: 'rejected' }[action];
      const result = await env.DB.prepare("UPDATE doctor_merge_approvals SET state=?,revision=revision+1,notice=1,updated_at=? WHERE id=? AND revision=? AND state='ready'")
        .bind(next, Date.now(), row.id, row.revision).run();
      accepted = result.meta.changes === 1;
    }
  }
  await telegram(env, 'answerCallbackQuery', { callback_query_id: cb.id,
    text: accepted ? 'Decision recorded for this commit.' : 'Owner only, or this approval is no longer current.' });
  return true;
}
