export function createHud(doc) {
  const playerNameEl    = doc.getElementById('player-name');
  const worldStatus     = doc.getElementById('world-status');
  const districtStatus  = doc.getElementById('district-status');
  const districtControl = doc.getElementById('district-control');
  const factionStatus   = doc.getElementById('faction-status');
  const samStatus       = doc.getElementById('sam-status');
  const phaseStatus     = doc.getElementById('phase-status');
  const scoreStatus     = doc.getElementById('score-status');
  const xpStatus        = doc.getElementById('xp-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus      = doc.getElementById('room-status');
  const populationStatus  = doc.getElementById('population-status');
  const questList       = doc.getElementById('quest-list');
  const feed            = doc.getElementById('street-feed');
  const samPopup        = doc.getElementById('sam-popup');
  const interactPrompt  = doc.getElementById('interact-prompt');

  let samPopupTimer = null;

  function pushFeed(text) {
    const item = doc.createElement('li');
    item.textContent = text;
    feed.prepend(item);
    while (feed.children.length > 16) {
      feed.removeChild(feed.lastChild);
    }
  }

  function setQuests(items) {
    questList.replaceChildren();
    items.forEach((text) => {
      const li = doc.createElement('li');
      li.textContent = text;
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

  function setInteractPrompt(text, visible) {
    if (!interactPrompt) return;
    if (text) interactPrompt.textContent = text;
    interactPrompt.classList.toggle('hidden', !visible);
  }

  return {
    setPlayerName:    (name) => { playerNameEl.textContent    = `Player: ${name}`; },
    setWorldStatus:   (text) => { worldStatus.textContent     = text; },
    setDistrict:      (name) => { districtStatus.textContent  = `District: ${name}`; },
    setDistrictControl: (pct) => { districtControl.textContent = `Control: ${Math.round(pct)}%`; },
    setFactionStatus: (text) => { factionStatus.textContent   = `Factions: ${text}`; },
    setSamPhase:      (name) => { samStatus.textContent       = `SAM Phase: ${name}`; },
    setPhase:         (name) => { phaseStatus.textContent     = `Phase: ${name}`; },
    setScore:         (val)  => { scoreStatus.textContent     = `Score: ${val}`; },
    setXp:            (val)  => { xpStatus.textContent        = `XP: ${val}`; },
    setMultiplayerStatus: (text) => { multiplayerStatus.textContent = text; },
    setRoom:          (name) => { roomStatus.textContent      = `Room: ${name}`; },
    setPopulation:    (count, max) => { populationStatus.textContent = `Players: ${count} / ${max}`; },
    setQuests,
    pushFeed,
    showSamPopup,
    setInteractPrompt,
  };
}
