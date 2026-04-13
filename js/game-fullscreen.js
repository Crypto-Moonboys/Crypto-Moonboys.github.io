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

  // Only activate on pages that have both a Start button and a .game-card.
  if (!startBtn || !gameCard) return;

  /* ── Game metadata ───────────────────────────────────────────────── */

  var GAME_META = {
    snakeCanvas: {
      label: '🐍 SnakeRun', color: '#2ec5ff', touchScheme: 'dpad',
      controls: ['↑↓←→ / WASD move', '+10 pts per food'],
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
      tips: ['Plan 2 pieces ahead', 'I-piece for Tetris', 'Hard drop = bonus pts']
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
    btn.innerHTML =
      '<span class="btn-icon">' + icon + '</span>' +
      '<span class="btn-label"> ' + labelText + '</span>';
    return btn;
  }

  var btnFS    = makeCtrlBtn('overlay-btn-fs',    'Toggle fullscreen', '⛶', 'FS');
  var btnPause = makeCtrlBtn('overlay-btn-pause', 'Pause/Resume',      '⏸', 'Pause');
  var btnReset = makeCtrlBtn('overlay-btn-reset', 'Reset game',        '↺', 'Reset');
  var btnMute  = makeCtrlBtn('overlay-btn-mute',  'Mute/Unmute',       '🔊', 'Mute');
  var btnExit  = makeCtrlBtn('overlay-btn-exit',  'Exit fullscreen',   '✕', 'Exit');

  ctrlBar.appendChild(gameLabel);
  ctrlBar.appendChild(btnFS);
  ctrlBar.appendChild(btnPause);
  ctrlBar.appendChild(btnReset);
  ctrlBar.appendChild(btnMute);
  ctrlBar.appendChild(btnExit);

  // Overlay body (side panels + stage)
  var overlayBody = document.createElement('div');
  overlayBody.className = 'overlay-body';

  var sideLeft  = document.createElement('div');
  sideLeft.className = 'overlay-side overlay-side--left';

  var stage = document.createElement('div');
  stage.className = 'game-stage';

  var sideRight = document.createElement('div');
  sideRight.className = 'overlay-side overlay-side--right';

  overlayBody.appendChild(sideLeft);
  overlayBody.appendChild(stage);
  overlayBody.appendChild(sideRight);

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

  function showGameOverModal(score, opts) {
    opts = opts || {};
    var valEl = document.getElementById('game-over-score-val');
    if (valEl) valEl.textContent = (typeof score !== 'undefined' ? score : 0);
    _goRestart = opts.onRestart || null;
    _goExit    = opts.onExit    || null;
    gameOverModal.classList.add('active');
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

  var origParent      = null;
  var origNextSibling = null;
  var isOpen          = false;
  var scoreInterval   = null;
  // Cached overlay score display elements; set in buildLeftPanel / buildRightPanel.
  var cachedLiveScore = null;
  var cachedLiveBest  = null;
  var cachedRightBest = null;

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
    sideLeft.appendChild(el('div', 'panel-title', 'Best'));
    cachedLiveBest = el('div', 'score-val', '0');
    cachedLiveBest.id = 'overlay-live-best';
    sideLeft.appendChild(cachedLiveBest);
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
    if (scoreNode && cachedLiveScore) cachedLiveScore.textContent = scoreNode.textContent || '0';
    if (bestNode) {
      var b = bestNode.textContent || '0';
      if (cachedLiveBest)  cachedLiveBest.textContent  = b;
      if (cachedRightBest) cachedRightBest.textContent = b;
    }
  }

  /* ── Button state sync ───────────────────────────────────────────── */

  // The games toggle a `paused` variable internally but don't change #pauseBtn text.
  // We track pause state locally in the overlay.
  var _isPaused = false;

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

  /* ── Open ────────────────────────────────────────────────────────── */

  function openOverlay() {
    if (isOpen) return;
    isOpen = true;

    var meta = detectMeta();

    // Update ctrl bar label
    gameLabel.textContent = meta.label;
    gameLabel.style.color = meta.color;

    // Build side panels and touch controls
    buildLeftPanel(meta);
    buildRightPanel(meta);
    buildTouchPad(meta);

    // Remember where game-card lives so we can restore it on close.
    origParent      = gameCard.parentNode;
    origNextSibling = gameCard.nextSibling;

    // Ensure every game canvas has an aspect-ratio so CSS max-height scaling
    // works correctly (canvas elements without CSS aspect-ratio don't shrink
    // automatically — e.g. Tetris sets canvas.width/height via JS).
    var canvases = gameCard.querySelectorAll('canvas');
    [].forEach.call(canvases, function (cv) {
      var computedRatio = getComputedStyle(cv).aspectRatio;
      var hasRatio = computedRatio && computedRatio !== 'auto';
      if (!hasRatio && cv.width && cv.height) {
        cv.style.setProperty('aspect-ratio', cv.width + ' / ' + cv.height);
      }
    });

    // Move the whole game-card (HUD + canvas + buttons) into the overlay stage.
    stage.appendChild(gameCard);

    // Show overlay.
    overlay.classList.add('active');
    document.body.classList.add('overlay-open');

    // Start live score updater.
    scoreInterval = setInterval(updateScores, 500);
    updateScores();

    // Reset pause tracking when opening.
    _isPaused = false;
    syncPauseBtn();
    syncFSBtn();

    // Move focus to exit button for keyboard users.
    btnExit.focus();

    // Attempt browser Fullscreen API; silently ignore if denied (iOS Safari, etc.).
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {});
    }
  }

  /* ── Close ───────────────────────────────────────────────────────── */

  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;

    // Stop live score updater.
    if (scoreInterval) { clearInterval(scoreInterval); scoreInterval = null; }

    // Pause the game if it's actively running before closing.
    // Only pause if we haven't already paused via the overlay btn.
    var gamePauseBtn = document.getElementById('pauseBtn');
    if (gamePauseBtn && !_isPaused) {
      // Clicking pauseBtn when game is running pauses it; if game isn't running
      // the handler is a no-op (all games check `if (running)`), so safe to call.
      gamePauseBtn.click();
    }

    // Leave browser fullscreen if active.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }

    // Restore game-card to its original location in the page.
    if (origParent) {
      origParent.insertBefore(gameCard, origNextSibling);
      origParent      = null;
      origNextSibling = null;
    }

    overlay.classList.remove('active');
    document.body.classList.remove('overlay-open');

    // Return focus to the start button.
    startBtn.focus();
  }

  /* ── Event wiring ────────────────────────────────────────────────── */

  // Use capture phase so the overlay opens *before* the game's own onclick
  // handler fires (the game's onclick is a property set after this script
  // runs, so it fires in bubble phase after our capture listener).
  startBtn.addEventListener('click', openOverlay, true);

  // Also reset pause tracking if Start is clicked while already in overlay
  // (the game handler resets paused=false internally on start).
  startBtn.addEventListener('click', function () {
    if (isOpen) { _isPaused = false; syncPauseBtn(); }
  });

  btnExit.addEventListener('click', closeOverlay);

  btnFS.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {});
    }
  });

  btnPause.addEventListener('click', function () {
    var gamePauseBtn = document.getElementById('pauseBtn');
    if (gamePauseBtn) {
      gamePauseBtn.click();
      _isPaused = !_isPaused;
      syncPauseBtn();
    }
  });

  btnReset.addEventListener('click', function () {
    var gameResetBtn = document.getElementById('resetBtn');
    if (gameResetBtn) {
      gameResetBtn.click();
      // After reset, game is no longer paused.
      _isPaused = false;
      syncPauseBtn();
    }
  });

  btnMute.addEventListener('click', function () {
    // Stub: toggles a global flag that game modules can check. No audio system
    // is wired yet; games that support audio should check window._arcadeMuted.
    window._arcadeMuted = !window._arcadeMuted;
    var icon = btnMute.querySelector('.btn-icon');
    var lbl  = btnMute.querySelector('.btn-label');
    if (window._arcadeMuted) {
      if (icon) icon.textContent = '🔇';
      if (lbl)  lbl.textContent  = ' Unmute';
    } else {
      if (icon) icon.textContent = '🔊';
      if (lbl)  lbl.textContent  = ' Mute';
    }
  });

  // Esc key closes the overlay.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeOverlay();
  });

  // Tap / click on the dark backdrop (outside .overlay-body) closes overlay.
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeOverlay();
  });

  // If the browser's own fullscreen is dismissed (e.g. by pressing Esc),
  // keep the overlay open so gameplay isn't interrupted.
}());
