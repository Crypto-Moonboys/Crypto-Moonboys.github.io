// Forward saved Radio requests to the configured Telegram group via the existing bot.
// The request remains the authoritative one-per-account/day receipt. Only the
// delivery marker changes; nothing awards currency/XP or publishes player IDs.
import { requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { normalizeMoonpetRadioRequest } from './radio-requests.js';

const MAX_PER_TICK = 5;
const START_DAY = '2026-10-12'; // never dump older private requests into a group retroactively

function escapeTelegramHtml(value) {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  const rows = requirePetReadResult(await db.prepare(`SELECT id,period_key,payload_json FROM telegram_pet_system_events
    WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
      AND period_key>=?
      AND json_valid(payload_json)
      AND COALESCE(json_extract(payload_json,'$.telegram_group_delivery'),'pending')='pending'
    ORDER BY created_at ASC LIMIT ?`).bind(START_DAY, MAX_PER_TICK).all()).results;
  let sent=0,failed=0,claimed=0;
  for(const row of rows){
    let payload;
    try {payload=JSON.parse(row.payload_json);}catch{failed++;continue;}
    const body=radioGroupMessage(payload,row.period_key);
    if(!body){failed++;continue;}
    // A conditional claim is permanent until a definitive Telegram failure:
    // an unknown send result must NOT silently retry (duplicate group posts).
    const claimedRow=requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
      SET payload_json=json_set(payload_json,'$.telegram_group_delivery','sending'),
          updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='completed' AND system_key='radio_request'
        AND COALESCE(json_extract(payload_json,'$.telegram_group_delivery'),'pending')='pending'`)
      .bind(row.id).run());
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
        SET payload_json=json_set(payload_json,'$.telegram_group_delivery','sent'),
            updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND json_extract(payload_json,'$.telegram_group_delivery')='sending'`)
        .bind(row.id).run());
      sent++;
    }else{
      failed++;
      // A non-2xx HTTP response is definitively not delivered; retry next
      // scheduled cycle. Network timeouts are uncertain: keep 'sending'.
      if(Number(result?.status)>=400){
        requirePetMutationResult(await db.prepare(`UPDATE telegram_pet_system_events
          SET payload_json=json_set(payload_json,'$.telegram_group_delivery','pending'),
              updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND json_extract(payload_json,'$.telegram_group_delivery')='sending'`)
          .bind(row.id).run());
      }
    }
  }
  return {ok:failed===0,found:rows.length,claimed,sent,failed};
}
