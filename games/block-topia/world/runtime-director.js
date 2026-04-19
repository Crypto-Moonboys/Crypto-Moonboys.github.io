const HEARTBEAT_MIN_MS = 30000;
const HEARTBEAT_MAX_MS = 45000;

function randomHeartbeatMs() {
  return HEARTBEAT_MIN_MS + Math.floor(Math.random() * (HEARTBEAT_MAX_MS - HEARTBEAT_MIN_MS));
}

export function createRuntimeDirector(state) {
  const director = {
    lastDirective: 'Stabilize contested nodes',
    nextHeartbeatAt: Date.now() + randomHeartbeatMs(),
  };

  function computeDirective(snapshot = {}) {
    if (snapshot.duelActive) return 'Win duel to swing district pressure';
    if (snapshot.mineReady) return 'Claim mine reward and reinvest gems';
    if (snapshot.unstableNodes > 0) return `Stabilize ${snapshot.unstableNodes} unstable node(s)`;
    if (snapshot.activeQuests > 0) return 'Complete active signal quests';
    return 'Interfere with a node to force world ripple';
  }

  function takeSnapshot() {
    const controlNodes = state.controlNodes || [];
    const unstableNodes = controlNodes.filter((node) => node.status === 'unstable').length;
    return {
      unstableNodes,
      activeQuests: state.quests?.active?.length || 0,
    };
  }

  function tick(hooks = {}) {
    const now = Date.now();
    const snapshot = {
      ...takeSnapshot(),
      duelActive: hooks.duelActive || false,
      mineReady: hooks.mineReady || false,
    };

    const nextDirective = computeDirective(snapshot);
    if (nextDirective !== director.lastDirective) {
      director.lastDirective = nextDirective;
      hooks.onDirective?.(nextDirective, snapshot);
    }

    if (now >= director.nextHeartbeatAt) {
      director.nextHeartbeatAt = now + randomHeartbeatMs();
      hooks.onHeartbeat?.();
    }
  }

  return {
    tick,
    getDirective: () => director.lastDirective,
  };
}
