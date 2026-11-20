/* NBG London roaming easter egg: isolated from the game's engine and score systems. */
(() => {
  'use strict';
  if (window.__NBG_ROAMER_BOOTED__) return;
  const path = location.pathname.toLowerCase();
  if (/^\/(?:games|game)(?:\/|$)/.test(path) || /\.(?:pdf|xml|json)$/.test(path)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  window.__NBG_ROAMER_BOOTED__ = true;
  const MIN_DELAY = 180000, MAX_DELAY = 420000, CONTROL_MS = 30000, SUMMON_COOLDOWN_MS = 60000;
  const ASSET_ROOT = '/game/assets/';
  const JUMP_CODES = ['ArrowUp', 'KeyW', 'Space'];
  const GRAVITY = 1150;
  const JUMP_VELOCITIES = [630, 760]; // First two distinct presses.
  const JUMP_TAP_SPACING_MS = 115; // Match the source game's discrete jump taps.
  const held = new Set();
  let manifest, host, sprite, controls, active = false, controlling = false;
  let direction = 1, x = -100, y = 0, vy = 0, frame = 0, frameTime = 0, last = 0, deadline = 0;
  let current = '', raf = 0, timer = 0, moving = false, disposed = false;
  let jumpsUsed = 0, lastJumpAt = -Infinity, backflipActive = false;
  let summonButton = null, summonCooldownTimer = 0, lastSummon = -Infinity, spawning = false;
  const interactive = target => !!target?.closest?.('input, textarea, select, button, a, [contenteditable], [role="textbox"], [role="dialog"]');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function schedule() {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(spawn, MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));
  }
  function updateSummonButton() {
    if (!summonButton) return;
    const remaining = Math.max(0, SUMMON_COOLDOWN_MS - (performance.now() - lastSummon));
    summonButton.hidden = active;
    summonButton.disabled = active || spawning || remaining > 0;
    summonButton.textContent = '▶';
    summonButton.setAttribute('aria-label', remaining > 0 ? 'NBG runner available in ' + Math.ceil(remaining / 1000) + ' seconds' : 'Summon NBG London runner');
    summonButton.title = remaining > 0 ? 'Runner recharging' : 'Summon the NBG London runner';
  }
  function ensureSummonButton() {
    if (summonButton || disposed) return;
    const style = document.createElement('style');
    style.id = 'nbg-roamer-summon-css';
    style.textContent = `
      #nbg-roamer-summon {position:fixed;right:72px;bottom:calc(18px + env(safe-area-inset-bottom, 0px));z-index:1502;
        border:2px solid #f3bd25;border-radius:50%;background:#090d14;color:#f3bd25;font:700 17px/1 system-ui,sans-serif;
        padding:0;width:42px;height:42px;display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 12px #0009;}
      #nbg-roamer-summon[hidden] {display:none;}
      #nbg-roamer-summon:disabled {opacity:.6;cursor:default;}
      #nbg-roamer-summon:focus-visible {outline:3px solid #fff;outline-offset:2px;}
    `;
    if (!document.getElementById(style.id)) document.head.appendChild(style);
    summonButton = document.createElement('button');
    summonButton.id = 'nbg-roamer-summon';
    summonButton.type = 'button';
    summonButton.setAttribute('aria-label', 'Summon NBG London runner');
    summonButton.addEventListener('click', () => {
      if (active || spawning || disposed || performance.now() - lastSummon < SUMMON_COOLDOWN_MS) return;
      void spawn(true);
    });
    document.body.appendChild(summonButton);
    updateSummonButton();
  }
  function startSummonCooldown(resetStart = true) {
    if (resetStart) lastSummon = performance.now();
    clearInterval(summonCooldownTimer);
    summonCooldownTimer = setInterval(() => {
      updateSummonButton();
      if (performance.now() - lastSummon >= SUMMON_COOLDOWN_MS) {
        clearInterval(summonCooldownTimer);
        summonCooldownTimer = 0;
      }
    }, 1000);
    updateSummonButton();
  }
  // Use the original game's jump, fall and backflip sheets, but independent
  // viewport-height physics: the final boost carries the runner offscreen.
  function tryJump(now = performance.now()) {
    if (!active || !controlling || disposed || jumpsUsed >= 3 ||
        now - lastJumpAt < JUMP_TAP_SPACING_MS) return false;
    if (jumpsUsed === 0 && y !== 0) return false;
    const stage = ++jumpsUsed;
    lastJumpAt = now;
    vy = stage === 3
      ? Math.sqrt(2 * GRAVITY * (window.innerHeight + 180))
      : JUMP_VELOCITIES[stage - 1];
    backflipActive = stage === 3;
    return true;
  }

  // Cosmetic website encounter. Never write to the game's replay, XP or scores.
  // All artwork comes from the canonical NBG London asset manifest.
  // Parachute A and B are brown; parachute C is turquoise.
  const ENEMY_TYPES = [
    { key: 'parachuteRatA', kind: 'parachute', width: 64, height: 64, columns: 5, frames: 25, frameMs: 95, landedKey: 'brownRatWalk' },
    { key: 'parachuteRatB', kind: 'parachute', width: 64, height: 64, columns: 5, frames: 25, frameMs: 95, landedKey: 'brownRatWalk' },
    { key: 'parachuteRatC', kind: 'parachute', width: 64, height: 64, columns: 5, frames: 25, frameMs: 95, landedKey: 'turquoiseRatWalk' },
    { key: 'londonRat', kind: 'ground', width: 50, height: 60, columns: 5, frames: 25, frameMs: 90 },
    { key: 'turquoiseRatWalk', kind: 'ground', width: 50, height: 60, columns: 5, frames: 25, frameMs: 90 },
    { key: 'brownRatWalk', kind: 'ground', width: 64, height: 72, columns: 5, frames: 25, frameMs: 90 },
    { key: 'graffitiBot', kind: 'ground', width: 70, height: 62, columns: 5, frames: 25, frameMs: 90 },
    { key: 'pigeon', kind: 'flying', width: 56, height: 44, columns: 5, frames: 20, frameMs: 85 },
    { key: 'balloonWalk', kind: 'ground', width: 54, height: 60, columns: 4, frames: 14, frameMs: 100 }
  ];
  const ENEMY_BY_KEY = Object.fromEntries(ENEMY_TYPES.map(type => [type.key, type]));
  const ENEMY_ATTACKS = Object.freeze({
    londonRat: ['londonRatBladeFlurry', 'londonRatViperPounce'],
    turquoiseRatWalk: ['turquoiseRatKick', 'turquoiseRatPunch'],
    brownRatWalk: ['brownRatPunch'],
    graffitiBot: ['graffitiBotKick', 'graffitiBotFire'],
    balloonWalk: ['balloonRelease']
  });
  const ATTACK_POSES = Object.freeze({
    londonRatBladeFlurry: { columns: 5, frames: 25, frameMs: 34, duration: 850 },
    londonRatViperPounce: { columns: 5, frames: 25, frameMs: 34, duration: 850 },
    turquoiseRatKick: { columns: 5, frames: 25, frameMs: 34, duration: 850 },
    turquoiseRatPunch: { columns: 5, frames: 25, frameMs: 34, duration: 850 },
    brownRatPunch: { columns: 5, frames: 25, frameMs: 34, duration: 850 },
    graffitiBotKick: { columns: 5, frames: 25, frameMs: 38, duration: 950 },
    graffitiBotFire: { columns: 4, frames: 16, frameMs: 55, duration: 880, effect: true },
    graffitiBotHurt: { columns: 5, frames: 25, frameMs: 36, duration: 360 },
    balloonRelease: { columns: 4, frames: 16, frameMs: 90, duration: 1440 }
  });
  let encounterCanvas = null, encounterCtx = null, enemyImages = {}, enemies = [];
  let enemyManifest = null, encounterNextAt = 0, encounterGeneration = 0, encounterSpawnIndex = 0;
  let sprayUntil = 0, lastSpray = -Infinity, cleanSprayUrl = null, sprayPreparing = false;
  const measuredFrames = new WeakMap();
  let measureCanvas = null, measureContext = null;
  function createEncounterCanvas() {
    if (encounterCanvas) return;
    encounterCanvas = document.createElement('canvas');
    encounterCanvas.id = 'nbg-roamer-enemies';
    encounterCanvas.setAttribute('aria-hidden', 'true');
    encounterCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1499;pointer-events:none;image-rendering:pixelated';
    document.body.appendChild(encounterCanvas);
    encounterCtx = encounterCanvas.getContext('2d');
  }
  function resizeEncounterCanvas() {
    if (!encounterCanvas) return;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    if (encounterCanvas.width !== width) encounterCanvas.width = width;
    if (encounterCanvas.height !== height) encounterCanvas.height = height;
  }
  function spawnEnemy(type, index = 0) {
    const w = window.innerWidth, h = window.innerHeight;
    const parachute = type.kind === 'parachute';
    return {
      type, identity: type.landedKey || type.key,
      x: parachute ? w * (index ? 0.7 : 0.3) : w + 20 + index * 70,
      top: parachute ? -type.height : h - type.height,
      vx: parachute ? (index ? -10 : 10) : -58,
      age: 0, defeated: false, hitUntil: 0, nextAttackAt: 0,
      attack: null, attackIndex: 0
    };
  }

  function preloadEnemyImages(generation) {
    const install = data => {
      if (disposed || generation !== encounterGeneration) return;
      enemyManifest = data.enemies || {};
      const keys = new Set([...ENEMY_TYPES.map(type => type.key), ...Object.keys(ATTACK_POSES)]);
      for (const key of keys) {
        const path = enemyManifest[key];
        if (!path || enemyImages[key]) continue;
        const image = new Image();
        image.src = ASSET_ROOT + path;
        enemyImages[key] = image;
      }
    };
    if (enemyManifest) { install({ enemies: enemyManifest }); return; }
    fetch(ASSET_ROOT + 'asset-manifest.json', { credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw Error('Missing NBG enemy manifest'); return response.json(); })
      .then(install).catch(() => {});
  }

  function startEncounter() {
    const generation = ++encounterGeneration;
    enemies = [];
    encounterSpawnIndex = 0;
    sprayUntil = 0;
    encounterNextAt = performance.now() + 2200;
    createEncounterCanvas();
    resizeEncounterCanvas();
    // Drop two distinct colours at the same instant, each retaining its own
    // identity once its parachute is replaced by the matching walk sheet.
    const parachutes = [ENEMY_BY_KEY.parachuteRatA, ENEMY_BY_KEY.parachuteRatC];
    for (let i = 0; i < parachutes.length; i++) enemies.push(spawnEnemy(parachutes[i], i));
    preloadEnemyImages(generation);
  }

  // Measure the visible pixels of each cell once, not its transparent 5x5
  // frame border. Preserve the original aspect ratio and anchor the visible
  // foot of every pose on the actual viewport bottom.
  function visibleFrameBounds(image, pose, frame) {
    let cache = measuredFrames.get(image);
    if (!cache) { cache = new Map(); measuredFrames.set(image, cache); }
    const index = Math.max(0, Math.min(pose.frames - 1, frame));
    const cacheKey = pose.columns + ':' + pose.frames + ':' + index;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const sourceW = image.naturalWidth / pose.columns;
    const sourceH = image.naturalHeight / Math.ceil(pose.frames / pose.columns);
    const sourceX = (index % pose.columns) * sourceW;
    const sourceY = Math.floor(index / pose.columns) * sourceH;
    let bounds = { x: sourceX, y: sourceY, width: sourceW, height: sourceH };
    try {
      if (!measureCanvas) {
        measureCanvas = document.createElement('canvas');
        measureContext = measureCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (measureContext) {
        const width = Math.max(1, Math.floor(sourceW)), height = Math.max(1, Math.floor(sourceH));
        measureCanvas.width = width;
        measureCanvas.height = height;
        measureContext.clearRect(0, 0, width, height);
        measureContext.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
        const pixels = measureContext.getImageData(0, 0, width, height).data;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            if (pixels[(row * width + col) * 4 + 3] <= 24) continue;
            minX = Math.min(minX, col); maxX = Math.max(maxX, col);
            minY = Math.min(minY, row); maxY = Math.max(maxY, row);
          }
        }
        if (maxX >= 0) {
          bounds = { x: sourceX + minX, y: sourceY + minY,
            width: maxX - minX + 1, height: maxY - minY + 1 };
        }
      }
    } catch (_) { /* Unreadable sheet: retain full-cell rendering. */ }
    cache.set(cacheKey, bounds);
    return bounds;
  }

  function drawEnemyPose(key, pose, frame, left, top, width, height, facing, grounded) {
    const image = enemyImages[key];
    if (!image || !image.complete || !image.naturalWidth || !encounterCtx) return;
    const index = Math.max(0, Math.min(pose.frames - 1, frame));
    const bounds = visibleFrameBounds(image, pose, index);
    // The first frame sets pose scale. Subsequent stances retain physical
    // proportions (e.g. crouched punches) instead of growing to fill a box.
    const start = visibleFrameBounds(image, pose, 0);
    const scale = Math.min(height / start.height, (width * 1.7) / start.width);
    const drawW = bounds.width * scale, drawH = bounds.height * scale;
    const drawX = left + (width - drawW) / 2;
    const drawY = grounded ? encounterCanvas.height - drawH : top;
    encounterCtx.save();
    encounterCtx.imageSmoothingEnabled = false;
    // Canonical NBG walking and attacking sheets face right. Mirror only the
    // drawn cell, never its viewport x translation, when heading left.
    if (facing < 0) {
      encounterCtx.translate(Math.round(drawX + drawW), Math.round(drawY));
      encounterCtx.scale(-1, 1);
      encounterCtx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, Math.round(drawW), Math.round(drawH));
    } else {
      encounterCtx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
        Math.round(drawX), Math.round(drawY), Math.round(drawW), Math.round(drawH));
    }
    encounterCtx.restore();
  }

  function beginEnemyAttack(enemy, now) {
    const attacks = ENEMY_ATTACKS[enemy.type.key];
    if (!attacks || enemy.attack || now < enemy.nextAttackAt || enemy.hitUntil > now) return;
    const nearby = Math.abs(x + 36 - enemy.x - enemy.type.width / 2) <= 100 &&
      y <= 125;
    if (!nearby) return;
    const key = attacks[enemy.attackIndex % attacks.length];
    const pose = ATTACK_POSES[key];
    enemy.attackIndex++;
    enemy.attack = { key, startedAt: now, until: now + pose.duration,
      facing: x + 36 < enemy.x + enemy.type.width / 2 ? -1 : 1 };
    enemy.nextAttackAt = now + pose.duration + 1150;
  }

  function defeatEnemy(enemy, now) {
    if (enemy.hitUntil > now || enemy.defeated) return;
    enemy.attack = null;
    // Graffbot alone has a dedicated hurt pose: play it before removing him.
    if (enemy.type.key === 'graffitiBot') {
      enemy.hitUntil = now + ATTACK_POSES.graffitiBotHurt.duration;
    } else {
      enemy.defeated = true;
    }
  }

  // The original spray sprite export has green/white matte. Apply the same
  // clean-up criteria used by NBG London; never alter the committed PNG.
  function prepareSpraySprite() {
    if (sprayPreparing || cleanSprayUrl || !manifest?.animations?.spray) return;
    sprayPreparing = true;
    const source = new Image();
    source.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
          const matte = g > r + 12 && g > b + 8 && r >= 45 && r <= 115 &&
            g >= 75 && g <= 155 && b >= 40 && b <= 120;
          const white = r >= 250 && g >= 250 && b >= 250;
          if (matte || white) pixels.data[i + 3] = 0;
        }
        ctx.putImageData(pixels, 0, 0);
        cleanSprayUrl = canvas.toDataURL('image/png');
      } catch (_) { /* Continue with original art when processing is unavailable. */ }
      sprayPreparing = false;
    };
    source.onerror = () => { sprayPreparing = false; };
    source.src = ASSET_ROOT + manifest.animations.spray.spriteSheet;
  }
  function spray(now = performance.now()) {
    if (!active || !controlling || now - lastSpray < 550) return;
    lastSpray = now;
    sprayUntil = now + 260;
    prepareSpraySprite();
  }
  function clearEncounter() {
    encounterGeneration++;
    enemies = [];
    encounterSpawnIndex = 0;
    sprayUntil = 0;
    if (encounterCanvas) encounterCanvas.remove();
    encounterCanvas = encounterCtx = null;
  }
  function updateEncounter(now, delta, previousPlayerY) {
    if (!encounterCtx || !active) return;
    resizeEncounterCanvas();
    encounterCtx.clearRect(0, 0, encounterCanvas.width, encounterCanvas.height);
    const h = encounterCanvas.height, w = encounterCanvas.width;

    // Present every original enemy over the encounter rather than repeatedly
    // selecting the same one from a timestamp modulo.
    const rotating = ENEMY_TYPES.filter(type => type.kind !== 'parachute');
    if (controlling && now >= encounterNextAt && encounterSpawnIndex < rotating.length) {
      enemies.push(spawnEnemy(rotating[encounterSpawnIndex++]));
      encounterNextAt = now + 2600;
    }

    for (const enemy of enemies) {
      if (enemy.defeated) continue;
      if (enemy.hitUntil && now >= enemy.hitUntil) {
        enemy.defeated = true;
        continue;
      }
      enemy.age += delta * 1000;
      let e = enemy.type;
      if (e.kind === 'parachute') {
        enemy.x += enemy.vx * delta;
        enemy.top = Math.min(h - e.height, enemy.top + Math.max(190, h / 3) * delta);
        if (enemy.top >= h - e.height) {
          // Never map by array position: each parachute owns its landed
          // identity, including after other enemies are killed or reordered.
          enemy.type = ENEMY_BY_KEY[e.landedKey];
          e = enemy.type;
          enemy.top = h - e.height;
          enemy.age = 0;
          enemy.vx = enemy.x < w / 2 ? 65 : -65;
        }
      } else {
        if (enemy.attack && now >= enemy.attack.until) enemy.attack = null;
        beginEnemyAttack(enemy, now);
        if (!enemy.attack && !enemy.hitUntil) {
          enemy.x += enemy.vx * delta;
          const left = 8, right = Math.max(left, w - e.width - 8);
          if (enemy.x <= left) {
            enemy.x = left;
            enemy.vx = Math.abs(enemy.vx);
          } else if (enemy.x >= right) {
            enemy.x = right;
            enemy.vx = -Math.abs(enemy.vx);
          }
        }
        // All enemy bodies, including the flying pig, share the same floor.
        enemy.top = h - e.height;
      }

      const playerLeft = x + 14, playerRight = x + 58;
      const playerTop = h - y - 74, playerFoot = h - y;
      const oldFoot = h - previousPlayerY;
      const overlapX = playerRight > enemy.x + 8 && playerLeft < enemy.x + e.width - 8;
      const enemyTop = enemy.top + (e.kind === 'parachute' ? 12 : 5);
      if (!enemy.hitUntil && overlapX && vy < 0 &&
          oldFoot <= enemyTop + 16 && playerFoot >= enemyTop) {
        defeatEnemy(enemy, now);
        vy = 430;
        if (jumpsUsed > 0) jumpsUsed = Math.min(jumpsUsed, 2);
      }
      const sprayActive = controlling && now < sprayUntil;
      const sprayReach = direction > 0 ? enemy.x - (x + 54) : x - (enemy.x + e.width);
      if (!enemy.hitUntil && sprayActive && sprayReach >= -10 && sprayReach < 125 &&
          Math.abs((enemy.top + e.height / 2) - (playerTop + 38)) < 95) {
        defeatEnemy(enemy, now);
      }
      if (enemy.defeated || enemy.x < -140 || enemy.x > w + 180 || enemy.age > 30000) {
        enemy.defeated = true;
        continue;
      }

      let key = e.key, pose = e, frameTime = enemy.age, facing = enemy.vx < 0 ? -1 : 1;
      if (enemy.hitUntil > now) {
        key = 'graffitiBotHurt';
        pose = ATTACK_POSES[key];
        frameTime = now - (enemy.hitUntil - pose.duration);
      } else if (enemy.attack) {
        key = enemy.attack.key === 'graffitiBotFire' ? 'graffitiBotKick' : enemy.attack.key;
        pose = ATTACK_POSES[key];
        frameTime = now - enemy.attack.startedAt;
        facing = enemy.attack.facing;
      }
      const frame = Math.min(pose.frames - 1, Math.floor(frameTime / pose.frameMs));
      drawEnemyPose(key, pose, e.kind === 'parachute' ? frame % pose.frames : frame,
        enemy.x, enemy.top, e.width, e.height, facing, e.kind !== 'parachute');

      // Graffbot fire is a separate original effect sheet, not a replacement
      // for the robot's body or its grounded feet.
      if (enemy.attack?.key === 'graffitiBotFire' && enemyImages.graffitiBotFire) {
        const flame = ATTACK_POSES.graffitiBotFire;
        const fireFrame = Math.min(flame.frames - 1,
          Math.floor((now - enemy.attack.startedAt) / flame.frameMs));
        const fireX = facing > 0 ? enemy.x + e.width - 8 : enemy.x - 88;
        drawEnemyPose('graffitiBotFire', flame, fireFrame,
          fireX, h - 80, 96, 48, facing, false);
      }
    }
    enemies = enemies.filter(enemy => !enemy.defeated);
  }

  function makeUI() {
    if (host) return;
    const style = document.createElement('style');
    style.id = 'nbg-roamer-css';
    style.textContent = `
      #nbg-roamer {position:fixed;bottom:0;left:0;z-index:1500;width:0;height:0;pointer-events:none;contain:layout style;}
      #nbg-roamer .nbg-sprite {position:absolute;left:0;bottom:0;width:72px;height:86px;overflow:hidden;image-rendering:pixelated;pointer-events:auto;cursor:pointer;outline:none;touch-action:manipulation;}
      #nbg-roamer .nbg-sprite:focus-visible {outline:none;}
      #nbg-roamer .nbg-sheet {position:absolute;top:0;left:0;max-width:none;image-rendering:pixelated;transform-origin:top left;pointer-events:none;}
      #nbg-roamer .nbg-controls {position:fixed;bottom:calc(100px + env(safe-area-inset-bottom, 0px));right:12px;display:flex;gap:8px;pointer-events:auto;z-index:1501;}
      #nbg-roamer .nbg-controls[hidden] {display:none;}
      #nbg-roamer .nbg-controls button {width:48px;height:48px;border:2px solid #f3bd25;border-radius:9px;background:#090d14e8;color:white;font-size:22px;touch-action:none;}
      @media (min-width:850px) and (pointer:fine) {#nbg-roamer .nbg-controls {display:none;}}
    `;
    if (!document.getElementById('nbg-roamer-css')) document.head.appendChild(style);
    host = document.createElement('div');
    host.id = 'nbg-roamer';
    host.setAttribute('aria-label', 'NBG London roaming character');
    sprite = document.createElement('div');
    sprite.className = 'nbg-sprite';
    sprite.tabIndex = 0;
    sprite.setAttribute('role', 'button');
    sprite.setAttribute('aria-label', 'Control NBG runner for 30 seconds');
    const sheet = document.createElement('img');
    sheet.className = 'nbg-sheet';
    sheet.alt = '';
    sheet.draggable = false;
    sprite.appendChild(sheet);
    controls = document.createElement('div');
    controls.className = 'nbg-controls';
    controls.hidden = true;
    controls.setAttribute('aria-label', 'NBG runner touch controls');
    for (const [label, key] of [['◀', 'ArrowLeft'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['▶', 'ArrowRight'], ['SPRAY', 'KeyF']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', key.replace('Arrow', ''));
      const release = event => { event.preventDefault(); held.delete(key); };
      button.addEventListener('pointerdown', event => {
        event.preventDefault(); button.setPointerCapture?.(event.pointerId);
        takeControl(); held.add(key);
        if (JUMP_CODES.includes(key)) tryJump();
        if (key === 'KeyF') spray();
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      controls.appendChild(button);
    }
    sprite.addEventListener('click', takeControl);
    sprite.addEventListener('keydown', event => {
      // Space during control must reach the window movement handler to jump.
      // Only use Enter/Space to activate when the runner is not yet controlled.
      if (event.key === 'Enter' || (event.key === ' ' && !controlling)) {
        event.preventDefault();
        if (!controlling) takeControl();
      }
    });
    host.append(sprite, controls);
    document.body.appendChild(host);
  }
  function takeControl() {
    if (!active || disposed) return;
    controlling = true;
    deadline = performance.now() + CONTROL_MS;
    controls.hidden = false;
    // The summon button retains focus after click, and its Space action would
    // otherwise prevent gameplay input. Focus the runner without page scrolling.
    sprite.focus({ preventScroll: true });
  }
  function setAnimation(name, now) {
    const a = manifest?.animations?.[name];
    if (!a) return;
    if (name !== current) { current = name; frame = 0; frameTime = now; }
    const index = Math.floor((now - frameTime) / a.frameMs) % a.frames + (a.frameStart || 0);
    const col = index % a.columns, row = Math.floor(index / a.columns);
    const img = sprite.firstElementChild;
    const scaleX = a.renderWidth / a.sourceFrameWidth;
    const scaleY = a.renderHeight / a.sourceFrameHeight;
    sprite.style.width = a.renderWidth + 'px';
    sprite.style.height = a.renderHeight + 'px';
    // Match the source game's per-animation visual foot alignment. The
    // sprite frame includes transparent padding beneath the character.
    sprite.style.bottom = -(a.renderOffsetY || 0) + 'px';
    const imageSrc = name === 'spray' && cleanSprayUrl ? cleanSprayUrl : ASSET_ROOT + a.spriteSheet;
    if (img.dataset.animation !== name || img.dataset.imageSrc !== imageSrc) img.src = imageSrc;
    img.dataset.imageSrc = imageSrc;
    img.dataset.animation = name;
    img.style.width = (a.columns * a.sourceFrameWidth) + 'px';
    img.style.height = (Math.ceil((a.frames + (a.frameStart || 0)) / a.columns) * a.sourceFrameHeight) + 'px';
    img.style.left = (-col * a.sourceFrameWidth * scaleX) + 'px';
    img.style.top = (-row * a.sourceFrameHeight * scaleY) + 'px';
    img.style.transform = 'scale(' + scaleX + ',' + scaleY + ')';
    // Store facing for tick: translate first, then mirror around the sprite centre.
    sprite.dataset.facing = String(a.nativeFacing ? direction * a.nativeFacing : direction);
  }
  function stop() {
    active = false; controlling = false; moving = false; held.clear();
    jumpsUsed = 0; lastJumpAt = -Infinity; backflipActive = false; y = vy = 0;
    clearEncounter();
    if (host) host.remove();
    host = sprite = controls = null;
    cancelAnimationFrame(raf);
    updateSummonButton();
    schedule();
  }
  function tick(now) {
    if (!active || disposed) return;
    const delta = clamp((now - (last || now)) / 1000, 0, 0.05);
    last = now;
    if (controlling && now >= deadline) { controlling = false; held.clear(); controls.hidden = true; direction = 1; }
    const previousPlayerY = y;
    let crouch = false;
    if (controlling) {
      const left = held.has('ArrowLeft') || held.has('KeyA');
      const right = held.has('ArrowRight') || held.has('KeyD');
      crouch = held.has('ArrowDown') || held.has('KeyS');
      moving = left !== right;
      if (moving) direction = left ? -1 : 1;
      if (moving) x += direction * (crouch ? 85 : 175) * delta;
      x = clamp(x, 0, Math.max(0, innerWidth - 72));
    } else { moving = true; x += 185 * delta; }
    if (y > 0 || vy > 0) {
      y = Math.max(0, y + vy * delta);
      vy -= GRAVITY * delta;
      if (y === 0) {
        vy = 0; jumpsUsed = 0; lastJumpAt = -Infinity; backflipActive = false;
      }
    }
    updateEncounter(now, delta, previousPlayerY);
    const anim = now < sprayUntil ? 'spray' : y > 0
      ? backflipActive ? 'backflip' : vy >= 0 ? 'jump' : 'fall'
      : crouch && moving ? (direction < 0 ? 'crouchLeft' : 'crouchRight') : crouch ? 'idle' : moving ? 'run' : 'idle';
    setAnimation(anim, now);
    sprite.style.transform = 'translate3d(' + x + 'px,' + (-y) + 'px,0) scaleX(' + (sprite.dataset.facing || '1') + ')';
    if (!controlling && x > innerWidth + 120) { stop(); return; }
    raf = requestAnimationFrame(tick);
  }
  async function spawn(manual = false) {
    if (disposed || active || spawning || document.hidden) {
      if (!manual && !active) schedule();
      return;
    }
    spawning = true;
    updateSummonButton();
    try {
      if (!manifest) {
        const response = await fetch(ASSET_ROOT + 'player/nbg-runner-animation-manifest.json', { credentials: 'same-origin' });
        if (!response.ok) throw Error('NBG animation manifest unavailable');
        manifest = await response.json();
      }
      if (disposed || document.hidden) { if (!disposed) schedule(); return; }
      clearTimeout(timer);
      makeUI();
      prepareSpraySprite(); // Preprocess the existing spray art before first attack.
      active = true; controlling = false; x = -100; y = vy = 0; direction = 1; current = ''; last = 0;
      jumpsUsed = 0; lastJumpAt = -Infinity; backflipActive = false;
      startEncounter();
      if (manual) startSummonCooldown();
      raf = requestAnimationFrame(tick);
    } catch (_) { if (!disposed) schedule(); }
    finally { spawning = false; updateSummonButton(); }
  }
  function onKeyDown(event) {
    if (!active || disposed || document.hidden || event.defaultPrevented ||
        event.altKey || event.ctrlKey || event.metaKey ||
        !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','KeyF','KeyJ'].includes(event.code)) return;
    // A summoned runner can be taken over with the first movement key, without
    // requiring a separate click. Never intercept input in page controls.
    const runnerTarget = !!sprite?.contains(event.target);
    const hiddenSummonTarget = event.target === summonButton && summonButton.hidden;
    if (interactive(event.target) && !runnerTarget && !hiddenSummonTarget) return;
    if (controlling && performance.now() >= deadline) return;
    if (!controlling) {
      if (event.repeat) return; // Never activate control from an already-held scrolling key.
      takeControl();
    }
    if (JUMP_CODES.includes(event.code) && !event.repeat && !held.has(event.code)) tryJump();
    if ((event.code === 'KeyF' || event.code === 'KeyJ') && !event.repeat) spray();
    held.add(event.code);
    event.preventDefault();
  }
  function onKeyUp(event) { held.delete(event.code); }
  window.addEventListener('keydown', onKeyDown, { capture: true, passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); if (active) stop(); } });
  window.addEventListener('pagehide', () => {
    disposed = true;
    clearTimeout(timer);
    stop(); // Clear capture state and remove the DOM even when the page enters bfcache.
    clearInterval(summonCooldownTimer);
    summonCooldownTimer = 0;
    summonButton?.remove();
    summonButton = null;
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && disposed) {
      disposed = false;
      ensureSummonButton();
      if (performance.now() - lastSummon < SUMMON_COOLDOWN_MS) startSummonCooldown(false);
      schedule();
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSummonButton, { once: true });
  } else {
    ensureSummonButton();
  }
  schedule();
})();
