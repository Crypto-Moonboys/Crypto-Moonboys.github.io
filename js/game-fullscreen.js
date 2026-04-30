/* game-fullscreen.js — Fullscreen Arcade Mode V2
 * Reusable fullscreen overlay for Crypto Moonboys arcade games.
 *
 * Drop in any arcade game page (after wiki.js, before </body>):
 *   <script src="/js/game-fullscreen.js"></script>
 *
 * Behaviour:
 *  • Clicking "Start" opens a full-viewport overlay containing the game.
 *  • Compact control bar: FS toggle, pause, reset, mute, exit.
 *  • Wide-screen side panels show controls, tips, and live score.
 *  • Mobile touch-control pad adapts per game (dpad, lr-fire, etc.).
 *  • Exiting pauses a running game and restores the game-card to its original DOM position.
 *  • Esc key, the ✕ Exit button, and tapping the backdrop all close the overlay.
 */
(function () {
  'use strict';

  var startBtn = document.getElementById('startBtn');
  var gameCard = document.querySelector('.game-card');
  var autoStartOnOpen = startBtn && startBtn.dataset && startBtn.dataset.overlayAutostart === 'true';
  // NOTE: HexGL (hexgl-monster-max.html) must NOT set data-overlay-autostart="true" on its
  // startBtn.  That flag causes the overlay to auto-click the game's own start handler on
  // open, creating a hidden second start path.  HexGL uses a single deliberate start flow:
  // user clicks ▶ Start inside the overlay → onStart() → LOADING → COUNTDOWN → RUN ACTIVE.
  var hidePauseControl = startBtn && startBtn.dataset && startBtn.dataset.overlayHidePause === 'true';
  var hideStartControl = startBtn && startBtn.dataset && startBtn.dataset.overlayHideStart === 'true';
  var singleStartFlow = startBtn && startBtn.dataset && startBtn.dataset.overlaySingleStart === 'true';
  var manualOverlayStart = startBtn && startBtn.dataset && startBtn.dataset.overlayManualStart === 'true';

  // Only activate on pages that have both a Start button and a .game-card.
  if (!startBtn || !gameCard) return;

  if (!window.MOONBOYS_FACTION) {
    var factionScript = document.createElement('script');
    factionScript.src = '/js/faction-alignment.js';
    factionScript.defer = true;
    document.head.appendChild(factionScript);
  }

  /* ── Game metadata ───────────────────────────────────────────────── */

  var GAME_META = {
    snakeCanvas: {
      label: '🐍 SnakeRun', color: '#2ec5ff', touchScheme: 'dpad',
      controls: ['↑↓←→ / WASD move', '+10 score per food'],
      tips: ['Wall = death', 'Longer = harder', 'Chase streaks']
    },
    brkCanvas: {
      label: '🧱 Breakout', color: '#f7ab1a', touchScheme: 'lr-launch',
      controls: ['← → Move paddle', 'Space Launch'],
      tips: ['Edge hits angle ball', 'Combo multiplies score', 'Pink bricks = 3 hits']
    },
    invCanvas: {
      label: '👾 Invaders', color: '#3fb950', touchScheme: 'lr-fire',
      controls: ['← → Move ship', 'Space Shoot'],
      tips: ['Boss every 5th wave', 'Shoot fast', 'Speed up as waves rise']
    },
    astCanvas: {
      label: '🌑 Asteroids', color: '#bc8cff', touchScheme: 'asteroid',
      controls: ['← → Rotate', '↑ Thrust', 'Space Shoot'],
      tips: ['Rocks split on hit', 'Wrap around edges', 'Tier-3 splits most']
    },
    pacCanvas: {
      label: '🟡 Pac-Chain', color: '#f7c948', touchScheme: 'dpad',
      controls: ['↑↓←→ / WASD move', 'Power pellets let you eat enemies'],
      tips: ['Chain ghost eats', 'Power mode fades fast', 'Clear all pellets']
    },
    tetCanvas: {
      label: '🟦 Tetris', color: '#bc8cff', touchScheme: 'tetris',
      controls: ['← → Move', '↑ Rotate', '↓ Soft drop', 'Space Hard drop'],
      tips: ['Plan 2 pieces ahead', 'I-piece for Tetris', 'Hard drop = bonus score']
    },
    btqmCanvas: {
      label: '🧱 Block Topia', color: '#f39c12', touchScheme: 'dpad',
      controls: ['↑↓←→ / WASD — Move', 'ENTER / SPACE — Enter zone', 'ESC — World map', '1 Attack  2 Skill  3 Moon  4 Potion  5 Flee'],
      tips: ['Defeat boss to unlock exit', 'Daily quests reset at UTC midnight', 'Clear all 6 zones = 2× score bonus']
    }
  };

  function detectMeta() {
    var ids = Object.keys(GAME_META);
    for (var i = 0; i < ids.length; i++) {
      if (document.getElementById(ids[i])) return GAME_META[ids[i]];
    }
    return { label: '🎮 Game', color: '#fff', touchScheme: null, controls: [], tips: [] };
  }

  /* ── Build overlay DOM ───────────────────────────────────────────── */

  var overlay = document.createElement('div');
  overlay.id = 'game-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Game — fullscreen mode');

  // Control bar
  var ctrlBar = document.createElement('div');
  ctrlBar.id = 'overlay-ctrl-bar';

  var gameLabel = document.createElement('span');
  gameLabel.id = 'overlay-game-label';

  function makeCtrlBtn(id, ariaLabel, icon, labelText) {
    var btn = document.createElement('button');
    btn.id = id;
    btn.setAttribute('aria-label', ariaLabel);
    btn.setAttribute('type', 'button');
    btn.classList.add('interactive');
    btn.innerHTML =
      '<span class="btn-icon">' + icon + '</span>' +
      '<span class="btn-label"> ' + labelText + '</span>';
    return btn;
  }

  var btnFS    = makeCtrlBtn('overlay-btn-fs',    'Toggle fullscreen', '⛶', 'FS');
  var btnStart = makeCtrlBtn('overlay-btn-start', 'Start game',        '▶', 'Start');
  var btnPause = makeCtrlBtn('overlay-btn-pause', 'Pause/Resume',      '⏸', 'Pause');
  var btnReset = makeCtrlBtn('overlay-btn-reset', 'Reset game',        '↺', 'Reset');
  var btnMute  = makeCtrlBtn('overlay-btn-mute',  'Mute/Unmute',       '🔊', 'Mute');
  var btnExit  = makeCtrlBtn('overlay-btn-exit',  'Exit fullscreen',   '✕', 'Exit');

  ctrlBar.appendChild(gameLabel);
  ctrlBar.appendChild(btnFS);
  ctrlBar.appendChild(btnStart);
  ctrlBar.appendChild(btnPause);
  ctrlBar.appendChild(btnReset);
  ctrlBar.appendChild(btnMute);
  ctrlBar.appendChild(btnExit);

  // Overlay body (side panels + stage)
  var overlayBody = document.createElement('div');
  overlayBody.className = 'overlay-body';

  var sideLeft  = document.createElement('div');
  sideLeft.className = 'overlay-side overlay-side--left shell-scroll';
  sideLeft.setAttribute('data-shell-scroll', '');

  var stage = document.createElement('div');
  stage.className = 'game-stage';

  var sideRight = document.createElement('div');
  sideRight.className = 'overlay-side overlay-side--right shell-scroll';
  sideRight.setAttribute('data-shell-scroll', '');

  overlayBody.appendChild(sideLeft);
  overlayBody.appendChild(stage);
  overlayBody.appendChild(sideRight);
  if (window.MOONBOYS_SCROLL_SHELL && typeof window.MOONBOYS_SCROLL_SHELL.mount === 'function') {
    window.MOONBOYS_SCROLL_SHELL.mount(sideLeft);
    window.MOONBOYS_SCROLL_SHELL.mount(sideRight);
  }

  // Touch pad
  var touchPad = document.createElement('div');
  touchPad.className = 'overlay-touch-pad';

  overlay.appendChild(ctrlBar);
  overlay.appendChild(overlayBody);
  overlay.appendChild(touchPad);
  document.body.appendChild(overlay);

  /* ── Game-Over Modal ─────────────────────────────────────────────── */

  var gameOverModal = document.createElement('div');
  gameOverModal.id = 'game-over-modal';
  gameOverModal.setAttribute('role', 'dialog');
  gameOverModal.setAttribute('aria-modal', 'true');
  gameOverModal.setAttribute('aria-label', 'Game Over');

  var gameOverBox = document.createElement('div');
  gameOverBox.className = 'game-over-box';

  var goTitle = document.createElement('div');
  goTitle.className = 'game-over-title';
  goTitle.textContent = 'GAME OVER';

  var goScoreLine = document.createElement('div');
  goScoreLine.className = 'game-over-score-line';
  goScoreLine.innerHTML = 'Score: <span id="game-over-score-val">0</span>';

  var goBtns = document.createElement('div');
  goBtns.className = 'game-over-btns';

  var goPlayAgain = document.createElement('button');
  goPlayAgain.id = 'game-over-play-again';
  goPlayAgain.setAttribute('type', 'button');
  goPlayAgain.className = 'game-btn';
  goPlayAgain.textContent = '▶ Play Again';

  var goExitBtn = document.createElement('button');
  goExitBtn.id = 'game-over-exit-btn';
  goExitBtn.setAttribute('type', 'button');
  goExitBtn.className = 'game-btn alt';
  goExitBtn.textContent = '✕ Exit';

  goBtns.appendChild(goPlayAgain);
  goBtns.appendChild(goExitBtn);
  gameOverBox.appendChild(goTitle);
  gameOverBox.appendChild(goScoreLine);
  gameOverBox.appendChild(goBtns);
  gameOverModal.appendChild(gameOverBox);
  document.body.appendChild(gameOverModal);

  var _goRestart = null;
  var _goExit    = null;
  var cachedFactionPanel = null;

  function showGameOverModal(score, opts) {
    opts = opts || {};
    var valEl = document.getElementById('game-over-score-val');
    if (valEl) valEl.textContent = (typeof score !== 'undefined' ? score : 0);
    _goRestart = opts.onRestart || null;
    _goExit    = opts.onExit    || null;
    gameOverModal.classList.add('active');
    document.dispatchEvent(new CustomEvent('arcade-run-game-over', {
      detail: { score: (typeof score !== 'undefined' ? score : 0) }
    }));
    goPlayAgain.focus();
  }

  function hideGameOverModal() {
    gameOverModal.classList.remove('active');
    _goRestart = null;
    _goExit    = null;
  }

  goPlayAgain.addEventListener('click', function () {
    var cb = _goRestart;
    hideGameOverModal();
    if (cb) {
      cb();
    } else {
      startBtn.click();
    }
  });

  goExitBtn.addEventListener('click', function () {
    var cb = _goExit;
    hideGameOverModal();
    if (cb) {
      cb();
    } else if (isOpen) {
      closeOverlay();
    }
  });

  // Expose globally so individual game scripts can call it.
  window.showGameOverModal = showGameOverModal;
  window.hideGameOverModal = hideGameOverModal;

  /* ── Constants ───────────────────────────────────────────────────── */

  // Brief delay (ms) for simulated key-up after a tap, matching typical game loop tick.
  var KEY_PULSE_MS = 80;

  // Safe initialization of global mute flag.
  if (typeof window._arcadeMuted === 'undefined') window._arcadeMuted = false;

  function getArcadeAudio() {
    return window.ArcadeAudio || null;
  }

  function getMutedState() {
    var audio = getArcadeAudio();
    if (audio && typeof audio.isMuted === 'function') return !!audio.isMuted();
    return !!window._arcadeMuted;
  }

  function syncMuteBtn() {
    var muted = getMutedState();
    var icon = btnMute.querySelector('.btn-icon');
    var lbl  = btnMute.querySelector('.btn-label');
    if (muted) {
      if (icon) icon.textContent = '🔇';
      if (lbl)  lbl.textContent  = ' Unmute';
    } else {
      if (icon) icon.textContent = '🔊';
      if (lbl)  lbl.textContent  = ' Mute';
    }
  }

  var origParent      = null;
  var origNextSibling = null;
  var stageTarget     = null; // element actually moved into the overlay (btqm-game-area or game-card)
  var isOpen          = false;
  var _gameStarted    = false; // true once the in-overlay Start button has been clicked at least once
  var scoreInterval   = null;
  // Cached overlay score display elements; set in buildLeftPanel / buildRightPanel.
  var cachedLiveScore = null;
  var cachedLiveProjectedXp = null;
  var cachedProjectedHint = null;
  var cachedLiveBest  = null;
  var cachedRightBest = null;
  var cachedSyncStatus = null;
  var cachedSyncIdentity = null;
  var cachedSyncActions = null;
  var inlineProjectedXpValue = null;
  var inlineSyncStatus = null;
  var inlineSyncIdentity = null;
  var inlineSyncActions = null;
  var lastSubmissionState = '';
  var microNotifyDedup = new Map();
  var microNotifyCooldownMs = 2200;
  var maxMicroItems = 5;

  function dispatchUiState(name, detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function ensureMicroFeed() {
    var root = document.getElementById('micro-notify-feed');
    if (root) return root;
    root = document.createElement('aside');
    root.id = 'micro-notify-feed';
    root.className = 'micro-notify-feed';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'false');
    document.body.appendChild(root);
    return root;
  }

  function pushMicroNotification(message, tone) {
    if (!message) return;
    var text = String(message).trim();
    if (!text) return;
    var key = (tone || 'info') + '::' + text.toLowerCase();
    var now = Date.now();
    var prev = microNotifyDedup.get(key) || 0;
    if ((now - prev) < microNotifyCooldownMs) return;
    microNotifyDedup.set(key, now);
    if (microNotifyDedup.size > 120) {
      microNotifyDedup.forEach(function (ts, dedupeKey) {
        if ((now - ts) > 60000) microNotifyDedup.delete(dedupeKey);
      });
    }
    var feed = ensureMicroFeed();
    var item = document.createElement('div');
    item.className = 'micro-note ' + (tone ? ('micro-note--' + tone) : 'micro-note--info');
    item.textContent = text;
    feed.prepend(item);
    while (feed.children.length > maxMicroItems) {
      feed.lastElementChild && feed.lastElementChild.remove();
    }
    requestAnimationFrame(function () { item.classList.add('is-live'); });
    window.setTimeout(function () { item.classList.remove('is-live'); item.classList.add('is-out'); }, 3400);
    window.setTimeout(function () { item.remove(); }, 4200);
  }

  function pulseStateClass(name, ms) {
    if (!document || !document.body || !name) return;
    document.body.classList.add(name);
    window.setTimeout(function () {
      if (document && document.body) document.body.classList.remove(name);
    }, Math.max(420, Number(ms) || 960));
  }

  function animateNumericNode(node, nextValue, duration) {
    if (!node) return;
    var to = Math.max(0, Math.floor(Number(nextValue) || 0));
    var from = Math.max(0, Math.floor(Number(node.dataset.value || node.textContent || 0) || 0));
    if (to === from) {
      node.textContent = String(to);
      node.dataset.value = String(to);
      return;
    }
    var start = performance.now();
    var ms = Math.max(250, Number(duration) || 700);
    function tick(now) {
      var t = Math.min(1, (now - start) / ms);
      var eased = 1 - Math.pow(1 - t, 3);
      var val = Math.round(from + (to - from) * eased);
      node.textContent = String(val);
      node.dataset.value = String(val);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function getProjectedXp(scoreText) {
    var raw = Number(scoreText);
    if (!isFinite(raw) || raw < 0) return 0;
    return Math.min(Math.floor(raw / 1000), 100);
  }

  function ensureInlineProjectionHud() {
    var hud = document.querySelector('.game-card .hud');
    if (!hud || document.getElementById('projectedXpValue')) return;
    var stat = el('div', 'stat stat--projected-xp');
    stat.innerHTML = '' +
      '<div class="label">Projected XP</div>' +
      '<div class="value" id="projectedXpValue">0</div>' +
      '<div class="subtle">Accepted score required</div>';
    hud.appendChild(stat);
    inlineProjectedXpValue = stat.querySelector('#projectedXpValue');
  }

  function ensureInlineSyncNote() {
    var card = document.querySelector('.game-card');
    if (!card || document.getElementById('arcade-sync-hint')) return;
    var note = el('div', 'arcade-sync-hint');
    note.id = 'arcade-sync-hint';
    note.innerHTML = '' +
      '<strong>Arcade Sync:</strong> Play free without Telegram. Unsynced progress stays in this browser only; clearing browser data may reset local arcade progress. Link Telegram to store Block Topia XP and progression server-side.';
    card.appendChild(note);
    var identity = el('div', 'arcade-sync-identity', 'Telegram not linked \u2014 run /gklink');
    identity.id = 'arcade-sync-identity';
    card.appendChild(identity);
    inlineSyncIdentity = identity;
    var status = el('div', 'arcade-sync-status sync-error', 'Unsynced play stays local to this browser. Run /gklink in Telegram to store XP and Block Topia progression server-side.');
    status.id = 'arcade-sync-status';
    card.appendChild(status);
    var actions = el('div', 'arcade-sync-actions');
    actions.id = 'arcade-sync-actions';
    card.appendChild(actions);
    inlineSyncActions = actions;
    inlineSyncStatus = status;
  }

  function getIdentityApi() {
    return (window && window.MOONBOYS_IDENTITY) || null;
  }

  function getLinkedIdentityLabel() {
    var gate = getIdentityApi();
    var name = gate && typeof gate.getTelegramName === 'function' ? gate.getTelegramName() : null;
    var auth = gate && typeof gate.getTelegramAuth === 'function' ? gate.getTelegramAuth() : null;
    var username = auth && (auth.username || (auth.user && auth.user.username)) ? (auth.username || auth.user.username) : null;
    if (name && username) return String(name) + ' (@' + String(username).replace(/^@/, '') + ')';
    if (name) return String(name);
    if (username) return '@' + String(username).replace(/^@/, '');
    return 'Unknown Telegram account';
  }

  function isLinkedReady() {
    var gate = getIdentityApi();
    if (!gate || typeof gate.isTelegramLinked !== 'function') return false;
    if (!gate.isTelegramLinked()) return false;
    if (typeof gate.getSyncState === 'function') {
      var sync = gate.getSyncState();
      return !!(sync && sync.good);
    }
    return true;
  }

  /* ── DOM helpers ─────────────────────────────────────────────────── */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls)  e.className   = cls;
    if (text) e.textContent = text;
    return e;
  }

  /* ── Touch helpers ───────────────────────────────────────────────── */

  function dispatchKey(type, key) {
    document.dispatchEvent(
      new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true })
    );
  }

  function makeTouchBtn(text, extraClass) {
    var btn = el('button', 'touch-btn' + (extraClass ? ' ' + extraClass : ''), text);
    btn.setAttribute('type', 'button');
    return btn;
  }

  // Hold-to-move: fires keydown on press, keyup on release.
  function bindHold(btn, key) {
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      dispatchKey('keydown', key);
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      dispatchKey('keyup', key);
    }, { passive: false });
    btn.addEventListener('touchcancel', function () { dispatchKey('keyup', key); });
    // Mouse fallback for non-touch testing
    btn.addEventListener('mousedown',  function () { dispatchKey('keydown', key); });
    btn.addEventListener('mouseup',    function () { dispatchKey('keyup',   key); });
    btn.addEventListener('mouseleave', function () { dispatchKey('keyup',   key); });
  }

  // Tap: fires a brief keydown+keyup pulse.
  function bindTap(btn, key) {
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      dispatchKey('keydown', key);
      setTimeout(function () { dispatchKey('keyup', key); }, KEY_PULSE_MS);
    }, { passive: false });
    btn.addEventListener('click', function () {
      dispatchKey('keydown', key);
      setTimeout(function () { dispatchKey('keyup', key); }, KEY_PULSE_MS);
    });
  }

  /* ── Touch control builders ──────────────────────────────────────── */

  function buildDpad() {
    var wrap   = el('div', 'touch-dpad');
    var keys   = [null, 'ArrowUp', null, 'ArrowLeft', null, 'ArrowRight', null, 'ArrowDown', null];
    var labels = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    keys.forEach(function (key) {
      if (!key) {
        wrap.appendChild(el('div', 'touch-btn touch-btn--empty'));
      } else {
        var btn = makeTouchBtn(labels[key]);
        bindHold(btn, key);
        wrap.appendChild(btn);
      }
    });
    return wrap;
  }

  function buildLrLaunch() {
    var wrap   = el('div', 'touch-lr');
    var row1   = el('div', 'touch-lr-row');
    var left   = makeTouchBtn('← Move',    'touch-btn--wide');
    var right  = makeTouchBtn('Move →',    'touch-btn--wide');
    var launch = makeTouchBtn('⎵ Launch',  'touch-btn--wide');
    bindHold(left,  'ArrowLeft');
    bindHold(right, 'ArrowRight');
    bindTap(launch, ' ');
    row1.appendChild(left);
    row1.appendChild(right);
    wrap.appendChild(row1);
    wrap.appendChild(launch);
    return wrap;
  }

  function buildLrFire() {
    var wrap  = el('div', 'touch-lr-row');
    var left  = makeTouchBtn('← Move',   'touch-btn--wide');
    var fire  = makeTouchBtn('🔫 Fire',  'touch-btn--fire');
    var right = makeTouchBtn('Move →',   'touch-btn--wide');
    bindHold(left,  'ArrowLeft');
    bindHold(right, 'ArrowRight');
    bindTap(fire,   ' ');
    wrap.appendChild(left);
    wrap.appendChild(fire);
    wrap.appendChild(right);
    return wrap;
  }

  function buildAsteroid() {
    var wrap   = el('div', 'touch-asteroid');
    var row1   = el('div', 'touch-asteroid-row');
    var rotL   = makeTouchBtn('↺ Left');
    var thrust = makeTouchBtn('▲ Thrust');
    var rotR   = makeTouchBtn('↻ Right');
    var fire   = makeTouchBtn('🔫 Fire', 'touch-btn--fire');
    bindHold(rotL,   'ArrowLeft');
    bindHold(thrust, 'ArrowUp');
    bindHold(rotR,   'ArrowRight');
    bindTap(fire,    ' ');
    row1.appendChild(rotL);
    row1.appendChild(thrust);
    row1.appendChild(rotR);
    wrap.appendChild(row1);
    wrap.appendChild(fire);
    return wrap;
  }

  function buildTetris() {
    var wrap     = el('div', 'touch-tetris');
    var row1     = el('div', 'touch-tetris-row');
    var left     = makeTouchBtn('←');
    var rotate   = makeTouchBtn('↻');
    var right    = makeTouchBtn('→');
    var softDrop = makeTouchBtn('↓');
    var hardDrop = makeTouchBtn('⏬');
    bindHold(left,     'ArrowLeft');
    bindTap(rotate,    'ArrowUp');
    bindHold(right,    'ArrowRight');
    bindHold(softDrop, 'ArrowDown');
    bindTap(hardDrop,  ' ');
    row1.appendChild(left);
    row1.appendChild(rotate);
    row1.appendChild(right);
    row1.appendChild(softDrop);
    row1.appendChild(hardDrop);
    wrap.appendChild(row1);
    return wrap;
  }

  function buildTouchPad(meta) {
    touchPad.innerHTML = '';
    if (!meta || !meta.touchScheme) return;
    var builders = {
      'dpad':      buildDpad,
      'lr-launch': buildLrLaunch,
      'lr-fire':   buildLrFire,
      'asteroid':  buildAsteroid,
      'tetris':    buildTetris
    };
    var fn = builders[meta.touchScheme];
    if (fn) touchPad.appendChild(fn());
  }

  /* ── Side panel builders ─────────────────────────────────────────── */

  function buildLeftPanel(meta) {
    sideLeft.innerHTML = '';
    var name = el('div', 'game-name', meta.label);
    name.style.color = meta.color;
    sideLeft.appendChild(name);
    sideLeft.appendChild(el('div', 'panel-title', 'Controls'));
    var ul = el('ul', 'ctrl-list');
    meta.controls.forEach(function (c) { ul.appendChild(el('li', null, c)); });
    sideLeft.appendChild(ul);
    sideLeft.appendChild(el('div', 'panel-title', 'Live Score'));
    cachedLiveScore = el('div', 'score-val', '0');
    cachedLiveScore.id = 'overlay-live-score';
    sideLeft.appendChild(cachedLiveScore);
    sideLeft.appendChild(el('div', 'panel-title', 'Projected Arcade XP'));
    cachedLiveProjectedXp = el('div', 'score-val score-val--projected', '0');
    cachedLiveProjectedXp.id = 'overlay-live-projected-xp';
    sideLeft.appendChild(cachedLiveProjectedXp);
    cachedProjectedHint = el('div', 'panel-note', 'Potential Arcade XP \u2014 accepted score + Telegram sync required.');
    sideLeft.appendChild(cachedProjectedHint);
    sideLeft.appendChild(el('div', 'panel-title', 'Best'));
    cachedLiveBest = el('div', 'score-val', '0');
    cachedLiveBest.id = 'overlay-live-best';
    sideLeft.appendChild(cachedLiveBest);
    sideLeft.appendChild(el('div', 'panel-title', 'Sync Status'));
    cachedSyncIdentity = el('div', 'panel-note panel-note--identity', 'Telegram not linked \u2014 run /gklink');
    cachedSyncIdentity.id = 'overlay-sync-identity';
    sideLeft.appendChild(cachedSyncIdentity);
    cachedSyncStatus = el('div', 'panel-note panel-note--status sync-error', 'Unsynced play stays local to this browser. Run /gklink in Telegram to store XP and Block Topia progression server-side.');
    cachedSyncStatus.id = 'overlay-sync-status';
    sideLeft.appendChild(cachedSyncStatus);
    cachedSyncActions = el('div', 'panel-note panel-note--actions');
    cachedSyncActions.id = 'overlay-sync-actions';
    sideLeft.appendChild(cachedSyncActions);
    sideLeft.appendChild(el('div', 'panel-title', 'Faction Alignment'));
    cachedFactionPanel = el('div', 'panel-note panel-note--faction');
    cachedFactionPanel.id = 'overlay-faction-panel';
    cachedFactionPanel.innerHTML = 'Loading faction card…';
    sideLeft.appendChild(cachedFactionPanel);
    updateSyncSurfaceState(lastSubmissionState || (isLinkedReady() ? 'linked_ready' : 'local_only'), {});
    refreshFactionPanel();
  }

  function refreshFactionPanel() {
    var panel = cachedFactionPanel || document.getElementById('overlay-faction-panel');
    if (!panel) return;
    var factionApi = window.MOONBOYS_FACTION;
    if (!factionApi || typeof factionApi.renderPlayerCard !== 'function') {
      panel.textContent = 'Faction system unavailable in this build.';
      return;
    }
    var draw = function (status) {
      panel.innerHTML = factionApi.renderPlayerCard(status, { showJoinActions: true });
      panel.querySelectorAll('.faction-join-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var gate = getIdentityApi();
          var runJoin = function () {
            factionApi.joinFaction(btn.dataset.faction)
              .then(function () { return factionApi.loadStatus(); })
              .then(draw)
              .catch(function (error) {
                var msg = (error && error.message) ? error.message : 'Faction join unavailable right now.';
                panel.insertAdjacentHTML('beforeend', '<div class=\"panel-note\">' + msg + '</div>');
              });
          };
          if (gate && typeof gate.requireLinkedAccount === 'function') gate.requireLinkedAccount(runJoin);
          else runJoin();
        });
      });
    };
    factionApi.loadStatus().then(draw).catch(function () {
      draw(factionApi.getCachedStatus() || { faction: 'unaligned', faction_xp: 0 });
    });
  }

  function buildRightPanel(meta) {
    sideRight.innerHTML = '';
    sideRight.appendChild(el('div', 'panel-title', 'Tips'));
    var ul = el('ul', 'tips-list');
    meta.tips.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    sideRight.appendChild(ul);
    sideRight.appendChild(el('div', 'panel-title', 'Your Best'));
    cachedRightBest = el('div', 'score-val', '0');
    cachedRightBest.id = 'overlay-best-right';
    sideRight.appendChild(cachedRightBest);
  }

  function updateScores() {
    var scoreNode = document.getElementById('score');
    var bestNode  = document.getElementById('best');
    var scoreText = scoreNode ? (scoreNode.textContent || '0') : '0';
    if (scoreNode && cachedLiveScore) cachedLiveScore.textContent = scoreText;
    var projected = getProjectedXp(scoreText);
    if (cachedLiveProjectedXp) cachedLiveProjectedXp.textContent = String(projected);
    if (inlineProjectedXpValue) inlineProjectedXpValue.textContent = String(projected);
    if (bestNode) {
      var b = bestNode.textContent || '0';
      if (cachedLiveBest)  cachedLiveBest.textContent  = b;
      if (cachedRightBest) cachedRightBest.textContent = b;
    }
  }

  function setSyncStatusText(text) {
    if (cachedSyncStatus) cachedSyncStatus.textContent = text;
    if (inlineSyncStatus) inlineSyncStatus.textContent = text;
  }

  function setSyncIdentityText(text) {
    if (cachedSyncIdentity) cachedSyncIdentity.textContent = text;
    if (inlineSyncIdentity) inlineSyncIdentity.textContent = text;
  }

  function setActionHtml(html) {
    if (cachedSyncActions) cachedSyncActions.innerHTML = html || '';
    if (inlineSyncActions) inlineSyncActions.innerHTML = html || '';
  }

  function setSyncVisualState(isGood) {
    var statusNodes = [cachedSyncStatus, inlineSyncStatus];
    statusNodes.forEach(function (node) {
      if (!node) return;
      node.classList.remove('sync-live', 'sync-error');
      node.classList.add(isGood ? 'sync-live' : 'sync-error');
      document.body.classList.toggle('sync-live', !!isGood);
      document.body.classList.toggle('sync-error', !isGood);
    });
  }

  function updateSyncSurfaceState(state, detail) {
    var d = detail || {};
    var gate = getIdentityApi();
    var sync = gate && typeof gate.getSyncState === 'function' ? gate.getSyncState() : null;
    var linked = !!(sync ? sync.linked : isLinkedReady());
    var baseIdentity = linked ? ('Linked as: ' + (d.identityLabel || getLinkedIdentityLabel())) : 'Telegram not linked \u2014 run /gklink';
    setSyncIdentityText(baseIdentity);
    lastSubmissionState = state;
    switch (state) {
      case 'linked_ready':
        setSyncVisualState(true);
        setSyncStatusText('Linked — ready. Auto-submit is active for this run.');
        dispatchUiState('moonboys:sync-state', { state: 'good', reason: state });
        setActionHtml('<a class="sync-action-link" href="/gkniftyheads-incubator.html">Open sync instructions</a>');
        return;
      case 'auto_submitting':
        setSyncVisualState(true);
        setSyncStatusText('Auto-submitting score...');
        setActionHtml('');
        return;
      case 'score_accepted':
        setSyncVisualState(true);
        setSyncStatusText('Score accepted for ranking.');
        setActionHtml('');
        return;
      case 'xp_awarded':
        setSyncVisualState(true);
        setSyncStatusText('Accepted score converted — XP awarded: ' + (d.awardedXp || 0) + (Number.isFinite(d.totalXp) ? (' · Total XP: ' + d.totalXp) : ''));
        setActionHtml('');
        if (Number(d.awardedXp) > 0 && cachedLiveProjectedXp) {
          cachedLiveProjectedXp.classList.add('xp-gain');
          animateNumericNode(cachedLiveProjectedXp, Number(d.awardedXp || 0), 900);
          pushMicroNotification('XP gained +' + Number(d.awardedXp || 0), 'success');
          setTimeout(function () { cachedLiveProjectedXp && cachedLiveProjectedXp.classList.remove('xp-gain'); }, 1100);
        }
        return;
      case 'accepted_no_xp':
      case 'rejected_no_xp':
        setSyncVisualState(true);
        setSyncStatusText('Accepted score recorded, but no XP was awarded.');
        setActionHtml('');
        return;
      case 'auth_expired':
        setSyncVisualState(false);
        setSyncStatusText('Sync expired — run /gklink again.');
        dispatchUiState('moonboys:sync-state', { state: 'bad', reason: state });
        setActionHtml('<a class="sync-action-link sync-action-link--danger" href="/gkniftyheads-incubator.html">Run /gklink</a>');
        return;
      case 'relink_required':
        setSyncVisualState(false);
        setSyncStatusText('Re-link required — run /gklink again to refresh sync.');
        setActionHtml('<a class="sync-action-link sync-action-link--danger" href="/gkniftyheads-incubator.html">Run /gklink</a>');
        return;
      case 'sync_error':
        setSyncVisualState(false);
        setSyncStatusText('Sync failed. Retry, then run /gklink again if needed.');
        setActionHtml('<a class="sync-action-link" href="/games/">Retry Sync</a> <a class="sync-action-link" href="/gkniftyheads-incubator.html">Open sync instructions</a>');
        return;
      case 'local_only':
      default:
        setSyncVisualState(false);
        setSyncStatusText('Unsynced play stays local to this browser. Run /gklink in Telegram to store XP and Block Topia progression server-side.');
        setActionHtml('<a class="sync-action-link sync-action-link--danger" href="/gkniftyheads-incubator.html">Run /gklink</a>');
    }
  }

  function bindSubmissionStatus() {
    document.addEventListener('arcade:submission-status', function (event) {
      var d = event && event.detail ? event.detail : {};
      updateSyncSurfaceState(d.state || '', d);
    });
    var _bus = window.MOONBOYS_EVENT_BUS;
    _bus.on('activity:event', function (d) {
      if (d._src === 'moonboys:micro-notify') {
        pushMicroNotification(d.message || '', d.tone || 'info');
      } else if (d._src === 'moonboys:score-updated') {
        if (!cachedLiveScore) return;
        cachedLiveScore.classList.add('score-updated');
        setTimeout(function () { cachedLiveScore && cachedLiveScore.classList.remove('score-updated'); }, 850);
        pulseStateClass('score-updated', 900);
      }
    });
    _bus.on('xp:update', function (d) {
      if (Number(d.amount) > 0) {
        pushMicroNotification('XP gained +' + Number(d.amount), 'success');
        pulseStateClass('xp-gain', 1050);
      }
    });
    _bus.on('faction:update', function (d) {
      if (cachedFactionPanel) {
        cachedFactionPanel.classList.add('faction-boost');
        setTimeout(function () { cachedFactionPanel && cachedFactionPanel.classList.remove('faction-boost'); }, 1250);
      }
      pulseStateClass('faction-boost', 1200);
      if (Number(d.amount) > 0) pushMicroNotification('Faction influence +' + Number(d.amount), 'success');
    });
    _bus.on('sync:state', function (d) {
      var bad = d.state === 'bad' || d.state === 'error';
      document.body.classList.toggle('sync-error', bad);
      document.body.classList.toggle('sync-live', !bad);
    });
    _bus.on('world:state', function (d) {
      var conflictActive = !!d.conflictActive;
      document.body.classList.toggle('conflict-active', conflictActive);
      if (d.conflictNearby) pulseStateClass('conflict-nearby', Number(d.durationMs) || 2200);
    });

    document.addEventListener('arcade-run-game-over', function () {
      if (isLinkedReady()) updateSyncSurfaceState('auto_submitting', {});
      else updateSyncSurfaceState('local_only', {});
    });
  }

  /* ── Button state sync ───────────────────────────────────────────── */

  // The games toggle a `paused` variable internally but don't change #pauseBtn text.
  // We track pause state locally in the overlay.
  var _isPaused = false;

  function getInvadersOverlayState() {
    if (typeof window.__invadersOverlayStateHook !== 'function') return null;
    try {
      var state = window.__invadersOverlayStateHook();
      return state && typeof state === 'object' ? state : null;
    } catch (_) {
      return null;
    }
  }

  function syncPauseBtn() {
    var icon = btnPause.querySelector('.btn-icon');
    var lbl  = btnPause.querySelector('.btn-label');
    if (_isPaused) {
      btnPause.classList.add('paused');
      if (icon) icon.textContent = '▶';
      if (lbl)  lbl.textContent  = ' Resume';
    } else {
      btnPause.classList.remove('paused');
      if (icon) icon.textContent = '⏸';
      if (lbl)  lbl.textContent  = ' Pause';
    }
  }

  function syncFSBtn() {
    var inFS = !!document.fullscreenElement;
    var icon = btnFS.querySelector('.btn-icon');
    var lbl  = btnFS.querySelector('.btn-label');
    if (inFS) {
      if (icon) icon.textContent = '⊠';
      if (lbl)  lbl.textContent  = ' Exit FS';
    } else {
      if (icon) icon.textContent = '⛶';
      if (lbl)  lbl.textContent  = ' FS';
    }
  }

  document.addEventListener('fullscreenchange', syncFSBtn);

  function triggerGameStart() {
    if (!isOpen) return;
    if (btnStart.disabled) return;
    // HexGL (and any game that exposes __hexglStartHook) wires its onStart()
    // function directly so we bypass the DOM click path entirely — no event
    // listener chain, no stopImmediatePropagation dependency, no timing race.
    // All other games fall back to the original .click() approach.
    if (typeof window.__hexglStartHook === 'function') {
      window.__hexglStartHook();
    } else {
      var gameStartBtn = document.getElementById('startBtn');
      if (!gameStartBtn || gameStartBtn.disabled) return;
      gameStartBtn.click();
    }
    _gameStarted = true;
    _isPaused = false;
    syncPauseBtn();
    document.dispatchEvent(new CustomEvent('arcade-run-start', {
      detail: { startedAt: Date.now() }
    }));
  }

  /* ── Open ────────────────────────────────────────────────────────── */

  function openOverlay() {
    if (isOpen) return;
    isOpen = true;

    var meta = detectMeta();

    // Update ctrl bar label
    gameLabel.textContent = meta.label;
    gameLabel.style.color = meta.color;
    btnStart.style.display = hideStartControl ? 'none' : '';
    btnPause.style.display = hidePauseControl ? 'none' : '';
    if (manualOverlayStart) {
      btnStart.setAttribute('aria-label', 'Begin tracked run');
      var startIcon = btnStart.querySelector('.btn-icon');
      var startLabel = btnStart.querySelector('.btn-label');
      if (startIcon) startIcon.textContent = '🏁';
      if (startLabel) startLabel.textContent = ' Begin Run';
    }

    // Build side panels and touch controls
    buildLeftPanel(meta);
    buildRightPanel(meta);
    buildTouchPad(meta);

    // For BTQM, move only the inner game area — not the whole game-card — to avoid
    // a nested "box inside a box" layout.  All other games use game-card as before.
    var btqmArea = document.querySelector('.btqm-game-area');
    stageTarget = btqmArea || gameCard;

    // Remember where the target element lives so we can restore it on close.
    origParent      = stageTarget.parentNode;
    origNextSibling = stageTarget.nextSibling;

    // Ensure every game canvas has an aspect-ratio so CSS max-height scaling
    // works correctly (canvas elements without CSS aspect-ratio don't shrink
    // automatically — e.g. Tetris sets canvas.width/height via JS).
    var canvases = stageTarget.querySelectorAll('canvas');
    [].forEach.call(canvases, function (cv) {
      var computedRatio = getComputedStyle(cv).aspectRatio;
      var hasRatio = computedRatio && computedRatio !== 'auto';
      if (!hasRatio && cv.width && cv.height) {
        cv.style.setProperty('aspect-ratio', cv.width + ' / ' + cv.height);
      }
    });

    // Move the target element into the overlay stage.
    stage.appendChild(stageTarget);

    // Show overlay.
    overlay.classList.add('active');
    document.body.classList.add('overlay-open');

    // Fire a resize event so Phaser (and any other canvas-scaling logic) can
    // recalculate dimensions against the new fullscreen container.
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 150);

    // Start live score updater.
    scoreInterval = setInterval(updateScores, 500);
    updateScores();

    // Reset pause tracking when opening.
    _isPaused = false;
    syncPauseBtn();
    syncFSBtn();
    syncMuteBtn();

    // Move focus to exit button for keyboard users.
    btnExit.focus();

    // Attempt browser Fullscreen API; silently ignore if denied (iOS Safari, etc.).
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {});
    }
    document.dispatchEvent(new CustomEvent('arcade-overlay-open', {
      detail: { isOpen: true }
    }));
  }

  /* ── Close ───────────────────────────────────────────────────────── */

  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;
    _gameStarted = false; // reset so Space can start the game again next time the overlay opens

    // Notify game modules that the overlay is closing (e.g. to play an exit sound).
    document.dispatchEvent(new CustomEvent('arcade-overlay-exit'));

    // Stop live score updater.
    if (scoreInterval) { clearInterval(scoreInterval); scoreInterval = null; }

    // Pause the game if it's actively running before closing.
    // Only pause if we haven't already paused via the overlay btn.
    var gamePauseBtn = document.getElementById('pauseBtn');
    var invadersState = getInvadersOverlayState();
    var isActivelyRunning = invadersState ? (invadersState.running && !invadersState.paused && !invadersState.gameOver) : !_isPaused;
    if (gamePauseBtn && isActivelyRunning) {
      // Clicking pauseBtn when game is running pauses it; if game isn't running
      // the handler is a no-op (all games check `if (running)`), so safe to call.
      gamePauseBtn.click();
      _isPaused = true;
      syncPauseBtn();
      document.dispatchEvent(new CustomEvent('arcade-pause-change', {
        detail: { paused: true }
      }));
    }

    // Leave browser fullscreen if active.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }

    // Restore the moved element to its original location in the page.
    if (origParent && stageTarget) {
      origParent.insertBefore(stageTarget, origNextSibling);
      origParent      = null;
      origNextSibling = null;
      stageTarget     = null;
    }

    overlay.classList.remove('active');
    document.body.classList.remove('overlay-open');

    // Fire a resize event so Phaser restores its in-page sizing.
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 150);

    // Return focus to the start button.
    startBtn.focus();
    document.dispatchEvent(new CustomEvent('arcade-overlay-close', {
      detail: { isOpen: false }
    }));
  }

  /* ── Event wiring ────────────────────────────────────────────────── */

  // Use capture phase so the overlay opens *before* the game's own onclick
  // handler fires (the game's onclick is a property set after this script
  // runs, so it fires in bubble phase after our capture listener).
  // When opening the overlay (isOpen is false), stop event propagation so the
  // game does NOT auto-start — the player must press START inside the overlay.
  // stopImmediatePropagation() is used (rather than stopPropagation()) because
  // the game's startBtn.onclick is registered on the same element; stopPropagation
  // only prevents bubbling to parent elements and would not prevent the game's
  // own onclick from firing.  stopImmediatePropagation() prevents all remaining
  // listeners on this element (both capture and bubble) from running.
  // When already open (isOpen is true), allow propagation so the game's own
  // startBtn handler fires normally (called by the overlay ▶ Start button).
  startBtn.addEventListener('click', function (e) {
    if (!isOpen) {
      openOverlay();
      e.stopImmediatePropagation();
      if (manualOverlayStart && typeof window.__hexglOverlayOpenHook === 'function') {
        window.__hexglOverlayOpenHook();
      } else if (autoStartOnOpen || singleStartFlow) {
        // Use a short delay so the overlay DOM is fully visible and the
        // game's click handler is ready before we programmatically click.
        setTimeout(function () {
          triggerGameStart();
        }, 50);
      }
    } else if (manualOverlayStart) {
      e.stopImmediatePropagation();
    }
  }, true);

  // Also reset pause tracking if Start is clicked while already in overlay
  // (the game handler resets paused=false internally on start).
  startBtn.addEventListener('click', function () {
    if (isOpen) { _isPaused = false; syncPauseBtn(); }
  });

  btnExit.addEventListener('click', closeOverlay);

  // START button in the overlay ctrl bar: triggers the game's own startBtn
  // which is now inside the overlay stage.  Keyboard/touch input is ignored by
  // all games until they are running, so this is the required first deliberate
  // action before gameplay begins.
  btnStart.addEventListener('click', function () {
    triggerGameStart();
  });

  btnFS.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {});
    }
  });

  btnPause.addEventListener('click', function () {
    // Skip pause logic entirely when the pause control is hidden (e.g. HexGL has
    // no #pauseBtn and the overlay button is not shown — do nothing).
    if (hidePauseControl) return;
    var gamePauseBtn = document.getElementById('pauseBtn');
    if (gamePauseBtn) {
      gamePauseBtn.click();
      var overlayState = getInvadersOverlayState();
      if (overlayState) {
        _isPaused = !!overlayState.paused;
      } else {
        _isPaused = !_isPaused;
      }
      syncPauseBtn();
      document.dispatchEvent(new CustomEvent('arcade-pause-change', {
        detail: { paused: _isPaused }
      }));
    }
  });

  btnReset.addEventListener('click', function () {
    var gameResetBtn = document.getElementById('resetBtn');
    if (gameResetBtn) {
      gameResetBtn.click();
      // After reset, game is no longer paused.
      _gameStarted = false;
      _isPaused = false;
      syncPauseBtn();
      document.dispatchEvent(new CustomEvent('arcade-run-reset', {
        detail: { resetAt: Date.now() }
      }));
    }
  });

  btnMute.addEventListener('click', function () {
    var audio = getArcadeAudio();
    var nextMuted = !getMutedState();
    if (audio && typeof audio.setMuted === 'function') {
      audio.setMuted(nextMuted);
    } else {
      window._arcadeMuted = nextMuted;
      document.dispatchEvent(new CustomEvent('arcade-mute-change', {
        detail: { muted: nextMuted }
      }));
    }
    syncMuteBtn();
  });

  if (!window.__arcadeMuteSyncBound) {
    document.addEventListener('arcade-mute-change', syncMuteBtn);
    window.__arcadeMuteSyncBound = true;
  }
  syncMuteBtn();
  ensureInlineProjectionHud();
  ensureInlineSyncNote();
  bindSubmissionStatus();
  updateSyncSurfaceState(isLinkedReady() ? 'linked_ready' : 'local_only', {});

  // Esc key closes the overlay.
  // Enter / Space trigger the overlay ▶ Start button when the overlay is open
  // but the game has not yet started (running is false on all games at that point).
  // We check the game's own running flag via a DOM attribute rather than a shared
  // variable because each game owns its state internally.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      closeOverlay();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && isOpen) {
      // Only fire if the currently focused element is NOT a game control input
      // (e.g. text input in Crystal Quest) to avoid double-firing.
      var focused = document.activeElement;
      var tag = focused ? focused.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Trigger the overlay START button if the game has not yet been started
      // in this overlay session.  Using _gameStarted (set when btnStart is clicked)
      // instead of window.running because game modules use function-scoped `running`
      // variables (not window.running), so window.running is always undefined/falsy.
      // Without this guard, every Space keypress would re-trigger startBtn and
      // rebuild the invader formation (or reset any other game mid-play).
      var gameStartBtn = document.getElementById('startBtn');
      if (gameStartBtn && !_gameStarted) {
        e.preventDefault();
        triggerGameStart();
      }
    }
  });

  // Tap / click on the dark backdrop (outside .overlay-body) closes overlay.
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeOverlay();
  });

  // If the browser's own fullscreen is dismissed (e.g. by pressing Esc),
  // keep the overlay open so gameplay isn't interrupted.
}());
