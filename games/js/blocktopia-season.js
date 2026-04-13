export async function loadSeasonConfig() {
  const res = await fetch('/games/data/blocktopia-season.json');
  return await res.json();
}

export async function loadLoreFeed() {
  const res = await fetch('/games/data/blocktopia-lore-feed.json');
  return await res.json();
}

export async function loadProphecyCandidates() {
  const res = await fetch('/games/data/blocktopia-prophecy-candidates.json');
  return await res.json();
}

export function isProphecySeason(season) {
  const start = new Date(season.season_start);
  const end = new Date(season.season_end);
  const durationDays = (end - start) / (1000 * 60 * 60 * 24);
  return durationDays >= 90 && season.season_name.toLowerCase().includes('prophecy');
}

export function pickNextYearArc(weights, candidates) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let rand = Math.random() * total;

  for (const [name, weight] of entries) {
    if (rand < weight) {
      return candidates.candidates.find(c => c.name === name) || candidates.candidates[0];
    }
    rand -= weight;
  }
  return candidates.candidates[0];
}

export function calculateSeasonIndex(epochMs) {
  const now = Date.now();
  const seasonLength = 90 * 24 * 60 * 60 * 1000; // 90 days
  return Math.floor((now - epochMs) / seasonLength);
}