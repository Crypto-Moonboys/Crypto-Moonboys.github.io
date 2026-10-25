import { requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { requirePetCombatRow, PET_ARENA_READ_SHAPE, PET_KAIJU_READ_SHAPE } from './combat-read.js';

// Complete-state presentation only. Action and live-poll callers retain their
// existing helpers. All housekeeping and reads share one guarded transaction.
export async function readPetCombatProjection(db, owner, { arenaLobby, kaijuLobby, arenaTtl, kaijuTtl }) {
  const id = String(owner), soloArena = `mini:${id}`, soloKaiju = `mini:kaiju:${id}`;
  const statements = [
    db.prepare(`UPDATE telegram_pet_arena_battles SET status='expired', completed_at=CURRENT_TIMESTAMP
      WHERE (chat_id=? OR (?<>'' AND (player1_telegram_id=? OR player2_telegram_id=?)))
        AND status IN ('readying','active') AND COALESCE(expires_at, created_at) < ?
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_arena_rounds r
          WHERE r.battle_id=telegram_pet_arena_battles.battle_id AND r.round_number=telegram_pet_arena_battles.current_round
            AND telegram_pet_arena_battles.status='active' AND r.player1_move IS NOT NULL
            AND (r.player2_move IS NOT NULL OR telegram_pet_arena_battles.player2_telegram_id='app'))`)
      .bind(arenaLobby, id, id, id, new Date().toISOString()),
    db.prepare(`UPDATE telegram_pet_arena_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
      WHERE (chat_id=? OR telegram_id=?) AND status='waiting' AND updated_at < datetime('now', ?)`)
      .bind(arenaLobby, id, `-${arenaTtl} minutes`),
    db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='cancelled', updated_at=CURRENT_TIMESTAMP
      WHERE (chat_id LIKE 'mini:kaiju:match:%' OR player1_telegram_id=? OR player2_telegram_id=?)
        AND status IN ('open','selecting') AND updated_at < datetime('now', ?)
        AND NOT (player1_card_key IS NOT NULL AND (CASE WHEN mode='solo' THEN cpu_card_key ELSE player2_card_key END) IS NOT NULL)`)
      .bind(id, id, `-${kaijuTtl} minutes`),
    db.prepare(`UPDATE telegram_pet_kaiju_queue SET status='expired', updated_at=CURRENT_TIMESTAMP
      WHERE (chat_id=? OR telegram_id=?) AND status='waiting' AND updated_at < datetime('now', ?)`)
      .bind(kaijuLobby, id, `-${kaijuTtl} minutes`),
    // The original solo fallback is visited only when no player match remains.
    // Do not cancel another row in this legacy chat when that fallback is unused.
    db.prepare(`UPDATE telegram_pet_kaiju_matches SET status='cancelled', updated_at=CURRENT_TIMESTAMP
      WHERE chat_id=? AND status IN ('open','selecting') AND updated_at < datetime('now', ?)
        AND NOT (player1_card_key IS NOT NULL AND (CASE WHEN mode='solo' THEN cpu_card_key ELSE player2_card_key END) IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_kaiju_matches p
          WHERE p.chat_id LIKE 'mini:kaiju:match:%' AND p.status IN ('open','selecting')
            AND (p.player1_telegram_id=? OR p.player2_telegram_id=?))`)
      .bind(soloKaiju, `-${kaijuTtl} minutes`, id, id),
    // Lobby matches retain priority over the solo fallback, as before.
    db.prepare(`SELECT * FROM telegram_pet_arena_battles
      WHERE chat_id IN (?,?) AND status IN ('readying','active') AND (player1_telegram_id=? OR player2_telegram_id=?)
      ORDER BY CASE WHEN chat_id=? THEN 0 ELSE 1 END, created_at DESC LIMIT 1`)
      .bind(arenaLobby, soloArena, id, id, arenaLobby),
    db.prepare(`SELECT q.rank_bucket,q.accept_any_rank,q.created_at,
        (SELECT COUNT(*) FROM telegram_pet_arena_queue p WHERE p.chat_id=q.chat_id AND p.status='waiting' AND p.created_at<=q.created_at) AS position
      FROM telegram_pet_arena_queue q WHERE q.chat_id=? AND q.telegram_id=?
        AND (q.status='waiting' OR q.updated_at LIKE 'claim:%') LIMIT 1`).bind(arenaLobby, id),
    db.prepare(`SELECT * FROM telegram_pet_kaiju_matches
      WHERE status IN ('open','selecting') AND ((chat_id LIKE 'mini:kaiju:match:%' AND (player1_telegram_id=? OR player2_telegram_id=?)) OR chat_id=?)
      ORDER BY CASE WHEN chat_id LIKE 'mini:kaiju:match:%' AND (player1_telegram_id=? OR player2_telegram_id=?) THEN 0 ELSE 1 END, created_at DESC LIMIT 1`)
      .bind(id, id, soloKaiju, id, id),
    db.prepare(`SELECT q.queued_at,
        (SELECT COUNT(*) FROM telegram_pet_kaiju_queue p WHERE p.chat_id=q.chat_id AND p.status='waiting' AND p.queued_at<=q.queued_at) AS position
      FROM telegram_pet_kaiju_queue q WHERE q.chat_id=? AND q.telegram_id=?
        AND (q.status='waiting' OR q.updated_at LIKE 'claim:%') LIMIT 1`).bind(kaijuLobby, id),
    db.prepare(`SELECT * FROM telegram_pet_arena_battles WHERE status='completed'
      AND (player1_telegram_id=? OR player2_telegram_id=?) ORDER BY completed_at DESC LIMIT 1`).bind(id,id),
    db.prepare(`SELECT * FROM telegram_pet_kaiju_matches WHERE status='completed'
      AND (player1_telegram_id=? OR player2_telegram_id=?) ORDER BY completed_at DESC LIMIT 1`).bind(id,id),
  ];
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length) throw new Error('pet_state_read_unavailable');
  results.slice(0,5).forEach(result => {
    requirePetMutationResult(result);
    if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('pet_state_write_unavailable');
  });
  const rows = results.slice(5).map(result => requirePetReadResult(result).results[0] || null);
  const [arena, queue, kaiju, kaijuQueue, recentArena, recentKaiju] = rows;
  requirePetCombatRow(queue, { text:['rank_bucket','created_at'], number:['accept_any_rank','position'] });
  requirePetCombatRow(kaijuQueue, { text:['queued_at'], number:['position'] });
  return {
    arena: requirePetCombatRow(arena, PET_ARENA_READ_SHAPE),
    arenaQueue: queue ? { waiting:true, rank_bucket:queue.rank_bucket, accept_any_rank:Boolean(queue.accept_any_rank), position:Math.max(1,queue.position) } : null,
    kaiju: requirePetCombatRow(kaiju, PET_KAIJU_READ_SHAPE),
    kaijuQueue: kaijuQueue ? { waiting:true, position:Math.max(1,kaijuQueue.position) } : null,
    recentArena: requirePetCombatRow(recentArena, PET_ARENA_READ_SHAPE),
    recentKaiju: requirePetCombatRow(recentKaiju, PET_KAIJU_READ_SHAPE),
  };
}
