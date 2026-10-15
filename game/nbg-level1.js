(function () {
  'use strict';

  var ASSET_ROOT = '/game/assets/';
  var ASSET_MANIFEST = ASSET_ROOT + 'asset-manifest.json';
  var WIDTH = 480;
  var HEIGHT = 270;
  var WORLD_WIDTH = 22000;
  var FLOOR_Y = 214;
  var TARGET_FRAME_MS = 1000 / 60;
  var WAITING_HUD_TEXT = 'MOVE TO START';
  var GRAVITY = 0.52;
  var FRICTION = 0.78;
  var RUN_ACCEL = 0.74;
  var MAX_SPEED = 4.2;
  var JUMP_VELOCITY = -11.4;
  var DOUBLE_JUMP_VELOCITY = -12.8;
  var DOUBLE_JUMP_SIDE_SPEED = 5.4;
  var BOT_SHEET_COLUMNS = 5;
  var BOT_SHEET_ROWS = 5;
  var BOT_SHEET_FRAMES = 25;
  var BOT_RENDER_WIDTH = 70;
  var BOT_RENDER_HEIGHT = 52;
  var SPEEDRUN_PAR_MS = 180000;
  var SPEEDRUN_TIME_BONUS_PER_SECOND = 35;
  var COIN_COMBO_WINDOW_MS = 2400;
  var MAX_COIN_COMBO = 4;
  var COURSE_SECTIONS = 18;
  var INVULN_TIME = 1050;
  var SKYLINE_PARALLAX = 0.22;
  var SKYLINE_Y = 40;
  var SKYLINE_WIDTH = 480;
  var SKYLINE_HEIGHT = 160;
  var STREET_BAND_HEIGHT = 28;
  var STREET_Y = HEIGHT - STREET_BAND_HEIGHT;
  var PLAYER_VISUAL_FOOT_Y = STREET_Y + 10;
  var PLAYER_VISUAL_OFFSET_Y = PLAYER_VISUAL_FOOT_Y - FLOOR_Y;
  var FOREGROUND_VISUAL_OFFSET_Y = PLAYER_VISUAL_OFFSET_Y;
  var CAMERA_JUMP_FOLLOW = 0.95;
  var CAMERA_JUMP_MAX_Y = 42;
  var CAMERA_JUMP_EASE = 0.28;
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

  function loadJson(src) {
    return fetch(src).then(function (response) {
      if (!response.ok) throw new Error('Unable to load JSON asset: ' + src);
      return response.json();
    });
  }

  function resolveAssetPath(assetPath) {
    if (!assetPath) return assetPath;
    if (/^(?:https?:)?\/\//.test(assetPath) || assetPath.charAt(0) === '/') return assetPath;
    return assetPath.indexOf('assets/') === 0 ? '/game/' + assetPath : ASSET_ROOT + assetPath;
  }

  function buildRuntimeAssetMap(manifest) {
    var layerKeyMap = {
      sky: 'sky',
      'london-skyline': 'skyline',
      'graffiti-wall': 'wall',
      street: 'street'
    };
    var assets = {};
    var layerNames = (manifest.world && manifest.world.layerNames) || [];
    var layers = (manifest.world && manifest.world.layers) || [];

    layerNames.forEach(function (name, index) {
      var key = layerKeyMap[name] || name;
      if (Array.isArray(layers[index]) && key === 'skyline') {
        layers[index].forEach(function (layer, layerIndex) {
          assets['skyline' + (layerIndex + 1)] = resolveAssetPath(layer);
        });
      } else if (layers[index]) {
        assets[key] = resolveAssetPath(layers[index]);
      }
    });

    if (manifest.objects) {
      if (manifest.objects.xpCoin) assets.coin = resolveAssetPath(manifest.objects.xpCoin);
      if (manifest.objects.checkpoint) assets.checkpoint = resolveAssetPath(manifest.objects.checkpoint);
      if (manifest.objects.finishFlag) assets.finish = resolveAssetPath(manifest.objects.finishFlag);
    }

    if (manifest.enemies) {
      if (manifest.enemies.londonRat) assets.rat = resolveAssetPath(manifest.enemies.londonRat);
      if (manifest.enemies.pigeon) assets.pigeon = resolveAssetPath(manifest.enemies.pigeon);
      if (manifest.enemies.graffitiBot) assets.bot = resolveAssetPath(manifest.enemies.graffitiBot);
      if (manifest.enemies.graffitiBotKick) assets.botKick = resolveAssetPath(manifest.enemies.graffitiBotKick);
      if (manifest.enemies.graffitiBotHurt) assets.botHurt = resolveAssetPath(manifest.enemies.graffitiBotHurt);
    }

    return assets;
  }

  function getAnimationFrameMetadata(animation) {
    if (!animation) {
      return {
        sourceWidth: 1,
        sourceHeight: 1,
        renderWidth: 1,
        renderHeight: 1,
        renderOffsetY: 0,
        count: 1,
        columns: 1
      };
    }

    var sourceWidth = animation.sourceFrameWidth || animation.frameWidth || 32;
    var sourceHeight = animation.sourceFrameHeight || animation.frameHeight || 48;
    return {
      sourceWidth: sourceWidth,
      sourceHeight: sourceHeight,
      renderWidth: animation.renderWidth || animation.frameWidth || 40,
      renderHeight: animation.renderHeight || animation.frameHeight || 48,
      renderOffsetY: typeof animation.renderOffsetY === 'number' ? animation.renderOffsetY : 0,
      count: Math.max(1, animation.frames || animation.frameCount || 1),
      columns: animation.columns || Math.max(1, Math.floor(((animation.image && animation.image.naturalWidth) || sourceWidth) / sourceWidth))
    };
  }

  function createRuntime(canvas, hud) {
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var keys = {};
    var pendingJumpPresses = 0;
    var jumpsUsed = 0;
    var touch = { left: false, right: false, jump: false, spray: false };
    var images = {};
    var playerAnimations = {};
    var assetStatus = {};
    var requiredAssets = [];
    var assetsLoaded = false;
    var gameVisible = false;
    var waitingForFirstInput = false;
    var running = false;
    var initPromise = null;
    var pendingInitialInput = null;
    var initialInputReplay = null;
    var completionAnimationActive = false;
    var complete = false;
    var lastTime = 0;
    var cameraX = 0;
    var cameraY = 0;
    var checkpointX = 72;
    var finishBonusAwarded = false;
    var runElapsedMs = 0;
    var speedrunBonusXp = 0;
    var comboCount = 0;
    var comboExpiresAt = 0;
    var bestTimeMs = null;
    var bestXp = 0;
    try {
      var savedBestTime = Number(window.localStorage.getItem('nbg-london-best-run-ms'));
      if (savedBestTime > 0 && Number.isFinite(savedBestTime)) bestTimeMs = savedBestTime;
      var savedBestXp = Number(window.localStorage.getItem('nbg-london-best-xp'));
      if (savedBestXp > 0 && Number.isFinite(savedBestXp)) bestXp = savedBestXp;
    } catch (error) {
      // Private browsing may block local storage; speedrun remains playable.
    }
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

    function resolveAnimationName(name) {
      var stateMap = {
        hit: 'hurt',
        tag: 'spray',
        celebrate: 'victory'
      };
      return stateMap[name] || name || 'idle';
    }

    function getAnimation(name) {
      return playerAnimations[resolveAnimationName(name)] || playerAnimations.idle || null;
    }

    function setPlayerAnimation(name) {
      var next = resolveAnimationName(name);
      if (player.anim !== next) {
        player.anim = next;
        player.frame = 0;
        player.frameTime = 0;
      }
    }

    function advancePlayerAnimation(dt, loop) {
      var animation = getAnimation(player.anim);
      var frameCount = getAnimationFrameMetadata(animation).count;
      var frameMs = animation ? animation.frameMs : 145;
      if (frameCount <= 1) return true;

      player.frameTime += dt;
      while (player.frameTime >= frameMs) {
        if (!loop && player.frame >= frameCount - 1) {
          player.frameTime = 0;
          return true;
        }

        player.frame = loop ? (player.frame + 1) % frameCount : Math.min(player.frame + 1, frameCount - 1);
        player.frameTime -= frameMs;
      }

      return !loop && player.frame >= frameCount - 1;
    }

    var platforms = [
      { x: 360, y: 178, w: 150, h: 16 },
      { x: 720, y: 154, w: 132, h: 16 },
      { x: 1120, y: 176, w: 142, h: 16 },
      { x: 1510, y: 148, w: 180, h: 16 }
    ];

    var secretNotificationUntil = 0;
    var secretNotificationText = '';
    var secretCoins = [
      { x: 405, y: -92, r: 8, xp: 500, taken: false, secret: true },
      { x: 485, y: -105, r: 8, xp: 500, taken: false, secret: true },
      { x: 755, y: -102, r: 8, xp: 500, taken: false, secret: true },
      { x: 825, y: -116, r: 8, xp: 500, taken: false, secret: true },
      { x: 1180, y: -99, r: 8, xp: 500, taken: false, secret: true },
      { x: 1580, y: -112, r: 8, xp: 500, taken: false, secret: true }
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
    var hazards = [];
    var courseCheckpoints = [];

    // Build the playable remainder of the 22,000px course after the handcrafted opening.
    // Stable deterministic placement: no random or potentially impossible gaps.
    for (var section = 0; section < COURSE_SECTIONS; section += 1) {
      var startX = 2200 + section * 1050;
      var ledges = [
        { x: startX + 95, y: 174 - section % 3 * 10, w: 150, h: 16 },
        { x: startX + 350, y: 122 - section % 2 * 16, w: 130, h: 16 },
        { x: startX + 590, y: 157 - section % 4 * 8, w: 145, h: 16 },
        { x: startX + 820, y: 116 + section % 3 * 8, w: 110, h: 16 }
      ];
      ledges.forEach(function (ledge) {
        platforms.push(ledge);
        for (var j = 0; j < 3; j += 1) {
          coins.push({ x: ledge.x + 30 + j * 30, y: ledge.y - 24 - j % 2 * 8, r: 8,
            xp: 100 + section % 4 * 25, taken: false });
        }
      });
      [45, 520, 980].forEach(function (dx) {
        coins.push({ x: startX + dx, y: 176, r: 8, xp: 100 + section % 3 * 25, taken: false });
      });

      hazards.push({ x: startX + 275, y: FLOOR_Y - 18, w: 34, h: 18, type: 'cones' });
      hazards.push({ x: startX + 745, y: FLOOR_Y - 20, w: 46, h: 20, type: 'spikes' });
      if (section >= 8 && section % 3 === 0) {
        hazards.push({ x: startX + 1000, y: FLOOR_Y - 24, w: 34, h: 24, type: 'barrier' });
      }
      enemies.push({ type: 'rat', x: startX + 435, y: FLOOR_Y - 20,
        w: 28, h: 18, vx: 1.1 + section * 0.025, min: startX + 395, max: startX + 535 });
      if (section % 2 === 1) {
        enemies.push({ type: 'bot', x: startX + 870, y: FLOOR_Y - 38,
          w: 30, h: 38, vx: 0.85 + section * 0.035, min: startX + 800, max: startX + 960 });
      }
      if (section % 3 === 2) {
        enemies.push({ type: 'pigeon', x: startX + 615, y: 110,
          w: 28, h: 22, vx: 1.35, min: startX + 575, max: startX + 720, bob: 0 });
      }
      if (section === 3 || section === 7 || section === 11 || section === 15) {
        courseCheckpoints.push({ x: startX + 965, y: FLOOR_Y - 48, w: 30, h: 48, active: false });
      }
    }

    var initialEnemies = enemies.map(function (enemy) {
      return Object.assign({}, enemy);
    });

    var checkpoint = { x: 1240, y: FLOOR_Y - 48, w: 30, h: 48, active: false };
    var finish = { x: WORLD_WIDTH - 150, y: FLOOR_Y - 62, w: 38, h: 62 };
    var xp = 0;

    function resetToCheckpoint() {
      player.x = checkpointX;
      player.y = FLOOR_Y - player.h;
      player.vx = 0;
      player.vy = 0;
      jumpsUsed = 0;
      player.invuln = INVULN_TIME;
      setPlayerAnimation('hurt');
      sprayTimer = 0;
    }

    var startInputCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyX'];

    function isStartInputCode(code) {
      return startInputCodes.indexOf(code) >= 0;
    }

    function getControlForCode(code) {
      if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
      if (code === 'ArrowRight' || code === 'KeyD') return 'right';
      if (code === 'ArrowUp' || code === 'Space' || code === 'KeyW') return 'jump';
      if (code === 'KeyS' || code === 'KeyX') return 'spray';
      return '';
    }

    function queueInitialInput(control) {
      if (assetsLoaded || running || !control) return;
      pendingInitialInput = { control: control };
    }

    function onKey(e, down) {
      var wasDown = !!keys[e.code];
      keys[e.code] = down;
      if (down && !wasDown && getControlForCode(e.code) === 'jump') {
        pendingJumpPresses = Math.min(2, pendingJumpPresses + 1);
      }
      if (isStartInputCode(e.code)) {
        e.preventDefault();
        if (down) {
          queueInitialInput(getControlForCode(e.code));
          beginGameplay();
        }
      }
    }

    function clearInput() {
      keys = {};
      pendingJumpPresses = 0;
      Object.keys(touch).forEach(function (control) {
        touch[control] = false;
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-control]'), function (button) {
        button.classList.remove('is-pressed');
      });
    }

    function handleInput(step) {
      var replay = initialInputReplay;
      var left = keys.ArrowLeft || keys.KeyA || touch.left || (replay && replay.control === 'left');
      var right = keys.ArrowRight || keys.KeyD || touch.right || (replay && replay.control === 'right');
      var jumpPressed = pendingJumpPresses > 0 || (replay && replay.control === 'jump');
      if (pendingJumpPresses > 0) pendingJumpPresses -= 1;
      var spray = keys.KeyS || keys.KeyX || touch.spray || (replay && replay.control === 'spray');

      if (left) {
        player.vx -= RUN_ACCEL * step;
        player.facing = -1;
      }
      if (right) {
        player.vx += RUN_ACCEL * step;
        player.facing = 1;
      }
      if (!left && !right) {
        player.vx *= Math.pow(FRICTION, step);
      }
      player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

      if (jumpPressed && player.grounded) {
        player.vy = JUMP_VELOCITY;
        player.grounded = false;
        jumpsUsed = 1;
      } else if (jumpPressed && !player.grounded && jumpsUsed === 1) {
        player.vy = DOUBLE_JUMP_VELOCITY;
        if (left !== right) {
          player.vx = left ? -DOUBLE_JUMP_SIDE_SPEED : DOUBLE_JUMP_SIDE_SPEED;
          player.facing = left ? -1 : 1;
        }
        jumpsUsed = 2;
      }

      if (spray && sprayTimer <= 0) {
        sprayTimer = 230;
      }

      if (!replay || step > 0) {
        initialInputReplay = null;
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
          jumpsUsed = 0;
        }
      }
    }

    function getPlayerVisualMarginX() {
      var animation = getAnimation(player.anim);
      var frameMeta = getAnimationFrameMetadata(animation);
      return Math.max(0, Math.round((frameMeta.renderWidth - player.w) / 2));
    }

    function updatePlayer(dt) {
      var step = dt / TARGET_FRAME_MS;
      handleInput(step);
      if (sprayTimer > 0) sprayTimer -= dt;
      if (player.invuln > 0) player.invuln -= dt;

      player.x += player.vx * step;
      var visualMarginX = getPlayerVisualMarginX();
      player.x = clamp(player.x, 12 + visualMarginX, WORLD_WIDTH - player.w - 12 - visualMarginX);

      var previousY = player.y;
      player.vy += GRAVITY * step;
      player.y += player.vy * step;
      resolveVerticalCollision(previousY);

      if (player.y > HEIGHT + 80) {
        player.health = Math.max(1, player.health - 1);
        resetToCheckpoint();
      }

      if (sprayTimer > 0) {
        setPlayerAnimation('spray');
      } else if (player.invuln > 0) {
        setPlayerAnimation('hurt');
      } else if (!player.grounded) {
        setPlayerAnimation(player.vy > 0 ? 'fall' : 'jump');
      } else if (Math.abs(player.vx) > 0.42) {
        setPlayerAnimation('run');
      } else {
        setPlayerAnimation('idle');
      }

      advancePlayerAnimation(dt, true);
    }

    function updateCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var coinRect = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
        if (rectsOverlap(player, coinRect)) {
          coin.taken = true;
          comboCount = time < comboExpiresAt ? Math.min(MAX_COIN_COMBO, comboCount + 1) : 1;
          comboExpiresAt = time + COIN_COMBO_WINDOW_MS;
          var earnedXp = coin.xp * comboCount;
          xp += earnedXp;
          window.dispatchEvent(new CustomEvent('nbg-xp-collected', {
            detail: { xp: xp, coin: coin, earnedXp: earnedXp, multiplier: comboCount }
          }));
        }
        coin.float = Math.sin((time + coin.x * 11) / 180) * 3;
      }
    }

    function updateSecretCoins(time) {
      for (var i = 0; i < secretCoins.length; i += 1) {
        var coin = secretCoins[i];
        if (coin.taken) continue;
        var coinRect = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
        if (rectsOverlap(player, coinRect)) {
          coin.taken = true;
          xp += coin.xp;
          secretNotificationText = 'SECRET FOUND +500 XP';
          secretNotificationUntil = time + 2000;
          window.dispatchEvent(new CustomEvent('nbg-xp-collected', { detail: { xp: xp, coin: coin } }));
          window.dispatchEvent(new CustomEvent('nbg-secret-found', { detail: { xp: xp, coin: coin } }));
        }
      }
    }

    function damagePlayer(type, hazardX) {
      if (player.invuln > 0) return;
      player.health -= 1;
      player.vx = hazardX > player.x ? -5.5 : 5.5;
      player.vy = -6.2;
      player.invuln = INVULN_TIME;
      comboCount = 0;
      comboExpiresAt = 0;
      setPlayerAnimation('hurt');
      window.dispatchEvent(new CustomEvent('nbg-player-hit', {
        detail: { health: player.health, enemy: type }
      }));
      if (player.health <= 0) {
        player.health = 3;
        xp = Math.max(0, xp - 150);
        resetToCheckpoint();
      }
    }

    function updateHazards() {
      if (player.invuln > 0) return;
      for (var i = 0; i < hazards.length; i += 1) {
        var hazard = hazards[i];
        if (rectsOverlap(player, hazard)) {
          damagePlayer(hazard.type, hazard.x);
          break;
        }
      }
    }

    function updateEnemies(time, dt) {
      var step = dt / TARGET_FRAME_MS;
      for (var i = 0; i < enemies.length; i += 1) {
        var enemy = enemies[i];
        enemy.x += enemy.vx * step;
        if (enemy.x < enemy.min || enemy.x > enemy.max) enemy.vx *= -1;
        if (enemy.type === 'pigeon') enemy.bob = Math.sin(time / 180) * 9;
        if (enemy.type === 'bot' && sprayTimer > 0 && Math.abs(player.x - enemy.x) < 65 && Math.abs(player.y - enemy.y) < 60 &&
            (player.facing > 0 ? enemy.x >= player.x - 8 : enemy.x <= player.x + player.w + 8)) {
          enemy.hurtUntil = time + 360;
        }

        var enemyRect = {
          x: enemy.x,
          y: enemy.y + (enemy.bob || 0),
          w: enemy.w,
          h: enemy.h
        };

        if (player.invuln <= 0 && rectsOverlap(player, enemyRect)) {
          damagePlayer(enemy.type, enemy.x);
        }
      }
    }

    function updateLevel() {
      var allCheckpoints = [checkpoint].concat(courseCheckpoints);
      for (var i = 0; i < allCheckpoints.length; i += 1) {
        var marker = allCheckpoints[i];
        if (!marker.active && rectsOverlap(player, marker)) {
          marker.active = true;
          checkpointX = Math.max(checkpointX, marker.x);
          xp += 250;
          window.dispatchEvent(new CustomEvent('nbg-checkpoint', {
            detail: { xp: xp, x: marker.x }
          }));
        }
      }

      if (!complete && rectsOverlap(player, finish)) {
        complete = true;
        running = false;
        completionAnimationActive = true;
        setPlayerAnimation('victory');
        if (!finishBonusAwarded) {
          finishBonusAwarded = true;
          xp += 500 + coins.filter(function (coin) { return coin.taken; }).length * 25;
          speedrunBonusXp = Math.max(0, Math.ceil((SPEEDRUN_PAR_MS - runElapsedMs) / 1000)) * SPEEDRUN_TIME_BONUS_PER_SECOND;
          xp += speedrunBonusXp;
          if (xp > bestXp) {
            bestXp = xp;
            try {
              window.localStorage.setItem('nbg-london-best-xp', String(bestXp));
            } catch (error) {
              // Best score remains visible for this session if storage is disabled.
            }
          }
          if (bestTimeMs === null || runElapsedMs < bestTimeMs) {
            bestTimeMs = runElapsedMs;
            try {
              window.localStorage.setItem('nbg-london-best-run-ms', String(Math.round(bestTimeMs)));
            } catch (error) {
              // Best time still tracks within this page if storage is blocked.
            }
          }
        }
        window.dispatchEvent(new CustomEvent('nbg-level-complete', {
          detail: {
            level: 'NBG London Graffiti Run - Level 1',
            xp: xp,
            coins: coins.filter(function (coin) { return coin.taken; }).length,
            secretCoins: secretCoins.filter(function (coin) { return coin.taken; }).length,
            timeMs: Math.round(runElapsedMs),
            speedrunBonusXp: speedrunBonusXp,
            bestTimeMs: Math.round(bestTimeMs),
            bestXp: bestXp,
            leaderboardReady: true
          }
        }));
      }
    }

    function updateCamera() {
      cameraX = clamp(player.x - WIDTH * 0.42, 0, WORLD_WIDTH - WIDTH);
    }

    function updateCameraY() {
      var groundedY = FLOOR_Y - player.h;
      var jumpLift = Math.max(0, groundedY - player.y);
      var targetCameraY = Math.min(CAMERA_JUMP_MAX_Y, jumpLift * CAMERA_JUMP_FOLLOW);
      cameraY += (targetCameraY - cameraY) * CAMERA_JUMP_EASE;
    }

    function updateHud() {
      var collected = coins.filter(function (coin) { return coin.taken; }).length;
      hud.xp.textContent = 'XP ' + xp;
      hud.coins.textContent = 'COINS ' + collected + '/' + coins.length;
      hud.health.textContent = 'HEALTH ' + player.health;
      hud.state.textContent = complete ? 'LEVEL COMPLETE' : running ? ((checkpoint.active || courseCheckpoints.some(function (marker) { return marker.active; })) ? 'CHECKPOINT' : 'RUNNING') : WAITING_HUD_TEXT;
    }

    function drawImageLayer(image, parallax, y, h, fallbackColor) {
      var offset = -cameraX * parallax;
      if (!image) {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, y, WIDTH, h);
        return;
      }
      var naturalWidth = image.naturalWidth || WIDTH;
      var naturalHeight = image.naturalHeight || h;
      var tileW = Math.max(WIDTH, Math.round(naturalWidth * (h / naturalHeight)));
      var start = Math.floor(offset % tileW) - tileW;
      for (var x = start; x < WIDTH + tileW; x += tileW) {
        ctx.drawImage(image, x, y, tileW, h);
      }
    }

    function drawStreetLayer() {
      if (!images.street) {
        ctx.fillStyle = '#303238';
        ctx.fillRect(0, STREET_Y, WIDTH, STREET_BAND_HEIGHT);
        return;
      }

      var naturalWidth = images.street.naturalWidth || WIDTH;
      var naturalHeight = images.street.naturalHeight || STREET_BAND_HEIGHT * 2;
      var sourceY = Math.floor(naturalHeight / 2);
      var sourceH = naturalHeight - sourceY;
      var tileW = Math.max(WIDTH, Math.round(naturalWidth * (STREET_BAND_HEIGHT / sourceH)));
      var offset = -cameraX;
      var start = Math.floor(offset % tileW) - tileW;

      for (var x = start; x < WIDTH + tileW; x += tileW) {
        ctx.drawImage(images.street, 0, sourceY, naturalWidth, sourceH, x, STREET_Y, tileW, STREET_BAND_HEIGHT);
      }
    }

    function drawSkylineLayer() {
      var skylineImages = [images.skyline1, images.skyline2, images.skyline3];
      if (skylineImages.some(function (image) { return !image; })) {
        ctx.fillStyle = '#18203a';
        ctx.fillRect(0, SKYLINE_Y, WIDTH, SKYLINE_HEIGHT);
        return;
      }

      var sequenceWidth = SKYLINE_WIDTH * skylineImages.length;
      var offset = -cameraX * SKYLINE_PARALLAX;
      var start = Math.floor(offset % sequenceWidth) - sequenceWidth;
      for (var x = start; x < WIDTH + sequenceWidth; x += sequenceWidth) {
        for (var i = 0; i < skylineImages.length; i += 1) {
          ctx.drawImage(
            skylineImages[i],
            Math.round(x + i * SKYLINE_WIDTH),
            SKYLINE_Y,
            SKYLINE_WIDTH,
            SKYLINE_HEIGHT
          );
        }
      }
    }

    function assertRequiredAssetsLoaded() {
      var missing = requiredAssets.filter(function (key) {
        return !assetStatus[key] || !assetStatus[key].loaded;
      });
      if (missing.length) {
        throw new Error('NBG Level 1 missing required assets: ' + missing.map(function (key) {
          return key + ' (' + (assetStatus[key] ? assetStatus[key].src : 'unregistered') + ')';
        }).join(', '));
      }
    }

    function formatRunTime(ms) {
      var seconds = Math.floor(ms / 1000);
      var minutes = Math.floor(seconds / 60);
      var remainder = String(seconds % 60).padStart(2, '0');
      return minutes + ':' + remainder + '.' + Math.floor(ms / 100) % 10;
    }

    function drawHazards() {
      hazards.forEach(function (hazard) {
        var x = Math.round(hazard.x - cameraX);
        if (x + hazard.w < -30 || x > WIDTH + 30) return;
        var y = hazard.y + FOREGROUND_VISUAL_OFFSET_Y;
        ctx.save();
        if (hazard.type === 'barrier') {
          ctx.fillStyle = '#f96f33';
          ctx.fillRect(x, y, hazard.w, hazard.h);
          ctx.fillStyle = '#ffe88c';
          ctx.fillRect(x, y + 4, hazard.w, 4);
          ctx.fillRect(x, y + 14, hazard.w, 4);
        } else {
          var count = hazard.type === 'spikes' ? 5 : 2;
          var partWidth = hazard.w / count;
          ctx.fillStyle = hazard.type === 'spikes' ? '#d9e4fc' : '#ff713d';
          for (var i = 0; i < count; i += 1) {
            ctx.beginPath();
            ctx.moveTo(x + i * partWidth, y + hazard.h);
            ctx.lineTo(x + (i + 0.5) * partWidth, y);
            ctx.lineTo(x + (i + 1) * partWidth, y + hazard.h);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = '#273449';
          ctx.fillRect(x, y + hazard.h - 3, hazard.w, 3);
        }
        ctx.restore();
      });
    }

    function drawWorld() {
      drawImageLayer(images.sky, 0.08, 0, HEIGHT, '#171730');
      drawSkylineLayer();
      drawImageLayer(images.wall, 0.58, 154, 88, '#2d2033');
      drawStreetLayer();

      ctx.fillStyle = '#2b2932';
      for (var i = 0; i < platforms.length; i += 1) {
        var p = platforms[i];
        var platformY = p.y + FOREGROUND_VISUAL_OFFSET_Y;
        ctx.fillRect(Math.round(p.x - cameraX), platformY, p.w, p.h);
        ctx.fillStyle = '#59d8ff';
        ctx.fillRect(Math.round(p.x - cameraX), platformY, p.w, 3);
        ctx.fillStyle = '#2b2932';
      }
      drawHazards();
    }

    function drawCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var x = Math.round(coin.x - cameraX - 8);
        if (x < -24 || x > WIDTH + 12) continue;
        var y = Math.round(coin.y + (coin.float || 0) + FOREGROUND_VISUAL_OFFSET_Y - 8);
        if (images.coin) {
          var coinColumns = 5;
          var coinRows = 5;
          var coinFrameCount = coinColumns * coinRows;
          var coinFrame = Math.floor((time + coin.x * 7) / 85) % coinFrameCount;
          var coinSourceWidth = images.coin.naturalWidth / coinColumns;
          var coinSourceHeight = images.coin.naturalHeight / coinRows;
          var coinSourceX = (coinFrame % coinColumns) * coinSourceWidth;
          var coinSourceY = Math.floor(coinFrame / coinColumns) * coinSourceHeight;
          ctx.drawImage(images.coin, coinSourceX, coinSourceY,
            coinSourceWidth, coinSourceHeight, x, y, 16, 16);
        } else {
          ctx.fillStyle = '#ffd447';
          ctx.fillRect(x + 3, y, 10, 16);
        }
        ctx.fillStyle = 'rgba(255, 212, 71, 0.22)';
        ctx.fillRect(x - 2, y + 16 + Math.sin(time / 120) * 1, 20, 2);
      }
    }

    function drawSecretCoins(time) {
      for (var i = 0; i < secretCoins.length; i += 1) {
        var coin = secretCoins[i];
        if (coin.taken) continue;
        var x = Math.round(coin.x - cameraX);
        var y = Math.round(coin.y + FOREGROUND_VISUAL_OFFSET_Y);
        ctx.save();
        ctx.fillStyle = '#ffe45a';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, coin.r + Math.sin(time / 220) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawEnemies(time) {
      for (var i = 0; i < enemies.length; i += 1) {
        var enemy = enemies[i];
        var botHurt = enemy.type === 'bot' && (enemy.hurtUntil || 0) > time;
        var botKicking = enemy.type === 'bot' && !botHurt && Math.abs(player.x - enemy.x) < 68 && Math.abs(player.y - enemy.y) < 48;
        var botImageKey = botHurt ? 'botHurt' : botKicking ? 'botKick' : 'bot';
        var image = images[enemy.type === 'bot' ? botImageKey : enemy.type];
        var x = Math.round(enemy.x - cameraX);
        if (x < -enemy.w || x > WIDTH) continue;
        var y = Math.round(enemy.y + (enemy.bob || 0) + FOREGROUND_VISUAL_OFFSET_Y);
        if (image) {
          ctx.save();
          if (enemy.type === 'bot') {
            var cellW = image.naturalWidth / BOT_SHEET_COLUMNS;
            var cellH = image.naturalHeight / BOT_SHEET_ROWS;
            var frameMs = botHurt ? 75 : botKicking ? 70 : 85;
            var frame = botHurt ? Math.min(BOT_SHEET_FRAMES - 1, Math.floor((time - (enemy.hurtUntil - 360)) / frameMs)) :
              Math.floor((time + enemy.x * 3) / frameMs) % BOT_SHEET_FRAMES;
            frame = Math.max(0, frame);
            var sourceX = frame % BOT_SHEET_COLUMNS * cellW;
            var sourceY = Math.floor(frame / BOT_SHEET_COLUMNS) * cellH;
            var drawX = x - Math.round((BOT_RENDER_WIDTH - enemy.w) / 2);
            var drawY = y + enemy.h - BOT_RENDER_HEIGHT;
            if (enemy.vx < 0) {
              ctx.translate(drawX + BOT_RENDER_WIDTH, drawY);
              ctx.scale(-1, 1);
              ctx.drawImage(image, sourceX, sourceY, cellW, cellH, 0, 0, BOT_RENDER_WIDTH, BOT_RENDER_HEIGHT);
            } else {
              ctx.drawImage(image, sourceX, sourceY, cellW, cellH, drawX, drawY, BOT_RENDER_WIDTH, BOT_RENDER_HEIGHT);
            }
          } else if (enemy.vx < 0) {
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
      var checkpointY = checkpoint.y + FOREGROUND_VISUAL_OFFSET_Y;
      if (images.checkpoint) ctx.drawImage(images.checkpoint, checkX, checkpointY, checkpoint.w, checkpoint.h);
      if (checkpoint.active) {
        ctx.fillStyle = '#7cff82';
        ctx.fillRect(checkX + 12, checkpointY + 8, 10, 8);
      }

      if (images.finish) {
        ctx.drawImage(images.finish, Math.round(finish.x - cameraX), finish.y + FOREGROUND_VISUAL_OFFSET_Y, finish.w, finish.h);
      }
    }

    function drawPlayer() {
      var animation = getAnimation(player.anim);
      var frameMeta = getAnimationFrameMetadata(animation);
      var frame = player.frame % frameMeta.count;
      var col = frame % frameMeta.columns;
      var row = Math.floor(frame / frameMeta.columns);
      var x = Math.round(player.x - cameraX);
      var y = Math.round(player.y);
      var drawWidth = frameMeta.renderWidth;
      var drawHeight = frameMeta.renderHeight;
      var drawX = x - Math.round((drawWidth - player.w) / 2);
      var visualFootY = y + player.h + PLAYER_VISUAL_OFFSET_Y;
      var drawY = Math.round(visualFootY - drawHeight + frameMeta.renderOffsetY);
      var sourceX = col * frameMeta.sourceWidth;
      var sourceY = row * frameMeta.sourceHeight;
      var flash = player.invuln > 0 && Math.floor(player.invuln / 90) % 2 === 0;
      if (flash) return;

      if (!animation || !animation.image) {
        ctx.fillStyle = '#ff315f';
        ctx.fillRect(x, y, player.w, player.h);
        return;
      }

      ctx.save();
      if (player.facing < 0) {
        ctx.translate(drawX + drawWidth, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(animation.image, sourceX, sourceY, frameMeta.sourceWidth, frameMeta.sourceHeight, 0, 0, drawWidth, drawHeight);
      } else {
        ctx.drawImage(animation.image, sourceX, sourceY, frameMeta.sourceWidth, frameMeta.sourceHeight, drawX, drawY, drawWidth, drawHeight);
      }
      ctx.restore();
    }

    function drawOverlay() {
      if (!complete) return;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd447';
      ctx.font = '900 24px Courier New';
      ctx.fillText('LEVEL COMPLETE', WIDTH / 2, 72);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 14px Courier New';
      ctx.fillText('RUN TIME ' + formatRunTime(runElapsedMs), WIDTH / 2, 108);
      ctx.fillText('BEST TIME ' + formatRunTime(bestTimeMs || runElapsedMs), WIDTH / 2, 129);
      ctx.fillStyle = '#7cff82';
      ctx.fillText('SPEED BONUS +' + speedrunBonusXp + ' XP', WIDTH / 2, 151);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 12px Courier New';
      ctx.fillText('LEADERBOARD XP READY: ' + xp, WIDTH / 2, 174);
      ctx.fillText('PERSONAL BEST XP: ' + bestXp, WIDTH / 2, 196);
      ctx.fillText('PRESS RESET TO RUN AGAIN', WIDTH / 2, 221);
      ctx.restore();
    }

    function drawSpeedrunHud(time) {
      ctx.save();
      ctx.fillStyle = 'rgba(9, 19, 38, 0.83)';
      ctx.fillRect(WIDTH - 165, 5, 160, 37);
      ctx.font = 'bold 12px Courier New';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SPEED ' + formatRunTime(runElapsedMs), WIDTH - 159, 19);
      ctx.font = 'bold 10px Courier New';
      ctx.fillStyle = '#ffe45a';
      ctx.fillText('PAR 3:00' + (comboCount > 1 && time < comboExpiresAt ? '  COMBO x' + comboCount : ''), WIDTH - 159, 34);
      ctx.restore();
    }

    function drawSecretNotification(time) {
      if (time >= secretNotificationUntil) return;
      ctx.save();
      ctx.font = 'bold 15px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(secretNotificationText, WIDTH / 2 + 1, 47);
      ctx.fillStyle = '#ffe45a';
      ctx.fillText(secretNotificationText, WIDTH / 2, 46);
      ctx.restore();
    }

    function render(time) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#0076fc';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      ctx.translate(0, Math.round(cameraY));
      drawWorld();
      drawCoins(time);
      drawSecretCoins(time);
      drawObjects();
      drawEnemies(time);
      drawPlayer();
      ctx.restore();
      drawSpeedrunHud(time);
      drawSecretNotification(time);
      drawOverlay();
    }

    function tick(time) {
      if (!lastTime) lastTime = time;
      var frameElapsedMs = Math.max(0, time - lastTime);
      var dt = Math.min(33, frameElapsedMs);
      lastTime = time;

      if (running) {
        runElapsedMs += frameElapsedMs;
        updatePlayer(dt);
        updateCoins(time);
        updateSecretCoins(time);
        updateEnemies(time, dt);
        updateHazards();
        updateLevel();
        updateCamera();
        updateCameraY();
      } else if (completionAnimationActive) {
        completionAnimationActive = !advancePlayerAnimation(dt, false);
      }
      updateHud();
      render(time);
      if (running || completionAnimationActive) requestAnimationFrame(tick);
    }

    function exposeTestState() {
      window.NBGLevel1State = {
        get player() { return player; },
        get jumpsUsed() { return jumpsUsed; },
        get coins() { return coins; },
        get secretCoins() { return secretCoins; },
        get secretNotificationUntil() { return secretNotificationUntil; },
        get secretNotificationText() { return secretNotificationText; },
        get enemies() { return enemies; },
        get platforms() { return platforms; },
        get hazards() { return hazards; },
        get courseCheckpoints() { return courseCheckpoints; },
        get runElapsedMs() { return runElapsedMs; },
        get bestTimeMs() { return bestTimeMs; },
        get bestXp() { return bestXp; },
        get speedrunBonusXp() { return speedrunBonusXp; },
        get comboCount() { return comboCount; },
        get xp() { return xp; },
        get complete() { return complete; },
        get assetsLoaded() { return assetsLoaded; },
        get gameVisible() { return gameVisible; },
        get waitingForFirstInput() { return waitingForFirstInput; },
        get pendingInitialInput() { return pendingInitialInput; },
        get running() { return running; },
        get completionAnimationActive() { return completionAnimationActive; },
        get cameraX() { return cameraX; },
        get cameraY() { return cameraY; },
        get checkpoint() { return checkpoint; },
        get finish() { return finish; },
        get worldWidth() { return WORLD_WIDTH; },
        get assetStatus() { return assetStatus; },
        get requiredAssets() { return requiredAssets.slice(); },
        get playerAnimations() { return playerAnimations; }
      };
    }

    function finishInit() {
      assertRequiredAssetsLoaded();
      assetsLoaded = true;
      gameVisible = true;
      waitingForFirstInput = true;
      running = false;
      complete = false;
      lastTime = 0;
      updateCamera();
      updateCameraY();
      cameraY = 0;
      updateHud();
      render(performance.now());
      return window.NBGLevel1State;
    }

    function resetRun() {
      running = false;
      waitingForFirstInput = true;
      completionAnimationActive = false;
      complete = false;
      lastTime = 0;
      cameraX = 0;
      cameraY = 0;
      checkpointX = 72;
      finishBonusAwarded = false;
      sprayTimer = 0;
      runElapsedMs = 0;
      speedrunBonusXp = 0;
      comboCount = 0;
      comboExpiresAt = 0;
      xp = 0;
      secretNotificationUntil = 0;
      secretNotificationText = '';
      pendingInitialInput = null;
      initialInputReplay = null;
      clearInput();

      player.x = 64;
      player.w = 24;
      player.h = 34;
      player.y = FLOOR_Y - player.h;
      player.vx = 0;
      player.vy = 0;
      player.facing = 1;
      player.grounded = true;
      jumpsUsed = 0;
      player.health = 3;
      player.invuln = 0;
      setPlayerAnimation('idle');
      player.frame = 0;
      player.frameTime = 0;

      coins.forEach(function (coin) {
        coin.taken = false;
        coin.float = 0;
      });
      secretCoins.forEach(function (coin) { coin.taken = false; });
      enemies.forEach(function (enemy, index) {
        Object.assign(enemy, initialEnemies[index]);
      });
      checkpoint.active = false;
      courseCheckpoints.forEach(function (marker) { marker.active = false; });
      gameVisible = true;
      updateCamera();
      updateCameraY();
      updateHud();
      render(typeof performance !== 'undefined' && performance.now ? performance.now() : 0);
      window.dispatchEvent(new CustomEvent('nbg-level-reset', {
        detail: { level: 'london-level-1' }
      }));
      return window.NBGLevel1State;
    }

    function init() {
      exposeTestState();
      if (initPromise) return initPromise;
      initPromise = loadJson(ASSET_MANIFEST).then(function (assetManifest) {
        var assets = buildRuntimeAssetMap(assetManifest);
        var playerManifestPath = resolveAssetPath(assetManifest.player && assetManifest.player.animationManifest);
        if (!playerManifestPath) throw new Error('Missing player animation manifest path');

        return loadJson(playerManifestPath).then(function (manifest) {
          return {
            assets: assets,
            manifest: manifest
          };
        });
      }).then(function (runtimeAssets) {
        var animations = runtimeAssets.manifest.animations || {};
        var animationKeys = Object.keys(animations);
        requiredAssets = Object.keys(runtimeAssets.assets).concat(animationKeys.map(function (key) {
          return 'player.' + key;
        }));

        return Promise.all(Object.keys(runtimeAssets.assets).map(function (key) {
          return loadImage(runtimeAssets.assets[key]).then(function (result) {
            images[key] = result.image;
            assetStatus[key] = {
              src: result.src,
              loaded: !!result.image
            };
          });
        }).concat(animationKeys.map(function (key) {
          var animation = animations[key] || {};
          var src = resolveAssetPath(animation.spriteSheet || '');
          return loadImage(src).then(function (result) {
            playerAnimations[key] = {
              sourceFrameWidth: animation.sourceFrameWidth,
              sourceFrameHeight: animation.sourceFrameHeight,
              renderWidth: animation.renderWidth,
              renderHeight: animation.renderHeight,
              renderOffsetY: animation.renderOffsetY,
              frames: animation.frames,
              columns: animation.columns,
              frameMs: animation.frameMs,
              spriteSheet: animation.spriteSheet,
              image: result.image
            };
            assetStatus['player.' + key] = {
              src: result.src,
              loaded: !!result.image
            };
          });
        })));
      }).then(finishInit);
      return initPromise;
    }

    function beginGameplay() {
      if (running) return Promise.resolve(window.NBGLevel1State);
      if (!assetsLoaded) return init().then(beginGameplay);
      if (complete) return Promise.resolve(window.NBGLevel1State);
      initialInputReplay = pendingInitialInput;
      pendingInitialInput = null;
      waitingForFirstInput = false;
      running = true;
      lastTime = 0;
      updateHud();
      window.dispatchEvent(new CustomEvent('nbg-level-started', { detail: { level: 'london-level-1' } }));
      requestAnimationFrame(tick);
      return Promise.resolve(window.NBGLevel1State);
    }

    window.addEventListener('keydown', function (e) { onKey(e, true); });
    window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', clearInput);

    return {
      init: init,
      start: beginGameplay,
      reset: function () {
        if (!assetsLoaded) return init().then(resetRun);
        return Promise.resolve(resetRun());
      },
      restart: function () {
        if (!assetsLoaded) return init().then(resetRun);
        return Promise.resolve(resetRun());
      },
      getState: function () { return window.NBGLevel1State; },
      setTouchControl: function (control, active) {
        if (Object.prototype.hasOwnProperty.call(touch, control)) {
          touch[control] = active;
          if (active) {
            if (control === 'jump') pendingJumpPresses = Math.min(2, pendingJumpPresses + 1);
            queueInitialInput(control);
            beginGameplay();
          }
        }
      }
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('game');
    var stage = document.getElementById('game-stage');
    var start = document.getElementById('startBtn') || document.getElementById('start');
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

    if (stage) stage.classList.add('is-active');
    runtime.init().catch(setLaunchError);

    if (start) {
      start.addEventListener('click', function () {
        if (stage) stage.classList.add('is-active');
        runtime.start().catch(setLaunchError);
      });
    }

    function resetRuntimeFromShell() {
      if (stage) stage.classList.add('is-active');
      Promise.resolve(runtime.reset()).catch(setLaunchError);
    }

    window.addEventListener('moonboys:game-reset', resetRuntimeFromShell);
    window.addEventListener('arcade:play-again', function (event) {
      event.preventDefault();
      resetRuntimeFromShell();
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
