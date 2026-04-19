const NPC_HANDLES = ['Ghost', 'Wire', 'Hex', 'Codec', 'Sable', 'Transit'];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function betAmount() {
  const values = [0.1, 0.25, 0.5, 0.75, 1];
  return pick(values);
}

export function createBettingFeedSystem() {
  const betsByDuel = new Map();

  function onDuelStarted(payload = {}, hooks = {}) {
    const duelId = payload.duelId || '';
    if (!duelId) return;
    const entries = [];
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i += 1) {
      const amount = betAmount();
      const bettor = pick(NPC_HANDLES);
      const side = Math.random() < 0.5 ? 'A' : 'B';
      const target = side === 'A' ? (payload.playerAName || 'Challenger') : (payload.playerBName || 'Defender');
      entries.push({ bettor, amount, side, target });
      hooks.onFeed?.(`🎲 ${bettor} bets ${amount.toFixed(2)} gems on ${target}`);
    }
    betsByDuel.set(duelId, entries);
  }

  function onDuelEnded(payload = {}, hooks = {}) {
    const duelId = payload.duelId || '';
    const entries = betsByDuel.get(duelId);
    if (!entries?.length) return;

    const winnerId = payload.winnerId || '';
    const winnerSide = winnerId && winnerId === payload.playerA ? 'A' : 'B';
    entries.forEach((bet) => {
      const won = winnerSide ? bet.side === winnerSide : Math.random() < 0.5;
      hooks.onFeed?.(
        won
          ? `💎 ${bet.bettor} wins ${Math.max(0.1, bet.amount * 1.8).toFixed(2)} gems`
          : `🧾 ${bet.bettor} loses ${bet.amount.toFixed(2)} gems`,
      );
    });
    betsByDuel.delete(duelId);
  }

  return {
    onDuelStarted,
    onDuelEnded,
  };
}
