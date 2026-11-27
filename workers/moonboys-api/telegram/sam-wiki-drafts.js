import { readBoundedJson } from '../shared/read-bounded-json.mjs';
import { matchSecret, say, telegram } from './support-cases.js';

const ID = /^[1-9]\d{0,15}$/;
const DELIVERY_TEST = 'delivery_test';
const TEST_ID = /^[1-9]\d{0,19}-[1-9]\d{0,8}$/;
const SHA = /^[a-f0-9]{40}$/;
const SECRET = /^[A-Za-z0-9_-]{32,256}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTIVE = "'queued','editing','reviewing','merging','merge_queued','closing'";
const VISIBLE = new Set(['reviewing', 'ready', 'needs_changes', 'blocked', 'left']);
const REPO = 'https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/';
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const find = (db, id) => db.prepare('SELECT * FROM sam_wiki_drafts WHERE id = ?').bind(id).first();
const limited = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const configured = env => env.SAM_WIKI_DRAFTS_ENABLED === 'true' && env.DB && env.TELEGRAM_BOT_TOKEN
  && ID.test(env.SUPPORT_OWNER_TELEGRAM_ID || '') && SECRET.test(env.SUPPORT_BRAIN_TOKEN || '')
  && SECRET.test(env.SAM_WIKI_DRAFT_TOKEN || '');

function actions(row) {
  const button = (label, action) => ({ text: label, callback_data: `samwiki:${action}:${row.id}:${row.revision}` });
  if (!VISIBLE.has(row.state)) return undefined;
  const choices = [button('Edit', 'edit'), button('Leave', 'leave'), button('Close', 'close')];
  if (row.reviewed && (row.state === 'ready' || row.state === 'left')) choices.unshift(button('Merge', 'merge'));
  return [choices];
}

async function deliver(row, env) {
  const payload = JSON.parse(row.payload);
  const message = row.state === DELIVERY_TEST
    ? `SAM Wiki delivery test · GitHub Actions run ${payload.run_id}\n\nThe private Telegram handoff is working. No action is needed.`
    : [
    `SAM Wiki draft #${row.id} · ${row.state.replaceAll('_', ' ')}`,
    limited(payload.title, 180),
    limited(payload.description, 320),
    limited(payload.article_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), 1100),
    row.note, row.pr_number ? REPO + row.pr_number : '',
    row.head_sha ? 'Commit ' + row.head_sha.slice(0, 12) : '',
  ].filter(Boolean).join('\n\n');
  await say(env, env.SUPPORT_OWNER_TELEGRAM_ID, message, actions(row));
  await env.DB.prepare('UPDATE sam_wiki_drafts SET owner_notice = 0 WHERE id = ? AND revision = ?')
    .bind(row.id, row.revision).run();
}

export async function handleSamWikiUpdate(update, env) {
  const callback = update.callback_query;
  const msg = update.message;
  const isCallback = typeof callback?.data === 'string' && callback.data.startsWith('samwiki:');
  const edit = typeof msg?.text === 'string' && /^\/sam_edit(?:@WIKICOMSBOT)? ([1-9]\d{0,15}) ([1-9]\d{0,15}) ([\s\S]+)$/i.exec(msg.text.trim());
  if (!isCallback && !edit) return false;
  if (!configured(env)) return true;
  const chat = isCallback ? callback.message?.chat : msg.chat;
  const from = isCallback ? callback.from : msg.from;
  if (chat?.type !== 'private' || from?.is_bot || String(chat.id) !== env.SUPPORT_OWNER_TELEGRAM_ID
    || String(from?.id) !== env.SUPPORT_OWNER_TELEGRAM_ID) return true;
  const match = isCallback ? /^samwiki:(edit|leave|close|merge):([1-9]\d{0,15}):([1-9]\d{0,15})$/.exec(callback.data) : null;
  const [, action, id, revision] = match || (edit ? ['', 'edit', edit[1], edit[2]] : []);
  const row = id ? await find(env.DB, id) : null;
  const reply = message => isCallback
    ? telegram(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: message })
    : say(env, chat.id, message);
  if (!row || String(row.revision) !== revision || !VISIBLE.has(row.state)) {
    await reply('Use the latest SAM Wiki draft message.');
    return true;
  }
  if (action === 'edit' && isCallback) {
    await reply('Send your changes in this private chat.');
    await say(env, chat.id, `/sam_edit ${id} ${revision} followed by your editorial instructions.`);
    return true;
  }
  if (action === 'merge' && (!row.reviewed || !SHA.test(row.head_sha) || !['ready', 'left'].includes(row.state))) {
    await reply('This revision needs a completed Codex review.');
    return true;
  }
  const next = { edit: 'editing', leave: 'left', close: 'closing', merge: 'merging' }[action];
  const result = await env.DB.prepare(`UPDATE sam_wiki_drafts SET state = ?, feedback = ?, revision = revision + 1,
    owner_notice = ?, polled_at = 0 WHERE id = ? AND revision = ? AND state = ?`)
    .bind(next, edit ? limited(edit[3], 1200) : '', Number(next === 'left'), row.id, row.revision, row.state).run();
  await reply(result.meta.changes === 1 ? `SAM draft #${id}: ${next}.` : 'Use the latest SAM Wiki draft message.');
  return true;
}

function validDraft(body) {
  const p = body?.payload;
  return SHA.test(body?.base_sha || '') && p?.publish_mode === 'middle_content_only'
    && typeof p.slug === 'string' && p.slug.length <= 100 && SLUG.test(p.slug)
    && limited(p.title, 180) && limited(p.description, 400)
    && typeof p.article_html === 'string' && p.article_html.length > 0 && p.article_html.length <= 20_000;
}

const progress = {
  queued: new Set(['reviewing', 'blocked']),
  editing: new Set(['reviewing', 'blocked']),
  reviewing: new Set(['ready', 'needs_changes', 'blocked']),
  merging: new Set(['merged', 'merge_queued', 'blocked', 'ready']),
  merge_queued: new Set(['merged', 'blocked']),
  closing: new Set(['closed', 'blocked']),
};

export async function handleSamWikiRequest(request, env) {
  if (!configured(env)) return response({ error: 'sam_wiki_unavailable' }, 503);
  const intake = await matchSecret(request.headers.get('X-SAM-Wiki-Draft-Token'), env.SAM_WIKI_DRAFT_TOKEN);
  const bridge = !intake && await matchSecret(request.headers.get('X-Doctor-Support-Token'), env.SUPPORT_BRAIN_TOKEN);
  if (!intake && !bridge) return response({ error: 'unauthorized' }, 401);
  const db = env.DB;
  if (intake && request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('delivery_test');
    if (!id) return response({ error: 'method_not_allowed' }, 405);
    if (!TEST_ID.test(id)) return response({ error: 'invalid_delivery_test' }, 400);
    const test = await db.prepare('SELECT owner_notice FROM sam_wiki_drafts WHERE intake_key = ? AND state = ?')
      .bind(`delivery-test:${id}`, DELIVERY_TEST).first();
    return test ? response({ ok: true, delivered: test.owner_notice === 0 }) : response({ error: 'test_not_found' }, 404);
  }
  if (bridge && request.method === 'GET') {
    const [cases, notices] = await Promise.all([
      db.prepare(`SELECT * FROM sam_wiki_drafts WHERE state IN (${ACTIVE}) ORDER BY polled_at,id LIMIT 5`).all(),
      db.prepare('SELECT id, revision FROM sam_wiki_drafts WHERE owner_notice = 1 ORDER BY id LIMIT 8').all(),
    ]);
    return response({ cases: cases.results, notices: notices.results });
  }
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const body = await readBoundedJson(request, 45_000);
  if (intake) {
    if (body && Object.hasOwn(body, DELIVERY_TEST)) {
      const id = body.delivery_test;
      if (typeof id !== 'string' || !TEST_ID.test(id) || Object.keys(body).length !== 1) {
        return response({ error: 'invalid_delivery_test' }, 400);
      }
      const key = `delivery-test:${id}`;
      const result = await db.prepare(`INSERT OR IGNORE INTO sam_wiki_drafts
        (intake_key, payload, base_sha, state, owner_notice)
        SELECT ?, ?, '', ?, 1 WHERE (SELECT COUNT(*) FROM sam_wiki_drafts
          WHERE state = ? AND owner_notice = 1) < 3`)
        .bind(key, JSON.stringify({ run_id: id }), DELIVERY_TEST, DELIVERY_TEST).run();
      if (!result.meta.changes && !await db.prepare('SELECT id FROM sam_wiki_drafts WHERE intake_key = ?').bind(key).first()) {
        return response({ error: 'delivery_test_queue_full' }, 429);
      }
      return response({ ok: true });
    }
    if (!validDraft(body)) return response({ error: 'invalid_draft' }, 400);
    const payload = JSON.stringify(body.payload);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.base_sha + payload));
    const key = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    const result = await db.prepare(`INSERT OR IGNORE INTO sam_wiki_drafts (intake_key,payload,base_sha)
      SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM sam_wiki_drafts
        WHERE state NOT IN ('merged','closed',?)) < 20`).bind(key, payload, body.base_sha, DELIVERY_TEST).run();
    if (!result.meta.changes && !await db.prepare('SELECT id FROM sam_wiki_drafts WHERE intake_key = ?').bind(key).first()) {
      return response({ error: 'sam_queue_full' }, 429);
    }
    return response({ ok: true });
  }
  if (!ID.test(String(body?.id)) || !ID.test(String(body?.revision))) return response({ error: 'invalid_draft' }, 400);
  const row = await find(db, body.id);
  if (!row || row.revision !== Number(body.revision)) return response({ error: 'stale_draft' }, 409);
  if (body.action === 'notify') {
    if (row.owner_notice) await deliver(row, env);
    return response({ ok: true });
  }
  if (body.action === 'defer') {
    await db.prepare('UPDATE sam_wiki_drafts SET polled_at = ? WHERE id = ? AND revision = ?').bind(Date.now(), row.id, row.revision).run();
    return response({ ok: true });
  }
  if (body.action === 'refresh_base' && ['queued', 'editing', 'reviewing', 'merging'].includes(row.state)
      && SHA.test(body.base_sha || '') && body.base_sha !== row.base_sha) {
    // Refreshing a branch invalidates both review and any pending merge approval.
    const next = row.state === 'editing' ? 'editing' : 'queued';
    const refreshed = await db.prepare(`UPDATE sam_wiki_drafts SET state = ?, base_sha = ?, revision = revision + 1,
      reviewed = 0, owner_notice = 0, polled_at = ? WHERE id = ? AND revision = ? AND state = ?`)
      .bind(next, body.base_sha, Date.now(), row.id, row.revision, row.state).run();
    return refreshed.meta.changes === 1 ? response({ ok: true }) : response({ error: 'stale_draft' }, 409);
  }
  if (body.action === 'prepare_edit' && row.state === 'editing' && !row.pending_payload
      && validDraft({ payload: body.payload, base_sha: row.base_sha })
      && body.payload.slug === JSON.parse(row.payload).slug) {
    const saved = await db.prepare(`UPDATE sam_wiki_drafts SET pending_payload = ?
      WHERE id = ? AND revision = ? AND state = 'editing' AND pending_payload = ''`)
      .bind(JSON.stringify(body.payload), row.id, row.revision).run();
    return saved.meta.changes === 1 ? response({ ok: true }) : response({ error: 'stale_draft' }, 409);
  }
  if (body.action !== 'status' || !progress[row.state]?.has(body.state)) return response({ error: 'invalid_transition' }, 409);
  const pr = body.pr_number ?? row.pr_number;
  const head = body.head_sha ?? row.head_sha;
  const review = body.review_id ?? row.review_id;
  if ((pr !== 0 && !ID.test(String(pr))) || (review !== 0 && !ID.test(String(review))) ||
    (head !== '' && !SHA.test(head)) ||
    (body.state === 'reviewing' && (!pr || !head || !review)) ||
    (['reviewing', 'merging', 'merge_queued'].includes(row.state) && (head !== row.head_sha || pr !== row.pr_number || review !== row.review_id))
    || (body.state === 'reviewing' && row.pr_number && pr !== row.pr_number)) {
    return response({ error: 'invalid_review' }, 400);
  }
  if (row.state === 'merging' && body.state === 'ready' && !row.reviewed) return response({ error: 'invalid_review' }, 400);
  const result = await db.prepare(`UPDATE sam_wiki_drafts SET state = ?, pr_number = ?, head_sha = ?,
    review_id = ?, reviewed = ?, note = ?, owner_notice = 1, revision = revision + 1, polled_at = ?,
    payload = CASE WHEN ? = 'reviewing' AND pending_payload <> '' THEN pending_payload ELSE payload END,
    pending_payload = ''
    WHERE id = ? AND revision = ? AND state = ?`)
    .bind(body.state, pr, head, review, Number(body.state === 'ready'), limited(body.note, 400),
      Date.now(), body.state, row.id, row.revision, row.state).run();
  return result.meta.changes === 1 ? response({ ok: true }) : response({ error: 'stale_draft' }, 409);
}
