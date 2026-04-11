
// Moonboys Arcade - Cross Game Leaderboard Sync
export function calculateGlobalScore(scores) {
  const varietyBonus = Object.keys(scores).length >= 3 ? 200 : 0;
  const total =
    (scores.snake || 0) +
    (scores.crystal || 0) +
    (scores.rpg || 0) +
    varietyBonus;

  return total;
}

export async function submitScore(playerName, scores) {
  const globalScore = calculateGlobalScore(scores);

  await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: playerName,
      score: globalScore,
      level: scores.level || 1
    })
  });
}
