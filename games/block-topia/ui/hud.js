export function createHud(doc) {
  // Core Street Signal progression: every 200 XP advances one level.
  const XP_PER_LEVEL = 200;
  const DISTRICT_CAPTURE_THRESHOLD = 90;
  const DISTRICT_CRITICAL_THRESHOLD = 70;
  const DISTRICT_CONTESTED_THRESHOLD = 45;
  const playerNameEl    = doc.getElementById('player-name');
  const levelStatus     = doc.getElementById('level-status');
  const worldStatus     = doc.getElementById('world-status');
  const districtStatus  = doc.getElementById('district-status');
  const districtControl = doc.getElementById('district-control');
  const districtOwner   = doc.getElementById('district-owner');
  const districtControlBar = doc.getElementById('district-control-bar');
  const factionStatus   = doc.getElementById('faction-status');
  const samStatus       = doc.getElementById('sam-status');
  const phaseStatus     = doc.getElementById('phase-status');
  const phaseFlavor     = doc.getElementById('phase-flavor');
  const samWarning      = doc.getElementById('sam-warning');
  const scoreStatus     = doc.getElementById('score-status');
  const xpStatus        = doc.getElementById('xp-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus      = doc.getElementById('room-status');
  const populationStatus  = doc.getElementById('population-status');
  const questList       = doc.getElementById('quest-list');
  const feed            = doc.getElementById('street-feed');
  const entryIdentity   = doc.getElementById('entry-identity');
  const entryTagline    = doc.getElementById('entry-tagline');
  const samPopup        = doc.getElementById('sam-popup');
  const samImpact       = doc.getElementById('sam-impact');
  const phaseFlash      = doc.getElementById('phase-flash');
  const captureFlash    = doc.getElementById('capture-flash');
  const districtCaptureBanner = doc.getElementById('district-capture-banner');
  const districtIntensity = doc.getElementById('district-intensity');
  const questToast      = doc.getElementById('quest-toast');
  const xpGain          = doc.getElementById('xp-gain');
  const npcDialogue     = doc.getElementById('npc-dialogue');
  const interactPrompt  = doc.getElementById('interact-prompt');
  const xpBarFill       = doc.getElementById('xp-bar-fill');
  const xpBarLabel      = doc.getElementById('xp-bar-label');

  let samPopupTimer = null;
  let districtBannerTimer = null;
  let questToastTimer = null;
  let xpGainTimer = null;
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

  function pushFeed(text, type = 'system') {
    const item = doc.createElement('li');
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    item.textContent = `[${time}] ${text}`;
    item.className = type;
    feed.prepend(item);
    while (feed.children.length > 16) {
      feed.removeChild(feed.lastChild);
    }
  }

  function setQuests(items) {
    questList.replaceChildren();
    if (!items || items.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'quest-empty';
      empty.textContent = 'No active operations';
      questList.appendChild(empty);
      return;
    }
    items.forEach((entry) => {
      const li = doc.createElement('li');
      if (typeof entry === 'string') {
        li.textContent = entry;
      } else {
        li.setAttribute('data-type', entry.type || 'daily');

        const badge = doc.createElement('span');
        badge.className = 'quest-badge';
        badge.textContent = (entry.type || 'DLY').toUpperCase().slice(0, 3);

        const titleSpan = doc.createElement('span');
        titleSpan.className = 'quest-title';
        titleSpan.textContent = entry.title;

        const xpSpan = doc.createElement('span');
        xpSpan.className = 'quest-xp';
        xpSpan.textContent = `+${entry.xp}`;

        const objSpan = doc.createElement('span');
        objSpan.className = 'quest-obj';
        objSpan.textContent = entry.objective || '';

        li.append(badge, titleSpan, xpSpan, objSpan);
      }
      questList.appendChild(li);
    });
  }

  function showSamPopup(text, durationMs = 4000) {
    if (!samPopup) return;
    samPopup.textContent = text;
    samPopup.classList.remove('hidden');
    clearTimeout(samPopupTimer);
    samPopupTimer = setTimeout(() => {
      samPopup.classList.add('hidden');
    }, durationMs);
  }

  function setDistrictControl(pct) {
    const rounded = Math.round(pct);
    districtControl.textContent = `Control: ${rounded}%`;
    if (districtIntensity) {
      let pressure = 'Stable';
      if (rounded >= DISTRICT_CAPTURE_THRESHOLD) pressure = 'Captured';
      else if (rounded >= DISTRICT_CRITICAL_THRESHOLD) pressure = 'Critical';
      else if (rounded >= DISTRICT_CONTESTED_THRESHOLD) pressure = 'Contested';
      districtIntensity.textContent = `Pressure: ${pressure}`;
    }
    if (districtControlBar) {
      districtControlBar.style.width = `${Math.max(0, Math.min(100, rounded))}%`;
      districtControlBar.classList.remove('surge');
      // Trigger CSS animation each update
      // Street Signal feature reintroduced: tactile district capture progression.
      void districtControlBar.offsetWidth;
      districtControlBar.classList.add('surge');
    }
  }

  function setXp(value) {
    const delta = value - lastXp;
    xpStatus.textContent = String(value);
    const level = Math.max(1, Math.floor(value / XP_PER_LEVEL) + 1);
    levelStatus.textContent = `L${level} · ${titleFromLevel(level)}`;
    const xpInLevel = value % XP_PER_LEVEL;
    const pct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
    if (xpBarFill) xpBarFill.style.width = `${pct}%`;
    if (xpBarLabel) xpBarLabel.textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP`;
    if (delta > 0) {
      clearTimeout(xpGainTimer);
      xpGain.textContent = `+${delta} XP`;
      xpGain.classList.remove('hidden');
      xpStatus.classList.remove('xp-pop');
      // Force reflow so the XP pop animation reliably restarts on repeated gain ticks.
      void xpStatus.offsetWidth;
      xpStatus.classList.add('xp-pop');
      xpGainTimer = setTimeout(() => xpGain.classList.add('hidden'), 1300);
    }
    lastXp = value;
  }

  function showBanner(el, text, duration, timerRefSetter) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    const timer = setTimeout(() => el.classList.add('hidden'), duration);
    timerRefSetter(timer);
  }

  function setInteractPrompt(text, visible) {
    if (!interactPrompt) return;
    if (text) interactPrompt.textContent = text;
    interactPrompt.classList.toggle('hidden', !visible);
  }

  function triggerPhaseTransition(name) {
    phaseFlash?.classList.remove('hidden');
    setTimeout(() => phaseFlash?.classList.add('hidden'), 550);
    phaseFlavor.textContent = name === 'Night'
      ? 'Night pressure rising. District control windows opening.'
      : 'Day cycle active. Recon, quests, and prep routes online.';
    if (samWarning) {
      samWarning.textContent = name === 'Night'
        ? 'SAM Alert: Elevated'
        : 'SAM Alert: Nominal';
    }
  }

  function triggerSamImpact(text) {
    samImpact?.classList.remove('hidden');
    setTimeout(() => samImpact?.classList.add('hidden'), 1500);
    showSamPopup(text, 4800);
  }

  function showQuestComplete(title, rewardXp) {
    clearTimeout(questToastTimer);
    showBanner(questToast, `✅ QUEST COMPLETE: ${title} (+${rewardXp} XP)`, 3000, (timer) => {
      questToastTimer = timer;
    });
  }

  function showDistrictCapture(text) {
    clearTimeout(districtBannerTimer);
    showBanner(districtCaptureBanner, text, 2800, (timer) => {
      districtBannerTimer = timer;
    });
    captureFlash?.classList.remove('hidden');
    setTimeout(() => captureFlash?.classList.add('hidden'), 700);
  }

  function showNpcDialogue(name, role, line) {
    clearTimeout(npcDialogueTimer);
    if (!npcDialogue) return;
    npcDialogue.replaceChildren();
    const header = doc.createElement('div');
    header.className = 'npc-dialogue-header';
    const nameSpan = doc.createElement('span');
    nameSpan.className = 'npc-dialogue-name';
    nameSpan.textContent = name;
    const roleSpan = doc.createElement('span');
    roleSpan.className = 'npc-dialogue-role';
    roleSpan.textContent = ` [${role}]`;
    header.append(nameSpan, roleSpan);
    const lineEl = doc.createElement('p');
    lineEl.className = 'npc-dialogue-line';
    lineEl.textContent = line;
    npcDialogue.append(header, lineEl);
    npcDialogue.classList.remove('hidden');
    const timer = setTimeout(() => npcDialogue.classList.add('hidden'), 3500);
    npcDialogueTimer = timer;
  }

  function setEntryTagline(text) {
    if (entryTagline) entryTagline.textContent = text;
  }

  function dismissEntryIdentity(delay = 4200) {
    clearTimeout(identityTimer);
    identityTimer = setTimeout(() => {
      entryIdentity?.classList.add('hidden');
    }, delay);
  }

  return {
    setPlayerName:    (name) => { playerNameEl.textContent    = name; },
    setWorldStatus:   (text) => { worldStatus.textContent     = text; },
    setDistrict:      (name) => { districtStatus.textContent  = `District: ${name}`; },
    setDistrictControl,
    setDistrictOwner: (owner) => { districtOwner.textContent   = `Owner: ${owner || '—'}`; },
    setFactionStatus: (text) => { factionStatus.textContent   = `Factions: ${text}`; },
    setSamPhase:      (name) => { samStatus.textContent       = `SAM: ${name}`; },
    setPhase:         (name) => { phaseStatus.textContent     = `Day / Night: ${name}`; },
    setScore:         (val)  => { scoreStatus.textContent     = String(val); },
    setXp,
    setMultiplayerStatus: (text) => { multiplayerStatus.textContent = text; },
    setRoom:          (name) => { roomStatus.textContent      = `Room: ${name}`; },
    setPopulation:    (count, max) => { populationStatus.textContent = `Players: ${count} / ${max}`; },
    setQuests,
    pushFeed,
    showSamPopup,
    triggerSamImpact,
    triggerPhaseTransition,
    showQuestComplete,
    showDistrictCapture,
    showNpcDialogue,
    setEntryTagline,
    dismissEntryIdentity,
    setInteractPrompt,
  };
}
