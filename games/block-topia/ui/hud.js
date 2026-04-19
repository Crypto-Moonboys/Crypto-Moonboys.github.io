const SAM_POPUP_DURATION_MS = 4200;
const QUEST_TOAST_DURATION_MS = 4200;
const CAPTURE_BANNER_DURATION_MS = 4200;
const NPC_DIALOGUE_DURATION_MS = 4200;
const NODE_ALERT_DURATION_MS = 2600;
const MAX_LOG_ENTRIES = 50;

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
  const districtStatus = doc.getElementById('district-status');

  const worldStatus = doc.getElementById('world-status');
  const aiStatus = doc.getElementById('ai-status');
  const factionStatus = doc.getElementById('faction-status');
  const samStatus = doc.getElementById('sam-status');
  const phaseStatus = doc.getElementById('phase-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus = doc.getElementById('room-status');
  const populationStatus = doc.getElementById('population-status');

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

  function appendLog(stream, text, cssClass = 'system') {
    const list = streamNode(stream);
    if (!list || !text) return;
    const item = doc.createElement('li');
    item.className = `stream-line ${cssClass}`;
    item.textContent = `[${timestamp()}] ${text}`;
    list.appendChild(item);
    while (list.children.length > MAX_LOG_ENTRIES) list.removeChild(list.firstChild);
    Array.from(list.children).forEach((entry, index, arr) => {
      const opacity = Math.max(0.22, 0.35 + (index / Math.max(1, arr.length - 1)) * 0.65);
      entry.style.opacity = opacity.toFixed(3);
    });
    list.scrollTop = list.scrollHeight;
  }

  function pushLog(stream, text) {
    appendLog(stream, text, 'system');
  }

  function pushFeed(text, type = 'system') {
    const stream = STREAM_BY_TYPE[type] || (String(text || '').includes('🗣️') ? 'left' : 'bottom');
    appendLog(stream, text, type);
  }

  function setXp(value) {
    const safe = Math.max(0, Number(value) || 0);
    const level = Math.max(1, Math.floor(safe / XP_PER_LEVEL) + 1);
    xpStatus.textContent = `${safe} XP`;
    levelStatus.textContent = `L${level} · ${titleFromLevel(level)}`;
    if (safe > lastXp) pushFeed(`+${safe - lastXp} XP gained`, 'system');
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

  function setQuests(items = []) {
    const count = Array.isArray(items) ? items.length : 0;
    if (lastQuestCount === count) return;
    lastQuestCount = count;
    pushLog('right', `Active operations: ${count}`);
  }

  function setEntryTagline(text) {
    if (entryTagline) entryTagline.textContent = text;
  }

  function dismissEntryIdentity(delay = 2200) {
    clearTimeout(identityTimer);
    identityTimer = setTimeout(() => entryIdentity?.classList.add('hidden'), delay);
  }

  return {
    setPlayerName: (name) => { playerNameEl.textContent = name; },
    setWorldStatus: (text) => { worldStatus.textContent = text; },
    setAiStatus: (text) => {
      if (aiStatus) aiStatus.textContent = `AI: ${text}`;
    },
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
