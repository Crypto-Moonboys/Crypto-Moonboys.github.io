const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const popup = document.getElementById('sam-popup');
const statusEl = document.getElementById('status');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const TILE_W = 64;
const TILE_H = 32;
const MAP_SIZE = 20;
const ORIGIN_Y = 120;

const camera = { x: 0, y: 0 };
const keys = Object.create(null);
const completedQuests = new Set();
let activeDistrict = '';
let popupTimer = null;
let samSpawned = false;

const player = {
  x: 10,
  y: 10,
  speed: 0.12,
  color: '#ff4fd8',
  radius: 10,
};

const districts = [
  { name: 'Central Plaza', x: 10, y: 10, color: '#ffd84d' },
  { name: 'Graffiti Ward', x: 5, y: 14, color: '#8dff6a' },
  { name: 'Signal Heights', x: 15, y: 5, color: '#5ef2ff' },
];

const npcs = [
  { id: 'warden', x: 12, y: 9, name: 'Warden Elias', color: '#5ef2ff', dialogue: 'Hold the line. SAM stays sealed.' },
  { id: 'liberator', x: 7, y: 13, name: 'Liberator Nyx', color: '#ff3355', dialogue: 'Break the lock. Let the city mutate.' },
  { id: 'archivist', x: 15, y: 6, name: 'Archivist Vex', color: '#ffd84d', dialogue: 'The walls remember more than the people do.' },
];

const quests = [
  {
    id: 'meet-warden',
    title: 'Speak to Warden Elias',
    reward: 100,
    check: () => nearPoint(player, npcs[0], 0.8),
  },
  {
    id: 'reach-graffiti',
    title: 'Reach Graffiti Ward',
    reward: 150,
    check: () => nearPoint(player, districts[1], 1),
  },
  {
    id: 'survive-sam',
    title: 'Witness SAM unleashed',
    reward: 250,
    check: () => samSpawned,
  },
];

const sam = {
  active: false,
  x: 17,
  y: 17,
  color: '#ff2222',
  radius: 34,
};

window.addEventListener('keydown', (event) => {
  keys[event.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
});

function toIso(x, y) {
  return {
    x: (x - y) * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2),
  };
}

function worldToScreen(x, y) {
  const iso = toIso(x, y);
  return {
    x: canvas.width / 2 + iso.x - camera.x,
    y: ORIGIN_Y + iso.y - camera.y,
  };
}

function nearPoint(a, b, threshold) {
  return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
}

function drawTile(x, y, fill = '#1f6f50') {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
  ctx.lineTo(x, y + TILE_H);
  ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#0b0f1a';
  ctx.stroke();
}

function drawMap() {
  ctx.fillStyle = '#071022';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      let fill = '#1f6f50';
      if (x === 10 || y === 10) fill = '#245a77';
      if (x > 3 && x < 8 && y > 11 && y < 16) fill = '#2b6f41';
      if (x > 12 && x < 17 && y > 3 && y < 8) fill = '#5d3d86';
      const pos = worldToScreen(x, y);
      drawTile(pos.x, pos.y, fill);
    }
  }
}

function drawLabel(text, x, y, color) {
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawNPCs() {
  for (const npc of npcs) {
    const pos = worldToScreen(npc.x, npc.y);
    ctx.beginPath();
    ctx.fillStyle = npc.color;
    ctx.arc(pos.x, pos.y - 10, 8, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(npc.name, pos.x, pos.y - 22, '#ffffff');
  }
}

function drawDistrictMarkers() {
  for (const district of districts) {
    const pos = worldToScreen(district.x, district.y);
    ctx.beginPath();
    ctx.strokeStyle = district.color;
    ctx.lineWidth = 2;
    ctx.arc(pos.x, pos.y + 6, 14, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(district.name, pos.x, pos.y + 28, district.color);
  }
}

function drawPlayer() {
  const pos = worldToScreen(player.x, player.y);
    
  ctx.beginPath();
  ctx.fillStyle = player.color;
  ctx.arc(pos.x, pos.y - 12, player.radius, 0, Math.PI * 2);
  ctx.fill();
  drawLabel('YOU', pos.x, pos.y - 28, '#ffffff');
}

function drawSAM() {
  if (!sam.active) return;
  const pos = worldToScreen(sam.x, sam.y);
  ctx.beginPath();
  ctx.fillStyle = sam.color;
  ctx.arc(pos.x, pos.y - 20, sam.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.arc(pos.x, pos.y - 20, sam.radius + 10, 0, Math.PI * 2);
  ctx.stroke();
  drawLabel('SAM UNLEASHED', pos.x, pos.y - 64, '#ffaaaa');
}

function showSamSignal(message) {
  popup.textContent = message;
  popup.classList.remove('hidden');
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => popup.classList.add('hidden'), 5000);
}

function updatePlayer() {
  if (keys.w || keys.arrowup) player.y -= player.speed;
  if (keys.s || keys.arrowdown) player.y += player.speed;
  if (keys.a || keys.arrowleft) player.x -= player.speed;
  if (keys.d || keys.arrowright) player.x += player.speed;

  player.x = Math.max(0, Math.min(MAP_SIZE - 1, player.x));
  player.y = Math.max(0, Math.min(MAP_SIZE - 1, player.y));
}

function updateCamera() {
  const iso = toIso(player.x, player.y);
  camera.x = iso.x;
  camera.y = iso.y;
}

function updateDistrictStatus() {
  let districtName = 'Outer Streets';
  for (const district of districts) {
    if (nearPoint(player, district, 1.5)) {
      districtName = district.name;
      if (activeDistrict !== district.name) {
        activeDistrict = district.name;
        showSamSignal(`DISTRICT ENTERED: ${district.name}`);
      }
    }
  }
  statusEl.textContent = `District: ${districtName} · Quests: ${completedQuests.size}/${quests.length}`;
}

function updateNPCInteractions() {
  for (const npc of npcs) {
    if (nearPoint(player, npc, 0.8) && !completedQuests.has(`talk-${npc.id}`)) {
      completedQuests.add(`talk-${npc.id}`);
      showSamSignal(`${npc.name}: ${npc.dialogue}`);
    }
  }
}

function updateQuests() {
  for (const quest of quests) {
    if (!completedQuests.has(quest.id) && quest.check()) {
      completedQuests.add(quest.id);
      showSamSignal(`QUEST COMPLETE: ${quest.title} (+${quest.reward} XP)`);
    }
  }
}

function spawnSAM() {
  sam.active = true;
  samSpawned = true;
  showSamSignal('WORLD EVENT: SAM UNLEASHED — all factions panic');
}

const samSignalInterval = setInterval(() => {
  showSamSignal('SAM SIGNAL RUSH: First 5 players to reach Central Plaza earn XP!');
}, 30000);

const samSpawnTimer = setTimeout(() => {
  spawnSAM();
}, 45000);

function gameLoop() {
  updatePlayer();
  updateCamera();
  updateDistrictStatus();
  updateNPCInteractions();
  updateQuests();
  drawMap();
  drawDistrictMarkers();
  drawNPCs();
  drawPlayer();
  drawSAM();
  requestAnimationFrame(gameLoop);
}

gameLoop();

window.addEventListener('unload', () => {
  clearInterval(samSignalInterval);
  clearTimeout(samSpawnTimer);
  clearTimeout(popupTimer);
});