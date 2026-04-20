function buildLeaderboardApiBase(env) {
  const configured = typeof env.LEADERBOARD_API_URL === 'string' ? env.LEADERBOARD_API_URL.trim() : '';
  const fallback = 'https://moonboys-leaderboard.sercullen.workers.dev';
  return (configured || fallback).replace(/\/$/, '');
}

function buildLeaderboardIdentityAliasList(verifiedUser) {
  const aliases = new Set();
  const username = String(verifiedUser?.username || '').trim();
  const fullName = [verifiedUser?.first_name, verifiedUser?.last_name].filter(Boolean).join(' ').trim();
  if (username) aliases.add(username.toLowerCase());
  if (fullName) aliases.add(fullName.toLowerCase());
  return aliases;
}

function logLeaderboardBridgeFailure(event, context = {}) {
  console.log('[blocktopia][leaderboard_bridge]', JSON.stringify({
    event,
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

export async function fetchTrustedLeaderboardContext(env, game, telegramId, verifiedUser) {
  const apiBase = buildLeaderboardApiBase(env);
  const res = await fetch(`${apiBase}?game=${encodeURIComponent(game)}&mode=raw`);
  if (!res.ok) {
    logLeaderboardBridgeFailure('http_error', {
      game,
      telegramId: String(telegramId || ''),
      status: res.status,
    });
    throw new Error(`Leaderboard API HTTP ${res.status}`);
  }
  const board = await res.json().catch((error) => {
    logLeaderboardBridgeFailure('invalid_json', {
      game,
      telegramId: String(telegramId || ''),
      message: error?.message || String(error),
    });
    return [];
  });
  const list = Array.isArray(board) ? board : [];
  if (!Array.isArray(board)) {
    logLeaderboardBridgeFailure('unexpected_payload', {
      game,
      telegramId: String(telegramId || ''),
      payloadType: typeof board,
    });
  }
  const aliases = buildLeaderboardIdentityAliasList(verifiedUser);
  const resolvedTelegramId = String(telegramId || '');
  const playerEntry = list.find((row) => {
    if (String(row?.telegram_id || '') === resolvedTelegramId) return true;
    const player = String(row?.player || '').trim().toLowerCase();
    return player && aliases.has(player);
  }) || null;
  const top10Idx = Math.max(0, Math.ceil(list.length * 0.1) - 1);
  const top1Idx = Math.max(0, Math.ceil(list.length * 0.01) - 1);
  return {
    rank: Number(playerEntry?.rank || 0),
    boardSize: list.length,
    top10PercentScore: Number(list[top10Idx]?.score || 0),
    top1PercentScore: Number(list[top1Idx]?.score || 0),
    trustedBestScore: Number(playerEntry?.score || 0),
  };
}
