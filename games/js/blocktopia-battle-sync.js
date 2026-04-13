const COMMUNITY_FEED_ENDPOINT = '/api/community-feed';

export async function pushBattleEvent(event) {
  try {
    await fetch(COMMUNITY_FEED_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  } catch (err) {
    console.warn('Community feed push failed', err);
  }
}

export function buildGraffitiEvent(player, district, score) {
  return {
    type: 'graffiti_capture',
    player,
    district,
    score,
    timestamp: Date.now(),
    message: `${player} reinforced GraffPUNKS control in ${district}.`
  };
}

export function buildProphecyEvent(player, arc) {
  return {
    type: 'prophecy_fragment',
    player,
    arc,
    timestamp: Date.now(),
    message: `${player} uploaded a prophecy fragment influencing the ${arc} arc.`
  };
}
