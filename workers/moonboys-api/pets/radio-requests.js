// GraffPUNKS Radio song/message requests. Private account-scoped moderation queue.
// No automatic broadcast, public exposure, XP or payment.
// Reuses the existing 074 telegram_pet_system_events schema.
import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';

const SYSTEM = 'radio_request';
const ACTION = 'submission';
const MAX_LENGTH = 160;

export function normalizeMoonpetRadioRequest(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return value.length >= 4 && value.length <= MAX_LENGTH ? value : null;
}

async function readSaved(db, telegramId, dayKey) {
  return db.prepare(`SELECT id,payload_json,created_at FROM telegram_pet_system_events
    WHERE pet_id='' AND season_key='' AND telegram_id=? AND system_key=? AND action_key=? AND period_key=? AND status='completed'`)
    .bind(telegramId,SYSTEM,ACTION,dayKey).first().then(requirePetFirstReadResult);
}

export async function submitMoonpetRadioRequest(db,telegramId,petId,rawMessage,now=new Date()) {
  const message=normalizeMoonpetRadioRequest(rawMessage);
  if(!message) return {accepted:false,reason:'radio_request_invalid',max_length:MAX_LENGTH};
  const dayKey=now.toISOString().slice(0,10);
  const previous=await readSaved(db,telegramId,dayKey);
  if(previous) return {accepted:true,duplicate:true,reason:'radio_request_saved',day_key:dayKey};
  const id=crypto.randomUUID();
  const payload=JSON.stringify({message,source_pet_id:petId,moderation:'pending_host_review'});
  const result=await db.prepare(`INSERT OR IGNORE INTO telegram_pet_system_events
    (id,pet_id,telegram_id,season_key,system_key,action_key,period_key,status,payload_json)
    SELECT ?,'',?,'',?, ?,?,'completed',?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_active_slots a
      JOIN telegram_pet_instances p ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key
      WHERE a.telegram_id=? AND a.pet_id=? AND p.status='active')`)
    .bind(id,telegramId,SYSTEM,ACTION,dayKey,payload,telegramId,petId)
    .run().then(requirePetMutationResult);
  if (Number(result?.meta?.changes)===1) return {accepted:true,duplicate:false,reason:'radio_request_saved',day_key:dayKey};
  const raced=await readSaved(db,telegramId,dayKey);
  if(raced) return {accepted:true,duplicate:true,reason:'radio_request_saved',day_key:dayKey};
  return {accepted:false,reason:'radio_request_pet_changed',refresh_state:true};
}
