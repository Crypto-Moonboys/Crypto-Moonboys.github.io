export function createHud(doc) {
  const worldStatus = doc.getElementById('world-status');
  const districtStatus = doc.getElementById('district-status');
  const factionStatus = doc.getElementById('faction-status');
  const samStatus = doc.getElementById('sam-status');
  const multiplayerStatus = doc.getElementById('mp-status');
  const roomStatus = doc.getElementById('room-status');
  const populationStatus = doc.getElementById('population-status');
  const questList = doc.getElementById('quest-list');
  const feed = doc.getElementById('street-feed');

  function pushFeed(text) {
    const item = doc.createElement('li');
    item.textContent = text;
    feed.prepend(item);
    while (feed.children.length > 14) {
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

  return {
    setWorldStatus: (text) => { worldStatus.textContent = text; },
    setDistrict: (name) => { districtStatus.textContent = `District: ${name}`; },
    setFactionStatus: (text) => { factionStatus.textContent = `Factions: ${text}`; },
    setSamPhase: (name) => { samStatus.textContent = `SAM Phase: ${name}`; },
    setMultiplayerStatus: (text) => { multiplayerStatus.textContent = text; },
    setRoom: (name) => { roomStatus.textContent = `Room: ${name}`; },
    setPopulation: (count, max) => { populationStatus.textContent = `Players: ${count} / ${max}`; },
    setQuests,
    pushFeed,
  };
}
