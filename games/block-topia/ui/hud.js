// Role colour lookup — mirrors ROLE_STYLE in iso-renderer so NPC dialogue matches world identity.
const ROLE_COLOR_MAP = {
  vendor:         '#ffd84d',
  fighter:        '#ff4fd8',
  agent:          '#ff9b42',
  'lore-keeper':  '#c77dff',
  'lore keeper':  '#c77dff',
  recruiter:      '#8dff6a',
  drifter:        '#a0b0c8',
};

const SAM_POPUP_DURATION_MS      = 5200;
const QUEST_TOAST_DURATION_MS    = 4200;
const CAPTURE_BANNER_DURATION_MS = 4200;
const NPC_DIALOGUE_DURATION_MS   = 4200;

const ROLE_ICON_MAP = {
  vendor:         '🏪',
  fighter:        '⚔️',
  agent:          '📡',
  'lore-keeper':  '📜',
  'lore keeper':  '📜',
  recruiter:      '🤝',
  drifter:        '🌫️',
};

const FACTION_COLOR_MAP = {
  Liberators: '#5ef2ff',
  Wardens:    '#ff9b42',
  Neutral:    '#a0b0c8',
};

const QUEST_TYPE_ICON = {
  daily:    '◆',
  weekly:   '◈',
  seasonal: '★',
  prophecy: '⬡',
};

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
        const type = entry.type || 'daily';
        li.setAttribute('data-type', type);

        const badge = doc.createElement('span');
        badge.className = 'quest-badge';
        const typeIcon = QUEST_TYPE_ICON[type] || '◆';
        badge.textContent = `${typeIcon} ${(type).toUpperCase().slice(0, 3)}`;

        const titleSpan = doc.createElement('span');
        titleSpan.className = 'quest-title';
        titleSpan.textContent = entry.title;

        const xpSpan = doc.createElement('span');
        xpSpan.className = 'quest-xp';
        xpSpan.textContent = `+${entry.xp} XP`;

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
      if (rounded >= DISTRICT_CAPTURE_THRESHOLD) pressure = '🏴 Captured';
      else if (rounded >= DISTRICT_CRITICAL_THRESHOLD) pressure = '🔴 Critical';
      else if (rounded >= DISTRICT_CONTESTED_THRESHOLD) pressure = '🟡 Contested';
      districtIntensity.textContent = `Pressure: ${pressure}`;
    }
    if (districtControlBar) {
      districtControlBar.style.width = `${Math.max(0, Math.min(100, rounded))}%`;
      districtControlBar.classList.remove('surge');
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
    if (xpBarLabel) xpBarLabel.textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP to L${level + 1}`;
    if (delta > 0) {
      clearTimeout(xpGainTimer);
      xpGain.innerHTML = `<span class="xp-gain-delta">+${delta} XP</span>`;
      xpGain.classList.remove('hidden');
      xpStatus.classList.remove('xp-pop');
      void xpStatus.offsetWidth;
      xpStatus.classList.add('xp-pop');
      xpGainTimer = setTimeout(() => xpGain.classList.add('hidden'), 1400);
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
    setTimeout(() => phaseFlash?.classList.add('hidden'), 700);
    phaseFlavor.textContent = name === 'Night'
      ? '🌑 Night pressure rising. District capture windows now open.'
      : '☀️ Day cycle active. Recon, quests, and prep routes online.';
    if (samWarning) {
      samWarning.textContent = name === 'Night'
        ? '⚠ SAM Alert: ELEVATED — capture window open'
        : '✓ SAM Alert: Nominal';
    }
    pushFeed(
      name === 'Night'
        ? 'PHASE SHIFT → NIGHT — District control windows open. Stay in territory to capture.'
        : 'PHASE SHIFT → DAY — Territory locked. Focus on quests and faction moves.',
      'system',
    );
  }

  function triggerSamImpact(text) {
    samImpact?.classList.remove('hidden');
    setTimeout(() => samImpact?.classList.add('hidden'), 1800);
    showSamPopup(`⚡ SAM EVENT\n${text}`, SAM_POPUP_DURATION_MS);
    pushFeed(`SAM EVENT: ${text}`, 'sam');
  }

  function showQuestComplete(title, rewardXp) {
    clearTimeout(questToastTimer);
    showBanner(questToast, `✅ OPERATION COMPLETE\n${title}  ·  +${rewardXp} XP`, QUEST_TOAST_DURATION_MS, (timer) => {
      questToastTimer = timer;
    });
    pushFeed(`Quest complete: ${title} (+${rewardXp} XP)`, 'quest');
  }

  function showDistrictCapture(text) {
    clearTimeout(districtBannerTimer);
    showBanner(districtCaptureBanner, `🏴 ${text}`, CAPTURE_BANNER_DURATION_MS, (timer) => {
      districtBannerTimer = timer;
    });
    captureFlash?.classList.remove('hidden');
    setTimeout(() => captureFlash?.classList.add('hidden'), 800);
    pushFeed(text, 'system');
  }

  function showNpcDialogue(name, role, line, faction) {
    clearTimeout(npcDialogueTimer);
    if (!npcDialogue) return;
    npcDialogue.replaceChildren();

    const roleKey = (role || '').toLowerCase().replace(/\s+/g, '-');
    const roleColor = ROLE_COLOR_MAP[roleKey] || 'var(--accent)';
    const roleIcon  = ROLE_ICON_MAP[roleKey]  || '👤';

    const header = doc.createElement('div');
    header.className = 'npc-dialogue-header';

    const iconSpan = doc.createElement('span');
    iconSpan.className = 'npc-dialogue-icon';
    iconSpan.textContent = roleIcon;

    const nameSpan = doc.createElement('span');
    nameSpan.className = 'npc-dialogue-name';
    nameSpan.textContent = name;

    const roleSpan = doc.createElement('span');
    roleSpan.className = 'npc-dialogue-role';
    roleSpan.textContent = ` [${role}]`;
    roleSpan.style.color = roleColor;

    header.append(iconSpan, nameSpan, roleSpan);

    if (faction && faction !== 'Neutral') {
      const factionBadge = doc.createElement('span');
      factionBadge.className = 'npc-dialogue-faction';
      factionBadge.textContent = faction;
      factionBadge.style.color = FACTION_COLOR_MAP[faction] || '#a0b0c8';
      header.append(factionBadge);
    }

    const lineEl = doc.createElement('p');
    lineEl.className = 'npc-dialogue-line';
    lineEl.textContent = line;

    npcDialogue.append(header, lineEl);
    npcDialogue.classList.remove('hidden');
    const timer = setTimeout(() => npcDialogue.classList.add('hidden'), NPC_DIALOGUE_DURATION_MS);
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
