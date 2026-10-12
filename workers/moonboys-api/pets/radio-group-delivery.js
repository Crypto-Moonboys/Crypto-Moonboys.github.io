// Forward saved Radio requests to the configured Telegram group via the existing bot.
// The request remains the authoritative one-per-account/day receipt. Only
// delivery metadata changes; nothing awards currency/XP or publishes player IDs.
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { normalizeMoonpetRadioRequest } from './radio-requests.js';

const MAX_PER_TICK = 5;
const MAX_DELIVERY_ATTEMPTS = 3;
const START_DAY = '2026-10-12'; // never dump older private requests into a group retroactively
export const RADIO_DELIVERY_QUERY = `SELECT id,period_key,payload_json FROM telegram_pet_system_events
    WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
      AND period_key>='${START_DAY}'
      AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='pending'
      AND COALESCE(CAST(json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery_retry_at') AS INTEGER),0)
        <= CAST(strftime('%s','now') AS INTEGER)
    ORDER BY created_at ASC LIMIT ?`;

function escapeTelegramHtml(value) {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function telegramRetryAfterSeconds(result) {
  if (Number(result?.status) !== 429 || typeof result?.response !== 'string') return 0;
  try {
    const seconds = JSON.parse(result.response)?.parameters?.retry_after;
    return Number.isSafeInteger(seconds) && seconds > 0 ? Math.min(seconds, Number.MAX_SAFE_INTEGER) : 0;
  } catch {
    return 0;
  }
}

export function radioGroupMessage(payload, dayKey) {
  const message = normalizeMoonpetRadioRequest(payload?.message);
  if (!message) return null;
  return '<b>GRAFFPUNKS RADIO // NEW REQUEST</b>\n' +
    escapeTelegramHtml(message) + '\n\n' +
    'Submitted: ' + escapeTelegramHtml(dayKey) + ' UTC\n' +
    'For DJ review only — not automatically played.';
}

export async function forwardRadioRequestsToGroup(db, config, send, options = {}) {
  const chatId = String(config?.chat_id || '').trim();
  if (!chatId || !config?.bot_token) return {ok:true,skipped:'group_not_configured',sent:0,failed:0};
  const rows = requirePetReadResult(await db.prepare(RADIO_DELIVERY_QUERY).bind(MAX_PER_TICK).all()).results;
  let sent=0,failed=0,claimed=0;
  for(const row of rows){
    let payload;
    try {payload=JSON.parse(row.payload_json);}catch{failed++;continue;}
    const body=radioGroupMessage(payload,row.period_key);
    if(!body){
      failed++;
      requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
        SET payload_json=json_set(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,
              '$.telegram_group_delivery','failed','$.telegram_group_delivery_error','invalid_message'),
            updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='completed' AND system_key='radio_request'
          AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='pending'`)
        .bind(row.id).run());
      continue;
    }
    const previousAttempts = payload.telegram_group_delivery_attempts;
    const attempts = Number.isSafeInteger(previousAttempts) && previousAttempts >= 0 ? previousAttempts + 1 : 1;
    // Keep uncertain outcomes held for operator reconciliation rather than
    // silently retrying them and risking duplicate group posts.
    const claimedRow=requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
      SET payload_json=json_set(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,
            '$.telegram_group_delivery','sending',
            '$.telegram_group_delivery_attempts',?),
          updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='completed' AND system_key='radio_request'
        AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='pending'`)
      .bind(attempts,row.id).run());
    if(Number(claimedRow?.meta?.changes)!==1)continue;
    claimed++;
    let result;
    try {
      result=await send(config.bot_token,chatId,body,{
        disable_web_page_preview:true,
        ...(config.message_thread_id ? {message_thread_id:Number(config.message_thread_id)} : {}),
      });
    }catch(error){result={ok:false,error:error?.message||'send_error'};}
    if(result?.ok===true){
      requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
        SET payload_json=json_remove(json_set(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,
              '$.telegram_group_delivery','sent'),
              '$.telegram_group_delivery_http_status','$.telegram_group_delivery_retry_at'),
            updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='sending'`)
        .bind(row.id).run());
      sent++;
    }else{
      failed++;
      const status = Number(result?.status);
      const hasHttpFailure = Number.isInteger(status) && status >= 300;
      const retryableHttpFailure = hasHttpFailure && (status === 429 || status >= 500);
      if(hasHttpFailure){
        const deliveryState = retryableHttpFailure && attempts < MAX_DELIVERY_ATTEMPTS ? 'pending' : 'failed';
        const retryAfter = deliveryState === 'pending' ? telegramRetryAfterSeconds(result) : 0;
        const now = Math.floor(Date.now() / 1000);
        const retryAt = retryAfter ? Math.min(now + retryAfter, Number.MAX_SAFE_INTEGER) : null;
        requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
          SET payload_json=json_set(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,
                '$.telegram_group_delivery',?,
                '$.telegram_group_delivery_http_status',?,
                '$.telegram_group_delivery_retry_at',?),
              updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='sending'`)
          .bind(deliveryState,status,retryAt,row.id).run());
      }
    }
  }
  return {ok:failed===0,found:rows.length,claimed,sent,failed};
}
