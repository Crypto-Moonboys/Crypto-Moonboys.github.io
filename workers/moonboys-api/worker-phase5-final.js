import baseWorker from './worker.js';
import { applyPetRuntimeAward } from './pets/runtime-phase-5a.js';

const PROGRESSION_API_ACTIONS = Object.freeze({
  feed: 'feed',
  play: 'play',
  clean: 'clean',
  sleep: 'sleep',
  train: 'train',
  work: 'job',
  daily_chest: 'daily_chest',
  run_step: 'run_step',
  run_extract: 'run_extract',
});

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function utcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function readJsonSafe(request) {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

async function getEquipmentRows(db, telegramId) {
  const result = await db.prepare(`
    SELECT item_key, slot, item_level, item_xp, mastery_xp, mastery_tier
    FROM telegram_pet_equipment_progression
    WHERE telegram_id = ?
  `).bind(telegramId).all().catch(() => ({ results: [] }));
  return result.results || [];
}

async function repairEquippedProgressionRows(db, telegramId) {
  const pet = await db.prepare(`
    SELECT equipped_food, equipped_toy, equipped_outfit,
           equipped_armor, equipped_weapon, equipped_charm
    FROM telegram_pet_profiles
    WHERE telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  if (!pet) return;

  for (const slot of ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm']) {
    const itemKey = String(pet[`equipped_${slot}`] || '').trim();
    if (!itemKey) continue;
    await db.prepare(`
      INSERT OR IGNORE INTO telegram_pet_equipment_progression
        (telegram_id, item_key, slot)
      VALUES (?, ?, ?)
    `).bind(telegramId, itemKey, slot).run();
  }
}

async function upsertPurchasedEquipment(db, telegramId, itemKey) {
  const key = String(itemKey || '').trim();
  if (!key) return;
  const pet = await db.prepare(`
    SELECT equipped_food, equipped_toy, equipped_outfit,
           equipped_armor, equipped_weapon, equipped_charm
    FROM telegram_pet_profiles
    WHERE telegram_id = ?
  `).bind(telegramId).first().catch(() => null);
  if (!pet) return;

  const slot = ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm']
    .find((candidate) => String(pet[`equipped_${candidate}`] || '') === key);
  if (!slot) return;

  await db.prepare(`
    INSERT INTO telegram_pet_equipment_progression (telegram_id, item_key, slot)
    VALUES (?, ?, ?)
    ON CONFLICT (telegram_id, item_key) DO UPDATE SET
      slot = excluded.slot,
      updated_at = CURRENT_TIMESTAMP
  `).bind(telegramId, key, slot).run();
}

function telegramCommandFromUpdate(update) {
  const text = String(update?.message?.text || update?.edited_message?.text || '').trim();
  if (!text.startsWith('/')) return '';
  return text.slice(1).split(/[@\s]/, 1)[0].toLowerCase();
}

async function preparePetGearRead(request, env, body) {
  if (telegramCommandFromUpdate(body) !== 'petgear') return;
  const telegramId = String(body?.message?.from?.id || body?.edited_message?.from?.id || '').trim();
  if (!telegramId || !env?.DB) return;
  await repairEquippedProgressionRows(env.DB, telegramId).catch(() => {});
}

async function handlePetApiPostProcessing(env, body, response) {
  if (!env?.DB || !body) return;
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }
  if (!payload?.accepted) return;

  const telegramId = String(body.telegram_id || '').trim();
  if (!telegramId) return;

  if (body.action === 'buy') {
    await upsertPurchasedEquipment(env.DB, telegramId, body.item_key).catch(() => {});
  }

  const runtimeAction = PROGRESSION_API_ACTIONS[String(body.action || '').trim()];
  if (!runtimeAction) return;

  const runtimeEventKey = String(body.event_key || '').trim();
  const equipmentRows = await getEquipmentRows(env.DB, telegramId);
  await applyPetRuntimeAward(
    env.DB,
    telegramId,
    `runtime:api:${runtimeEventKey}`,
    runtimeAction,
    {
      day_key: utcDayKey(),
      equipment_rows: equipmentRows,
      drop_roll: body.drop_roll,
      material_amount: body.material_amount,
    },
  ).catch((error) => {
    console.log('[moonboys-api]', JSON.stringify({
      event: 'runtime_api_award_failed',
      telegramId,
      action: runtimeAction,
      eventKey: runtimeEventKey,
      message: error?.message || String(error),
      timestamp: new Date().toISOString(),
    }));
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isPetAction = url.pathname === '/telegram-pets/action' && request.method === 'POST';
    const isTelegramWebhook = url.pathname === '/telegram/webhook' && request.method === 'POST';
    const body = (isPetAction || isTelegramWebhook) ? await readJsonSafe(request) : null;

    if (isPetAction && body) {
      const runtimeAction = PROGRESSION_API_ACTIONS[String(body.action || '').trim()];
      if (runtimeAction && !String(body.event_key || '').trim()) {
        return jsonError('event_key required for progression-bearing pet actions', 400);
      }
    }

    if (isTelegramWebhook && body) {
      await preparePetGearRead(request, env, body);
    }

    const response = await baseWorker.fetch(request, env, ctx);

    if (isPetAction && body) {
      await handlePetApiPostProcessing(env, body, response);
    }

    return response;
  },

  async scheduled(event, env, ctx) {
    if (typeof baseWorker.scheduled === 'function') {
      return baseWorker.scheduled(event, env, ctx);
    }
    return undefined;
  },
};
