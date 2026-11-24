import { tile, width, height, spawn, stations, directions, noise, onMoon, route, walkable, miningSites } from './lunar-world.mjs?v=6';

const byId = id => document.getElementById(id);
const game = byId('game');
const canvas = byId('moon');
const ctx = canvas.getContext('2d');
const terrain = document.createElement('canvas');
terrain.width = width * tile;
terrain.height = height * tile;
const soil = terrain.getContext('2d');
const sprite = new Image();
sprite.src = '../waterfront/assets/atlases/factions.png';
const detailedSprite = new Image();
detailedSprite.src = '../waterfront/assets/atlases/factions-detail.webp';
const detailCell = 192;
const miningBuildings = miningSites.map(site => {
  const image = new Image();
  image.src = './assets/' + site.file + '?v=2-detail';
  return { scale: .625, ...site, image };
});
const fortressFrame = { width: 224, height: 280, columns: 4, count: 12, fps: 12 };
// The ground anchor is inside the rock base. Sort from the forward edge of its footprint.
const fortressAnchorX = 112;

const craters = [[35,31,8],[23,38,5],[46,23,4],[36,49,5],[17,24,3],[52,40,3],[32,13,3]];
const trails = stations.map((station, i) => [station, stations[(i+1) % stations.length]]);
trails.push([stations[0], stations[3]], [stations[2], stations[5]]);

function trailDistance(x, y, a, b) {
  const dx = b.x-a.x, dy = b.y-a.y;
  const t = Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-a.x-t*dx, y-a.y-t*dy);
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!onMoon(x,y)) continue;
    const variation = noise(x,y);
    const crater = craters.find(([cx,cy,r]) => Math.hypot(x-cx,(y-cy)*1.15) < r);
    const trail = trails.some(([a,b]) => trailDistance(x,y,a,b) < .78);
    const rim = !onMoon(x,y+1) || !onMoon(x+1,y);
    const palette = trail ? ['#655e6e','#686171','#6b6474'] : rim ? ['#353348','#454054','#534c62']
      : crater ? ['#343146','#373449','#3a374c'] : ['#575065','#5a5368','#5d566b'];
    soil.fillStyle = palette[Math.floor(variation*3)];
    soil.fillRect(x*tile,y*tile,tile,tile);
    soil.fillStyle = variation > .5 ? '#c2b3d026' : '#1516293b';
    for (let n = 0; n < 17; n++) {
      const px = Math.floor(noise(x*7+n,y)*(tile-3));
      const py = Math.floor(noise(x,y*9+n)*(tile-3));
      soil.fillRect(x*tile+px,y*tile+py,1+n%3,1+n%2);
    }
    if (!trail && variation > .96) {
      soil.fillStyle = '#363347';
      soil.fillRect(x*tile+5,y*tile+13,12,6);
      soil.fillStyle = '#918397';
      soil.fillRect(x*tile+7,y*tile+10,8,4);
    }
  }
}

// Rotate the ground slightly and foreshorten it, like a tilted orthographic camera.
const yaw = -Math.PI / 9;
const cosine = Math.cos(yaw), sine = Math.sin(yaw);
const tilt = .57;

function project(x,y) {
  return { x: x*cosine-y*sine, y: (x*sine+y*cosine)*tilt };
}

function unproject(x,y) {
  return { x: x*cosine+(y/tilt)*sine, y: -x*sine+(y/tilt)*cosine };
}

const corners = [project(0,0), project(terrain.width,0),
  project(0,terrain.height), project(terrain.width,terrain.height)];
const left = Math.min(...corners.map(p => p.x));
const right = Math.max(...corners.map(p => p.x));
const top = Math.min(...corners.map(p => p.y));
const bottom = Math.max(...corners.map(p => p.y)) + 12;

const rimSilhouette = document.createElement('canvas');
rimSilhouette.width = terrain.width;
rimSilhouette.height = terrain.height;
const rimContext = rimSilhouette.getContext('2d');
rimContext.drawImage(terrain,0,0);
rimContext.globalCompositeOperation = 'source-in';
rimContext.fillStyle = '#29263c';
rimContext.fillRect(0,0,terrain.width,terrain.height);

const crew = [
  { name: 'Mara Coil', faction: 4, station: 1, line: 'Relay Nine is still broadcasting. If you hear your own voice come back late, walk uphill.' },
  { name: 'Latch', faction: 1, station: 2, line: 'They wrote off the drill first. Took another week to write down who was standing by it.' },
  { name: 'Kestrel Ash', faction: 5, station: 3, line: 'Every filter on the memorial is a shift somebody chose to work short.' },
  { name: 'Patch Cable', faction: 2, station: 4, line: 'The vault recorder has a cracked case. I can keep it playing long enough for one more hearing.' },
  { name: 'Rook Quartz', faction: 7, station: 5, line: 'When a light goes down into the crater, count the seconds. When it comes back, count the people.' },
];

const actorSize = 34;
const maxZoom = 3;
const player = { ...spawn, facing: 0 };
const camera = {
  ...project((spawn.x + .5)*tile,(spawn.y + .5)*tile),
  zoom: matchMedia('(max-width: 739px)').matches ? 1.1 : 1.6,
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const recovered = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('hodl-wars-lores.logs') || '[]');
  if (Array.isArray(saved)) saved.filter(i => Number.isInteger(i) && stations[i]).forEach(i => recovered.add(i));
} catch { /* The map remains playable with storage disabled. */ }
let steps = [], arriving = null, nextStep = 0, movingUntil = 0;
let viewWidth = 0, viewHeight = 0, pixelRatio = 1;
let hits = [];
const pointers = new Map();
let panning = false;

function show(title, copy) {
  byId('detail-title').textContent = title;
  byId('detail-copy').textContent = copy;
  byId('details').hidden = false;
}

function updateProgress() {
  byId('progress').textContent = recovered.size === stations.length ? 'All six logs recovered' : `${recovered.size} / ${stations.length} logs recovered`;
}

function arrive(index) {
  const station = stations[index];
  recovered.add(index);
  try { localStorage.setItem('hodl-wars-lores.logs', JSON.stringify([...recovered])); } catch { /* Session progress still works. */ }
  updateProgress();
  show(station.name, station.log);
}

function visit(x,y,station = null) {
  if (!walkable(x,y)) return;
  steps = route(player,{x,y});
  arriving = station;
  if (!steps.length && station !== null && x === player.x && y === player.y) {
    arrive(station);
    arriving = null;
  }
}

function updatePlayer(now) {
  if (!steps.length || now < nextStep) return;
  const next = steps.shift();
  player.facing = directions.findIndex(([dx,dy]) => player.x+dx === next.x && player.y+dy === next.y);
  Object.assign(player,next);
  nextStep = now + 92;
  movingUntil = now + 115;
  const nearest = stations.find(s => s.x === player.x && s.y === player.y);
  byId('location').textContent = nearest?.name ?? `Lunar surface · ${player.x+1}, ${player.y+1}`;
  const edgeX = Math.max(0,viewWidth/(2*camera.zoom)-tile*2);
  const edgeY = Math.max(0,viewHeight/(2*camera.zoom)-tile*2);
  const feet = project((player.x+.5)*tile,(player.y+.65)*tile);
  camera.x = Math.max(feet.x-edgeX, Math.min(camera.x,feet.x+edgeX));
  camera.y = Math.max(feet.y-edgeY, Math.min(camera.y,feet.y+edgeY));
  constrainCamera();
  if (!steps.length && arriving !== null) {
    arrive(arriving);
    arriving = null;
  }
}

function constrainCamera() {
  const padX = Math.min((right-left)/2,viewWidth/(2*camera.zoom));
  const padY = Math.min((bottom-top)/2,viewHeight/(2*camera.zoom));
  camera.x = Math.max(left+padX,Math.min(right-padX,camera.x));
  camera.y = Math.max(top+padY,Math.min(bottom-padY,camera.y));
}
function minZoom() {
  return Math.min(1, Math.max(.45, viewWidth/(right-left), viewHeight/(bottom-top)));
}
function planeAt(x,y) {
  return { x: camera.x+(x-viewWidth/2)/camera.zoom, y: camera.y+(y-viewHeight/2)/camera.zoom };
}
function zoomAt(factor,x=viewWidth/2,y=viewHeight/2) {
  const before = planeAt(x,y);
  camera.zoom = Math.max(minZoom(),Math.min(maxZoom,camera.zoom*factor));
  camera.x = before.x-(x-viewWidth/2)/camera.zoom;
  camera.y = before.y-(y-viewHeight/2)/camera.zoom;
  constrainCamera();
}
function resize() {
  viewWidth = canvas.clientWidth;
  viewHeight = canvas.clientHeight;
  pixelRatio = Math.min(2,window.devicePixelRatio || 1);
  canvas.width = Math.round(viewWidth*pixelRatio);
  canvas.height = Math.round(viewHeight*pixelRatio);
  zoomAt(1);
}
function drawStation(station,index) {
  const {x,y} = project((station.x+.5)*tile,(station.y+.5)*tile);
  ctx.fillStyle = '#181b2a';
  ctx.fillRect(x-19,y-16,38,29);
  ctx.fillStyle = '#80859d';
  ctx.fillRect(x-17,y-18,34,24);
  ctx.fillStyle = '#393e54';
  ctx.fillRect(x-14,y-15,28,18);
  ctx.fillStyle = recovered.has(index) ? '#789d98' : '#b3ffff';
  ctx.fillRect(x-7,y-10,14,4);
  ctx.fillRect(x+14,y-23,2,13);
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e5eaff';
  ctx.fillText(station.name,x,y+25);
  hits.push({minX:x-24,maxX:x+24,minY:y-25,maxY:y+26,station:index});
}
function drawActor({x,y,facing,faction,frame}) {
  ctx.fillStyle = '#141623a8';
  ctx.fillRect(x-9,y-4,18,5);
  if (detailedSprite.complete && detailedSprite.naturalWidth) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const col = faction % 3 * 4 + frame;
    const row = Math.floor(faction / 3) * 4 + facing;
    ctx.drawImage(detailedSprite, col*detailCell, row*detailCell, detailCell, detailCell,
      x-actorSize/2, y-actorSize, actorSize, actorSize);
    ctx.restore();
  } else if (sprite.complete && sprite.naturalWidth) {
    ctx.drawImage(sprite, frame*36,(faction*4+facing)*36,36,36,x-actorSize/2,y-actorSize,actorSize,actorSize);
  } else {
    ctx.fillStyle = '#b5d7dc';
    ctx.fillRect(x-6,y-23,12,20);
    ctx.fillStyle = '#313d5c';
    ctx.fillRect(x-5,y-21,10,6);
  }
}
function drawFortress(x, y, now, building) {
  const { width, height, columns, count, fps } = fortressFrame;
  const frame = reduced.matches ? 0 : Math.floor(now * fps / 1000) % count;
  const { scale } = building;
  const left = x - fortressAnchorX * scale;
  const top = y - building.anchorY * scale;
  const frameWidth = building.image.naturalWidth / columns;
  const frameHeight = building.image.naturalHeight / (count / columns);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(building.image, frame % columns * frameWidth, Math.floor(frame / columns) * frameHeight,
    frameWidth, frameHeight, left, top, width * scale, height * scale);
  ctx.restore();
  hits.push({
    minX: left, maxX: left + width * scale, minY: top, maxY: top + height * scale,
    building,
  });
}

function onFortressSprite(hit, point) {
  const { width, height } = fortressFrame;
  const { building } = hit;
  if (!building.mask) {
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const context = mask.getContext('2d');
    const { columns, count } = fortressFrame;
    context.drawImage(building.image, 0, 0, building.image.naturalWidth / columns,
      building.image.naturalHeight / (count / columns), 0, 0, width, height);
    building.mask = context.getImageData(0, 0, width, height).data;
  }
  const x = Math.floor((point.x - hit.minX) / building.scale);
  const y = Math.floor((point.y - hit.minY) / building.scale);
  return x < width && y < height && building.mask[(y * width + x) * 4 + 3] >= 128;
}

let previousPaint = 0;
function paint(now) {
  requestAnimationFrame(paint);
  if (now-previousPaint < 1000/30) return;
  previousPaint = now;
  updatePlayer(now);
  ctx.resetTransform();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(pixelRatio*camera.zoom,0,0,pixelRatio*camera.zoom,
    pixelRatio*(viewWidth/2-camera.x*camera.zoom),pixelRatio*(viewHeight/2-camera.y*camera.zoom));
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(0,12);
  ctx.transform(cosine,sine*tilt,-sine,cosine*tilt,0,0);
  ctx.drawImage(rimSilhouette,0,0);
  ctx.restore();
  ctx.save();
  ctx.transform(cosine,sine*tilt,-sine,cosine*tilt,0,0);
  ctx.drawImage(terrain,0,0);
  ctx.restore();
  hits = [];
  stations.forEach(drawStation);
  const walkers = crew.map((npc,index) => {
    const station = stations[npc.station];
    const phase = reduced.matches ? 0 : (now/700 + index) % 12;
    const dx = phase < 6 ? phase-3 : 9-phase;
    return {...npc,x:(station.x+.5+dx)*tile,y:(station.y+1.65)*tile,
      facing:phase < 6 ? 2 : 1,frame:reduced.matches ? 0 : Math.floor(now/150)%4};
  });
  walkers.push({x:(player.x+.5)*tile,y:(player.y+.65)*tile,faction:0,facing:player.facing,
    frame:!reduced.matches && now < movingUntil ? 1+Math.floor(now/95)%3 : 0});
  for (const walker of walkers) {
    Object.assign(walker, project(walker.x, walker.y));
    walker.depth = walker.y;
  }
  for (const building of miningBuildings) {
    if (!building.image.complete || !building.image.naturalWidth) continue;
    const anchor = project((building.x + .5) * tile, (building.y + .5) * tile);
    const front = project((building.x - .5) * tile, (building.y + 1.5) * tile);
    walkers.push({ ...anchor, depth: front.y, building });
  }
  walkers.sort((a,b) => a.depth-b.depth);
  for (const walker of walkers) {
    if (walker.building) {
      drawFortress(walker.x, walker.y, now, walker.building);
      continue;
    }
    drawActor(walker);
    if (walker.name) hits.push({minX:walker.x-actorSize/2,maxX:walker.x+actorSize/2,minY:walker.y-actorSize,maxY:walker.y,npc:walker});
  }
}
function selectAt(x,y) {
  const at = planeAt(x,y);
  const hit = hits.findLast(h => at.x >= h.minX && at.x < h.maxX && at.y >= h.minY && at.y < h.maxY &&
    (!h.building || onFortressSprite(h, at)));
  if (hit?.building) {
    show(hit.building.name, hit.building.info);
    return;
  }
  if (hit?.npc) { show(hit.npc.name,hit.npc.line); return; }
  if (hit) { const s = stations[hit.station]; visit(s.x,s.y,hit.station); return; }
  byId('details').hidden = true;
  const ground = unproject(at.x,at.y);
  visit(Math.floor(ground.x/tile),Math.floor(ground.y/tile));
}

canvas.addEventListener('pointerdown',e => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY,startX:e.offsetX,startY:e.offsetY});
  if (pointers.size > 1) panning = true;
});
canvas.addEventListener('pointermove',e => {
  const old = pointers.get(e.pointerId);
  if (!old) return;
  const x = e.offsetX, y = e.offsetY;
  const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
  if (other) {
    const before = Math.hypot(old.x-other.x,old.y-other.y);
    if (before > 0) zoomAt(Math.hypot(x-other.x,y-other.y)/before,(x+other.x)/2,(y+other.y)/2);
  } else if (panning || Math.hypot(x-old.startX,y-old.startY) > 5) {
    panning = true;
    camera.x -= (x-old.x)/camera.zoom;
    camera.y -= (y-old.y)/camera.zoom;
    constrainCamera();
  }
  Object.assign(old,{x,y});
});
function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (!panning && e.type === 'pointerup') selectAt(e.offsetX,e.offsetY);
  if (!pointers.size) panning = false;
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,endPointer);
canvas.addEventListener('wheel',e => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewHeight : 1;
  const delta = Math.max(-160, Math.min(160, e.deltaY * unit));
  zoomAt(Math.exp(-delta*.0025),e.offsetX,e.offsetY);
},{passive:false});
const keyDirections = {ArrowUp:3,w:3,ArrowDown:0,s:0,ArrowLeft:1,a:1,ArrowRight:2,d:2};
canvas.addEventListener('keydown',e => {
  if (!Object.hasOwn(keyDirections,e.key)) return;
  e.preventDefault();
  const [dx,dy] = directions[keyDirections[e.key]];
  visit(player.x+dx,player.y+dy);
});
byId('in').onclick = () => zoomAt(1.25);
byId('out').onclick = () => zoomAt(.8);
byId('home').onclick = () => {
  Object.assign(camera,project((player.x+.5)*tile,(player.y+.65)*tile));
  constrainCamera();
};
byId('info').onclick = () => {
  const guide = byId('guide');
  guide.hidden = !guide.hidden;
  byId('info').setAttribute('aria-expanded',String(!guide.hidden));
};
byId('close').onclick = () => { byId('details').hidden = true; canvas.focus(); };
if (document.fullscreenEnabled) {
  const full = byId('full');
  full.hidden = false;
  full.onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await game.requestFullscreen(); }
    catch { full.textContent = 'Fullscreen unavailable'; }
  };
  document.addEventListener('fullscreenchange',() => { full.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
}
stations.forEach((station,index) => {
  const button = document.createElement('button');
  button.textContent = station.name;
  button.onclick = () => { visit(station.x,station.y,index); byId('info').click(); canvas.focus(); };
  byId('station-list').append(button);
});
new ResizeObserver(resize).observe(canvas);
resize();
updateProgress();
requestAnimationFrame(paint);
