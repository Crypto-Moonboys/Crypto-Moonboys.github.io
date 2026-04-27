function isDebugEnabled() {
  return typeof window !== 'undefined' && !!window.__ARCADE_DEBUG_FRAMES;
}

export function createFrameDebug(gameId) {
  const id = gameId || 'unknown-game';
  let tickCount = 0;
  let inputCount = 0;
  let lastTsBucket = -1;
  let ticksThisBucket = 0;

  function tick(ts) {
    if (!isDebugEnabled()) return;

    const tsBucket = Math.round(ts);
    if (tsBucket === lastTsBucket) {
      ticksThisBucket += 1;
    } else {
      lastTsBucket = tsBucket;
      ticksThisBucket = 1;
    }

    tickCount += 1;
    console.debug('[frame-debug][' + id + '] tick=' + tickCount + ' ts=' + ts.toFixed(3) + ' ticksPerFrame=' + ticksThisBucket);
    if (ticksThisBucket > 1) {
      console.warn('[frame-debug][' + id + '] duplicate tick detected for the same rAF timestamp bucket');
    }
  }

  function input(eventName, key) {
    if (!isDebugEnabled()) return;
    inputCount += 1;
    console.debug('[frame-debug][' + id + '] input=' + inputCount + ' type=' + eventName + ' key=' + String(key || ''));
  }

  return { tick, input };
}

