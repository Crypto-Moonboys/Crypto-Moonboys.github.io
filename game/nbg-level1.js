(function () {
  'use strict';

  var ASSETS = {
    player: 'assets/player/nbg-runner-sprite-sheet.svg',
    coin: 'assets/objects/xp-coin.svg',
    checkpoint: 'assets/objects/checkpoint.svg',
    finish: 'assets/objects/finish-flag.svg',
    sky: 'assets/world/london-sky-layer.svg',
    skyline: 'assets/world/london-skyline-layer.svg',
    wall: 'assets/world/graffiti-wall-layer.svg',
    street: 'assets/world/street-tiles.svg',
    rat: 'assets/enemies/london-rat.svg',
    pigeon: 'assets/enemies/pigeon.svg',
    bot: 'assets/enemies/graffiti-bot.svg'
  };
  var REQUIRED_ASSETS = Object.keys(ASSETS);

  var WIDTH = 480;
  var HEIGHT = 270;
  var WORLD_WIDTH = 2200;
  var FLOOR_Y = 214;
  var GRAVITY = 0.52;
  var FRICTION = 0.78;
  var RUN_ACCEL = 0.74;
  var MAX_SPEED = 4.2;
  var JUMP_VELOCITY = -11.4;
  var INVULN_TIME = 1050;
  var FRAME_W = 32;
  var FRAME_H = 32;

  var stateNames = ['idle', 'run', 'jump', 'spray', 'hit'];

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve({ image: image, src: src }); };
      image.onerror = function () { resolve({ image: null, src: src }); };
      image.src = src;
    });
  }

  function createRuntime(canvas, hud) {
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var keys = {};
    var touch = { left: false, right: false, jump: false, spray: false };
    var images = {};
    var assetStatus = {};
    var running = false;
    var complete = false;
    var lastTime = 0;
    var cameraX = 0;
    var checkpointX = 72;
    var finishBonusAwarded = false;
    var sprayTimer = 0;

    var player = {
      x: 64,
      y: FLOOR_Y - 38,
      w: 24,
      h: 34,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      anim: 'idle',
      frame: 0,
      frameTime: 0,
      health: 3,
      invuln: 0
    };

    var platforms = [
      { x: 360, y: 178, w: 150, h: 16 },
      { x: 720, y: 154, w: 132, h: 16 },
      { x: 1120, y: 176, w: 142, h: 16 },
      { x: 1510, y: 148, w: 180, h: 16 }
    ];

    var coins = [
      { x: 155, y: 176, r: 8, xp: 100, taken: false },
      { x: 270, y: 150, r: 8, xp: 100, taken: false },
      { x: 410, y: 140, r: 8, xp: 125, taken: false },
      { x: 520, y: 176, r: 8, xp: 100, taken: false },
      { x: 760, y: 116, r: 8, xp: 150, taken: false },
      { x: 890, y: 176, r: 8, xp: 100, taken: false },
      { x: 1080, y: 152, r: 8, xp: 125, taken: false },
      { x: 1180, y: 138, r: 8, xp: 150, taken: false },
      { x: 1335, y: 176, r: 8, xp: 100, taken: false },
      { x: 1580, y: 110, r: 8, xp: 175, taken: false },
      { x: 1740, y: 176, r: 8, xp: 125, taken: false },
      { x: 1940, y: 176, r: 8, xp: 200, taken: false }
    ];

    var enemies = [
      { type: 'rat', x: 600, y: FLOOR_Y - 20, w: 28, h: 18, vx: 1.1, min: 540, max: 690 },
      { type: 'pigeon', x: 1010, y: 128, w: 28, h: 22, vx: 1.35, min: 940, max: 1128, bob: 0 },
      { type: 'bot', x: 1455, y: FLOOR_Y - 38, w: 30, h: 38, vx: 0.85, min: 1390, max: 1550 }
    ];

    var checkpoint = { x: 1240, y: FLOOR_Y - 48, w: 30, h: 48, active: false };
    var finish = { x: 2050, y: FLOOR_Y - 62, w: 38, h: 62 };
    var xp = 0;

    function resetToCheckpoint() {
      player.x = checkpointX;
      player.y = FLOOR_Y - player.h;
      player.vx = 0;
      player.vy = 0;
      player.invuln = INVULN_TIME;
      player.anim = 'hit';
      sprayTimer = 0;
    }

    function onKey(e, down) {
      keys[e.code] = down;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyX'].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    }

    function handleInput() {
      var left = keys.ArrowLeft || keys.KeyA || touch.left;
      var right = keys.ArrowRight || keys.KeyD || touch.right;
      var jump = keys.Space || keys.ArrowUp || keys.KeyW || touch.jump;
      var spray = keys.KeyS || keys.KeyX || touch.spray;

      if (left) {
        player.vx -= RUN_ACCEL;
        player.facing = -1;
      }
      if (right) {
        player.vx += RUN_ACCEL;
        player.facing = 1;
      }
      if (!left && !right) {
        player.vx *= FRICTION;
      }
      player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

      if (jump && player.grounded) {
        player.vy = JUMP_VELOCITY;
        player.grounded = false;
      }

      if (spray && sprayTimer <= 0) {
        sprayTimer = 230;
      }
    }

    function resolveVerticalCollision(previousY) {
      var floor = { x: 0, y: FLOOR_Y, w: WORLD_WIDTH, h: 60 };
      var solids = [floor].concat(platforms);
      player.grounded = false;

      for (var i = 0; i < solids.length; i += 1) {
        var tile = solids[i];
        var wasAbove = previousY + player.h <= tile.y + 1;
        if (rectsOverlap(player, tile) && player.vy >= 0 && wasAbove) {
          player.y = tile.y - player.h;
          player.vy = 0;
          player.grounded = true;
        }
      }
    }

    function updatePlayer(dt) {
      handleInput();
      if (sprayTimer > 0) sprayTimer -= dt;
      if (player.invuln > 0) player.invuln -= dt;

      player.x += player.vx;
      player.x = clamp(player.x, 12, WORLD_WIDTH - player.w - 12);

      var previousY = player.y;
      player.vy += GRAVITY;
      player.y += player.vy;
      resolveVerticalCollision(previousY);

      if (player.y > HEIGHT + 80) {
        player.health = Math.max(1, player.health - 1);
        resetToCheckpoint();
      }

      if (sprayTimer > 0) {
        player.anim = 'spray';
      } else if (player.invuln > 0) {
        player.anim = 'hit';
      } else if (!player.grounded) {
        player.anim = 'jump';
      } else if (Math.abs(player.vx) > 0.42) {
        player.anim = 'run';
      } else {
        player.anim = 'idle';
      }

      player.frameTime += dt;
      if (player.frameTime > (player.anim === 'run' ? 88 : 145)) {
        player.frame = (player.frame + 1) % 4;
        player.frameTime = 0;
      }
    }

    function updateCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var coinRect = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
        if (rectsOverlap(player, coinRect)) {
          coin.taken = true;
          xp += coin.xp;
          window.dispatchEvent(new CustomEvent('nbg-xp-collected', { detail: { xp: xp, coin: coin } }));
        }
        coin.float = Math.sin((time + coin.x * 11) / 180) * 3;
      }
    }

    function updateEnemies(time) {
      for (var i = 0; i < enemies.length; i += 1) {
        var enemy = enemies[i];
        enemy.x += enemy.vx;
        if (enemy.x < enemy.min || enemy.x > enemy.max) enemy.vx *= -1;
        if (enemy.type === 'pigeon') enemy.bob = Math.sin(time / 180) * 9;

        var enemyRect = {
          x: enemy.x,
          y: enemy.y + (enemy.bob || 0),
          w: enemy.w,
          h: enemy.h
        };

        if (player.invuln <= 0 && rectsOverlap(player, enemyRect)) {
          player.health -= 1;
          player.vx = enemy.x > player.x ? -5.5 : 5.5;
          player.vy = -6.2;
          player.invuln = INVULN_TIME;
          player.anim = 'hit';
          window.dispatchEvent(new CustomEvent('nbg-player-hit', { detail: { health: player.health, enemy: enemy.type } }));
          if (player.health <= 0) {
            player.health = 3;
            xp = Math.max(0, xp - 150);
            resetToCheckpoint();
          }
        }
      }
    }

    function updateLevel() {
      if (!checkpoint.active && rectsOverlap(player, checkpoint)) {
        checkpoint.active = true;
        checkpointX = checkpoint.x;
        xp += 250;
        window.dispatchEvent(new CustomEvent('nbg-checkpoint', { detail: { xp: xp } }));
      }

      if (!complete && rectsOverlap(player, finish)) {
        complete = true;
        running = false;
        if (!finishBonusAwarded) {
          finishBonusAwarded = true;
          xp += 500 + coins.filter(function (coin) { return coin.taken; }).length * 25;
        }
        window.dispatchEvent(new CustomEvent('nbg-level-complete', {
          detail: {
            level: 'NBG London Graffiti Run - Level 1',
            xp: xp,
            coins: coins.filter(function (coin) { return coin.taken; }).length,
            leaderboardReady: true
          }
        }));
      }
    }

    function updateCamera() {
      cameraX = clamp(player.x - WIDTH * 0.42, 0, WORLD_WIDTH - WIDTH);
    }

    function updateHud() {
      var collected = coins.filter(function (coin) { return coin.taken; }).length;
      hud.xp.textContent = 'XP ' + xp;
      hud.coins.textContent = 'COINS ' + collected + '/' + coins.length;
      hud.health.textContent = 'HEALTH ' + player.health;
      hud.state.textContent = complete ? 'LEVEL COMPLETE' : checkpoint.active ? 'CHECKPOINT' : 'RUNNING';
    }

    function drawImageLayer(image, parallax, y, h, fallbackColor) {
      var offset = -cameraX * parallax;
      if (!image) {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, y, WIDTH, h);
        return;
      }
      var tileW = WIDTH;
      var start = Math.floor(offset % tileW) - tileW;
      for (var x = start; x < WIDTH + tileW; x += tileW) {
        ctx.drawImage(image, x, y, tileW, h);
      }
    }

    function assertRequiredAssetsLoaded() {
      var missing = REQUIRED_ASSETS.filter(function (key) {
        return !images[key];
      });
      if (missing.length) {
        throw new Error('NBG Level 1 missing required assets: ' + missing.map(function (key) {
          return key + ' (' + ASSETS[key] + ')';
        }).join(', '));
      }
    }

    function drawWorld() {
      drawImageLayer(images.sky, 0.08, 0, HEIGHT, '#171730');
      drawImageLayer(images.skyline, 0.22, 46, 102, '#18203a');
      drawImageLayer(images.wall, 0.58, 116, 88, '#2d2033');
      drawImageLayer(images.street, 1, FLOOR_Y, 56, '#303238');

      ctx.fillStyle = '#2b2932';
      for (var i = 0; i < platforms.length; i += 1) {
        var p = platforms[i];
        ctx.fillRect(Math.round(p.x - cameraX), p.y, p.w, p.h);
        ctx.fillStyle = '#59d8ff';
        ctx.fillRect(Math.round(p.x - cameraX), p.y, p.w, 3);
        ctx.fillStyle = '#2b2932';
      }
    }

    function drawCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var x = Math.round(coin.x - cameraX - 8);
        var y = Math.round(coin.y + (coin.float || 0) - 8);
        if (images.coin) {
          ctx.drawImage(images.coin, x, y, 16, 16);
        } else {
          ctx.fillStyle = '#ffd447';
          ctx.fillRect(x + 3, y, 10, 16);
        }
        ctx.fillStyle = 'rgba(255, 212, 71, 0.22)';
        ctx.fillRect(x - 2, y + 16 + Math.sin(time / 120) * 1, 20, 2);
      }
    }

    function drawEnemies() {
      for (var i = 0; i < enemies.length; i += 1) {
        var enemy = enemies[i];
        var image = images[enemy.type];
        var x = Math.round(enemy.x - cameraX);
        var y = Math.round(enemy.y + (enemy.bob || 0));
        if (image) {
          ctx.save();
          if (enemy.vx < 0) {
            ctx.translate(x + enemy.w, y);
            ctx.scale(-1, 1);
            ctx.drawImage(image, 0, 0, enemy.w, enemy.h);
          } else {
            ctx.drawImage(image, x, y, enemy.w, enemy.h);
          }
          ctx.restore();
        } else {
          ctx.fillStyle = '#ff315f';
          ctx.fillRect(x, y, enemy.w, enemy.h);
        }
      }
    }

    function drawObjects() {
      var checkX = Math.round(checkpoint.x - cameraX);
      if (images.checkpoint) ctx.drawImage(images.checkpoint, checkX, checkpoint.y, checkpoint.w, checkpoint.h);
      if (checkpoint.active) {
        ctx.fillStyle = '#7cff82';
        ctx.fillRect(checkX + 12, checkpoint.y + 8, 10, 8);
      }

      if (images.finish) {
        ctx.drawImage(images.finish, Math.round(finish.x - cameraX), finish.y, finish.w, finish.h);
      }
    }

    function drawPlayer() {
      var row = Math.max(0, stateNames.indexOf(player.anim));
      var col = player.frame % 4;
      var x = Math.round(player.x - cameraX);
      var y = Math.round(player.y);
      var flash = player.invuln > 0 && Math.floor(player.invuln / 90) % 2 === 0;
      if (flash) return;

      if (!images.player) {
        ctx.fillStyle = '#ff315f';
        ctx.fillRect(x, y, player.w, player.h);
        return;
      }

      ctx.save();
      if (player.facing < 0) {
        ctx.translate(x + player.w + 4, y - 2);
        ctx.scale(-1, 1);
        ctx.drawImage(images.player, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, 0, 0, 32, 40);
      } else {
        ctx.drawImage(images.player, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, x - 4, y - 2, 32, 40);
      }
      ctx.restore();
    }

    function drawOverlay() {
      if (!complete) return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#ffd447';
      ctx.font = '900 24px Courier New';
      ctx.fillText('LEVEL COMPLETE', 122, 112);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 13px Courier New';
      ctx.fillText('LEADERBOARD XP READY: ' + xp, 130, 138);
      ctx.fillText('REFRESH TO RUN AGAIN', 154, 160);
    }

    function render(time) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawWorld();
      drawCoins(time);
      drawObjects();
      drawEnemies();
      drawPlayer();
      drawOverlay();
    }

    function tick(time) {
      if (!lastTime) lastTime = time;
      var dt = Math.min(33, time - lastTime);
      lastTime = time;

      if (running) {
        updatePlayer(dt);
        updateCoins(time);
        updateEnemies(time);
        updateLevel();
        updateCamera();
      }
      updateHud();
      render(time);
      if (running || complete) requestAnimationFrame(tick);
    }

    function exposeTestState() {
      window.NBGLevel1State = {
        get player() { return player; },
        get coins() { return coins; },
        get enemies() { return enemies; },
        get xp() { return xp; },
        get complete() { return complete; },
        get running() { return running; },
        get cameraX() { return cameraX; },
        get assetStatus() { return assetStatus; },
        get requiredAssets() { return REQUIRED_ASSETS.slice(); }
      };
    }

    function start() {
      if (running) return Promise.resolve(window.NBGLevel1State);
      return Promise.all(Object.keys(ASSETS).map(function (key) {
        return loadImage(ASSETS[key]).then(function (result) {
          images[key] = result.image;
          assetStatus[key] = {
            src: result.src,
            loaded: !!result.image
          };
        });
      })).then(function () {
        assertRequiredAssetsLoaded();
        exposeTestState();
        running = true;
        complete = false;
        lastTime = 0;
        window.dispatchEvent(new CustomEvent('nbg-level-started', { detail: { level: 'london-level-1' } }));
        requestAnimationFrame(tick);
        return window.NBGLevel1State;
      });
    }

    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });

    return {
      start: start,
      getState: function () { return window.NBGLevel1State; },
      setTouchControl: function (control, active) {
        if (Object.prototype.hasOwnProperty.call(touch, control)) {
          touch[control] = active;
        }
      }
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('game');
    var title = document.getElementById('title-screen');
    var stage = document.getElementById('game-stage');
    var start = document.getElementById('start');
    var hud = {
      xp: document.getElementById('hud-xp'),
      coins: document.getElementById('hud-coins'),
      health: document.getElementById('hud-health'),
      state: document.getElementById('hud-state')
    };

    var runtime = createRuntime(canvas, hud);
    window.NBGLevel1Runtime = runtime;

    function setLaunchError(error) {
      hud.state.textContent = 'ASSET ERROR';
      window.NBGLevel1StartupError = error && error.message ? error.message : String(error);
      window.dispatchEvent(new CustomEvent('nbg-level-start-failed', {
        detail: { message: window.NBGLevel1StartupError }
      }));
      throw error;
    }

    start.addEventListener('click', function () {
      title.hidden = true;
      stage.classList.add('is-active');
      runtime.start().catch(setLaunchError);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-control]'), function (button) {
      var control = button.getAttribute('data-control');
      function setActive(active) {
        runtime.setTouchControl(control, active);
        button.classList.toggle('is-pressed', active);
      }
      button.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (button.setPointerCapture) {
          try {
            button.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic validation events and some mobile browsers can omit capture-capable pointer ids.
          }
        }
        setActive(true);
      });
      button.addEventListener('pointerup', function (event) {
        event.preventDefault();
        setActive(false);
      });
      button.addEventListener('pointercancel', function () { setActive(false); });
      button.addEventListener('pointerleave', function () { setActive(false); });
    });
  });
})();
