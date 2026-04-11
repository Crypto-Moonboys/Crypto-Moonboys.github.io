
// Moonboys Arcade - Leaderboard Client
export async function fetchLeaderboard() {
  const res = await fetch('/api/leaderboard');
  return await res.json();
}

export async function submitLeaderboardEntry(name, score, level = 1, wallet = null) {
  await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score, level, wallet })
  });
}
