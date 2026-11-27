const ROUTE = '/internal/doctor-support';
const ID = /^[1-9]\d{0,15}$/;
const SHA = /^[a-f0-9]{40}$/;
const PR = /^https:\/\/github\.com\/Crypto-Moonboys\/Crypto-Moonboys\.github\.io\/pull\/[1-9]\d*$/;
const SECRET = /^[A-Za-z0-9_-]{32,256}$/;
const WIKI_PATH = /^\/wiki\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.html$/;
const WIKI_PREFIX = 'wiki-link:';
const ART = new Set(['moonboy-builder.html', 'js/avatar-builder-core.mjs', 'js/avatar-builder-test.js', 'css/avatar-builder-test.css']);
const POLL_STATES = "'look_requested','approved','tracking'";
const STATUS = new Set(['queued', 'running', 'pr_opened_waiting_review', 'blocked_needs_human_permission', 'failed_with_reason', 'merged', 'merge_ready', 'merge_blocked']);
const config = env => env.SUPPORT_CASES_ENABLED === 'true' && ID.test(env.SUPPORT_OWNER_TELEGRAM_ID || '')
  && SECRET.test(env.SUPPORT_BRAIN_TOKEN || '') && env.DB && env.TELEGRAM_BOT_TOKEN;
const find = (db, id) => db.prepare('SELECT * FROM support_cases WHERE id = ?').bind(id).first();
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function supportRepairPath(path) {
  return typeof path === 'string' && path.length <= 180 && (ART.has(path) || (
    /^games\/[a-z0-9-]+\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:html|css|m?js)$/.test(path)
    && !/(?:auth|admin|token|secret|leaderboard|reward|score|payment|wallet|anti[-_]?cheat|session|login|ranked|payout|progression)/i.test(path)
    && !/\/(?:tests?|test-builds|vendor|node_modules|dist|build)\/|\.(?:test|spec)\.m?js$/i.test(path)
  ));
}

function redact(value) {
  return value.replace(/\b(?:sk-[\w-]{16,}|github_pat_[\w]+|gh[pousr]_[\w]+|\d{8,16}:[\w-]{25,}|Bearer\s+[\w.-]{16,})\b/gi, '[redacted]');
}

export async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok || (await response.json()).ok !== true) throw new Error('support_telegram_delivery_failed');
}

export const say = (env, chat_id, message, inline_keyboard) => telegram(env, 'sendMessage', {
  chat_id, text: message, ...(inline_keyboard ? { reply_markup: { inline_keyboard } } : {})
});
const button = (label, action, row) => ({ text: label, callback_data: `support:${action}:${row.id}:${row.revision}` });

function parseUpdate(update) {
  const callback = update.callback_query;
  if (typeof callback?.data === 'string' && callback.data.startsWith('support:')) {
    const match = /^support:(look|decline|fix|merge):(\d+):(\d+)$/.exec(callback.data);
    return { action: match?.[1], id: match?.[2], revision: match?.[3], actor: callback.from, chat: callback.message?.chat, callback: callback.id };
  }
  const msg = update.message;
  if (typeof msg?.text !== 'string') return null;
  const report = /^\/report(?:@WIKICOMSBOT)?(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
  if (report) return { action: 'report', value: report[1], actor: msg.from, chat: msg.chat, messageId: msg.message_id };
  const command = /^(?:\/|\b)(look|decline|review|fix|resolved)(?:@WIKICOMSBOT)?\s+#?(\d+)(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
  return command ? { action: command[1].toLowerCase(), id: command[2], value: command[3], actor: msg.from, chat: msg.chat } : null;
}

export async function handleSupportUpdate(update, env, checkMember) {
  if (!config(env)) return false;
  const command = parseUpdate(update);
  if (!command) return false;
  const actor = String(command.actor?.id || '');
  if (command.chat?.type !== 'private' || String(command.chat.id) !== actor || !ID.test(actor) || command.actor?.is_bot) return false;
  const db = env.DB;
  if (command.action === 'report') {
    const report = text(redact(text(command.value, 4096)), 1800);
    if (!report) {
      await say(env, actor, 'Send /report followed by what happened, the page or game, and what you expected. Keep keys and wallet recovery phrases private.');
      return true;
    }
    const membership = actor === env.SUPPORT_OWNER_TELEGRAM_ID ? { ok: true } : await checkMember(actor);
    if (!membership.ok) {
      await say(env, actor, membership.status === 403 ? 'Support is available to community members.' : 'Membership could not be checked. Please retry shortly.');
      return true;
    }
    if (!Number.isSafeInteger(command.messageId) || command.messageId < 1) return true;
    const intakeKey = `${actor}:${command.messageId}`;
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`INSERT OR IGNORE INTO support_cases (intake_key, reporter_id, report, created_at)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM support_cases WHERE reporter_id = ? AND created_at > ?)`)
      .bind(intakeKey, actor, report, now, actor, now - 60).run();
    const row = await db.prepare('SELECT id FROM support_cases WHERE intake_key = ?').bind(intakeKey).first();
    if (!row) await say(env, actor, 'Wait a minute before sending another report.');
    // The Brain drains the durable receipt and owner notice on its next poll.
    return true;
  }
  if (actor !== env.SUPPORT_OWNER_TELEGRAM_ID || !command.action || !ID.test(command.id || '')) {
    if (command.callback) await telegram(env, 'answerCallbackQuery', { callback_query_id: command.callback, text: 'Owner only.' });
    return true;
  }
  const row = await find(db, command.id);
  const revision = command.revision || (command.action === 'fix' ? command.value : String(row?.revision));
  const state = row?.state;
  let next, feedback = row?.feedback || '';
  if (command.action === 'look' && state === 'submitted') next = 'look_requested';
  if (command.action === 'decline' && ['submitted', 'look_requested', 'reviewed'].includes(state)) next = 'declined';
  if (command.action === 'review' && state === 'reviewed' && !row.intake_key.startsWith(WIKI_PREFIX) && text(command.value, 1200)) {
    next = 'look_requested';
    feedback = text(redact(text(command.value, 4096)), 1200);
  }
  if (command.action === 'fix' && state === 'reviewed' && row.fix && SHA.test(row.base_sha)) next = 'approved';
  if (command.action === 'resolved' && state === 'merged') next = 'resolved';
  if (command.action === 'merge' && state === 'tracking'
      && row.doctor_status === 'merge_ready' && SHA.test(row.merge_head_sha)
      && PR.test(row.pr_url) && revision === String(row.revision)) {
    const approval = await db.prepare(`UPDATE support_cases SET doctor_status = 'merge_approved',
      revision = revision + 1, owner_notice = 0, polled_at = 0
      WHERE id = ? AND revision = ? AND state = 'tracking' AND doctor_status = 'merge_ready'`)
      .bind(row.id, row.revision).run();
    if (approval.meta.changes === 1) {
      await telegram(env, 'answerCallbackQuery', {
        callback_query_id: command.callback, text: 'Approved. The Brain will recheck the PR before merging.'
      });
      return true;
    }
  }
  let changed = false;
  if (next && revision === String(row.revision)) {
    const result = await db.prepare(`UPDATE support_cases
      SET state = ?, revision = revision + 1, feedback = ?, owner_notice = ?, reporter_notice = CASE WHEN ? THEN 1 ELSE reporter_notice END,
        approved_revision = CASE WHEN ? = 'approved' THEN revision + 1 ELSE approved_revision END, polled_at = 0
      WHERE id = ? AND revision = ? AND state = ?`)
      .bind(next, feedback, Number(['look_requested', 'approved', 'declined', 'resolved'].includes(next)),
        Number(['declined', 'resolved'].includes(next)), next, row.id, row.revision, state).run();
    changed = result.meta.changes === 1;
  }
  const reply = changed ? `Case #${row.id}: ${next.replaceAll('_', ' ')}.`
    : 'Case state or review revision changed. Use the latest case message. To approve a fix by text, use FIX #case revision.';
  if (command.callback) await telegram(env, 'answerCallbackQuery', { callback_query_id: command.callback, text: reply });
  else await say(env, actor, reply);
  return true;
}

export async function matchSecret(candidate, secret) {
  if (!candidate || !SECRET.test(candidate)) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([secret, candidate].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(left, right);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  return a.reduce((difference, byte, i) => difference | (byte ^ b[i]), 0) === 0;
}

async function intakeWikiLink(body, env) {
  const { page, old, new: target, base_sha: base } = body;
  const normalized = path => path.toLowerCase().replaceAll('_', '-');
  if (typeof page !== 'string' || !WIKI_PATH.test('/' + page)
      || typeof old !== 'string' || !WIKI_PATH.test(old)
      || typeof target !== 'string' || !WIKI_PATH.test(target)
      || old === target || normalized(old) !== normalized(target)
      || typeof base !== 'string' || !SHA.test(base)) {
    return json({ error: 'invalid_scope' }, 400);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([page, old, target])));
  const key = WIKI_PREFIX + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  const fix = `Replace Wiki link ${old} with ${target}.`;
  const db = env.DB;
  const result = await db.prepare(`INSERT INTO support_cases
    (intake_key, reporter_id, report, state, review, fix, paths, base_sha, reporter_notice, created_at)
    SELECT ?, ?, ?, 'reviewed', ?, ?, ?, ?, 0, ?
    WHERE EXISTS (SELECT 1 FROM support_cases WHERE intake_key = ?)
      OR (SELECT COUNT(*) FROM support_cases WHERE intake_key LIKE 'wiki-link:%'
          AND state IN ('reviewed', 'approved', 'tracking')) < 5
    ON CONFLICT(intake_key) DO UPDATE SET
      fix = excluded.fix, base_sha = excluded.base_sha,
      revision = revision + CASE WHEN fix = '' THEN 1 ELSE 0 END,
      owner_notice = CASE WHEN fix = '' THEN 1 ELSE owner_notice END,
      doctor_status = '', doctor_reason = '', pr_url = '', merge_head_sha = ''
    WHERE state = 'reviewed' AND (fix = '' OR base_sha <> excluded.base_sha)`)
    .bind(key, env.SUPPORT_OWNER_TELEGRAM_ID, fix,
      `The Brain found a Wiki link on /${page} with no matching tracked page. The proposed link matches a single published Wiki path.`,
      fix, JSON.stringify([page]), base, Math.floor(Date.now() / 1000), key).run();
  if (result.meta.changes === 0 && !await db.prepare('SELECT id FROM support_cases WHERE intake_key = ?').bind(key).first()) {
    return json({ error: 'wiki_queue_full' }, 429);
  }
  return json({ ok: true });
}

async function deliver(env, row) {
  const db = env.DB;
  const prefix = `Case #${row.id}`;
  if (row.owner_notice) {
    let message = `${prefix}: ${row.state.replaceAll('_', ' ')}`;
    let keyboard;
    if (row.state === 'submitted') {
      message += `\n\n${row.report}`;
      keyboard = [[button('Look into it', 'look', row), button('Decline', 'decline', row)]];
    }
    if (row.state === 'reviewed') {
      message += ` · review ${row.revision}\n\n${row.review}\n\n/review ${row.id} your follow-up question`;
      if (row.fix) {
        message += `\n\nProposed fix: ${row.fix}\nFiles: ${JSON.parse(row.paths).join(', ')}\nFIX #${row.id} ${row.revision}`;
        keyboard = [[button('Approve fix', 'fix', row), button('Decline', 'decline', row)]];
      } else keyboard = [[button('Decline', 'decline', row)]];
    }
    if (row.doctor_status) message += `\nDoctor: ${row.doctor_status.replaceAll('_', ' ')}`;
    if (row.doctor_reason) message += `\n${row.doctor_reason}`;
    if (row.pr_url) message += `\n${row.pr_url}`;
    if (row.state === 'tracking' && row.doctor_status === 'merge_ready' && SHA.test(row.merge_head_sha)) {
      message += `\nReviewed commit: ${row.merge_head_sha.slice(0, 12)}`;
      keyboard = [[button('Approve merge', 'merge', row)]];
    }
    if (row.state === 'merged') message += `\nAfter the change is live and verified, send /resolved ${row.id}.`;
    await say(env, env.SUPPORT_OWNER_TELEGRAM_ID, message, keyboard);
    await db.prepare('UPDATE support_cases SET owner_notice = 0 WHERE id = ? AND revision = ?').bind(row.id, row.revision).run();
  }
  if (row.reporter_notice) {
    const receipt = row.state === 'resolved' ? 'The change is live and verified.'
      : row.state === 'declined' ? 'Your report was closed.' : 'Your report was received.';
    await say(env, row.reporter_id, `${prefix}: ${receipt}`);
    await db.prepare('UPDATE support_cases SET reporter_notice = 0 WHERE id = ? AND revision = ?').bind(row.id, row.revision).run();
  }
}

export async function handleSupportRequest(request, env) {
  if (new URL(request.url).pathname !== ROUTE) return null;
  if (!config(env)) return json({ error: 'support_unavailable' }, 503);
  const wikiToken = request.headers.get('X-Brain-Wiki-Scan-Token');
  const scanner = wikiToken !== null && SECRET.test(env.BRAIN_WIKI_SCAN_TOKEN || '')
    && await matchSecret(wikiToken, env.BRAIN_WIKI_SCAN_TOKEN);
  if (!scanner && !await matchSecret(request.headers.get('X-Doctor-Support-Token'), env.SUPPORT_BRAIN_TOKEN)) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (scanner && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const db = env.DB;
  if (request.method === 'GET') {
    const [work, notices] = await Promise.all([
      db.prepare(`SELECT id, state, revision, approved_revision,
        CASE WHEN state = 'look_requested' THEN report ELSE '' END AS report,
        CASE WHEN state = 'look_requested' THEN feedback ELSE '' END AS feedback,
        CASE WHEN state = 'look_requested' THEN review ELSE '' END AS review,
        fix, paths, base_sha, doctor_status, pr_url, merge_head_sha,
        intake_key LIKE 'wiki-link:%' AS wiki_scan
        FROM support_cases WHERE state IN (${POLL_STATES}) ORDER BY polled_at, id LIMIT 12`).all(),
      db.prepare('SELECT id, revision FROM support_cases WHERE owner_notice = 1 OR reporter_notice = 1 ORDER BY polled_at, id LIMIT 12').all()
    ]);
    return json({ cases: work.results, notices: notices.results });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return json({ error: 'body_too_large' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'invalid_body' }, 400); }
  if (scanner) return body?.action === 'wiki_link'
    ? intakeWikiLink(body, env) : json({ error: 'unauthorized' }, 401);
  if (!ID.test(String(body?.id)) || !ID.test(String(body?.revision))) return json({ error: 'invalid_case' }, 400);
  const row = await find(db, body.id);
  if (!row || row.revision !== Number(body.revision)) return json({ error: 'stale_case' }, 409);
  const now = Date.now();
  await db.prepare('UPDATE support_cases SET polled_at = ? WHERE id = ?').bind(now, row.id).run();
  if (body.action === 'notify') {
    await deliver(env, row);
    return json({ ok: true });
  }
  if (body.action === 'defer') return json({ ok: true });
  if (body.action === 'review' && row.state === 'look_requested' && text(body.review, 1300)) {
    const paths = Array.isArray(body.paths) ? [...new Set(body.paths)] : [];
    const fix = text(body.fix, 700);
    if (paths.length > 5 || !paths.every(supportRepairPath) ||
      (fix ? !SHA.test(body.base_sha || '') || !paths.length : paths.length !== 0)) return json({ error: 'invalid_scope' }, 400);
    const result = await db.prepare(`UPDATE support_cases SET state = 'reviewed', revision = revision + 1, review = ?,
      fix = ?, paths = ?, base_sha = ?, doctor_status = '', doctor_reason = '', pr_url = '', owner_notice = 1
      WHERE id = ? AND revision = ? AND state = 'look_requested'`)
      .bind(text(body.review, 1300), fix, JSON.stringify(paths), fix ? body.base_sha : '', row.id, row.revision).run();
    return result.meta.changes === 1 ? json({ ok: true }) : json({ error: 'stale_case' }, 409);
  }
  if (body.action === 'status' && ['approved', 'tracking'].includes(row.state) && STATUS.has(body.status)
      && (body.pr_url ? PR.test(body.pr_url) : !['merged', 'pr_opened_waiting_review', 'merge_ready'].includes(body.status))
      && (body.status !== 'merge_ready' || (row.state === 'tracking' && row.pr_url === body.pr_url && SHA.test(body.merge_head_sha || '')))) {
    const mergeHead = body.status === 'merge_ready' ? body.merge_head_sha : '';
    if (row.doctor_status === 'merge_approved' && !['merged', 'merge_blocked'].includes(body.status)) {
      return json({ error: 'stale_case' }, 409);
    }
    const reason = redact(text(body.reason, 300));
    if (row.doctor_status === body.status && row.pr_url === (body.pr_url || '') && row.doctor_reason === reason && row.merge_head_sha === mergeHead) return json({ ok: true });
    const next = body.status === 'merged' ? 'merged'
      : ['blocked_needs_human_permission', 'failed_with_reason'].includes(body.status) ? 'reviewed' : 'tracking';
    // A blocked job needs a fresh investigation before any further approval.
    const result = await db.prepare(`UPDATE support_cases SET state = ?, revision = revision + 1, doctor_status = ?, doctor_reason = ?, pr_url = ?, merge_head_sha = ?,
      owner_notice = 1, fix = CASE WHEN ? = 'reviewed' THEN '' ELSE fix END
      WHERE id = ? AND revision = ? AND state = ?`).bind(next, body.status, reason, body.pr_url || '', mergeHead, next, row.id, row.revision, row.state).run();
    return result.meta.changes === 1 ? json({ ok: true }) : json({ error: 'stale_case' }, 409);
  }
  return json({ error: 'invalid_transition' }, 409);
}
