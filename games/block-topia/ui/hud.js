const SAM_POPUP_DURATION_MS = 5200;
const QUEST_TOAST_DURATION_MS = 4200;
const CAPTURE_BANNER_DURATION_MS = 4200;
const NPC_DIALOGUE_DURATION_MS = 4200;
const NODE_ALERT_DURATION_MS = 2600;
const MAX_LOG_ENTRIES = 260;

const STREAM_BY_TYPE = {
  combat: 'center',
  quest: 'left',
  sam: 'right',
  system: 'left',
};

function timestamp() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

export function createHud(doc) {
  const XP_PER_LEVEL = 200;
  const playerNameEl = doc.getElementById('player-name');
  const levelStatus = doc.getElementById('level-status');
  const xpStatus = doc.getElementById('xp-status');
  const districtStatus = doc.getElementById('district-status');
  const worldStatus = doc.getElementById('world-status');
  const factionStatus = doc.getElementById('faction-status');
  const samStatus = doc.getElementById('sam-status');
  const phaseStatus = doc.getElementById('phase-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus = doc.getElementById('room-status');
  const populationStatus = doc.getElementById('population-status');
  const samTopBanner = doc.getElementById('sam-top-banner');
  const systemClock = doc.getElementById('system-clock');
  const opsQuests = doc.getElementById('ops-quests');
  const opsMine = doc.getElementById('ops-mine');
  const opsEnergy = doc.getElementById('ops-energy');
  const opsDirective = doc.getElementById('ops-directive');
  const opsTimeline = doc.getElementById('ops-timeline');
  const opsFighter = doc.getElementById('ops-fighter');
  const opsPassives = doc.getElementById('ops-passives');

  const feedLeft = doc.getElementById('stream-left');
  const feedRight = doc.getElementById('stream-right');
  const feedCenter = doc.getElementById('stream-center');
  const ticker = doc.getElementById('status-ticker');

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

  const streamRoot = doc.getElementById('live-stream-canvas');
  const streamGrip = doc.getElementById('stream-grip');
  const autoFlow = { enabled: true, speed: 22, y: 0, dragging: false, startY: 0, startOffsetY: 0 };

  let samPopupTimer = null;
  let districtBannerTimer = null;
  let questToastTimer = null;
  let npcDialogueTimer = null;
  let identityTimer = null;
  let lastXp = 0;

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
    return feedCenter;
  }

  function maintainVisibleWindow() {
    const minY = Math.min(0, streamRoot.clientHeight - streamRoot.scrollHeight);
    autoFlow.y = Math.max(minY, Math.min(0, autoFlow.y));
    streamRoot.style.transform = `translateY(${Math.round(autoFlow.y)}px)`;
  }

  function appendLog(stream, text, cssClass = 'system') {
    const list = streamNode(stream);
    if (!list || !text) return;
    const item = doc.createElement('li');
    item.className = `stream-line ${cssClass}`;
    item.textContent = `[${timestamp()}] ${text}`;
    list.appendChild(item);
    while (list.children.length > MAX_LOG_ENTRIES) list.removeChild(list.firstChild);
    if (autoFlow.enabled) {
      autoFlow.y = Math.min(0, autoFlow.y - 24);
      maintainVisibleWindow();
    }
  }

  function pushLog(stream, text) {
    appendLog(stream, text, 'system');
  }

  function pushFeed(text, type = 'system') {
    const stream = STREAM_BY_TYPE[type] || 'left';
    appendLog(stream, text, type);
  }

  function setXp(value) {
    const safe = Math.max(0, Number(value) || 0);
    const level = Math.max(1, Math.floor(safe / XP_PER_LEVEL) + 1);
    xpStatus.textContent = `${safe} XP`;
    levelStatus.textContent = `L${level} · ${titleFromLevel(level)}`;
    if (safe > lastXp) pushFeed(`+${safe - lastXp} XP gained`, 'quest');
    lastXp = safe;
  }

  function setDistrictControl(pct) {
    if (!districtStatus) return;
    const rounded = Math.round(pct || 0);
    districtStatus.textContent = `District: ${districtStatus.textContent.replace(/^District:\s*/, '')} · ${rounded}% control`;
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
    showSamPopup(`⚡ SAM EVENT\n${text}`, SAM_POPUP_DURATION_MS);
    pushFeed(`SAM EVENT: ${text}`, 'sam');
  }

  function showQuestComplete(title, rewardXp) {
    clearTimeout(questToastTimer);
    questToast.textContent = `✅ ${title} · +${rewardXp} XP`;
    questToast.classList.remove('hidden');
    questToastTimer = setTimeout(() => questToast.classList.add('hidden'), QUEST_TOAST_DURATION_MS);
    pushFeed(`Quest complete: ${title} (+${rewardXp})`, 'quest');
  }

  function showDistrictCapture(text) {
    clearTimeout(districtBannerTimer);
    districtCaptureBanner.textContent = text;
    districtCaptureBanner.classList.remove('hidden');
    districtBannerTimer = setTimeout(() => districtCaptureBanner.classList.add('hidden'), CAPTURE_BANNER_DURATION_MS);
    captureFlash?.classList.remove('hidden');
    setTimeout(() => captureFlash?.classList.add('hidden'), 800);
    pushFeed(text, 'combat');
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
    pushFeed(`${prefix} ${text}`, level === 'sam' ? 'sam' : 'combat');
  }

  function setSamBanner(text, tone = 'alert') {
    if (!samTopBanner) return;
    samTopBanner.textContent = text;
    samTopBanner.dataset.tone = tone;
  }

  function setQuests(items = []) {
    const count = Array.isArray(items) ? items.length : 0;
    pushLog('right', `Active operations: ${count}`);
    if (opsQuests) opsQuests.textContent = `Quests: ${count}`;
  }

  function setStatusTicker(data = {}) {
    if (!ticker) return;
    const mineText = data.mineActive ? `Mine claim in ${formatDuration(data.mineClaimInMs || 0)}` : 'Mine idle';
    ticker.textContent = `⚙ XP ${data.xp || 0} · 💎 Gems ${data.gems || 0} · ⛏ Tier ${data.mineTier || 1} · ${mineText} · 🗡 ${String(data.weaponRarity || 'common').toUpperCase()} L${data.weaponLevel || 1}`;
    if (opsMine) opsMine.textContent = `Mine: ${mineText}`;
    if (opsEnergy) opsEnergy.textContent = `Energy: ${data.energy ?? 100}`;
  }

  function setDirective(text) {
    if (!opsDirective) return;
    opsDirective.textContent = `Directive: ${text}`;
  }

  function setTimeline(text) {
    if (!opsTimeline) return;
    opsTimeline.textContent = `Timeline: ${text}`;
  }

  function setFighterProfile({ fighter = 'COMMON', level = 1, passives = 'none' } = {}) {
    if (opsFighter) opsFighter.textContent = `Fighter: ${fighter} / L${level}`;
    if (opsPassives) opsPassives.textContent = `Passives: ${passives}`;
  }

  streamGrip?.addEventListener('pointerdown', (event) => {
    autoFlow.dragging = true;
    autoFlow.enabled = false;
    autoFlow.startY = event.clientY;
    autoFlow.startOffsetY = autoFlow.y;
    streamGrip.setPointerCapture?.(event.pointerId);
  });

  streamGrip?.addEventListener('pointermove', (event) => {
    if (!autoFlow.dragging) return;
    const dy = event.clientY - autoFlow.startY;
    autoFlow.y = autoFlow.startOffsetY + dy;
    maintainVisibleWindow();
  });

  function endDrag(event) {
    if (!autoFlow.dragging) return;
    autoFlow.dragging = false;
    autoFlow.enabled = true;
    streamGrip?.releasePointerCapture?.(event.pointerId);
  }
  streamGrip?.addEventListener('pointerup', endDrag);
  streamGrip?.addEventListener('pointercancel', endDrag);

  let lastTs = performance.now();
  function flowTick(now) {
    const dt = Math.min(0.1, (now - lastTs) / 1000);
    lastTs = now;
    if (autoFlow.enabled && !autoFlow.dragging) {
      autoFlow.y -= autoFlow.speed * dt;
      maintainVisibleWindow();
    }
    requestAnimationFrame(flowTick);
  }
  requestAnimationFrame(flowTick);

  setInterval(() => {
    if (!systemClock) return;
    const now = new Date();
    systemClock.textContent = `UTC ${now.toISOString().slice(11, 19)}`;
  }, 1000);

  return {
    setPlayerName: (name) => { playerNameEl.textContent = name; },
    setWorldStatus: (text) => { worldStatus.textContent = text; },
    setDistrict: (name) => { districtStatus.textContent = `District: ${name}`; },
    setDistrictControl,
    setDistrictOwner: (owner) => pushLog('right', `District owner: ${owner || '—'}`),
    setFactionStatus: (text) => { factionStatus.textContent = `Factions: ${text}`; },
    setSamPhase: (name) => { samStatus.textContent = `SAM: ${name}`; },
    setPhase: (name) => { phaseStatus.textContent = `Phase: ${name}`; },
    setScore: () => {},
    setXp,
    setMultiplayerStatus: (text) => { multiplayerStatus.textContent = text; },
    setRoom: (name) => { roomStatus.textContent = `Room: ${name}`; },
    setPopulation: (count, max) => { populationStatus.textContent = `Players: ${count} / ${max}`; },
    setSamBanner,
    setQuests,
    setStatusTicker,
    setDirective,
    setTimeline,
    setFighterProfile,
    pushFeed,
    pushLog,
    showSamPopup,
    triggerSamImpact,
    triggerPhaseTransition,
    showQuestComplete,
    showDistrictCapture,
    showNpcDialogue,
    showNodeInterference,
    setEntryTagline: (text) => { if (entryTagline) entryTagline.textContent = text; },
    dismissEntryIdentity: (delay = 4200) => {
      clearTimeout(identityTimer);
      identityTimer = setTimeout(() => entryIdentity?.classList.add('hidden'), delay);
    },
    setInteractPrompt: (text, visible) => {
      if (!interactPrompt) return;
      if (text) interactPrompt.textContent = text;
      interactPrompt.classList.toggle('hidden', !visible);
    },
  };
}
