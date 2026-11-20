/* NBG London roaming easter egg: isolated from the game's engine and score systems. */
(() => {
  'use strict';
  if (window.__NBG_ROAMER_BOOTED__) return;
  const path = location.pathname.toLowerCase();
  if (/^\/(?:games|game)(?:\/|$)/.test(path) || /\.(?:pdf|xml|json)$/.test(path)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  window.__NBG_ROAMER_BOOTED__ = true;
  const MIN_DELAY = 180000, MAX_DELAY = 420000, CONTROL_MS = 30000;
  const ASSET_ROOT = '/game/assets/';
  const held = new Set();
  let manifest, host, sprite, controls, active = false, controlling = false;
  let direction = 1, x = -100, y = 0, vy = 0, frame = 0, frameTime = 0, last = 0, deadline = 0;
  let current = '', raf = 0, timer = 0, moving = false, disposed = false;
  const interactive = target => !!target?.closest?.('input, textarea, select, button, a, [contenteditable], [role="textbox"], [role="dialog"]');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function schedule() {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(spawn, MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));
  }
  function makeUI() {
    if (host) return;
    const style = document.createElement('style');
    style.id = 'nbg-roamer-css';
    style.textContent = `
      #nbg-roamer {position:fixed;bottom:env(safe-area-inset-bottom, 0px);left:0;z-index:1500;width:0;height:0;pointer-events:none;contain:layout style;}
      #nbg-roamer .nbg-sprite {position:absolute;left:0;bottom:0;width:72px;height:86px;overflow:hidden;image-rendering:pixelated;pointer-events:auto;cursor:pointer;outline-offset:3px;touch-action:manipulation;}
      #nbg-roamer .nbg-sprite:focus-visible {outline:2px solid #f3bd25;}
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
    for (const [label, key] of [['◀', 'ArrowLeft'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['▶', 'ArrowRight']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', key.replace('Arrow', ''));
      const release = event => { event.preventDefault(); held.delete(key); };
      button.addEventListener('pointerdown', event => {
        event.preventDefault(); button.setPointerCapture?.(event.pointerId);
        takeControl(); held.add(key);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      controls.appendChild(button);
    }
    sprite.addEventListener('click', takeControl);
    sprite.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); takeControl(); }
    });
    host.append(sprite, controls);
    document.body.appendChild(host);
  }
  function takeControl() {
    if (!active || disposed) return;
    controlling = true;
    deadline = performance.now() + CONTROL_MS;
    controls.hidden = false;
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
    img.src = img.dataset.animation === name ? img.src : ASSET_ROOT + a.spriteSheet;
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
    if (host) host.remove();
    host = sprite = controls = null;
    cancelAnimationFrame(raf);
    schedule();
  }
  function tick(now) {
    if (!active || disposed) return;
    const delta = clamp((now - (last || now)) / 1000, 0, 0.05);
    last = now;
    if (controlling && now >= deadline) { controlling = false; held.clear(); controls.hidden = true; direction = 1; }
    let crouch = false, jump = false;
    if (controlling) {
      const left = held.has('ArrowLeft') || held.has('KeyA');
      const right = held.has('ArrowRight') || held.has('KeyD');
      crouch = held.has('ArrowDown') || held.has('KeyS');
      jump = held.has('ArrowUp') || held.has('KeyW') || held.has('Space');
      moving = left !== right;
      if (moving) direction = left ? -1 : 1;
      if (jump && y === 0) vy = 480;
      if (moving) x += direction * (crouch ? 85 : 175) * delta;
      x = clamp(x, 0, Math.max(0, innerWidth - 72));
    } else { moving = true; x += 185 * delta; }
    if (y > 0 || vy > 0) { y = Math.max(0, y + vy * delta); vy -= 1100 * delta; if (y === 0) vy = 0; }
    const anim = y > 0 ? (vy >= 0 ? 'jump' : 'fall') : crouch && moving ? (direction < 0 ? 'crouchLeft' : 'crouchRight') : crouch ? 'idle' : moving ? 'run' : 'idle';
    setAnimation(anim, now);
    sprite.style.transform = 'translate3d(' + x + 'px,' + (-y) + 'px,0) scaleX(' + (sprite.dataset.facing || '1') + ')';
    if (!controlling && x > innerWidth + 120) { stop(); return; }
    raf = requestAnimationFrame(tick);
  }
  async function spawn() {
    if (disposed || active || document.hidden) { schedule(); return; }
    try {
      if (!manifest) {
        const response = await fetch(ASSET_ROOT + 'player/nbg-runner-animation-manifest.json', { credentials: 'same-origin' });
        if (!response.ok) throw Error('NBG animation manifest unavailable');
        manifest = await response.json();
      }
      if (disposed || document.hidden) { schedule(); return; }
      makeUI();
      active = true; controlling = false; x = -100; y = vy = 0; direction = 1; current = ''; last = 0;
      raf = requestAnimationFrame(tick);
    } catch (_) { schedule(); }
  }
  function onKeyDown(event) {
    if (!active || !controlling || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat && !held.has(event.code) || interactive(event.target)) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'].includes(event.code)) {
      held.add(event.code); event.preventDefault();
    }
  }
  function onKeyUp(event) { held.delete(event.code); }
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); if (active) stop(); } });
  window.addEventListener('pagehide', () => {
    disposed = true;
    clearTimeout(timer);
    stop(); // Clear capture state and remove the DOM even when the page enters bfcache.
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && disposed) { disposed = false; schedule(); }
  });
  schedule();
})();
