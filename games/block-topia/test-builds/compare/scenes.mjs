// GK-approved baseline (games/block-topia/AGENTS.md). Keep the four comparison camera setups.
const block = '/games/block-topia/';
const compact = () => matchMedia('(max-width: 739px)').matches;
const fromTopDown = (x,y) => ({x:(x+.5)*32, y:(y+.5)*32});

export async function createScene(mode, canvas, viewport) {
  if (mode === 'node-city') {
    const [{ createIsoRenderer, LUNAR_MAX_ZOOM }, { createLunarTerrain }] = await Promise.all([
      import('./classic-renderer.mjs?v=4'),
      import('./node-city/lunar-terrain.mjs?v=1'),
    ]);
    const map = {width:48,height:48};
    const renderer = createIsoRenderer(canvas, { floor: createLunarTerrain(map.width, map.height) });
    const state = {
      map,
      player: {x:25,y:26},
      camera: {x:0,y:0,zoom:1,panX:0,panY:0},
    };
    const start = [25,26];
    function reset() {
      const zoom = 1.25;
      // Keep the start tile at the same screen position when opening closer.
      const y = (start[0] + start[1] + 1) * 16 - 151 / zoom;
      state.camera = {x:(start[0]-start[1])*32, y, zoom, panX:0, panY:0};
    }
    reset();
    return {
      start, reset,
      walkable: (x,y) => renderer.isWalkable(x,y,state),
      render(_time, drawObjects) { renderer.render(state, drawObjects); },
      pick(x,y) {
        const rect = canvas.getBoundingClientRect();
        const tile = renderer.pickTileFromClientPoint(x+rect.left,y+rect.top,state);
        return tile?.valid ? [tile.col,tile.row] : null;
      },
      pan(dx,dy) { state.camera.panX += dx/state.camera.zoom; state.camera.panY += dy/state.camera.zoom; },
      zoom(factor) { state.camera.zoom = Math.max(.7, Math.min(LUNAR_MAX_ZOOM, state.camera.zoom*factor)); },
    };
  }

  if (mode === 'survival') {
    const survival = await import('./survival-terrain.mjs?v=3');
    return {
      start:[10,10], bounds:{left:-640,right:640,top:-112,bottom:640},
      project:survival.projectSurvival,
      unproject:(x,y) => [(x/32+(y-16)/16)/2, ((y-16)/16-x/32)/2],
      walkable:survival.survivalWalkable,
      initial:() => Math.max(.35, Math.min(1.25, viewport.width*.84/1280, viewport.height*.84/752)),
      zoomRange:() => [.35, 3],
      background:survival.drawBackground,
      ground:survival.createSurvivalGround(),
      centered:true,
    };
  }

  if (mode === 'moon') {
    const moon = await import('./moon-terrain.mjs');
    return {
      start:[24,23], bounds:moon.bounds,
      project:(x,y) => moon.projectPixels((x+.5)*moon.tile,(y+.5)*moon.tile),
      unproject(x,y) {
        const p = moon.unprojectPixels(x,y);
        return [p.x/moon.tile-.5,p.y/moon.tile-.5];
      },
      walkable:moon.onMoon,
      initial:() => compact() ? 1.1 : 1.6,
      ground:moon.drawMoon,
    };
  }

  const [{ default: base }, island] = await Promise.all([
    import('./waterfront-district.mjs'), import(block+'waterfront/nature-island.mjs?v=4'),
  ]);
  const district = island.extendWaterfront(base);
  window.findRoute = findRoute;
  window.waterfrontCharacterNames = [];
  window.waterfrontIslandPatrol = island.islandPatrol;
  window.waterfrontIslandSeed = island.islandSeed;
  await new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = block+'waterfront/harbor-art.js?v=79-runtime-images';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  await window.loadWaterfrontSprites();
  const { rows, spawn, tiles } = district;
  return {
    start:[spawn.x,spawn.y], bounds:{left:0,right:rows[0].length*32,top:0,bottom:rows.length*32},
    project:fromTopDown,
    unproject:(x,y) => [x/32-.5,y/32-.5],
    walkable:(x,y) => Boolean(tiles[rows[y]?.[x]]?.walkable),
    initial:() => compact() ? 1.1 : 1.6,
    ground(ctx,time,visible) {
      window.drawWaterfront(ctx, rows, comparisonMarker, district, time, null, [],
        null, null, visible, null, () => {});
    },
  };
}

// The shared comparison sprite supplies the player in every scene.
const comparisonMarker = { x: -20, y: -20, facing: 0, frame: 0 };

export const neighbors = [[0,1],[-1,0],[0,-1],[1,0]];

export function findRoute(start, goal, canWalk) {
  const queue = [{...start, previous:null}];
  const seen = new Set([`${start.x},${start.y}`]);
  for (const step of queue) {
    if (step.x===goal.x && step.y===goal.y) {
      const path = [];
      for (let cursor = step; cursor.previous; cursor = cursor.previous) path.push(cursor);
      return path.reverse();
    }
    for (const [dx,dy] of neighbors) {
      const x=step.x+dx, y=step.y+dy, key=`${x},${y}`;
      if (seen.has(key) || !canWalk(x,y)) continue;
      seen.add(key);
      queue.push({x,y,previous:step});
    }
  }
  return null;
}
