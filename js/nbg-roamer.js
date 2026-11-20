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
  const ENEMY_TYPES = [
    { key: 'parachuteRatA', kind: 'parachute', width: 64, height: 64, columns: 5, frames: 25, frameMs: 95 },
    { key: 'parachuteRatB', kind: 'parachute', width: 64, height: 64, columns: 5, frames: 25, frameMs: 95 },
    { key: 'londonRat', kind: 'ground', width: 50, height: 60, columns: 5, frames: 25, frameMs: 90 },
    { key: 'turquoiseRatWalk', kind: 'ground', width: 50, height: 60, columns: 5, frames: 25, frameMs: 90 },
    { key: 'brownRatWalk', kind: 'ground', width: 64, height: 72, columns: 5, frames: 25, frameMs: 90 },
    { key: 'graffitiBot', kind: 'ground', width: 70, height: 52, columns: 5, frames: 25, frameMs: 90 },
    { key: 'pigeon', kind: 'flying', width: 56, height: 44, columns: 5, frames: 20, frameMs: 85 },
    { key: 'balloonWalk', kind: 'ground', width: 54, height: 60, columns: 4, frames: 14, frameMs: 100 }
  ];
  let encounterCanvas = null, encounterCtx = null, enemyImages = {}, enemies = [];
  let enemyManifest = null, encounterNextAt = 0, encounterGeneration = 0;
  let sprayUntil = 0, lastSpray = -Infinity, cleanSprayUrl = null, sprayPreparing = false;
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
      type, x: parachute ? w * (index ? 0.7 : 0.3) : w + 20 + index * 70,
      top: parachute ? -type.height - index * 100 : type.kind === 'flying' ? h * 0.28 : h - type.height,
      vx: parachute ? (index ? -10 : 10) : -(type.kind === 'flying' ? 100 : 58),
      age: index * 140, defeated: false
    };
  }
  function startEncounter() {
    const generation = ++encounterGeneration;
    enemies = [];
    sprayUntil = 0;
    encounterNextAt = performance.now() + 2200;
    createEncounterCanvas();
    resizeEncounterCanvas();
    // Parachute rats appear together when the character comes into view.
    const parachutes = ENEMY_TYPES.slice(0, 2);
    for (let i = 0; i < parachutes.length; i++) enemies.push(spawnEnemy(parachutes[i], i));
    // Preload actual NBG Level 1 artwork, without blocking player movement.
    if (!enemyManifest) {
      fetch(ASSET_ROOT + 'asset-manifest.json', { credentials: 'same-origin' })
        .then(response => { if (!response.ok) throw Error('Missing NBG enemy manifest'); return response.json(); })
        .then(data => {
          if (disposed || generation !== encounterGeneration) return;
          enemyManifest = data.enemies || {};
          ENEMY_TYPES.forEach(type => {
            const path = enemyManifest[type.key];
            if (!path || enemyImages[type.key]) return;
            const image = new Image();
            image.src = ASSET_ROOT + path;
            enemyImages[type.key] = image;
          });
        }).catch(() => {});
    } else {
      ENEMY_TYPES.forEach(type => {
        if (!enemyManifest[type.key] || enemyImages[type.key]) return;
        const image = new Image();
        image.src = ASSET_ROOT + enemyManifest[type.key];
        enemyImages[type.key] = image;
      });
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
    sprayUntil = 0;
    if (encounterCanvas) encounterCanvas.remove();
    encounterCanvas = encounterCtx = null;
  }
  function updateEncounter(now, delta, previousPlayerY) {
    if (!encounterCtx || !active) return;
    resizeEncounterCanvas();
    encounterCtx.clearRect(0, 0, encounterCanvas.width, encounterCanvas.height);
    const h = encounterCanvas.height, w = encounterCanvas.width;
    if (controlling && now >= encounterNextAt && enemies.length < 8) {
      const rotating = ENEMY_TYPES.slice(2);
      const selected = rotating[Math.floor(now / 2500) % rotating.length];
      enemies.push(spawnEnemy(selected));
      encounterNextAt = now + 2600;
    }
    for (const enemy of enemies) {
      if (enemy.defeated) continue;
      const e = enemy.type;
      enemy.age += delta * 1000;
      enemy.x += enemy.vx * delta;
      if (e.kind === 'parachute') {
        enemy.top = Math.min(h - e.height, enemy.top + 105 * delta);
        if (enemy.top >= h - e.height) {
          // Parachute lands and turns into a moving rat.
          enemy.type = ENEMY_TYPES[enemy === enemies[0] ? 3 : 4];
          enemy.top = h - enemy.type.height;
          enemy.vx = enemy.x < w / 2 ? 65 : -65;
        }
      } else if (e.kind === 'ground') {
        enemy.top = h - e.height;
      } else {
        enemy.top = h * 0.25 + Math.sin(enemy.age / 300) * 35;
      }
      const playerLeft = x + 14, playerRight = x + 58;
      const playerTop = h - y - 74, playerFoot = h - y;
      const oldFoot = h - previousPlayerY;
      const overlapX = playerRight > enemy.x + 8 && playerLeft < enemy.x + e.width - 8;
      const enemyTop = enemy.top + (e.kind === 'parachute' ? 12 : 5);
      if (overlapX && vy < 0 && oldFoot <= enemyTop + 16 && playerFoot >= enemyTop) {
        enemy.defeated = true;
        vy = 430; // Rebound upward after a successful stomp.
        if (jumpsUsed > 0) jumpsUsed = Math.min(jumpsUsed, 2);
      }
      const sprayActive = controlling && now < sprayUntil;
      const sprayReach = direction > 0 ? enemy.x - (x + 54) : x - (enemy.x + e.width);
      if (sprayActive && sprayReach >= -10 && sprayReach < 125 &&
          Math.abs((enemy.top + e.height / 2) - (playerTop + 38)) < 95) {
        enemy.defeated = true;
      }
      if (enemy.defeated || enemy.x < -140 || enemy.x > w + 180 || enemy.age > 30000) {
        enemy.defeated = true;
        continue;
      }
      const image = enemyImages[e.key];
      if (!image?.complete || !image.naturalWidth) continue;
      const frame = Math.floor(enemy.age / e.frameMs) % e.frames;
      const sourceW = image.naturalWidth / e.columns;
      const sourceH = image.naturalHeight / Math.ceil(e.frames / e.columns);
      encounterCtx.save();
      encounterCtx.imageSmoothingEnabled = false;
      encounterCtx.drawImage(image, (frame % e.columns) * sourceW,
        Math.floor(frame / e.columns) * sourceH, sourceW, sourceH,
        Math.round(enemy.x), Math.round(enemy.top), e.width, e.height);
      encounterCtx.restore();
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
