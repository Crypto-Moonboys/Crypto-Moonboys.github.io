// A D1 claim covers concurrent Workers as well as Telegram webhook replays.
// This is at-most-once execution, not a promise of exactly-once delivery:
// attempted/failed commands require a NEW user command, never an automatic retry.
export async function claimTagRunCommand(update, env) {
  const botId = String(env?.TELEGRAM_BOT_TOKEN || '').split(':')[0];
  const message = update?.message;
  if (!/^\d{4,20}$/.test(botId) ||
      !Number.isSafeInteger(update?.update_id) || update.update_id < 0 ||
      !Number.isSafeInteger(message?.message_id) || message.message_id <= 0 ||
      !/^-?\d{1,20}$/.test(String(message?.chat?.id ?? ''))) {
    throw new Error('tag_run_command_identity_invalid');
  }
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO tag_run_command_receipts
    (bot_id,update_id,chat_id,message_id) VALUES (?,?,?,?)`)
    .bind(botId, update.update_id, String(message.chat.id), message.message_id).run();
  const changes = result?.meta?.changes;
  if (result?.success === false || !Number.isSafeInteger(changes) || changes < 0 || changes > 1) {
    throw new Error('tag_run_command_claim_unconfirmed');
  }
  return changes === 1;
}

export async function runClaimedTagRunCommand(update, env, execute) {
  let status = 'completed';
  try {
    await execute();
  } catch {
    status = 'failed';
    console.warn('[TAG RUN] claimed command failed; no automatic resend', {
      update_id: update.update_id
    });
  }
  try {
    await env.DB.prepare(`UPDATE tag_run_command_receipts SET status=?,finished_at=CURRENT_TIMESTAMP
      WHERE bot_id=? AND update_id=?`)
      .bind(status, String(env.TELEGRAM_BOT_TOKEN).split(':')[0], update.update_id).run();
  } catch {
    // The original claim remains terminal even if final bookkeeping fails.
    console.warn('[TAG RUN] command receipt completion unavailable', { update_id: update.update_id });
  }
}
