// GK-approved baseline (games/block-topia/AGENTS.md). Keep the Moon comparison projection and terrain silhouette.
// Ground-only snapshot from HODL Wars Lores at 05ab717.
import { tile, width, height, stations, noise, onMoon } from '../../hodl-wars-lores/lunar-world.mjs';

const terrain = document.createElement('canvas');
terrain.width = width * tile;
terrain.height = height * tile;
const soil = terrain.getContext('2d');
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

export function projectPixels(x,y) {
  return { x: x*cosine-y*sine, y: (x*sine+y*cosine)*tilt };
}

export function unprojectPixels(x,y) {
  return { x: x*cosine+(y/tilt)*sine, y: -x*sine+(y/tilt)*cosine };
}

const corners = [projectPixels(0,0), projectPixels(terrain.width,0),
  projectPixels(0,terrain.height), projectPixels(terrain.width,terrain.height)];
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

export const bounds = { left, right, top, bottom };
export const drawMoon = ctx => {
  ctx.save();
  ctx.translate(0,12);
  ctx.transform(cosine,sine*tilt,-sine,cosine*tilt,0,0);
  ctx.drawImage(rimSilhouette,0,0);
  ctx.restore();
  ctx.save();
  ctx.transform(cosine,sine*tilt,-sine,cosine*tilt,0,0);
  ctx.drawImage(terrain,0,0);
  ctx.restore();
};
export { onMoon, stations, tile };
