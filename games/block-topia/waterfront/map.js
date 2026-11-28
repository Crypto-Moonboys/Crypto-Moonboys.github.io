// GK-approved baseline (games/block-topia/AGENTS.md). Keep the top-down camera, zoom behavior, and original harbor framing.
"use strict";
const district = window.waterfrontDistrict;
const { rows: initial, spawn, tiles, tileSize } = district;
const columns = initial[0].length;
const mapWidth = columns * tileSize;
const mapHeight = initial.length * tileSize;
const directions = { up: [0,-1], left: [-1,0], down: [0,1], right: [1,0] };
const storageKey = "block-topia.waterfront.v9";
const viewport = document.querySelector(".viewport");
const mapScroll = document.querySelector(".map-scroll");
const mapSurface = document.querySelector("#map");
const mapView = document.querySelector("#map-view");
const ctx = mapView.getContext("2d");
const edit = document.querySelector("#edit");
const select = document.querySelector("#tile");
const status = document.querySelector("#status");
const kaijuWarning = document.querySelector("#kaiju-warning");
const locationLabel = document.querySelector("#location");
let rows = [...initial];
let player = { ...spawn };
const playerFaction = document.querySelector("#player-faction");
const factionIds = ["all-city-bulls", "nomad-bears", "hard-fork-rockers", "rugpull-miners",
  "crypto-moongirls", "blockchain-furies", "graffpunks", "crypto-stoned-boys", "blockstars"];
const avatar = document.querySelector("#waterfront-avatar");
waterfrontCharacterNames.forEach((name, index) => avatar.add(new Option(name, String(index))));
let selectedAvatar = null;
let avatarIdleSince = performance.now();
let idleRouteIndex = null;
function resetIdleWalk() {
  avatarIdleSince = performance.now();
  idleRouteIndex = null;
}
viewport.addEventListener("pointerdown", resetIdleWalk, { passive: true });
viewport.addEventListener("keydown", resetIdleWalk);
let browserStorage;
try { browserStorage = window.localStorage; } catch { /* Private browsing can disable storage. */ }
const factionConversations = window.createWaterfrontFactionConversations(browserStorage);
avatar.addEventListener("change", () => {
  if (!window.waterfrontAccess.canPlay()) return;
  selectedAvatar = avatar.value === "" ? null : Number(avatar.value);
  resetIdleWalk();
  mapSurface.dispatchEvent(new Event("waterfront:leader-clear"));
  draw();
});
let editing = false;
let walkTimer;

function walkable(tile) {
  return Boolean(tiles[tile]?.walkable);
}

rows = window.restoreWaterfrontLayout(browserStorage, district);

for (const [tile, { name }] of Object.entries(tiles)) {
  select.add(new Option(name, tile));
}
select.value = "p";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let sceneTime = null;
let discussionElapsed = 0;
let publishedDiscussion = "";
let recordedDiscussion = [];
let discussionRequest = 0;

function updateBuildDiscussion(now = new Date()) {
  const briefing = window.waterfrontCrewBriefing(now.getUTCDay());
  const turns = [...briefing.turns, ...recordedDiscussion];
  const current = JSON.stringify(turns);
  if (current === publishedDiscussion) return;
  publishedDiscussion = current;
  window.waterfrontBuildDiscussion = turns;

  const panel = document.querySelector("#build-discussion");
  panel.hidden = false;
  panel.querySelector("#crew-briefing-topic").textContent = briefing.title;
  for (const [id, entries, roles] of [
    ["crew-briefing-lines", briefing.turns, ["Crew planner", "Site checker"]],
    ["recorded-build-lines", recordedDiscussion, ["Builder", "Reviewer"]],
  ]) {
    panel.querySelector("#" + id).replaceChildren(...entries.map(turn => {
      const entry = document.createElement("li");
      entry.textContent = roles[turn.speaker] + " — " + turn.text;
      return entry;
    }));
  }
  panel.querySelector("#recorded-build-discussion").hidden = !recordedDiscussion.length;
  paintMap();
}

async function loadBuildDiscussion() {
  const request = ++discussionRequest;
  updateBuildDiscussion();
  try {
    const response = await fetch("build-discussion.json", { cache: "no-cache" });
    if (!response.ok || request !== discussionRequest) return;
    const turns = await response.json();
    if (request !== discussionRequest || !Array.isArray(turns) || !turns.every(turn => turn &&
      (turn.speaker === 0 || turn.speaker === 1) && typeof turn.text === "string")) return;
    recordedDiscussion = turns;
    updateBuildDiscussion();
  } catch {
    // A temporary fetch failure leaves the last published discussion available.
  }
}
let previousDiscussionFrame = null;

let factionHits = [];
let leaderStates = [];
const npcPauseSeconds = 30;
const npcPauses = new Map();
let npcHits = [];
let hoverPoint;
let hoveredNpc;
let tappedNpc;
let inspectionTimer;
let compactArtReady = false;
let streamDetailArt = false;
const inspection = {
  hit(actor) { npcHits.push(actor); },
  held(id) { return (npcPauses.get(id)?.until ?? 0) > performance.now(); },
  time(id, time) {
    const pause = npcPauses.get(id);
    if (time === null || !pause) return time;
    return Math.max(0, time - pause.previous - Math.min(npcPauseSeconds, Math.max(0, time - pause.scene)));
  },
};

function pauseNpc(id) {
  if (inspection.held(id)) return;
  const previous = npcPauses.has(id) ? npcPauses.get(id).previous + npcPauseSeconds : 0;
  const until = performance.now() + npcPauseSeconds * 1000;
  npcPauses.set(id, { until, scene: sceneTime ?? performance.now() / 1000, previous });
  requestMapPaint();
  scheduleInspectionPaint();
}

function scheduleInspectionPaint() {
  clearTimeout(inspectionTimer);
  const now = performance.now();
  const next = Math.min(...[...npcPauses.values()].map(pause => pause.until).filter(until => until > now));
  if (Number.isFinite(next)) inspectionTimer = setTimeout(() => {
    paintMap();
    scheduleInspectionPaint();
  }, next - now + 5);
}

function npcAt(x, y) {
  return npcHits.findLast(actor => actor.bounds
    ? x >= actor.bounds.left && x <= actor.bounds.right && y >= actor.bounds.top && y <= actor.bounds.bottom
    : Math.abs(actor.x - x) <= actor.spriteSize / 2 &&
    y >= actor.y - actor.spriteSize && y <= actor.y + 3);
}

function updateHover() {
  if (!hoverPoint || mousePan || editing) return;
  const rect = mapSurface.getBoundingClientRect();
  const hit = npcAt((hoverPoint.x - rect.left) * mapWidth / rect.width,
    (hoverPoint.y - rect.top) * mapHeight / rect.height);
  mapSurface.classList.toggle("is-npc", Boolean(hit));
  if (hit?.id === hoveredNpc) return;
  hoveredNpc = hit?.id;
  if (hit && hit.pausable !== false) pauseNpc(hit.id);
}
function paintMap() {
  if (!window.waterfrontAccess.canPlay()) return;
  const width = mapScroll.clientWidth;
  const height = mapScroll.clientHeight;
  if (!width || !height || !mapSurface.clientWidth || !mapSurface.clientHeight) return;
  // Render the visible window, not a magnified bitmap of the entire island.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(width, height),
    Math.sqrt(8_000_000 / (width * height)));
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (mapView.width !== pixelWidth || mapView.height !== pixelHeight) {
    mapView.width = pixelWidth;
    mapView.height = pixelHeight;
  }
  const scaleX = pixelWidth / width;
  const scaleY = pixelHeight / height;
  ctx.resetTransform();
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  ctx.setTransform(mapSurface.clientWidth / mapWidth * scaleX, 0, 0,
    mapSurface.clientHeight / mapHeight * scaleY,
    -mapScroll.scrollLeft * scaleX, -mapScroll.scrollTop * scaleY);
  ctx.imageSmoothingEnabled = false;

  npcHits = [];
  factionHits = window.drawWaterfront(ctx, rows, { ...player, faction: selectedAvatar }, district, sceneTime,
    reducedMotion.matches ? null : discussionElapsed, leaderStates, selectedAvatar,
    editing || document.hidden ? null : factionConversations, visibleTiles(), inspection,
    streamDetailArt ? requestMapPaint : null) ?? [];
  kaijuWarning.hidden = !window.harborKaijuActive(rows);
  if (compactArtReady && !streamDetailArt) {
    streamDetailArt = true;
    requestMapPaint();
  }
  updateHover();
  mapSurface.dispatchEvent(new Event('waterfront:map-painted'));
  if (editing) {
    ctx.strokeStyle = "#fce5a2";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, mapWidth - 2, mapHeight - 2);
  }
}

function draw() {
  paintMap();
  locationLabel.textContent = tiles[rows[player.y][player.x]].name + " · " + (player.x + 1) + ", " + (player.y + 1);
}

function findRoute(start, goal, canWalk) {
  const queue = [{ ...start, previous: null }];
  const seen = new Set([start.x + "," + start.y]);
  for (const step of queue) {
    if (step.x === goal.x && step.y === goal.y) {
      const route = [];
      for (let node = step; node.previous; node = node.previous) route.push(node);
      return route.reverse();
    }
    for (const [dx, dy] of Object.values(directions)) {
      const x = step.x + dx;
      const y = step.y + dy;
      const key = x + "," + y;
      if (!seen.has(key) && canWalk(x, y)) {
        seen.add(key);
        queue.push({ x, y, previous: step });
      }
    }
  }
  return null;
}

function walkTo(x, y) {
  clearTimeout(walkTimer);
  player.frame = 0;
  const route = findRoute(player, { x, y }, (col, row) => walkable(rows[row]?.[col]));
  if (!route) {
    draw();
    locationLabel.textContent += " · No walking route";
    return;
  }
  function advance(index) {
    const step = route[index];
    if (!step) return;
    const facing = step.x < player.x ? 1 : step.x > player.x ? 2 : step.y < player.y ? 3 : 0;
    player = { x: step.x, y: step.y, facing, frame: 1 + index % 3 };
    draw();
    walkTimer = setTimeout(() => {
      if (index + 1 < route.length) advance(index + 1);
      else {
        player.frame = 0;
        draw();
      }
    }, 120);
  }
  draw();
  advance(0);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(rows));
    window.waterfrontReloadSafe = true;
    status.textContent = "Saved in this browser.";
  } catch {
    window.waterfrontReloadSafe = false;
    status.textContent = "Browser storage is unavailable. Download the map to keep your edits.";
  }
}

function setEditing(enabled) {
  clearTimeout(walkTimer);
  editing = enabled;
  clearHover();
  tappedNpc = null;
  mapSurface.dataset.editing = String(editing);
  edit.setAttribute("aria-pressed", String(editing));
  status.textContent = editing ? "Select a square to place a tile." : "Tile editing is off.";
  draw();
}
edit.addEventListener("click", () => setEditing(!editing));
document.querySelector("#editor").addEventListener("toggle", event => {
  if (!event.currentTarget.open && editing) setEditing(false);
});
mapSurface.addEventListener("click", event => {
  if (!window.waterfrontAccess.canPlay() || performance.now() < ignoreTapUntil) return;
  const rect = mapSurface.getBoundingClientRect();
  const mapX = (event.clientX - rect.left) * mapWidth / rect.width;
  const mapY = (event.clientY - rect.top) * mapHeight / rect.height;
  const x = Math.floor(mapX / tileSize);
  const y = Math.floor(mapY / tileSize);
  if (x < 0 || x >= columns || y < 0 || y >= initial.length) return;
  if (!editing) {
    const hit = npcAt(mapX, mapY);
    if (hit) {
      const touch = event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents;
      const open = !touch || (tappedNpc === hit.id && inspection.held(hit.id));
      if (hit.pausable !== false) pauseNpc(hit.id);
      tappedNpc = touch ? hit.id : null;
      if (hit.profile) {
        mapSurface.dispatchEvent(new CustomEvent("waterfront:roamer-select", { detail: hit.profile }));
      } else if (open && hit.index !== undefined) {
        mapSurface.dispatchEvent(new CustomEvent("waterfront:leader-select", { detail: { index: hit.index } }));
      } else mapSurface.dispatchEvent(new Event("waterfront:leader-clear"));
      return;
    }
    tappedNpc = null;
    mapSurface.dispatchEvent(new Event("waterfront:leader-clear"));
    walkTo(x, y);
    return;
  }
  const tile = select.value;
  if (!Object.hasOwn(tiles, tile)) {
    status.textContent = "Choose a terrain tile first.";
    return;
  }
  if ((x >= district.harborWidth || y >= district.harborHeight) && !"~pmtf".includes(tile)) {
    status.textContent = "Choose water, a trail, meadow, trees or flowers for the island.";
    return;
  }
  if (x === spawn.x && y === spawn.y && !walkable(tile)) {
    status.textContent = "Keep the starting square walkable.";
    return;
  }
  rows[y] = rows[y].slice(0, x) + tile + rows[y].slice(x+1);
  resetIdleWalk();
  if (!walkable(rows[player.y][player.x])) player = { ...spawn };
  save();
  draw();
});
document.querySelector("#download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ name: district.name, rows }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "luminas-waterfront.json";
  link.click();
  window.waterfrontReloadSafe = true;
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector("#reset").addEventListener("click", () => {
  if (!window.confirm("Reset your browser’s map to the original layout?")) return;
  clearTimeout(walkTimer);
  rows = [...initial];
  player = { ...spawn };
  resetIdleWalk();
  save();
  draw();
});
const compactMap = window.matchMedia("(max-width: 739px)").matches;
const maxZoom = 3;
let zoom = compactMap ? 1.1 : 1.6;
let pinch = null;
let mapTouchActive = false;
let ignoreTapUntil = 0;

function minimumZoom() {
  // Keep the map filling the viewport while either axis can still be panned.
  return Math.min(1, Math.max(0.45, mapScroll.clientWidth / mapWidth, mapScroll.clientHeight / mapHeight));
}

function applyZoomSize() {
  const width = mapScroll.clientWidth;
  const height = mapScroll.clientHeight;
  if (!width || !height) return;
  zoom = Math.max(minimumZoom(), Math.min(maxZoom, zoom));
  mapSurface.style.width = Math.round(mapWidth * zoom) + "px";
  mapSurface.style.height = Math.round(mapHeight * zoom) + "px";
  mapView.style.width = mapScroll.clientWidth + "px";
  mapView.style.height = mapScroll.clientHeight + "px";
  paintMap();
}

function visibleTiles() {
  const tileWidth = mapSurface.clientWidth / columns;
  const tileHeight = mapSurface.clientHeight / initial.length;
  return {
    left: Math.max(0, Math.floor(mapScroll.scrollLeft / tileWidth) - 2),
    top: Math.max(0, Math.floor(mapScroll.scrollTop / tileHeight) - 2),
    right: Math.min(columns, Math.ceil((mapScroll.scrollLeft + mapScroll.clientWidth) / tileWidth) + 2),
    bottom: Math.min(initial.length, Math.ceil((mapScroll.scrollTop + mapScroll.clientHeight) / tileHeight) + 2),
  };
}

let scrollPaint;
function requestMapPaint() {
  if (scrollPaint) return;
  scrollPaint = requestAnimationFrame(() => {
    scrollPaint = null;
    paintMap();
  });
}
let kaijuKeyTimer;
function triggerKaiju(landfall) {
  if (!window.waterfrontAccess.canPlay() || editing || viewport.querySelector("dialog[open]")) return;
  const location = landfall ? window.summonHarborLandfall(rows) : window.summonHarborKaiju(rows);
  if (!location) return;
  centerWaterEncounter(location);
}

function centerWaterEncounter(location) {
  mapScroll.scrollLeft = location.x * mapSurface.clientWidth / columns - mapScroll.clientWidth / 2;
  mapScroll.scrollTop = location.y * mapSurface.clientHeight / initial.length - mapScroll.clientHeight / 2;
  requestMapPaint();
}

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if ((key !== "k" && key !== "l") || event.defaultPrevented || event.repeat || event.isComposing ||
      event.ctrlKey || event.altKey || event.metaKey || editing || !window.waterfrontAccess.canPlay() ||
      viewport.querySelector("dialog[open]") ||
      event.target instanceof Element && (event.target.isContentEditable ||
        event.target.closest("input, textarea, select, [role='textbox']"))) return;
  event.preventDefault();
  if (key === "l") {
    const location = window.summonHarborNessie(rows, performance.now() / 1000);
    if (location) centerWaterEncounter(location);
    return;
  }
  if (kaijuKeyTimer !== undefined) {
    clearTimeout(kaijuKeyTimer);
    kaijuKeyTimer = undefined;
    triggerKaiju(true);
  } else {
    kaijuKeyTimer = setTimeout(() => {
      kaijuKeyTimer = undefined;
      triggerKaiju(false);
    }, 300);
  }
});
mapScroll.addEventListener("scroll", requestMapPaint, { passive: true });

function zoomMap(scale, fromX, fromY, toX = fromX, toY = fromY) {
  const before = mapSurface.getBoundingClientRect();
  const mapX = (fromX - before.left) / before.width;
  const mapY = (fromY - before.top) / before.height;
  zoom = scale;
  applyZoomSize();
  const after = mapSurface.getBoundingClientRect();
  mapScroll.scrollLeft += after.left + mapX * after.width - toX;
  mapScroll.scrollTop += after.top + mapY * after.height - toY;
  paintMap();
}

const infoButton = document.querySelector("#map-info");
const infoPanel = document.querySelector("#map-tools");
infoButton.addEventListener("click", () => {
  infoPanel.hidden = !infoPanel.hidden;
  infoButton.setAttribute("aria-expanded", String(!infoPanel.hidden));
});
infoPanel.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    infoButton.click();
    infoButton.focus();
  }
});

viewport.addEventListener("wheel", event => {
  if (infoPanel.contains(event.target) || event.target.closest('.clan-leader-dialog, .leader-map-details, .leader-map-bubble')) return;
  if (event.deltaY === 0) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mapScroll.clientHeight : 1;
  const delta = Math.max(-160, Math.min(160, event.deltaY * unit));
  zoomMap(zoom * Math.exp(-delta * 0.0025), event.clientX, event.clientY);
}, { capture: true, passive: false });

function zoomFromCenter(factor) {
  const rect = mapScroll.getBoundingClientRect();
  zoomMap(zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
document.querySelector("#zoom-in").addEventListener("click", () => zoomFromCenter(1.25));
document.querySelector("#zoom-out").addEventListener("click", () => zoomFromCenter(0.8));
const fullscreenButton = document.querySelector("#map-fullscreen");
fullscreenButton.hidden = !document.fullscreenEnabled || !viewport.requestFullscreen;
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === viewport) await document.exitFullscreen();
    else await viewport.requestFullscreen();
  } catch {
    locationLabel.textContent = "Fullscreen unavailable";
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement === viewport ? "Exit fullscreen" : "Fullscreen";
});

function pinchPosition(touches) {
  const [a, b] = [touches[0], touches[1]];
  return {
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2
  };
}

mapScroll.addEventListener("touchstart", event => {
  mapTouchActive = true;
  if (event.touches.length !== 2) return;
  event.preventDefault();
  pinch = pinchPosition(event.touches);
  ignoreTapUntil = Infinity;
}, { passive: false });

mapScroll.addEventListener("touchmove", event => {
  if (!pinch || event.touches.length !== 2) return;
  event.preventDefault();
  const next = pinchPosition(event.touches);
  if (pinch.distance > 0 && next.distance > 0) {
    zoomMap(zoom * next.distance / pinch.distance, pinch.x, pinch.y, next.x, next.y);
  }
  pinch = next;
}, { passive: false });

for (const name of ["touchend", "touchcancel"]) {
  mapScroll.addEventListener(name, event => {
    if (event.touches.length < 2) pinch = null;
    if (event.touches.length === 0) mapTouchActive = false;
    if (ignoreTapUntil === Infinity && event.touches.length === 0) {
      ignoreTapUntil = performance.now() + 350;
    }
  });
}

let mousePan = null;
mapSurface.addEventListener("pointerdown", event => {
  if (!window.waterfrontAccess.canPlay() || event.pointerType !== "mouse" || event.button !== 0 || editing) return;
  mousePan = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    left: mapScroll.scrollLeft, top: mapScroll.scrollTop, active: false
  };
  mapSurface.setPointerCapture(event.pointerId);
});
function clearHover() {
  hoverPoint = null;
  hoveredNpc = null;
  mapSurface.classList.remove("is-npc");
}
mapSurface.addEventListener("pointerleave", clearHover);
mapSurface.addEventListener("pointermove", event => {
  if (!mousePan || mousePan.id !== event.pointerId) {
    if (event.pointerType === "mouse" && window.waterfrontAccess.canPlay() && !editing) {
      hoverPoint = { x: event.clientX, y: event.clientY };
      updateHover();
    }
    return;
  }
  const dx = event.clientX - mousePan.x;
  const dy = event.clientY - mousePan.y;
  if (!mousePan.active && Math.hypot(dx, dy) < 6) return;
  mousePan.active = true;
  clearHover();
  mapSurface.classList.add("is-panning");
  mapScroll.scrollLeft = mousePan.left - dx;
  mapScroll.scrollTop = mousePan.top - dy;
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
  mapSurface.addEventListener(name, event => {
    if (mousePan?.id !== event.pointerId) return;
    if (mousePan.active) ignoreTapUntil = performance.now() + 150;
    mousePan = null;
    mapSurface.classList.remove("is-panning");
  });
}

window.addEventListener("resize", applyZoomSize);
document.addEventListener("fullscreenchange", applyZoomSize);
let centered = false;
window.addEventListener("waterfront:access", () => {
  if (window.waterfrontAccess.canPlay()) {
    const name = waterfrontCharacterNames[factionIds.indexOf(window.waterfrontAccess.faction())];
    playerFaction.textContent = "Your representative · " + name;
    applyZoomSize();
    if (!centered) {
      const spawnCenter = (spawn.x + 0.5) * mapSurface.clientWidth / columns;
      mapScroll.scrollLeft = Math.max(0, spawnCenter - mapScroll.clientWidth / 2);
      const waterfrontCenter = (spawn.y - 1) * mapSurface.clientHeight / initial.length;
      mapScroll.scrollTop = Math.max(0, waterfrontCenter - mapScroll.clientHeight / 2);
      centered = true;
    }
    draw();
    loadBuildDiscussion();
  } else {
    clearTimeout(walkTimer);
    clearTimeout(kaijuKeyTimer);
    kaijuKeyTimer = undefined;
    selectedAvatar = null;
    avatar.value = "";
    clearHover();
    tappedNpc = null;
    npcPauses.clear();
    clearTimeout(inspectionTimer);
  }
  syncAnimation();
});
window.loadWaterfrontSprites().then(() => {
  compactArtReady = true;
  requestMapPaint();
});

let frameId;
function animateHarbor(now) {
  if (previousDiscussionFrame !== null) discussionElapsed += (now - previousDiscussionFrame) / 1000;
  previousDiscussionFrame = now;
  if (sceneTime === null || now / 1000 - sceneTime >= 1 / 18) {
    sceneTime = now / 1000;
    paintMap();
  }
  frameId = requestAnimationFrame(animateHarbor);
}

function syncAnimation() {
  cancelAnimationFrame(frameId);
  previousDiscussionFrame = null;
  if (!window.waterfrontAccess.canPlay() || document.hidden || reducedMotion.matches) {
    sceneTime = null;
    paintMap();
    return;
  }
  frameId = requestAnimationFrame(animateHarbor);
}
setInterval(() => {
  if (selectedAvatar === null || !window.waterfrontAccess.canPlay() || document.hidden || editing ||
      reducedMotion.matches || performance.now() - avatarIdleSince < 25_000 ||
      player.frame || factionConversations.holds(selectedAvatar) || !infoPanel.hidden ||
      viewport.querySelector("dialog[open], .leader-map-details:not([hidden])") ||
      viewport.hasAttribute("data-leader-question-pending")) return;
  const route = natureRoute(rows, district);
  if (idleRouteIndex === null) {
    const distance = point => Math.abs(player.x - point.x) + Math.abs(player.y - point.y);
    idleRouteIndex = route.reduce((nearest, point, index) =>
      distance(point) < distance(route[nearest]) ? index : nearest, 0);
  }
  const next = route[idleRouteIndex];
  if (next.x === player.x && next.y === player.y) idleRouteIndex = (idleRouteIndex + 1) % route.length;
  const target = route[idleRouteIndex];
  walkTo(target.x, target.y);
}, 1_800);
document.addEventListener("visibilitychange", syncAnimation);
reducedMotion.addEventListener("change", syncAnimation);
syncAnimation();

// Refresh public displays without interrupting map edits or active gestures.
const refreshInterval = 20 * 60 * 1000;
let refreshDeadline = Date.now() + refreshInterval;
function refreshWaterfront() {
  clearTimeout(refreshTimer);
  const remaining = refreshDeadline - Date.now();
  if (remaining <= 0 && window.waterfrontAccess.canPlay() && !editing && !mapTouchActive && !mousePan &&
      !viewport.querySelector('dialog[open]') && !viewport.hasAttribute('data-leader-question-pending')) {
    window.waterfrontAccess.reload();
    return;
  }
  refreshTimer = setTimeout(refreshWaterfront, remaining > 0 ? remaining
    : window.waterfrontAccess.canPlay() ? 1000 : 20000);
}
let refreshTimer = setTimeout(refreshWaterfront, refreshInterval);
window.addEventListener("pageshow", refreshWaterfront);
setInterval(() => {
  if (window.waterfrontAccess.canPlay() && !document.hidden) loadBuildDiscussion();
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (window.waterfrontAccess.canPlay() && !document.hidden) loadBuildDiscussion();
});

window.waterfrontMapLoaded = true;
