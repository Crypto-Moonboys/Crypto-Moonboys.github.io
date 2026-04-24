const SAM_POPUP_DURATION_MS = 4200;
const QUEST_TOAST_DURATION_MS = 4200;
const CAPTURE_BANNER_DURATION_MS = 4200;
const NPC_DIALOGUE_DURATION_MS = 4200;
const NODE_ALERT_DURATION_MS = 2600;
const MAX_LOG_ENTRIES = 50;
const FEED_STAGGER_MS = 210;
const FEED_BURST_GRACE_MS = 120;
const FEED_REPEAT_SUPPRESS_MS = 7000;
const LEFT_FEED_AUTO_SCROLL_MS = 1200;

const STREAM_BY_TYPE = {
  combat: 'left',
  quest: 'right',
  sam: 'right',
  system: 'bottom',
};

function timestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function createHud(doc) {
  const XP_PER_LEVEL = 200;
  const playerNameEl = doc.getElementById('player-name');
  const levelStatus = doc.getElementById('level-status');
  const xpStatus = doc.getElementById('xp-status');
  const gemsStatus = doc.getElementById('gems-status');
  const drainStatus = doc.getElementById('drain-status');
  const districtStatus = doc.getElementById('district-status');

  const worldStatus = doc.getElementById('world-status');
  const aiStatus = doc.getElementById('ai-status');
  const factionStatus = doc.getElementById('faction-status');
  const samStatus = doc.getElementById('sam-status');
  const covertSamStatus = doc.getElementById('covert-sam-status');
  const phaseStatus = doc.getElementById('phase-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus = doc.getElementById('room-status');
  const populationStatus = doc.getElementById('population-status');
  const multiplayerLiveBanner = doc.getElementById('multiplayer-live-banner');
  const covertStrip = doc.getElementById('covert-strip');
  const covertWatchCopy = doc.getElementById('covert-watch-copy');
  const covertHeatValue = doc.getElementById('covert-heat-value');
  const covertHeatMeta = doc.getElementById('covert-heat-meta');
  const covertNodeValue = doc.getElementById('covert-node-value');
  const covertNodeMeta = doc.getElementById('covert-node-meta');
  const covertDistrictValue = doc.getElementById('covert-district-value');
  const covertDistrictMeta = doc.getElementById('covert-district-meta');
  const covertAgentValue = doc.getElementById('covert-agent-value');
  const covertAgentMeta = doc.getElementById('covert-agent-meta');
  const covertRecoveryLine = doc.getElementById('covert-recovery-line');

  const feedLeft = doc.getElementById('stream-left');
  const feedRight = doc.getElementById('stream-right');
  const feedBottom = doc.getElementById('stream-bottom');

  const entryIdentity = doc.getElementById('entry-identity');
  const entryTagline = doc.getElementById('entry-tagline');
  const samPopup = doc.getElementById('sam-popup');
  const samImpact = doc.getElementById('sam-impact');
  const phaseFlash = doc.getElementById('phase-flash');
  const captureFlash = doc.getElementById('capture-flash');
  const districtCaptureBanner = doc.getElementById('district-capture-banner');
  const questToast = doc.getElementById('quest-toast');
  const npcDialogue = doc.getElementById('npc-dialogue');
  const interactPrompt = doc.getElementById('interact-prompt');

  let samPopupTimer = null;
  let districtBannerTimer = null;
  let questToastTimer = null;
  let npcDialogueTimer = null;
  let identityTimer = null;
  let lastXp = 0;
  let lastQuestCount = null;
  const feedQueue = [];
  let feedFlushTimer = null;
  let feedNextSlotAt = Date.now();
  let lastFeedSignature = '';
  let lastFeedAt = 0;
  let districtName = '';
  let districtControl = 0;
  let districtState = 'contested';
  let districtPosture = 'normal';

  let leftFeedTicker = null;

  function startLeftFeedTicker() {
    if (leftFeedTicker || !feedLeft) return;
    leftFeedTicker = setInterval(() => {
      if (feedLeft.children.length < 2) return;
      const first = feedLeft.firstElementChild;
      if (first) feedLeft.appendChild(first);
    }, LEFT_FEED_AUTO_SCROLL_MS);
  }


  function titleFromLevel(level) {
    if (level >= 16) return 'District Sovereign';
    if (level >= 12) return 'Signal Warlord';
    if (level >= 8) return 'Phase Hunter';
    if (level >= 5) return 'Street Captain';
    if (level >= 3) return 'Tag Enforcer';
    return 'Signal Runner';
  }

  function streamNode(stream) {
    if (stream === 'left') return feedLeft;
    if (stream === 'right') return feedRight;
    return feedBottom;
  }

  function appendLog(stream, text, cssClass = 'system', priority = 'ambient') {
    const list = streamNode(stream);
    if (!list || !text) return;
    const item = doc.createElement('li');
    item.className = `stream-line ${cssClass} priority-${priority}`;
    item.textContent = `[${timestamp()}] ${text}`;
    list.appendChild(item);
    while (list.children.length > MAX_LOG_ENTRIES) list.removeChild(list.firstChild);
    Array.from(list.children).forEach((entry, index, arr) => {
      const opacity = Math.max(0.22, 0.35 + (index / Math.max(1, arr.length - 1)) * 0.65);
      entry.style.opacity = opacity.toFixed(3);
    });
    list.scrollTop = list.scrollHeight;
    if (stream === 'left') startLeftFeedTicker();
  }

  function pushLog(stream, text) {
    appendLog(stream, text, 'system');
  }

  function pushFeed(text, type = 'system') {
    const rawText = String(text || '');
    const stream = STREAM_BY_TYPE[type] || (rawText.includes('🗣️') ? 'left' : 'bottom');
    const priority = resolveFeedPriority(type, rawText);
    const signature = `${type}:${rawText.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    const now = Date.now();
    if (
      priority === 'ambient'
      && signature === lastFeedSignature
      && now - lastFeedAt < FEED_REPEAT_SUPPRESS_MS
    ) {
      return;
    }
    lastFeedSignature = signature;
    lastFeedAt = now;
    feedQueue.push({ stream, text: rawText, type, priority, queuedAt: now });
    scheduleFeedFlush();
  }

  function resolveFeedPriority(type, text) {
    const line = String(text || '').toLowerCase();
    if (
      type === 'sam'
      || line.includes('phase shift')
      || line.includes('captured')
      || line.includes('sam event')
      || line.includes('signal rush')
    ) {
      return 'critical';
    }
    if (
      type === 'combat'
      || line.includes('duel')
      || line.includes('interference')
      || line.includes('pressure')
      || line.includes('stabilized')
      || line.includes('stabilised')
    ) {
      return 'important';
    }
    return 'ambient';
  }

  function scheduleFeedFlush() {
    if (feedFlushTimer) return;
    const now = Date.now();
    const wait = Math.max(0, feedNextSlotAt - now);
    feedFlushTimer = setTimeout(flushFeedQueue, wait);
  }

  function flushFeedQueue() {
    feedFlushTimer = null;
    if (!feedQueue.length) return;
    feedQueue.sort((a, b) => {
      const rank = { critical: 0, important: 1, ambient: 2 };
      const rDiff = rank[a.priority] - rank[b.priority];
      if (rDiff !== 0) return rDiff;
      return a.queuedAt - b.queuedAt;
    });
    const item = feedQueue.shift();
    appendLog(item.stream, item.text, item.type, item.priority);
    const now = Date.now();
    const spacing = item.priority === 'critical' ? FEED_STAGGER_MS + FEED_BURST_GRACE_MS : FEED_STAGGER_MS;
    feedNextSlotAt = Math.max(feedNextSlotAt, now) + spacing;
    if (feedQueue.length) scheduleFeedFlush();
  }

  function setXp(value) {
    const safe = Math.max(0, Number(value) || 0);
    const level = Math.max(1, Math.floor(safe / XP_PER_LEVEL) + 1);
    xpStatus.textContent = `${safe} XP`;
    levelStatus.textContent = `L${level} · ${titleFromLevel(level)}`;
    if (safe > lastXp) pushFeed(`+${safe - lastXp} XP secured`, 'quest');
    lastXp = safe;
  }

  function setGems(value) {
    if (!gemsStatus) return;
    const safe = Math.max(0, Math.floor(Number(value) || 0));
    gemsStatus.textContent = `${safe} GEMS`;
  }

  function setDrainPerMinute(value) {
    if (!drainStatus) return;
    const safe = Math.max(0, Math.round(Number(value) || 0));
    drainStatus.textContent = `DRAIN ${safe}/MIN`;
  }

  function setDistrictControl(pct) {
    districtControl = Number(pct) || 0;
    refreshDistrictLine();
  }

  function showSamPopup(text, durationMs = 4000) {
    if (!samPopup) return;
    samPopup.textContent = text;
    samPopup.classList.remove('hidden');
    clearTimeout(samPopupTimer);
    samPopupTimer = setTimeout(() => samPopup.classList.add('hidden'), durationMs);
  }

  function triggerPhaseTransition(name) {
    phaseFlash?.classList.remove('hidden');
    setTimeout(() => phaseFlash?.classList.add('hidden'), 650);
    pushFeed(`PHASE SHIFT → ${String(name || '').toUpperCase()}`, 'sam');
  }

  function triggerSamImpact(text) {
    samImpact?.classList.remove('hidden');
    setTimeout(() => samImpact?.classList.add('hidden'), 1800);
    showSamPopup(`⚡ SAM ALERT\n${text}`, SAM_POPUP_DURATION_MS);
    pushFeed(`SAM alert: ${text}`, 'sam');
  }

  function showQuestComplete(title, rewardXp) {
    clearTimeout(questToastTimer);
    questToast.textContent = `✅ ${title} · +${rewardXp} XP`;
    questToast.classList.remove('hidden');
    questToastTimer = setTimeout(() => questToast.classList.add('hidden'), QUEST_TOAST_DURATION_MS);
  }

  function showDistrictCapture(text) {
    clearTimeout(districtBannerTimer);
    districtCaptureBanner.textContent = text;
    districtCaptureBanner.classList.remove('hidden');
    districtBannerTimer = setTimeout(() => districtCaptureBanner.classList.add('hidden'), CAPTURE_BANNER_DURATION_MS);
    captureFlash?.classList.remove('hidden');
    setTimeout(() => captureFlash?.classList.add('hidden'), 800);
  }

  function showNpcDialogue(name, role, line) {
    clearTimeout(npcDialogueTimer);
    npcDialogue.textContent = `${name} [${role}] · ${line}`;
    npcDialogue.classList.remove('hidden');
    npcDialogueTimer = setTimeout(() => npcDialogue.classList.add('hidden'), NPC_DIALOGUE_DURATION_MS);
  }

  function showNodeInterference(text, level = 'signal') {
    const prefix = level === 'sam' ? '🧠' : level === 'warning' ? '⚠️' : '⚡';
    showSamPopup(`${prefix} ${text}`, NODE_ALERT_DURATION_MS);
    pushFeed(
      `${prefix} ${text}`,
      level === 'sam' ? 'sam' : level === 'warning' ? 'system' : 'combat',
    );
  }

  function setQuests(items = []) {
    const count = Array.isArray(items) ? items.length : 0;
    if (lastQuestCount === count) return;
    lastQuestCount = count;
    pushLog('right', `Active signal operations: ${count}`);
  }

  function setEntryTagline(text) {
    if (entryTagline) entryTagline.textContent = text;
  }

  function dismissEntryIdentity(delay = 2200) {
    clearTimeout(identityTimer);
    identityTimer = setTimeout(() => entryIdentity?.classList.add('hidden'), delay);
  }

  function refreshDistrictLine() {
    if (!districtStatus) return;
    const controlTag = Number.isFinite(districtControl) ? `${Math.round(districtControl)}%` : '0%';
    const postureTag = districtPosture && districtPosture !== 'normal'
      ? ` · ${String(districtPosture).replace(/_/g, ' ').toUpperCase()}`
      : '';
    districtStatus.textContent = `District: ${districtName || 'Unknown'} · ${controlTag} · ${String(districtState || 'contested').toUpperCase()}${postureTag}`;
  }

  function setCovertState(snapshot = {}) {
    if (!covertStrip) return;
    const networkHeat = Math.max(0, Math.min(100, Number(snapshot?.networkHeat?.value) || 0));
    const networkTier = String(snapshot?.networkHeat?.tier || 'cold').toUpperCase();
    const samTier = String(snapshot?.samAwareness?.tier || 'cold').toUpperCase();
    const samSensitivity = Math.max(0, Number(snapshot?.samAwareness?.sensitivity) || 0);
    const summary = snapshot?.summary || {};
    const counterActions = snapshot?.counterActions || {};
    const activeAgents = Math.max(0, Number(summary.activeAgents) || 0);
    const exposedAgents = Math.max(0, Number(summary.exposedAgents) || 0);
    const capturedAgents = Math.max(0, Number(summary.capturedAgents) || 0);
    const highRiskAgents = Math.max(0, Number(summary.highRiskAgents) || 0);
    const highestRisk = Math.max(0, Number(summary.highestRisk) || 0);
    const urgentRecoveryAgents = Math.max(0, Number(summary.urgentRecoveryAgents) || 0);
    const primaryCounterAction = String(counterActions?.summary?.primary_action_label || '').trim();
    const nodeScanCount = Math.max(0, Number(summary.activeNodeScans) || 0);
    const localTraceCount = Math.max(0, Number(summary.activeLocalTraces) || 0);
    const routeDisruptionCount = Math.max(0, Number(summary.activeRouteDisruptions) || 0);
    const activeHunters = Math.max(0, Number(summary.activeHunters) || 0);
    const currentHunterPressure = Math.max(0, Number(summary.currentDistrictHunterPressure) || 0);
    const hottestNode = snapshot?.nodeRiskById?.[summary.hottestNodeId] || null;
    const hottestHunterNode = snapshot?.hunterDetectionByNodeId?.[summary.hottestHunterNodeId] || null;
    const currentDistrict = snapshot?.districtSignalById?.[summary.currentDistrictId] || null;
    const focusedDistrict = currentDistrict || snapshot?.districtSignalById?.[summary.hottestDistrictId] || null;
    const currentPatrol = snapshot?.districtPatrolById?.[summary.currentDistrictId] || null;
    const focusedPatrol = currentPatrol || snapshot?.districtPatrolById?.[summary.hottestDistrictId] || null;
    const districtLabel = String(
      focusedPatrol?.postureState
      || focusedDistrict?.pressure_flag
      || summary.currentDistrictFlag
      || 'calm',
    ).toUpperCase().replace(/_/g, ' ');
    const districtInstability = Math.max(
      0,
      Number(focusedPatrol?.postureScore ?? focusedDistrict?.instability ?? summary.currentDistrictInstability) || 0,
    );
    const nodeRisk = Math.max(0, Number(hottestNode?.risk) || 0);
    const nodeStatus = String(hottestNode?.watch_status || 'quiet').replace(/_/g, ' ');

    covertStrip.dataset.heatTier = String(snapshot?.networkHeat?.tier || 'cold');
    covertHeatValue.textContent = `${networkHeat}%`;
    covertHeatMeta.textContent = `${networkTier} · detection floor ${Math.max(0, Number(snapshot?.networkHeat?.derived_floor) || 0)}%`;

    covertNodeValue.textContent = hottestNode
      ? `${Math.round(nodeRisk)} · ${nodeStatus.toUpperCase()}`
      : hottestHunterNode
        ? `HUNTER ${Math.round(Math.max(0, Number(hottestHunterNode.intensity) || 0))}`
        : 'QUIET';
    covertNodeMeta.textContent = hottestNode
      ? `${String(hottestNode.node_id || '').toUpperCase()} · ${String(hottestNode.district_id || '').replace(/-/g, ' ')}`
      : hottestHunterNode
        ? `${String(hottestHunterNode.node_id || '').toUpperCase()} · moving SAM scan field`
        : 'No covert-hot node in focus';

    covertDistrictValue.textContent = `${districtLabel}`;
    covertDistrictMeta.textContent = focusedPatrol
      ? `${String(focusedPatrol.districtId || '').replace(/-/g, ' ')} · ${focusedPatrol.surveillanceTone || 'watch lanes elevated'} · score ${Math.round(districtInstability)}`
      : focusedDistrict
        ? `${String(focusedDistrict.district_id || '').replace(/-/g, ' ')} · instability ${Math.round(districtInstability)}`
        : 'District pressure nominal';

    covertAgentValue.textContent = `${activeAgents} ACTIVE`;
    covertAgentMeta.textContent = `${exposedAgents} exposed · ${capturedAgents} captured · ${highRiskAgents} high risk · ${activeHunters} hunters`;

    if (covertSamStatus) covertSamStatus.textContent = `Watch: ${samTier} ${samSensitivity}`;

    const pressureFlags = Array.isArray(snapshot?.samAwareness?.pressure_flags) ? snapshot.samAwareness.pressure_flags : [];
    const watchCopy = primaryCounterAction
      ? primaryCounterAction
      : focusedPatrol?.warningLine
      ? focusedPatrol.warningLine
      : activeHunters > 0
      ? `${activeHunters} hunter patrol${activeHunters === 1 ? '' : 's'} sweeping nearby zones`
      : pressureFlags.length
      ? pressureFlags[0].replace(/_/g, ' ')
      : networkHeat >= 70
        ? 'Surveillance pressure peaking.'
        : networkHeat >= 45
          ? 'District surveillance elevated.'
          : 'Signal cover intact.';
    covertWatchCopy.textContent = watchCopy;

    if (urgentRecoveryAgents > 0) {
      covertRecoveryLine.textContent = `${urgentRecoveryAgents} urgent recovery ${urgentRecoveryAgents === 1 ? 'window' : 'windows'} - SAM counter-actions active${routeDisruptionCount > 0 ? ' - routes unstable' : ''}`;
    } else if (activeHunters > 0 && currentHunterPressure > 0) {
      covertRecoveryLine.textContent = `${activeHunters} hunter patrol${activeHunters === 1 ? '' : 's'} active · district scan pressure ${Math.round(currentHunterPressure)} · covert success reduced in the field`;
    } else if (capturedAgents > 0) {
      const recoverable = summary.recoveryReady
        ? `Recovery boost ready · ${Math.max(0, Number(summary.recoveryCost) || 0)} gems`
        : 'Recovery timer active';
      covertRecoveryLine.textContent = `${capturedAgents} captured · ${Math.max(0, Number(summary.recoveringAgents) || 0)} recovering · ${recoverable}`;
    } else if (highestRisk >= 70) {
      covertRecoveryLine.textContent = `High-risk warning · agent exposure ${highestRisk}% · covert routes compromised`;
    } else {
      covertRecoveryLine.textContent = 'No captured agents in recovery.';
    }
  }

  return {
    setPlayerName: (name) => { playerNameEl.textContent = name; },
    setWorldStatus: (text) => { worldStatus.textContent = text; },
    setAiStatus: (text) => {
      if (aiStatus) aiStatus.textContent = `AI: ${text}`;
    },
    setDistrict: (name) => { districtName = String(name || 'Unknown'); refreshDistrictLine(); },
    setDistrictControl,
    setDistrictState: (nextState) => { districtState = String(nextState || 'contested'); refreshDistrictLine(); },
    setDistrictPosture: (nextPosture) => { districtPosture = String(nextPosture || 'normal'); refreshDistrictLine(); },
    setDistrictOwner: (owner) => pushLog('right', `District control: ${owner || '—'}`),
    setFactionStatus: (text) => { factionStatus.textContent = `Factions: ${text}`; },
    setSamPhase: (name) => { samStatus.textContent = `SAM: ${name}`; },
    setCovertState,
    setPhase: (name) => { phaseStatus.textContent = `Phase: ${name}`; },
    setScore: () => {},
    setXp,
    setGems,
    setDrainPerMinute,
    setMultiplayerStatus: (text) => {
      const label = String(text || '');
      multiplayerStatus.textContent = label;
      if (!multiplayerLiveBanner) return;
      if (label.toLowerCase().startsWith('connected')) {
        multiplayerLiveBanner.textContent = 'LIVE LINK — CONNECTED';
      } else if (label.toLowerCase().startsWith('connecting')) {
        multiplayerLiveBanner.textContent = 'LIVE LINK — CONNECTING';
      } else {
        multiplayerLiveBanner.textContent = `LIVE LINK — ${label.toUpperCase()}`;
      }
    },
    // city_status_fix: Centralized helper — call ONLY from real network lifecycle events
    // (room-full, room.onLeave/disconnect, all retries exhausted). Mini-game failures,
    // node actions, and other local events must NOT call this.
    setMultiplayerUnavailable: (reason) => {
      const reasonStr = String(reason || 'unknown');
      console.warn('[BlockTopia] LIVE LINK marked unavailable from:', reasonStr);
      const label = 'Live city unavailable. Try again later.';
      if (multiplayerStatus) multiplayerStatus.textContent = label;
      if (multiplayerLiveBanner) {
        multiplayerLiveBanner.textContent = `LIVE LINK — ${label.toUpperCase()}`;
      }
    },
    setRoom: (name) => { roomStatus.textContent = `Room: ${name}`; },
    setPopulation: (count, max) => { populationStatus.textContent = `Players: ${count} / ${max}`; },
    setQuests,
    pushFeed,
    pushLog,
    showSamPopup,
    triggerSamImpact,
    triggerPhaseTransition,
    showQuestComplete,
    showDistrictCapture,
    showNpcDialogue,
    showNodeInterference,
    setEntryTagline,
    dismissEntryIdentity,
    setInteractPrompt: (text, visible) => {
      if (!interactPrompt) return;
      if (text) interactPrompt.textContent = text;
      interactPrompt.classList.toggle('hidden', !visible);
    },
  };
}
