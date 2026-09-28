import baseWorker from './worker.js';
import { applyPetRuntimeCommandAward } from './worker.js';
import { recoverPetRuntimeAwards } from './pets/runtime-recovery.js';
import { handleDeadRunRequest, cleanupExpiredSessions } from './routes/dead-run.js';

const PROGRESSION_API_ACTIONS = Object.freeze({
  feed: 'feed',
  play: 'play',
  clean: 'clean',
  sleep: 'sleep',
  train: 'train',
  energy_drink: 'energy_drink',
  dance: 'dance',
  cuddles: 'cuddles',
  work: 'job',
  daily_chest: 'daily_chest',
  adventure: 'explore',
  run_step: 'run_step',
  run_extract: 'run_extract',
});

const CORS_ALLOWED_ORIGINS = new Set([
  'https://cryptomoonboys.com',
  'https://www.cryptomoonboys.com',
  'https://crypto-moonboys.github.io',
]);

function corsHeadersFor(request) {
  const origin = String(request?.headers?.get('Origin') || '').trim();
  return origin && CORS_ALLOWED_ORIGINS.has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
}

function jsonError(request, message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeadersFor(request),
    },
  });
}

function stableEventKey(parts = []) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(':').slice(0, 120);
}

function telegramIdFromPetBody(body) {
  return String(body?.telegram_id || body?.user?.id || '').trim();
}

async function readJsonSafe(request) {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

async function runtimeSource(db, telegramId, eventKey, action) {
  if (action === 'run_step') {
    return db.prepare(`SELECT s.pet_id, r.season_key, date(s.created_at) AS day_key
      FROM telegram_pet_run_steps s JOIN telegram_pet_runs r
        ON r.run_id=s.run_id AND r.telegram_id=s.telegram_id AND r.pet_id=s.pet_id
      JOIN telegram_pet_instances p ON p.pet_id=s.pet_id AND p.telegram_id=s.telegram_id AND p.season_key=r.season_key
      WHERE s.telegram_id=? AND s.event_key=? LIMIT 1`).bind(telegramId, eventKey).first();
  }
  const eventType = action === 'job' ? 'work' : action;
  return db.prepare(`SELECT e.pet_id, e.season_key, e.day_key, e.id AS source_event_id,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END, '$.context.runtime_event_key') AS runtime_event_key,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END, '$.context.source') AS source_surface,
      json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END, '$.context.equipment_snapshot') AS equipment_snapshot
    FROM telegram_pet_events e
    JOIN telegram_pet_instances p ON p.pet_id=e.pet_id AND p.telegram_id=e.telegram_id AND p.season_key=e.season_key
    WHERE e.telegram_id=? AND e.event_key=? AND e.event_type=? AND e.status='accepted' LIMIT 1`)
    .bind(telegramId, eventKey, eventType).first();
}

async function applyRuntimeAward(env, telegramId, eventKey, runtimeAction, primaryEventKey, requireStoredKey = false) {
  if (!env?.DB || !telegramId || !eventKey || !runtimeAction) return null;
  try {
    const source = await runtimeSource(env.DB, telegramId, primaryEventKey, runtimeAction);
    // Legacy unscoped events and settlement-only responses cannot name a new pet.
    if (!source?.pet_id || !source?.season_key || !source?.day_key) return null;
    const apiExtractionReceipt = runtimeAction === 'run_extract' && source.source_surface === 'telegram_pets_api';
    if ((requireStoredKey || apiExtractionReceipt) && source.runtime_event_key !== eventKey) {
      if (source.runtime_event_key || source.source_surface !== 'telegram_pets_api') return null;
      // Old API receipts did not retain their client key. Recover only when no
      // unlinked API extraction award could already belong to this receipt.
      const legacyAward = await env.DB.prepare(`SELECT 1 FROM telegram_pet_specialist_events
        WHERE pet_id=? AND telegram_id=? AND season_key=? AND action='run_extract'
          AND event_key LIKE 'runtime:api:%' LIMIT 1`)
        .bind(source.pet_id, telegramId, source.season_key).first();
      if (legacyAward) return null;
    }
    return await applyPetRuntimeCommandAward(env.DB, telegramId, eventKey, runtimeAction, source);
  } catch (error) {
    console.log('[moonboys-api]', JSON.stringify({
      event: 'runtime_api_award_failed', telegramId, action: runtimeAction, eventKey,
      message: error?.message || String(error), timestamp: new Date().toISOString(),
    }));
    return null;
  }
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

function telegramMessageFromUpdate(update) {
  return update?.message || update?.edited_message || null;
}

function telegramCommandFromUpdate(update) {
  const text = String(telegramMessageFromUpdate(update)?.text || '').trim();
  if (!text.startsWith('/')) return '';
  return text.slice(1).split(/[@\s]/, 1)[0].toLowerCase();
}

async function preparePetGearRead(env, body) {
  if (telegramCommandFromUpdate(body) !== 'petgear') return;
  const message = telegramMessageFromUpdate(body);
  const telegramId = String(message?.from?.id || '').trim();
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
  if (body.action === 'run_extract' && payload.reason === 'daily_run_completed') return;

  const telegramId = telegramIdFromPetBody(body);
  if (!telegramId) return;

  if (body.action === 'buy') {
    await upsertPurchasedEquipment(env.DB, telegramId, body.item_key).catch(() => {});
  }

  const runtimeAction = PROGRESSION_API_ACTIONS[String(body.action || '').trim().toLowerCase()];
  if (!runtimeAction) return;

  if (runtimeAction === 'run_extract' && payload.run) {
    if (payload.daily_run || payload.run.status !== 'extracted') return;
    const sourceKey = stableEventKey(['pet_run_extract', telegramId, payload.run.run_id]);
    // Every new Standard extraction stores one runtime identity with its primary
    // receipt. Different request keys and surfaces must share that same claim.
    await applyRuntimeAward(env, telegramId, `runtime:run-extract:${sourceKey}`, runtimeAction, sourceKey, true);
    return;
  }

  if (runtimeAction === 'explore') {
    await recoverPetRuntimeAwards(env.DB, telegramId, applyPetRuntimeCommandAward, { action: 'explore' });
    return;
  }
  if (runtimeAction === 'run_step') {
    if (payload.run?.run_id) await recoverPetRuntimeAwards(env.DB, telegramId, applyPetRuntimeCommandAward,
      { run_id: payload.run.run_id, action: 'run_step', event_key: String(body.event_key || '') });
    return;
  }
  if (payload.settlement_recovered || payload.daily_run) return;
  await recoverPetRuntimeAwards(env.DB, telegramId, applyPetRuntimeCommandAward, { action: runtimeAction });
}

function telegramRunCallbackContext(update) {
  const query = update?.callback_query;
  const data = String(query?.data || '').trim();
  const telegramId = String(query?.from?.id || '').trim();
  if (!telegramId || !data.startsWith('pet:run:')) return null;

  const parts = data.slice('pet:run:'.length).split(':');
  const runId = String(parts.shift() || '').trim();
  const action = String(parts.shift() || '').trim();
  if (!runId) return null;

  if (action === 'step') {
    const stepIndex = String(parts.shift() || '').trim();
    const choiceKey = String(parts.shift() || '').trim();
    if (!stepIndex || !choiceKey) return null;
    const primaryEventKey = stableEventKey(['pet_run_step', telegramId, runId, stepIndex, choiceKey]);
    return {
      telegramId,
      runId,
      primaryEventKey,
      runtimeEventKey: `runtime:run-step:${primaryEventKey}`,
      runtimeAction: 'run_step',
    };
  }

  if (action === 'extract') {
    const primaryEventKey = stableEventKey(['pet_run_extract', telegramId, runId]);
    return {
      telegramId,
      runId,
      primaryEventKey,
      runtimeEventKey: `runtime:run-extract:${primaryEventKey}`,
      runtimeAction: 'run_extract',
    };
  }

  return null;
}

async function repairTelegramRunRuntimeAward(env, update) {
  if (!env?.DB) return;
  const context = telegramRunCallbackContext(update);
  if (!context) return;

  if (context.runtimeAction === 'run_step') {
    await recoverPetRuntimeAwards(env.DB, context.telegramId, applyPetRuntimeCommandAward,
      { run_id: context.runId, action: 'run_step', event_key: context.primaryEventKey });
    return;
  }
  await applyRuntimeAward(env, context.telegramId, context.runtimeEventKey, context.runtimeAction, context.primaryEventKey);
}

export default {
  async fetch(request, env, ctx) {
    const deadRunResponse = await handleDeadRunRequest(request, env, ctx);
    if (deadRunResponse) return deadRunResponse;

    const url = new URL(request.url);
    const isPetAction = url.pathname === '/telegram-pets/action' && request.method === 'POST';
    const isTelegramWebhook = url.pathname === '/telegram/webhook' && request.method === 'POST';
    const body = (isPetAction || isTelegramWebhook) ? await readJsonSafe(request) : null;

    if (isPetAction && body) {
      const runtimeAction = PROGRESSION_API_ACTIONS[String(body.action || '').trim().toLowerCase()];
      if (runtimeAction && !String(body.event_key || '').trim()) {
        return jsonError(request, 'event_key required for progression-bearing pet actions', 400);
      }
      if (runtimeAction && String(body.event_key).length > 120) {
        return jsonError(request, 'event_key must be at most 120 characters', 400);
      }
    }

    if (isTelegramWebhook && body) {
      await preparePetGearRead(env, body);
    }

    const response = await baseWorker.fetch(request, env, ctx);

    if (isPetAction && body) {
      await handlePetApiPostProcessing(env, body, response);
    }
    if (isTelegramWebhook && body && response.ok) {
      await repairTelegramRunRuntimeAward(env, body);
    }

    return response;
  },

  async scheduled(event, env, ctx) {
    // Global GPS coordinate cleanup runs on every cron tick so expired and abandoned
    // sessions are scrubbed regardless of whether the user ever makes another request.
    ctx.waitUntil(cleanupExpiredSessions(env.DB, Date.now()).catch(() => {}));
    if (typeof baseWorker.scheduled === 'function') {
      return baseWorker.scheduled(event, env, ctx);
    }
    return undefined;
  },
};
