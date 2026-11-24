// GK-approved baseline (games/block-topia/AGENTS.md). Keep map-specific landmark art, fixture anchors, and rear tower placement.
import { createScene, findRoute, neighbors } from './scenes.mjs?v=9';
import { drawZcashFortress, fortressSize, loadZcashFortress, towerScale } from '../../zcash-fortress.mjs?v=4';

const byId = id => document.getElementById(id);
const canvas = byId('view');
const ctx = canvas.getContext('2d');
const status = byId('status');
const controls = status.textContent;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mode = document.body.dataset.map;
const base = '/games/block-topia/waterfront/assets/atlases/';
const atlas = file => {
  const image = new Image();
  image.src = base + file;
  return image;
};
const buildings = atlas('hk-night.png');
const isIso = mode === 'node-city' || mode === 'survival';
const fortress = isIso ? loadZcashFortress() : null;
const waxBee = mode === 'waterfront' ? null : loadZcashFortress(mode === 'moon'
  ? './hodl-wars-lores/assets/wax-bee.webp?view=moon-grid' : './assets/miners/wax-bee-iso.webp');
const tower = mode === 'waterfront' ? null : loadZcashFortress(mode === 'moon'
  ? './hodl-wars-lores/assets/bitcoin-cash-tower.webp' : './assets/miners/bitcoin-cash-tower-iso.webp');
const people = atlas('factions-detail.webp');
const viewport = {width:0,height:0};
const camera = {x:0,y:0,zoom:1};
let lastFrame = 0;
let nextStep = 0;
let pointer;
let hits = [];
let steps = [];

const fixtures = [
  {name:'Afterblock Club', rect:[2,2,111,115], width:55, maxHeight:64, offset:[-3,-1]},
  {name:'Cold Vault', rect:[380,2,122,113], width:48, maxHeight:51, offset:[2,-2]},
  {name:'Hash House', rect:[128,124,108,109], width:56, maxHeight:65, offset:[2,2]},
  {name:'Jack the Bull', model:0, offset:[-2,1]},
  {name:'Nine Toes Joe', model:1, offset:[0,2]},
  {name:'ZARAH8', model:4, offset:[3,0]},
];

function spot(walkable, desired, occupied) {
  for (let radius = 0; radius <= 6; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = desired[0]+dx, y = desired[1]+dy;
        if (Math.max(Math.abs(dx),Math.abs(dy)) === radius && walkable(x,y) && !occupied.has(`${x},${y}`)) {
          occupied.add(`${x},${y}`);
          return {x,y};
        }
      }
    }
  }
  throw new Error('Could not place comparison sprite.');
}

function widthOfView() {
  return {width:canvas.clientWidth,height:canvas.clientHeight};
}

try {
  Object.assign(viewport,widthOfView());
  const scene = await createScene(mode, canvas, viewport);
  const occupied = new Set([scene.start.join(',')]);
  const items = fixtures.map(item => ({
    ...item, ...spot(scene.walkable, scene.start.map((value,i) => value+item.offset[i]), occupied),
  }));
  if (fortress) items.push({
    name: 'Zcash Mining Fortress', fortress,
    ...spot(scene.walkable, [scene.start[0]-1, scene.start[1]-5], occupied),
  });
  if (waxBee) items.push({
    name: 'WAX Bee Node', fortress: waxBee,
    ...spot(scene.walkable, [scene.start[0]+4, scene.start[1]+3], occupied),
  });
  if (tower) {
    const location = mode === 'survival' ? {x:1,y:4}
      : spot(scene.walkable, mode === 'moon' ? [24,14] : [18,20], occupied);
    items.push({name:'Bitcoin Cash Mining Tower', fortress:tower, scale:towerScale, ...location});
  }
  const blocked = new Set(items.filter(item => item.rect || item.fortress).map(item => `${item.x},${item.y}`));
  const canWalk = (x,y) => scene.walkable(x,y) && !blocked.has(`${x},${y}`);
  const player = {x:scene.start[0],y:scene.start[1],model:2,facing:0};
  for (const item of items) {
    if (item.rect || item.fortress) continue;
    item.patrol = [item.x-1,item.x+1].find(x => canWalk(x,item.y)) ?? item.x;
  }

  function route(x,y) {
    if (!canWalk(x,y)) return [];
    return findRoute({x:player.x,y:player.y},{x,y},canWalk) ?? [];
  }

  function resetCamera() {
    if (scene.reset) { scene.reset(); return; }
    const {left,right,top,bottom} = scene.bounds;
    Object.assign(camera, scene.centered ? {x:(left+right)/2,y:(top+bottom)/2} : scene.project(player.x,player.y));
    camera.zoom = scene.initial();
    constrain();
  }

  function constrain() {
    if (!scene.bounds) return;
    const {left,right,top,bottom} = scene.bounds;
    const px = Math.min((right-left)/2,viewport.width/(2*camera.zoom));
    const py = Math.min((bottom-top)/2,viewport.height/(2*camera.zoom));
    camera.x = Math.max(left+px,Math.min(right-px,camera.x));
    camera.y = Math.max(top+py,Math.min(bottom-py,camera.y));
  }

  function zoom(factor) {
    if (scene.zoom) { scene.zoom(factor); return; }
    const {left,right,top,bottom} = scene.bounds;
    const floor = Math.min(1,Math.max(.45,viewport.width/(right-left),viewport.height/(bottom-top)));
    const [min,max] = scene.zoomRange?.() ?? [floor,3];
    camera.zoom = Math.max(min,Math.min(max,camera.zoom*factor));
    constrain();
  }

  function drawSprites(surface, project, frame, time) {
    hits = [];
    const objects = items.map((item,index) => {
      if (item.rect || item.fortress) return {...item,point:project(item.x,item.y)};
      const phase = reduced.matches ? 0 : (time*.66 + index*.31)%2;
      const progress = phase < 1 ? phase : 2-phase;
      const x = item.x+(item.patrol-item.x)*progress;
      const facing = (item.patrol>item.x) === (phase<1) ? 2 : 1;
      return {...item,facing,frame:item.patrol===item.x || reduced.matches ? 0 : 1+Math.floor(time*7)%3,point:project(x,item.y)};
    });
    objects.push({...player,frame:steps.length && !reduced.matches ? 1+Math.floor(time*8)%3 : 0,
      point:project(player.x,player.y)});
    objects.sort((a,b) => a.point.y-b.point.y);
    if (mode === 'node-city') {
      surface.save();
      surface.fillStyle = 'rgba(14, 14, 24, .30)';
      for (const { point, fortress, rect, width, scale } of objects) {
        const buildingWidth = fortress?.naturalWidth ? fortressSize.width * (scale ?? 1)
          : rect && buildings.naturalWidth ? width : 0;
        if (!buildingWidth) continue;
        const radius = buildingWidth * .34;
        surface.beginPath();
        surface.ellipse(point.x + radius * .4, point.y + radius * .2,
          radius, radius * .35, Math.atan(.5), 0, 2 * Math.PI);
        surface.fill();
      }
      surface.restore();
    }
    for (const object of objects) {
      const {x,y} = object.point;
      let w = 34, h = 34;
      let top = y - h, bottom = y;
      if (object.fortress) {
        if (!object.fortress.naturalWidth) continue;
        const scale = object.scale ?? 1;
        w = fortressSize.width * scale;
        top = y - fortressSize.anchorY * scale;
        bottom = top + fortressSize.height * scale;
        drawZcashFortress(surface, object.fortress, x, y, scale, time);
      } else if (object.rect) {
        const [sx,sy,sw,sh] = object.rect;
        w = object.width;
        h = Math.min(object.maxHeight,w*sh/sw);
        top = y - h;
        surface.imageSmoothingEnabled = false;
        if (buildings.naturalWidth) surface.drawImage(buildings,sx,sy,sw,sh,x-w/2,y-h,w,h);
      } else if (people.naturalWidth) {
        const col = object.model%3*4+object.frame;
        const row = Math.floor(object.model/3)*4+object.facing;
        surface.imageSmoothingEnabled = true;
        surface.imageSmoothingQuality = 'high';
        surface.drawImage(people,col*192,row*192,192,192,x-w/2,y-h,w,h);
      }
      if (object.name) {
        const factor = frame.zoom;
        hits.push({object,left:(x-w/2)*factor+frame.translateX,top:top*factor+frame.translateY,
          right:(x+w/2)*factor+frame.translateX,bottom:bottom*factor+frame.translateY});
      }
    }
  }

  function paint(now) {
    requestAnimationFrame(paint);
    if (now-lastFrame<1000/30) return;
    lastFrame = now;
    if (steps.length && now >= nextStep) {
      const step = steps.shift();
      player.facing = step.x<player.x ? 1 : step.x>player.x ? 2 : step.y<player.y ? 3 : 0;
      player.x = step.x;
      player.y = step.y;
      nextStep = now+120;
    }
    const time = reduced.matches ? null : now/1000;
    if (scene.render) {
      scene.render(time, (surface,project, frame) => drawSprites(surface,project,frame,time));
      return;
    }
    const ratio = canvas.width/viewport.width;
    const scale = camera.zoom*ratio;
    const x = viewport.width/2-camera.x*camera.zoom;
    const y = viewport.height/2-camera.y*camera.zoom;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,viewport.width,viewport.height);
    scene.background?.(ctx,viewport.width,viewport.height);
    ctx.setTransform(scale,0,0,scale,x*ratio,y*ratio);
    ctx.imageSmoothingEnabled = false;
    const visible = mode === 'waterfront' ? {
      left:Math.max(0,Math.floor(-x/camera.zoom/32)-2), top:Math.max(0,Math.floor(-y/camera.zoom/32)-2),
      right:Math.min(scene.bounds.right/32,Math.ceil((viewport.width-x)/camera.zoom/32)+2),
      bottom:Math.min(scene.bounds.bottom/32,Math.ceil((viewport.height-y)/camera.zoom/32)+2),
    } : null;
    scene.ground(ctx,time,visible);
    drawSprites(ctx,scene.project,{zoom:camera.zoom,translateX:x,translateY:y},time);
  }

  function resize() {
    Object.assign(viewport,widthOfView());
    if (!scene.render) {
      const ratio = Math.min(2,devicePixelRatio || 1);
      canvas.width = Math.max(1,Math.round(viewport.width*ratio));
      canvas.height = Math.max(1,Math.round(viewport.height*ratio));
      zoom(1);
    }
  }

  function select(x,y) {
    const selected = hits.findLast(h => x>=h.left && x<=h.right && y>=h.top && y<=h.bottom)?.object;
    if (selected) {
      byId('name').textContent = selected.name;
      byId('kind').textContent = selected.fortress ? 'Animated mining fortress' : selected.rect ? 'Waterfront building' : 'Waterfront NPC';
      byId('details').hidden = false;
      return;
    }
    byId('details').hidden = true;
    const target = scene.pick ? scene.pick(x,y) : scene.unproject(
      camera.x+(x-viewport.width/2)/camera.zoom, camera.y+(y-viewport.height/2)/camera.zoom,
    ).map(Math.round);
    if (!target) return;
    steps = route(...target);
    status.textContent = steps.length ? controls : 'Choose an open tile';
  }

  canvas.addEventListener('pointerdown',event => {
    if (event.button !== 0 || pointer) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = {id:event.pointerId,x:event.offsetX,y:event.offsetY,dragging:false};
  });
  canvas.addEventListener('pointermove',event => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.offsetX-pointer.x, dy = event.offsetY-pointer.y;
    if (!pointer.dragging && Math.hypot(dx,dy)<5) return;
    if (scene.pan) scene.pan(dx,dy);
    else {
      camera.x -= dx/camera.zoom;
      camera.y -= dy/camera.zoom;
      constrain();
    }
    Object.assign(pointer,{x:event.offsetX,y:event.offsetY,dragging:true});
  });
  canvas.addEventListener('pointerup',event => {
    if (event.pointerId !== pointer?.id) return;
    if (!pointer.dragging) select(event.offsetX,event.offsetY);
    pointer = null;
  });
  for (const event of ['pointercancel','lostpointercapture']) canvas.addEventListener(event,e => {
    if (pointer?.id===e.pointerId) pointer = null;
  });
  canvas.addEventListener('wheel',event => {
    event.preventDefault();
    zoom(event.deltaY>0 ? .9 : 1/.9);
  },{passive:false});
  const keys = {ArrowRight:3,d:3,ArrowLeft:1,a:1,ArrowDown:0,s:0,ArrowUp:2,w:2};
  canvas.addEventListener('keydown',event => {
    if (!Object.hasOwn(keys,event.key)) return;
    event.preventDefault();
    const [dx,dy] = neighbors[keys[event.key]];
    steps = route(player.x+dx,player.y+dy);
  });
  byId('zoom-in').onclick = () => zoom(1.25);
  byId('zoom-out').onclick = () => zoom(.8);
  byId('home').onclick = resetCamera;
  byId('close').onclick = () => {byId('details').hidden = true; canvas.focus();};
  if (document.fullscreenEnabled) {
    const button = byId('full');
    button.hidden = false;
    button.onclick = async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('main').requestFullscreen(); }
      catch { status.textContent = 'Fullscreen unavailable'; }
    };
  }
  window.addEventListener('resize',resize);
  resize();
  resetCamera();
  requestAnimationFrame(paint);
} catch (error) {
  status.textContent = 'Map could not load. Refresh to try again.';
  console.error(error);
}
