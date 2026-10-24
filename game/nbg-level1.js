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
  var SPEED_BOOST_MAX_SPEED = 6;
  var SPEED_BOOST_DURATION_MS = 6000;
  var SPEED_BOX_RENDER_SIZE = 28;
  var JUMP_VELOCITY = -11.4;
  var DOUBLE_JUMP_VELOCITY = -12.8;
  var TRIPLE_JUMP_VELOCITY = -12.8;
  var JUMP_TAP_SPACING_MS = 115; // Make successive queued boosts visibly distinct.
  var COURSE_LAYOUT_VERSION = 5; // Replay v1 format, speed box, Graffbot fire and balloon enemy.
  var DOUBLE_JUMP_SIDE_SPEED = 5.4;
  // Pig sheet is 700x560: five columns by four rows, 140px per frame.
  // Display is twice the former 28x22 pigeon sprite; patrol coordinates stay 28x22 while combat follows the visible frame.
  var FLYING_PIG_COLUMNS = 5;
  var FLYING_PIG_ROWS = 4;
  var FLYING_PIG_FRAMES = 20;
  var FLYING_PIG_RENDER_WIDTH = 56;
  var FLYING_PIG_RENDER_HEIGHT = 44;
  var FLYING_PIG_FRAME_MS = 85;
  var BOT_SHEET_COLUMNS = 5;
  var BOT_SHEET_ROWS = 5;
  var BOT_SHEET_FRAMES = 25;
  var BOT_RENDER_WIDTH = 70;
  var BOT_RENDER_HEIGHT = 52;
  var GRAFFBOT_FIRE_COLUMNS = 4;
  var GRAFFBOT_FIRE_ROWS = 4;
  var GRAFFBOT_FIRE_FRAMES = 16;
  var GRAFFBOT_FIRE_FRAME_MS = 55;
  var GRAFFBOT_FIRE_DURATION_MS = GRAFFBOT_FIRE_FRAMES * GRAFFBOT_FIRE_FRAME_MS;
  var GRAFFBOT_FIRE_COOLDOWN_MS = 2400;
  var GRAFFBOT_FIRE_TRIGGER_RANGE = 150;
  var GRAFFBOT_FIRE_RENDER_SIZE = 96;
  // Align the sheet's centre-line nozzle with the rendered Graffbot mouth.
  var GRAFFBOT_FIRE_MOUTH_OFFSET_Y = -10;
  var GRAFFBOT_FIRE_DAMAGE_RANGE = 82;
  var SPEEDRUN_HUD_WIDTH = 104;
  var SPEEDRUN_HUD_HEIGHT = 11;
  var BALLOON_WALK_FRAMES = 14;
  var BALLOON_RELEASE_FRAMES = 16;
  var BALLOON_FRAME_MS = 90;
  var BALLOON_CYCLE_MS = BALLOON_RELEASE_FRAMES * BALLOON_FRAME_MS;
  var BALLOON_REPEAT_DELAY_MS = 420;
  var BALLOON_TRIGGER_RANGE = 330;
  // Both originals are transparent 512x512 exports, read left-to-right, top-to-bottom.
  // Measure the person, not the balloon/padding: walk is 93px tall, release 54px.
  // Independent uniform scales keep her at 52px (the unchanged combat height).
  var BALLOON_ANIMATIONS = {
    balloonWalk: { width: 512, height: 512, columns: 4, rows: 4,
      frameWidth: 128, frameHeight: 128, frames: BALLOON_WALK_FRAMES,
      frameMs: 100, scale: 52 / 93, anchorX: 62 },
    balloonRelease: { width: 512, height: 512, columns: 4, rows: 4,
      frameWidth: 128, frameHeight: 128, frames: BALLOON_RELEASE_FRAMES,
      frameMs: BALLOON_FRAME_MS, scale: 52 / 54, anchorX: 38 }
  };
  var RAT_SHEET_COLUMNS = 5;
  var RAT_SHEET_ROWS = 5;
  var RAT_SHEET_FRAMES = 25;
  var RAT_RENDER_WIDTH = 50;
  var RAT_RENDER_HEIGHT = 60;
  var RAT_ATTACK_RANGE = 70;
  var RAT_ATTACK_DURATION_MS = 850;
  var RAT_ATTACK_COOLDOWN_MS = 1700;
  var PARACHUTE_START_X = 390;
  var PARACHUTE_LANDED_LIFETIME_MS = 22000;
  var SPRAY_ENEMY_RANGE = 86;
  var ENEMY_STOMP_BOUNCE = -9;
  var PARACHUTE_GLIDE_SPEED = 2.8; // Descend into view before the runner passes.
  var PARACHUTE_STEER_SPEED = 0.028;
  var PARACHUTE_RENDER_WIDTH = 64;
  var PARACHUTE_RENDER_HEIGHT = 64;
  var SPEEDRUN_PAR_MS = 180000;
  var SPEEDRUN_TIME_BONUS_PER_SECOND = 35;
  var COIN_COMBO_WINDOW_MS = 2400;
  var MAX_COIN_COMBO = 4;
  var COIN_TIERS = { small: { size: 16, xp: 100 }, medium: { size: 32, xp: 250 }, large: { size: 40, xp: 500 }, xl: { size: 50, xp: 1000 } };
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
  var CAMERA_LOOK_DOWN_MAX_Y = 84; // View only: no physics or replay changes.
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

  // The approved final spray export contains a flat green matte and white
  // page border. Remove only these background colors once during asset load;
  // keep original PNG committed and preserve coloured paint/character pixels.
  function prepareFinalSpraySheet(image) {
    if (!image) return null;
    var canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    var context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    var rgba = pixels.data;
    for (var i = 0; i < rgba.length; i += 4) {
      var red = rgba[i];
      var green = rgba[i + 1];
      var blue = rgba[i + 2];
      var matte = green > red + 12 && green > blue + 8 &&
        red >= 45 && red <= 115 && green >= 75 && green <= 155 && blue >= 40 && blue <= 120;
      var pageWhite = red >= 250 && green >= 250 && blue >= 250;
      if (matte || pageWhite) rgba[i + 3] = 0;
    }
    context.putImageData(pixels, 0, 0);
    canvas.__nbgSpraySource = image.src;
    return canvas;
  }

  // The source flying-pig export clips many wings at its 140px cell edges.
  // Extract isolated transparent, padded frames once; feather the cell edges
  // to prevent hard-cut wing tips and leaked fragments from neighboring cells.
  function isolateFlyingPigFrames(image) {
    var frames = [];
    var sourceW = image.naturalWidth / FLYING_PIG_COLUMNS;
    var sourceH = image.naturalHeight / FLYING_PIG_ROWS;
    var pad = 8;
    for (var index = 0; index < FLYING_PIG_FRAMES; index++) {
      var cell = document.createElement('canvas');
      cell.width = sourceW + pad * 2;
      cell.height = sourceH + pad * 2;
      var brush = cell.getContext('2d', { willReadFrequently: true });
      brush.drawImage(image, index % FLYING_PIG_COLUMNS * sourceW,
        Math.floor(index / FLYING_PIG_COLUMNS) * sourceH,
        sourceW, sourceH, pad, pad, sourceW, sourceH);
      var pixels = brush.getImageData(0, 0, cell.width, cell.height);
      for (var y = pad; y < pad + sourceH; y++) {
        for (var x = pad; x < pad + sourceW; x++) {
          var distance = Math.min(x - pad, pad + sourceW - 1 - x,
            y - pad, pad + sourceH - 1 - y);
          if (distance >= 7) continue;
          var alphaIndex = (y * cell.width + x) * 4 + 3;
          pixels.data[alphaIndex] = Math.round(pixels.data[alphaIndex] *
            (distance + 1) / 8);
        }
      }
      brush.putImageData(pixels, 0, 0);
      frames.push(cell);
    }
    return frames;
  }

  // Only the flame uses this legacy colour key. Balloon sheets already have
  // alpha; their transparent corner RGB must never be used as a colour key.
  function prepareMatteSpriteSheet(image, tolerance) {
    if (!image) return null;
    var canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    var context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    var rgba = pixels.data;
    var matteRed = rgba[0];
    var matteGreen = rgba[1];
    var matteBlue = rgba[2];
    var limit = typeof tolerance === 'number' ? tolerance : 18;
    for (var index = 0; index < rgba.length; index += 4) {
      if (Math.abs(rgba[index] - matteRed) <= limit &&
          Math.abs(rgba[index + 1] - matteGreen) <= limit &&
          Math.abs(rgba[index + 2] - matteBlue) <= limit) {
        rgba[index + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    canvas.__nbgSource = image.src;
    return canvas;
  }

  // Read occupied bounds once without editing a single source RGBA pixel.
  // Crop each cell independently; anchor its feet, rather than transparent padding.
  function measureBalloonFrames(image, animation) {
    if (image.naturalWidth !== animation.width || image.naturalHeight !== animation.height)
      throw new Error('Unexpected Balloon Girl sheet dimensions: ' + image.src);
    var canvas = document.createElement('canvas');
    canvas.width = animation.width;
    canvas.height = animation.height;
    var context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    var rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    var frames = [];
    for (var index = 0; index < animation.frames; index++) {
      var cellX = index % animation.columns * animation.frameWidth;
      var cellY = Math.floor(index / animation.columns) * animation.frameHeight;
      var left = animation.frameWidth, top = animation.frameHeight, right = -1, bottom = -1;
      for (var y = 0; y < animation.frameHeight; y++) {
        for (var x = 0; x < animation.frameWidth; x++) {
          if (!rgba[((cellY + y) * canvas.width + cellX + x) * 4 + 3]) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error('Empty Balloon Girl frame: ' + index);
      frames.push({ x: cellX + left, y: cellY + top,
        width: right - left + 1, height: bottom - top + 1,
        anchorX: animation.anchorX - left, footY: bottom - top + 1 });
    }
    return frames;
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
      if (manifest.objects.mysteryBox) assets.mysteryBox = resolveAssetPath(manifest.objects.mysteryBox);
      if (manifest.objects.starBox) assets.starBox = resolveAssetPath(manifest.objects.starBox);
      if (manifest.objects.speedBox) assets.speedBox = resolveAssetPath(manifest.objects.speedBox);
      if (manifest.objects.floorCrate) assets.floorCrate = resolveAssetPath(manifest.objects.floorCrate);
      if (manifest.objects.floatingBrick) assets.floatingBrick = resolveAssetPath(manifest.objects.floatingBrick);
      if (manifest.objects.floatingRock) assets.floatingRock = resolveAssetPath(manifest.objects.floatingRock);
      if (manifest.objects.checkpoint) assets.checkpoint = resolveAssetPath(manifest.objects.checkpoint);
      if (manifest.objects.finishFlag) assets.finish = resolveAssetPath(manifest.objects.finishFlag);
    }

    if (manifest.enemies) {
      if (manifest.enemies.londonRat) assets.rat = resolveAssetPath(manifest.enemies.londonRat);
      if (manifest.enemies.londonRatBladeFlurry) assets.ratBladeFlurry = resolveAssetPath(manifest.enemies.londonRatBladeFlurry);
      if (manifest.enemies.londonRatViperPounce) assets.ratViperPounce = resolveAssetPath(manifest.enemies.londonRatViperPounce);
      if (manifest.enemies.parachuteRatA) assets.parachuteRatA = resolveAssetPath(manifest.enemies.parachuteRatA);
      if (manifest.enemies.parachuteRatB) assets.parachuteRatB = resolveAssetPath(manifest.enemies.parachuteRatB);
      if (manifest.enemies.parachuteRatC) assets.parachuteRatC = resolveAssetPath(manifest.enemies.parachuteRatC);
      if (manifest.enemies.turquoiseRatWalk) assets.turquoiseRatWalk = resolveAssetPath(manifest.enemies.turquoiseRatWalk);
      if (manifest.enemies.turquoiseRatKick) assets.turquoiseRatKick = resolveAssetPath(manifest.enemies.turquoiseRatKick);
      if (manifest.enemies.turquoiseRatPunch) assets.turquoiseRatPunch = resolveAssetPath(manifest.enemies.turquoiseRatPunch);
      if (manifest.enemies.brownRatWalk) assets.brownRatWalk = resolveAssetPath(manifest.enemies.brownRatWalk);
      if (manifest.enemies.brownRatPunch) assets.brownRatPunch = resolveAssetPath(manifest.enemies.brownRatPunch);
      if (manifest.enemies.pigeon) assets.pigeon = resolveAssetPath(manifest.enemies.pigeon);
      if (manifest.enemies.graffitiBot) assets.bot = resolveAssetPath(manifest.enemies.graffitiBot);
      if (manifest.enemies.graffitiBotKick) assets.botKick = resolveAssetPath(manifest.enemies.graffitiBotKick);
      if (manifest.enemies.graffitiBotHurt) assets.botHurt = resolveAssetPath(manifest.enemies.graffitiBotHurt);
      if (manifest.enemies.graffitiBotFire) assets.botFire = resolveAssetPath(manifest.enemies.graffitiBotFire);
      if (manifest.enemies.balloonWalk) assets.balloonWalk = resolveAssetPath(manifest.enemies.balloonWalk);
      if (manifest.enemies.balloonRelease) assets.balloonRelease = resolveAssetPath(manifest.enemies.balloonRelease);
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
    var nextJumpBoostAtMs = 0;
    var jumpsUsed = 0;
    // Visual-only one-shot state; jump physics and replay inputs remain authoritative and unchanged.
    var backflipActive = false;
    var touch = { left: false, right: false, jump: false, spray: false, look: false };
    var images = {};
    var balloonFrames = {};
    var playerAnimations = {};
    var assetStatus = {};
    var requiredAssets = [];
    var assetsLoaded = false;
    var gameVisible = false;
    var waitingForFirstInput = false;
    var running = false;
    var initPromise = null;
    var pendingRunStartPromise = null;
    var pendingRunOwner = null;
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
    // Compact authoritative replay: 5 bytes per rendered simulation tick.
    // Tick duration (tenths of ms), elapsed wall-time (ms), and input bits.
    // The Worker independently simulates these inputs; XP HUD values are
    // never accepted as proof of a ranked score.
    var runReplayFrames = [];
    var replayInvalid = false;
    var speedrunBonusXp = 0;
    var comboCount = 0;
    var comboExpiresAt = 0;
    var bestTimeMs = null;
    // Browser bests are session-only; authenticated all-time records live in D1.
    // Clear old guest/device-local bests from earlier game versions.
    var bestXp = 0;
    try {
      window.localStorage.removeItem('nbg-london-best-run-ms');
      window.localStorage.removeItem('nbg-london-best-xp');
    } catch (error) {
      // Storage may be blocked; no local competitive record is retained.
    }
    var sprayTimer = 0;
    var speedBoostUntil = 0;
    var balloonRewardNotificationText = '';
    var balloonRewardNotificationUntil = 0;
    var parachuteRats = [];
    var flyingPigFrames = null;
    var parachuteSpawnCount = 0;
    var gameOver = false;
    var runSequence = 0;
    // Same seeded gameplay randomness as the Worker replay authority.
    // Visual-only animation timing may differ, physics and rewards may not.
    var runRandomState = 0x9e3779b9;
    function nextRunRandom() {
      runRandomState = (Math.imul(runRandomState, 1664525) + 1013904223) >>> 0;
      return runRandomState / 4294967296;
    }

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
    var previousPlayerY = player.y;
    var previousPlayerVy = player.vy;

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

      // A non-looping animation is complete only after its final frame has
      // remained visible for a full frame interval.
      return false;
    }

    var platforms = [
      { x: 360, y: 178, w: 150, h: 16 },
      { x: 720, y: 154, w: 132, h: 16 },
      { x: 1120, y: 176, w: 142, h: 16 },
      { x: 1510, y: 148, w: 180, h: 16 }
    ];

    platforms.forEach(function (platform, index) {
      platform.material = index % 2 === 0 ? 'brick' : 'rock';
    });

    var crates = [
      { x: 1840, y: FLOOR_Y - 28, w: 28, h: 28 },
      { x: 2070, y: FLOOR_Y - 28, w: 28, h: 28 }
    ];
    var rewardBoxes = [
      { x: 535, y: 85, w: 25, h: 25, type: 'mystery', opened: false },
      { x: 1600, y: 55, w: 25, h: 25, type: 'star', opened: false }
    ];
    var rewardNotificationText = '';
    var rewardNotificationUntil = 0;
    // Four finite, reachable collectibles spread across the fixed course.
    // Collecting another refreshes the timer; speed itself never stacks.
    var speedBoxes = [875, 5685, 10935, 16185].map(function (x) {
      return { x: x, y: FLOOR_Y - 28, w: 28, h: 28, collected: false };
    });

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

    // Standard opening coins retain their placement but use the small tier.
    coins.forEach(function (coin) {
      coin.tier = 'small';
      coin.size = COIN_TIERS.small.size;
      coin.xp = COIN_TIERS.small.xp;
      coin.r = Math.round(coin.size * 0.4);
    });

    var enemies = [
      { type: 'rat', x: 600, y: FLOOR_Y - 42, w: 28, h: 42, vx: 1.1, min: 540, max: 690 },
      { type: 'pigeon', x: 1010, y: 128, w: 28, h: 22, vx: 1.35, min: 940, max: 1128, bob: 0 },
      { type: 'bot', x: 1455, y: FLOOR_Y - 38, w: 30, h: 38, vx: 0.85, min: 1390, max: 1550 },
      { type: 'balloon', x: 1780, y: FLOOR_Y - 48, w: 30, h: 48, vx: 0.62,
        min: 1715, max: 1825, balloonState: 'walk', balloonCycles: 0,
        balloonStartedAt: 0, nextBalloonAt: 0, balloonRewardAwarded: false }
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
      ledges.forEach(function (ledge, ledgeIndex) {
        ledge.material = (section + ledgeIndex) % 2 === 0 ? 'brick' : 'rock';
        platforms.push(ledge);
        for (var j = 0; j < 3; j += 1) {
          coins.push({ x: ledge.x + 30 + j * 30, y: ledge.y - 24 - j % 2 * 8,
            tier: 'small', size: 16, r: 6, xp: 100, taken: false });
        }
      });
      // Hidden rewards continue through every course section, not only the
      // original 0–2,200px opening. Three jumps can reach these heights.
      secretCoins.push({ x: startX + 405, y: -94 - section % 3 * 9,
        r: 8, xp: 500, taken: false, secret: true });
      secretCoins.push({ x: startX + 865, y: -102 - section % 2 * 10,
        r: 8, xp: 500, taken: false, secret: true });
      [45, 520, 980].forEach(function (dx) {
        coins.push({ x: startX + dx, y: 176, tier: 'small', size: 16, r: 6, xp: 100, taken: false });
      });

      var tierName = section % 4 === 3 ? 'xl' : section % 4 === 2 ? 'large' : 'medium';
      var tier = COIN_TIERS[tierName];
      coins.push({ x: startX + 404, y: ledges[1].y - 75,
        tier: tierName, size: tier.size, r: Math.round(tier.size * 0.4), xp: tier.xp, taken: false });
      if (section >= 6) {
        var extraTierName = section % 3 === 0 ? 'large' : 'medium';
        var extraTier = COIN_TIERS[extraTierName];
        coins.push({ x: startX + 866, y: ledges[3].y - 62,
          tier: extraTierName, size: extraTier.size, r: Math.round(extraTier.size * 0.4), xp: extraTier.xp, taken: false });
      }

      crates.push({ x: startX + 65, y: FLOOR_Y - 28, w: 28, h: 28 });
      crates.push({ x: startX + 675, y: FLOOR_Y - 28, w: 28, h: 28 });
      rewardBoxes.push({ x: startX + 189, y: ledges[0].y - 78, w: 25, h: 25,
        type: 'mystery', opened: false });
      rewardBoxes.push({ x: startX + 651, y: ledges[2].y - 95, w: 25, h: 25,
        type: 'star', opened: false });

      hazards.push({ x: startX + 275, y: FLOOR_Y - 18, w: 34, h: 18, type: 'cones' });
      hazards.push({ x: startX + 745, y: FLOOR_Y - 20, w: 46, h: 20, type: 'spikes' });
      if (section >= 8 && section % 3 === 0) {
        hazards.push({ x: startX + 1000, y: FLOOR_Y - 24, w: 34, h: 24, type: 'barrier' });
      }
      enemies.push({ type: 'rat', x: startX + 435, y: FLOOR_Y - 42,
        w: 28, h: 42, vx: 1.1 + section * 0.025, min: startX + 395, max: startX + 535 });
      // Every section has all three existing enemy classes, with the original
      // patrol bounds. This expands coverage without inventing new mechanics.
      enemies.push({ type: 'bot', x: startX + 870, y: FLOOR_Y - 38,
        w: 30, h: 38, vx: 0.85 + section * 0.035, min: startX + 800, max: startX + 960 });
      enemies.push({ type: 'pigeon', x: startX + 615, y: 110,
        w: 28, h: 22, vx: 1.35, min: startX + 575, max: startX + 720, bob: 0 });
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
      previousPlayerY = player.y;
      previousPlayerVy = 0;
      player.vx = 0;
      player.vy = 0;
      jumpsUsed = 0;
      player.invuln = INVULN_TIME;
      backflipActive = false;
      setPlayerAnimation('hurt');
      sprayTimer = 0;
      speedBoostUntil = 0;
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
      // Scores drawer is a normal keyboard-accessible UI, not a game input.
      // Keep key-up cleanup for keys pressed before opening the drawer.
      var drawer = document.getElementById('nbg-record-drawer');
      var scoresOpen = drawer && !drawer.hidden;
      var scoresControl = e.target && e.target.closest &&
        e.target.closest('#nbg-record-drawer, #nbg-open-records');
      // Once Scores closes, focus returns to its toolbar button. Preserve
      // native Enter/Space activation there, but allow gameplay movement,
      // jump (ArrowUp/W) and spray even while that button retains focus.
      if (down && (scoresOpen ||
          (scoresControl && (e.code === 'Space' || e.code === 'Enter')))) return;
      if (!down && (scoresOpen || scoresControl)) {
        keys[e.code] = false;
        return;
      }
      var wasDown = !!keys[e.code];
      keys[e.code] = down;
      if (down && !wasDown && getControlForCode(e.code) === 'jump') {
        pendingJumpPresses = Math.min(Math.max(0, 3 - jumpsUsed), pendingJumpPresses + 1);
      }
      if (e.code === 'ArrowDown') e.preventDefault();
      if (isStartInputCode(e.code)) {
        e.preventDefault();
        if (down) {
          queueInitialInput(getControlForCode(e.code));
          beginGameplay(getControlForCode(e.code));
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

    function jumpTapReady() {
      return pendingJumpPresses > 0 && jumpsUsed < 3 && runElapsedMs >= nextJumpBoostAtMs;
    }

    function recordReplayTick(frameElapsedMs, dt) {
      if (replayInvalid) return;
      if (!Number.isFinite(frameElapsedMs) || frameElapsedMs > 2000 ||
          runReplayFrames.length >= 600000) {
        replayInvalid = true;
        return;
      }
      var replay = initialInputReplay;
      var mask = 0;
      if (keys.ArrowLeft || keys.KeyA || touch.left || (replay && replay.control === 'left')) mask |= 1;
      if (keys.ArrowRight || keys.KeyD || touch.right || (replay && replay.control === 'right')) mask |= 2;
      if (jumpTapReady() || (replay && replay.control === 'jump')) mask |= 4;
      if (keys.KeyS || keys.KeyX || touch.spray || (replay && replay.control === 'spray')) mask |= 8;
      var tenth = Math.round(dt * 10);
      var elapsed = Math.round(frameElapsedMs * 10);
      runReplayFrames.push(tenth & 255, (tenth >> 8) & 255,
        elapsed & 255, (elapsed >> 8) & 255, mask);
    }

    function encodedRunReplay() {
      if (replayInvalid || !runReplayFrames.length) return null;
      var segments = [];
      for (var i = 0; i < runReplayFrames.length; i += 16384) {
        segments.push(String.fromCharCode.apply(null, runReplayFrames.slice(i, i + 16384)));
      }
      return { version: 1, course_version: COURSE_LAYOUT_VERSION, frames: btoa(segments.join('')) };
    }

    function handleInput(step) {
      var replay = initialInputReplay;
      var left = keys.ArrowLeft || keys.KeyA || touch.left || (replay && replay.control === 'left');
      var right = keys.ArrowRight || keys.KeyD || touch.right || (replay && replay.control === 'right');
      var queuedJump = jumpTapReady();
      var jumpPressed = queuedJump || (replay && replay.control === 'jump');
      if (queuedJump) {
        pendingJumpPresses -= 1;
        nextJumpBoostAtMs = runElapsedMs + JUMP_TAP_SPACING_MS;
      }
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
      var activeMaxSpeed = runElapsedMs < speedBoostUntil ? SPEED_BOOST_MAX_SPEED : MAX_SPEED;
      player.vx = clamp(player.vx, -activeMaxSpeed, activeMaxSpeed);

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
      } else if (jumpPressed && !player.grounded && jumpsUsed === 2) {
        // Third distinct mid-air press; landing, respawn and reset still
        // restore the full three-jump sequence.
        player.vy = TRIPLE_JUMP_VELOCITY;
        if (left !== right) {
          player.vx = left ? -DOUBLE_JUMP_SIDE_SPEED : DOUBLE_JUMP_SIDE_SPEED;
          player.facing = left ? -1 : 1;
        }
        jumpsUsed = 3;
        backflipActive = true;
        setPlayerAnimation('backflip');
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
      var solids = [floor].concat(platforms, crates);
      player.grounded = false;

      for (var i = 0; i < solids.length; i += 1) {
        var tile = solids[i];
        var wasAbove = previousY + player.h <= tile.y + 1;
        if (rectsOverlap(player, tile) && player.vy >= 0 && wasAbove) {
          player.y = tile.y - player.h;
          player.vy = 0;
          player.grounded = true;
          jumpsUsed = 0;
          backflipActive = false;
        }
      }
    }

    function getPlayerVisualMarginX() {
      var animation = getAnimation(player.anim);
      var frameMeta = getAnimationFrameMetadata(animation);
      return Math.max(0, Math.round((frameMeta.renderWidth - player.w) / 2));
    }

    function getPlayerCombatRect() {
      return {
        x: player.x - 8,
        y: player.y - 30,
        w: player.w + 16,
        h: player.h + 30
      };
    }

    function getEnemyCombatRect(enemy) {
      var bob = enemy.bob || 0;
      if (enemy.variant) {
        return { x: enemy.x - 12, y: enemy.y + bob - 10, w: 52, h: 56 };
      }
      if (enemy.type === 'pigeon') {
        return { x: enemy.x - 12, y: enemy.y + bob - 10, w: 52, h: 42 };
      }
      if (enemy.type === 'bot') {
        return { x: enemy.x - 14, y: enemy.y + bob - 12, w: 58, h: 50 };
      }
      if (enemy.type === 'balloon') {
        return { x: enemy.x - 6, y: enemy.y + bob - 4, w: 42, h: 52 };
      }
      return { x: enemy.x - 8, y: enemy.y + bob - 12, w: 44, h: 54 };
    }

    function getSprayAttackRect() {
      return {
        x: player.facing > 0 ? player.x + player.w - 4 : player.x - SPRAY_ENEMY_RANGE + 4,
        y: player.y - 22,
        w: SPRAY_ENEMY_RANGE,
        h: player.h + 44
      };
    }

    function getRatAttackRect(enemy) {
      var body = getEnemyCombatRect(enemy);
      var facing = enemy.attackFacing || (enemy.vx < 0 ? -1 : 1);
      return {
        x: facing > 0 ? body.x + body.w - 4 : body.x - 24,
        y: body.y + 12,
        w: 28,
        h: Math.max(20, body.h - 22)
      };
    }

    function getGraffbotFireFrame(enemy, time) {
      if (!enemy || enemy.type !== 'bot' || !(enemy.fireUntil > time)) return -1;
      return Math.min(GRAFFBOT_FIRE_FRAMES - 1,
        Math.max(0, Math.floor((time - enemy.fireStartedAt) / GRAFFBOT_FIRE_FRAME_MS)));
    }

    function getGraffbotFireRect(enemy, time) {
      if (getGraffbotFireFrame(enemy, time) < 0) return null;
      var facing = enemy.fireFacing || (enemy.vx < 0 ? -1 : 1);
      return {
        x: facing > 0 ? enemy.x + enemy.w - 3 : enemy.x - GRAFFBOT_FIRE_DAMAGE_RANGE + 3,
        y: enemy.y + 3,
        w: GRAFFBOT_FIRE_DAMAGE_RANGE,
        h: 34
      };
    }

    function updatePlayer(dt) {
      var step = dt / TARGET_FRAME_MS;
      handleInput(step);
      if (sprayTimer > 0) sprayTimer -= dt;
      if (player.invuln > 0) player.invuln -= dt;

      var previousX = player.x;
      player.x += player.vx * step;
      var visualMarginX = getPlayerVisualMarginX();
      player.x = clamp(player.x, 12 + visualMarginX, WORLD_WIDTH - player.w - 12 - visualMarginX);
      // Crates block movement from the sides but can also be jumped onto.
      for (var crateIndex = 0; crateIndex < crates.length; crateIndex += 1) {
        var crate = crates[crateIndex];
        if (!rectsOverlap(player, crate)) continue;
        if (player.vx > 0 && previousX + player.w <= crate.x + 1) {
          player.x = crate.x - player.w;
          player.vx = 0;
        } else if (player.vx < 0 && previousX >= crate.x + crate.w - 1) {
          player.x = crate.x + crate.w;
          player.vx = 0;
        }
      }

      var previousY = player.y;
      previousPlayerY = previousY;
      player.vy += GRAVITY * step;
      previousPlayerVy = player.vy;
      player.y += player.vy * step;
      resolveVerticalCollision(previousY);

      if (player.y > HEIGHT + 80) {
        damagePlayer('fall', player.x);
        if (!gameOver) resetToCheckpoint();
      }

      if (sprayTimer > 0) {
        // Preserve the existing attack-animation priority. An explicit attack
        // interrupts the visual flip and must not restart later in the jump.
        backflipActive = false;
        setPlayerAnimation('spray');
      } else if (player.invuln > 0) {
        backflipActive = false;
        setPlayerAnimation('hurt');
      } else if (backflipActive && !player.grounded) {
        setPlayerAnimation('backflip');
      } else if (!player.grounded) {
        setPlayerAnimation(player.vy > 0 ? 'fall' : 'jump');
      } else if (Math.abs(player.vx) > 0.42) {
        setPlayerAnimation('run');
      } else {
        setPlayerAnimation('idle');
      }

      // Spray holds its final painted frame for the attack window. Backflip
      // is also one-shot, but returns to normal airborne art after frame 15.
      var animationFinished = advancePlayerAnimation(dt,
        player.anim !== 'spray' && player.anim !== 'backflip');
      if (player.anim === 'backflip' && animationFinished) {
        backflipActive = false;
        setPlayerAnimation(player.vy > 0 ? 'fall' : 'jump');
      }
    }

    function updateCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var hitSize = Math.round((coin.size || 16) * 0.8);
        var coinRect = { x: coin.x - hitSize / 2, y: coin.y - hitSize / 2,
          w: hitSize, h: hitSize };
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

    function updateSpeedBoxes(time) {
      for (var i = 0; i < speedBoxes.length; i += 1) {
        var box = speedBoxes[i];
        if (box.collected || !rectsOverlap(player, box)) continue;
        box.collected = true;
        speedBoostUntil = time + SPEED_BOOST_DURATION_MS;
        window.dispatchEvent(new CustomEvent('nbg-speed-boost', {
          detail: { activeUntil: speedBoostUntil, maxSpeed: SPEED_BOOST_MAX_SPEED, box: box }
        }));
      }
    }

    function updateRewardBoxes(time) {
      for (var i = 0; i < rewardBoxes.length; i += 1) {
        var box = rewardBoxes[i];
        if (box.opened || !rectsOverlap(player, box)) continue;
        box.opened = true;
        // Rewards are rolled on every actual collection, never preselected by position.
        var pool = box.type === 'star' ?
          [{ type: 'xp', amount: 500 }, { type: 'xp', amount: 750 },
            { type: 'xp', amount: 1000 }, { type: 'health', amount: 2 }] :
          [{ type: 'xp', amount: 100 }, { type: 'xp', amount: 250 },
            { type: 'xp', amount: 500 }, { type: 'health', amount: 1 }];
        var roll = Math.min(pool.length - 1, Math.floor(nextRunRandom() * pool.length));
        var reward = pool[roll];
        var earnedXp = 0;
        var healed = 0;
        if (reward.type === 'health') {
          healed = Math.min(reward.amount, Math.max(0, 5 - player.health));
          player.health += healed;
          if (!healed) {
            earnedXp = box.type === 'star' ? 500 : 100;
          }
        } else {
          earnedXp = reward.amount;
        }
        xp += earnedXp;
        box.reward = { type: reward.type, amount: reward.amount, xp: earnedXp, health: healed };
        rewardNotificationText = (box.type === 'star' ? 'STAR BOX ' : 'MYSTERY BOX ') +
          (earnedXp ? '+' + earnedXp + ' XP' : '+' + healed + ' HEALTH');
        rewardNotificationUntil = time + 2300;
        window.dispatchEvent(new CustomEvent('nbg-reward-found', {
          detail: { kind: box.type, reward: box.reward, xp: xp, health: player.health, box: box }
        }));
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

    function defeatEnemy(enemy, time, reason) {
      if (enemy.defeated) return;
      enemy.defeated = true;
      enemy.defeatedAt = time;
      enemy.fireUntil = 0;
      enemy.balloonState = 'defeated';
      var earnedXp = enemy.spawnedByParachute ? 100 : 75;
      if (enemy.type === 'balloon') {
        if (enemy.balloonRewardAwarded) return;
        enemy.balloonRewardAwarded = true;
        earnedXp = 10 + Math.floor(nextRunRandom() * 9991);
        enemy.balloonRewardXp = earnedXp;
        balloonRewardNotificationText = '+' + earnedXp.toLocaleString('en-US') + ' XP';
        balloonRewardNotificationUntil = time + 2500;
      }
      xp += earnedXp;
      window.dispatchEvent(new CustomEvent('nbg-enemy-defeated', {
        detail: { type: enemy.type || enemy.variant, reason: reason, earnedXp: earnedXp, xp: xp }
      }));
    }

    function playerSprayHits(target) {
      if (sprayTimer <= 0 || gameOver) return false;
      return rectsOverlap(getSprayAttackRect(), getEnemyCombatRect(target));
    }

    function playerStomps(target) {
      var targetRect = getEnemyCombatRect(target);
      var previousFeet = previousPlayerY + player.h;
      var currentFeet = player.y + player.h;
      var footRect = {
        x: player.x + 2,
        y: Math.min(previousFeet, currentFeet) - 5,
        w: player.w - 4,
        h: Math.abs(currentFeet - previousFeet) + 8
      };
      return (player.vy > 1.5 || (player.vy === 0 && previousPlayerVy > 1.5)) &&
        previousFeet <= targetRect.y + 5 &&
        currentFeet >= targetRect.y &&
        rectsOverlap(footRect, targetRect);
    }

    function damagePlayer(type, hazardX) {
      if (player.invuln > 0 || gameOver) return;
      player.health -= 1;
      player.vx = hazardX > player.x ? -5.5 : 5.5;
      player.vy = -6.2;
      player.invuln = INVULN_TIME;
      comboCount = 0;
      comboExpiresAt = 0;
      backflipActive = false;
      setPlayerAnimation('hurt');
      window.dispatchEvent(new CustomEvent('nbg-player-hit', {
        detail: { health: player.health, enemy: type }
      }));
      if (player.health <= 0) {
        player.health = 0;
        gameOver = true;
        running = false;
        speedBoostUntil = 0;
        clearInput();
        window.dispatchEvent(new CustomEvent('nbg-game-over', {
          detail: { timeMs: Math.round(runElapsedMs), xp: xp, enemy: type }
        }));
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

    function updateParachuteRats(time, dt) {
      var step = dt / TARGET_FRAME_MS;
      var landedCount = enemies.filter(function (enemy) { return enemy.spawnedByParachute && !enemy.defeated; }).length;
      if (parachuteSpawnCount === 0) {
        var variants = ['parachuteRatA', 'parachuteRatB', 'parachuteRatC'];
        var variant = variants[Math.floor(nextRunRandom() * variants.length)];
        var drift = (nextRunRandom() * 2 - 1) * 90;
        // One visible encounter belongs to the run, not to a timer, section or
        // checkpoint. Its bounded start-area position keeps it near the player.
        parachuteRats.push({
          x: clamp(PARACHUTE_START_X + drift * 0.25, 350, 430),
          y: 55, w: 28, h: 42, variant: variant,
          swayPhase: nextRunRandom() * Math.PI * 2, vx: 0, age: 0
        });
        parachuteSpawnCount += 1;
      }
      for (var i = parachuteRats.length - 1; i >= 0; i -= 1) {
        var rat = parachuteRats[i];
        rat.age += dt;
        var targetX = player.x + player.w / 2 - rat.w / 2;
        var horizontalTarget = clamp((targetX - rat.x) * PARACHUTE_STEER_SPEED, -0.9, 0.9);
        rat.vx += (horizontalTarget - rat.vx) * Math.min(1, 0.065 * step);
        rat.x += (rat.vx + Math.sin(rat.age / 380 + rat.swayPhase) * 0.24) * step;
        rat.x = clamp(rat.x, 0, WORLD_WIDTH - rat.w);
        rat.y += (PARACHUTE_GLIDE_SPEED + Math.sin(rat.age / 470 + rat.swayPhase) * 0.11) * step;
        if (playerSprayHits(rat) || playerStomps(rat)) {
          var stomped = !playerSprayHits(rat);
          if (stomped) player.vy = ENEMY_STOMP_BOUNCE;
          defeatEnemy(rat, time, stomped ? 'stomp' : 'spray');
          parachuteRats.splice(i, 1);
          continue;
        }
        if (player.invuln <= 0 && rectsOverlap(getPlayerCombatRect(), getEnemyCombatRect(rat))) {
          damagePlayer('parachute-rat', rat.x);
          rat.y = FLOOR_Y - rat.h;
        }
        if (rat.y + rat.h >= FLOOR_Y) {
          if (landedCount < 1) {
            enemies.push({
              type: rat.variant === 'parachuteRatC' ? 'turquoiseRat' : 'brownRat',
              x: rat.x, y: FLOOR_Y - 42, w: 28, h: 42,
              vx: nextRunRandom() < 0.5 ? -1.1 : 1.1,
              min: Math.max(0, rat.x - 65), max: Math.min(WORLD_WIDTH - 28, rat.x + 65),
              spawnedByParachute: true, spawnedAt: runElapsedMs
            });
            landedCount += 1;
          }
          parachuteRats.splice(i, 1);
        }
      }
    }

    function drawParachuteRats(time) {
      for (var i = 0; i < parachuteRats.length; i += 1) {
        var rat = parachuteRats[i];
        var image = images[rat.variant];
        if (!image) continue;
        var x = Math.round(rat.x - cameraX - (PARACHUTE_RENDER_WIDTH - rat.w) / 2);
        if (x + PARACHUTE_RENDER_WIDTH < -10 || x > WIDTH + 10) continue;
        var y = Math.round(rat.y + FOREGROUND_VISUAL_OFFSET_Y - 13);
        var frame = Math.floor((time + i * 153) / 95) % 25;
        var frameW = image.naturalWidth / 5;
        var frameH = image.naturalHeight / 5;
        ctx.drawImage(image, frame % 5 * frameW, Math.floor(frame / 5) * frameH,
          frameW, frameH, x, y, PARACHUTE_RENDER_WIDTH, PARACHUTE_RENDER_HEIGHT);
      }
    }

    function updateEnemies(time, dt) {
      var step = dt / TARGET_FRAME_MS;
      for (var i = enemies.length - 1; i >= 0; i -= 1) {
        var enemy = enemies[i];
        if (enemy.defeated || (enemy.spawnedByParachute &&
            (runElapsedMs - enemy.spawnedAt >= PARACHUTE_LANDED_LIFETIME_MS ||
            Math.abs(enemy.x - player.x) > WIDTH * 2))) {
          if (enemy.spawnedByParachute) enemies.splice(i, 1);
          continue;
        }
        if (playerSprayHits(enemy) || playerStomps(enemy)) {
          var stomped = !playerSprayHits(enemy);
          if (stomped) player.vy = ENEMY_STOMP_BOUNCE;
          defeatEnemy(enemy, time, stomped ? 'stomp' : 'spray');
          if (enemy.spawnedByParachute) enemies.splice(i, 1);
          continue;
        }

        var balloonActive = enemy.type === 'balloon' && enemy.balloonState === 'release';
        if (enemy.type === 'balloon') {
          if (balloonActive && time - enemy.balloonStartedAt >= BALLOON_CYCLE_MS) {
            enemy.balloonCycles += 1;
            enemy.balloonState = 'walk';
            enemy.nextBalloonAt = enemy.balloonCycles < 2 ?
              time + BALLOON_REPEAT_DELAY_MS : Number.POSITIVE_INFINITY;
            balloonActive = false;
          }
          if (!balloonActive && enemy.balloonCycles < 2 &&
              Math.abs(player.x - enemy.x) < BALLOON_TRIGGER_RANGE &&
              time >= (enemy.nextBalloonAt || 0)) {
            enemy.balloonState = 'release';
            enemy.balloonStartedAt = time;
            enemy.balloonFacing = player.x + player.w / 2 < enemy.x + enemy.w / 2 ? -1 : 1;
            balloonActive = true;
          }
        }

        var botFireActive = enemy.type === 'bot' && (enemy.fireUntil || 0) > time;
        if (enemy.type === 'bot' && !botFireActive &&
            Math.abs(player.x - enemy.x) < GRAFFBOT_FIRE_TRIGGER_RANGE &&
            Math.abs(player.y - enemy.y) < 70 &&
            time >= (enemy.nextFireAt || 0)) {
          enemy.fireFacing = player.x + player.w / 2 < enemy.x + enemy.w / 2 ? -1 : 1;
          enemy.fireStartedAt = time;
          enemy.fireUntil = time + GRAFFBOT_FIRE_DURATION_MS;
          enemy.nextFireAt = enemy.fireUntil + GRAFFBOT_FIRE_COOLDOWN_MS;
          botFireActive = true;
        }

        if (!balloonActive && !botFireActive) {
          enemy.x += enemy.vx * step;
          if (enemy.x < enemy.min || enemy.x > enemy.max) enemy.vx *= -1;
        }
        if (enemy.type === 'pigeon') enemy.bob = Math.sin(time / 180) * 9;
        if (enemy.type === 'rat' || enemy.type === 'turquoiseRat' || enemy.type === 'brownRat') {
          var ratClose = Math.abs(player.x - enemy.x) < RAT_ATTACK_RANGE && Math.abs(player.y - enemy.y) < 65;
          if (ratClose && time >= (enemy.nextAttackAt || 0) && time >= (enemy.attackUntil || 0)) {
            enemy.attackType = enemy.type === 'turquoiseRat' ?
              (nextRunRandom() < 0.5 ? 'turquoiseRatKick' : 'turquoiseRatPunch') :
              enemy.type === 'brownRat' ? 'brownRatPunch' :
              (nextRunRandom() < 0.5 ? 'ratBladeFlurry' : 'ratViperPounce');
            enemy.attackStartedAt = time;
            enemy.attackUntil = time + RAT_ATTACK_DURATION_MS;
            enemy.nextAttackAt = time + RAT_ATTACK_COOLDOWN_MS;
            enemy.attackFacing = player.x + player.w / 2 < enemy.x + enemy.w / 2 ? -1 : 1;
          }
        }
        if (enemy.type === 'bot' && sprayTimer > 0 && Math.abs(player.x - enemy.x) < 65 && Math.abs(player.y - enemy.y) < 60 &&
            (player.facing > 0 ? enemy.x >= player.x - 8 : enemy.x <= player.x + player.w + 8)) {
          enemy.hurtUntil = time + 360;
        }

        var enemyRect = getEnemyCombatRect(enemy);
        var isRat = enemy.type === 'rat' || enemy.type === 'turquoiseRat' || enemy.type === 'brownRat';
        var activeRatAttack = isRat && (enemy.attackUntil || 0) > time &&
          rectsOverlap(getPlayerCombatRect(), getRatAttackRect(enemy));
        var fireRect = enemy.type === 'bot' ? getGraffbotFireRect(enemy, time) : null;
        var activeGraffbotFire = fireRect && rectsOverlap(getPlayerCombatRect(), fireRect);
        if (player.invuln <= 0 &&
            (rectsOverlap(getPlayerCombatRect(), enemyRect) || activeRatAttack || activeGraffbotFire)) {
          damagePlayer(activeGraffbotFire ? 'graffbot-fire' : enemy.type, enemy.x);
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
          if (xp > bestXp) bestXp = xp;
          if (bestTimeMs === null || runElapsedMs < bestTimeMs) bestTimeMs = runElapsedMs;
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
            leaderboardReady: true,
            replay: encodedRunReplay()
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
      // Hold Down to inspect the ground below a higher platform. This only
      // translates rendered scenery and does not affect hitboxes or XP.
      if (keys.ArrowDown || touch.look) targetCameraY -= CAMERA_LOOK_DOWN_MAX_Y;
      cameraY += (targetCameraY - cameraY) * CAMERA_JUMP_EASE;
    }

    function updateHud() {
      var collected = coins.filter(function (coin) { return coin.taken; }).length;
      hud.xp.textContent = 'XP ' + xp;
      hud.coins.textContent = 'COINS ' + collected + '/' + coins.length;
      hud.health.textContent = 'HEALTH ' + player.health;
      hud.state.textContent = complete ? 'LEVEL COMPLETE' : gameOver ? 'GAME OVER' : running ? ((checkpoint.active || courseCheckpoints.some(function (marker) { return marker.active; })) ? 'CHECKPOINT' : 'RUNNING') : WAITING_HUD_TEXT;
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

    // The 480x270 uploaded clouds.jpg fills the game viewport exactly, but
    // its left and right edges are not seamless. Alternating mirrored tiles
    // makes both joins match without stretching or changing the source art.
    function drawSkyWallpaper() {
      var image = images.sky;
      if (!image) {
        ctx.fillStyle = '#171730';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        return;
      }
      var tileW = WIDTH;
      var offset = -cameraX * 0.08;
      var firstTile = Math.floor(-offset / tileW) - 1;
      for (var tile = firstTile; offset + tile * tileW < WIDTH + tileW; tile++) {
        var x = Math.round(offset + tile * tileW);
        if (tile % 2 !== 0) {
          ctx.save();
          ctx.translate(x + tileW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(image, 0, 0, tileW, HEIGHT);
          ctx.restore();
        } else {
          ctx.drawImage(image, x, 0, tileW, HEIGHT);
        }
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
      drawSkyWallpaper();
      drawSkylineLayer();
      drawImageLayer(images.wall, 0.58, 154, 88, '#2d2033');
      drawStreetLayer();
      // Looking below shifts the road upward; extend the painted roadbed
      // beneath its existing 28px street strip instead of exposing blue clear.
      ctx.fillStyle = '#303238';
      ctx.fillRect(0, STREET_Y + STREET_BAND_HEIGHT, WIDTH, CAMERA_LOOK_DOWN_MAX_Y + 2);

      // A whole platform uses brick OR rock, never an alternating mixture.
      for (var i = 0; i < platforms.length; i += 1) {
        var p = platforms[i];
        var x = Math.round(p.x - cameraX);
        if (x + p.w < 0 || x > WIDTH) continue;
        var platformY = p.y + FOREGROUND_VISUAL_OFFSET_Y;
        var tileImage = p.material === 'rock' ? images.floatingRock : images.floatingBrick;
        if (!tileImage) {
          ctx.fillStyle = p.material === 'rock' ? '#394050' : '#854e26';
          ctx.fillRect(x, platformY, p.w, p.h);
          continue;
        }
        for (var tileX = 0; tileX < p.w; tileX += 16) {
          var width = Math.min(16, p.w - tileX);
          ctx.drawImage(tileImage, 0, 0,
            tileImage.naturalWidth * width / 16, tileImage.naturalHeight,
            x + tileX, platformY, width, p.h);
        }
      }

      for (var j = 0; j < crates.length; j += 1) {
        var crate = crates[j];
        var crateX = Math.round(crate.x - cameraX);
        if (crateX + crate.w < 0 || crateX > WIDTH) continue;
        var crateY = crate.y + FOREGROUND_VISUAL_OFFSET_Y;
        if (images.floorCrate) {
          ctx.drawImage(images.floorCrate, crateX, crateY, crate.w, crate.h);
        } else {
          ctx.fillStyle = '#b5793e';
          ctx.fillRect(crateX, crateY, crate.w, crate.h);
        }
      }
      drawHazards();
    }

    function drawCoins(time) {
      for (var i = 0; i < coins.length; i += 1) {
        var coin = coins[i];
        if (coin.taken) continue;
        var coinSize = coin.size || 16;
        var x = Math.round(coin.x - cameraX - coinSize / 2);
        if (x < -coinSize || x > WIDTH + coinSize) continue;
        var y = Math.round(coin.y + (coin.float || 0) + FOREGROUND_VISUAL_OFFSET_Y - coinSize / 2);
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
            coinSourceWidth, coinSourceHeight, x, y, coinSize, coinSize);
        } else {
          ctx.fillStyle = '#ffd447';
          ctx.fillRect(x + Math.round(coinSize * 0.18), y, Math.round(coinSize * 0.64), coinSize);
        }
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
        if (enemy.defeated) continue;
        var botHurt = enemy.type === 'bot' && (enemy.hurtUntil || 0) > time;
        var botFireActive = enemy.type === 'bot' && (enemy.fireUntil || 0) > time;
        var botKicking = enemy.type === 'bot' && !botHurt && (botFireActive || (Math.abs(player.x - enemy.x) < 68 && Math.abs(player.y - enemy.y) < 48));
        var botImageKey = botHurt ? 'botHurt' : botKicking ? 'botKick' : 'bot';
        var isWalkingRat = enemy.type === 'rat' || enemy.type === 'turquoiseRat' || enemy.type === 'brownRat';
        var ratAttacking = isWalkingRat && (enemy.attackUntil || 0) > time;
        var ratImageKey = ratAttacking ? enemy.attackType :
          (enemy.type === 'turquoiseRat' ? 'turquoiseRatWalk' :
          enemy.type === 'brownRat' ? 'brownRatWalk' : 'rat');
        var balloonActive = enemy.type === 'balloon' && enemy.balloonState === 'release';
        var image = images[enemy.type === 'bot' ? botImageKey : isWalkingRat ? ratImageKey :
          enemy.type === 'balloon' ? (balloonActive ? 'balloonRelease' : 'balloonWalk') : enemy.type];
        var x = Math.round(enemy.x - cameraX);
        var cullMargin = enemy.type === 'balloon' ? 100 : enemy.type === 'pigeon' ?
          Math.round((FLYING_PIG_RENDER_WIDTH - enemy.w) / 2) : 0;
        if (x < -enemy.w - cullMargin || x > WIDTH + cullMargin) continue;
        var y = Math.round(enemy.y + (enemy.bob || 0) + FOREGROUND_VISUAL_OFFSET_Y);
        if (image) {
          ctx.save();
          if (isWalkingRat) {
            var ratFrameWidth = image.naturalWidth / RAT_SHEET_COLUMNS;
            var ratFrameHeight = image.naturalHeight / RAT_SHEET_ROWS;
            var ratFrame = ratAttacking ?
              Math.min(RAT_SHEET_FRAMES - 1, Math.floor((time - enemy.attackStartedAt) / (RAT_ATTACK_DURATION_MS / RAT_SHEET_FRAMES))) :
              Math.floor((time + enemy.x * 3) / 90) % RAT_SHEET_FRAMES;
            ratFrame = Math.max(0, ratFrame);
            var ratSourceX = ratFrame % RAT_SHEET_COLUMNS * ratFrameWidth;
            var ratSourceY = Math.floor(ratFrame / RAT_SHEET_COLUMNS) * ratFrameHeight;
            // Brown walk artwork is undersized, and the brown punch sheet has
            // even more transparent padding per frame. Scale each pose
            // independently, without altering any enemy hitbox or XP rules.
            var ratScale = enemy.type === 'brownRat' ?
              (ratAttacking ? 2.45 : 1.55) :
              (ratAttacking && enemy.type === 'rat' ? 1.9 : 1);
            var ratDrawWidth = Math.round(RAT_RENDER_WIDTH * ratScale);
            var ratDrawHeight = Math.round(RAT_RENDER_HEIGHT * ratScale);
            var ratDrawX = x - Math.round((ratDrawWidth - enemy.w) / 2);
            // Brown sprite frames contain transparent pixels *below* their
            // feet: ~18 output pixels for walk, ~34 for the padded punch sheet.
            // Anchor the visible feet (not the bottom of the transparent cell)
            // to the same physics-ground line for both poses and directions.
            var ratFootY = y + enemy.h;
            var brownFootPadding = enemy.type === 'brownRat' ?
              (ratAttacking ? 34 : 18) : 0;
            var ratDrawY = ratFootY - ratDrawHeight + brownFootPadding;
            var ratFacing = ratAttacking && Math.abs(enemy.vx) > 0.01 ?
              (enemy.attackFacing || (enemy.vx < 0 ? -1 : 1)) : (enemy.vx < 0 ? -1 : 1);
            if (ratFacing < 0) {
              ctx.translate(ratDrawX + ratDrawWidth, ratDrawY);
              ctx.scale(-1, 1);
              ctx.drawImage(image, ratSourceX, ratSourceY, ratFrameWidth, ratFrameHeight,
                0, 0, ratDrawWidth, ratDrawHeight);
            } else {
              ctx.drawImage(image, ratSourceX, ratSourceY, ratFrameWidth, ratFrameHeight,
                ratDrawX, ratDrawY, ratDrawWidth, ratDrawHeight);
            }
          } else if (enemy.type === 'pigeon') {
            // These are presentation-only frames. Preserve the canonical
            // 28x22 pigeon physics while drawing the pig at 56x44.
            if (!flyingPigFrames) flyingPigFrames = isolateFlyingPigFrames(image);
            var pigFrame = Math.floor((time + enemy.x * 3) /
              FLYING_PIG_FRAME_MS) % FLYING_PIG_FRAMES;
            var pigImage = flyingPigFrames[pigFrame];
            var pigDrawX = x - Math.round((FLYING_PIG_RENDER_WIDTH - enemy.w) / 2);
            var pigDrawY = y - Math.round((FLYING_PIG_RENDER_HEIGHT - enemy.h) / 2);
            if (enemy.vx < 0) {
              ctx.translate(pigDrawX + FLYING_PIG_RENDER_WIDTH, pigDrawY);
              ctx.scale(-1, 1);
              ctx.drawImage(pigImage, 0, 0, pigImage.width, pigImage.height,
                0, 0, FLYING_PIG_RENDER_WIDTH, FLYING_PIG_RENDER_HEIGHT);
            } else {
              ctx.drawImage(pigImage, 0, 0, pigImage.width, pigImage.height,
                pigDrawX, pigDrawY, FLYING_PIG_RENDER_WIDTH, FLYING_PIG_RENDER_HEIGHT);
            }
          } else if (enemy.type === 'balloon') {
            var balloonKey = balloonActive ? 'balloonRelease' : 'balloonWalk';
            var balloonAnimation = BALLOON_ANIMATIONS[balloonKey];
            var balloonFrameCount = balloonAnimation.frames;
            var balloonFrame = balloonActive ?
              Math.min(balloonFrameCount - 1,
                Math.floor((time - enemy.balloonStartedAt) / balloonAnimation.frameMs)) :
              Math.floor((time + enemy.x * 3) / balloonAnimation.frameMs) % balloonFrameCount;
            balloonFrame = Math.max(0, balloonFrame);
            var balloonBounds = balloonFrames[balloonKey][balloonFrame];
            var balloonScale = balloonAnimation.scale;
            var balloonFacing = balloonActive ? (enemy.balloonFacing || 1) : (enemy.vx < 0 ? -1 : 1);
            ctx.translate(x + enemy.w / 2, y + enemy.h);
            ctx.scale(balloonFacing, 1);
            ctx.drawImage(image, balloonBounds.x, balloonBounds.y,
              balloonBounds.width, balloonBounds.height,
              -balloonBounds.anchorX * balloonScale, -balloonBounds.footY * balloonScale,
              balloonBounds.width * balloonScale, balloonBounds.height * balloonScale);
          } else if (enemy.type === 'bot') {
            var cellW = image.naturalWidth / BOT_SHEET_COLUMNS;
            var cellH = image.naturalHeight / BOT_SHEET_ROWS;
            var frameMs = botHurt ? 75 : botKicking ? 70 : 85;
            var frame = botHurt ? Math.min(BOT_SHEET_FRAMES - 1, Math.floor((time - (enemy.hurtUntil - 360)) / frameMs)) :
              botFireActive ? Math.min(BOT_SHEET_FRAMES - 1, Math.floor((time - enemy.fireStartedAt) / frameMs)) :
              Math.floor((time + enemy.x * 3) / frameMs) % BOT_SHEET_FRAMES;
            frame = Math.max(0, frame);
            var sourceX = frame % BOT_SHEET_COLUMNS * cellW;
            var sourceY = Math.floor(frame / BOT_SHEET_COLUMNS) * cellH;
            var drawX = x - Math.round((BOT_RENDER_WIDTH - enemy.w) / 2);
            var drawY = y + enemy.h - BOT_RENDER_HEIGHT;
            var botFacing = botFireActive ? (enemy.fireFacing || 1) : (enemy.vx < 0 ? -1 : 1);
            if (botFacing < 0) {
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

    function drawGraffbotFires(time) {
      var image = images.botFire;
      if (!image) return;
      var cellW = (image.naturalWidth || image.width) / GRAFFBOT_FIRE_COLUMNS;
      var cellH = (image.naturalHeight || image.height) / GRAFFBOT_FIRE_ROWS;
      for (var i = 0; i < enemies.length; i += 1) {
        var enemy = enemies[i];
        var frame = getGraffbotFireFrame(enemy, time);
        if (enemy.defeated || frame < 0) continue;
        var facing = enemy.fireFacing || (enemy.vx < 0 ? -1 : 1);
        var anchorX = Math.round(enemy.x - cameraX + (facing > 0 ? enemy.w - 4 : 4));
        var drawX = facing > 0 ? anchorX : anchorX - GRAFFBOT_FIRE_RENDER_SIZE;
        var drawY = Math.round(enemy.y + FOREGROUND_VISUAL_OFFSET_Y + enemy.h / 2 -
          GRAFFBOT_FIRE_RENDER_SIZE / 2 + GRAFFBOT_FIRE_MOUTH_OFFSET_Y);
        var sourceX = frame % GRAFFBOT_FIRE_COLUMNS * cellW;
        var sourceY = Math.floor(frame / GRAFFBOT_FIRE_COLUMNS) * cellH;
        ctx.save();
        // The production sheet faces right natively. Mirror only leftward fire
        // so the visible jet and its directional damage rectangle agree.
        if (facing < 0) {
          ctx.translate(drawX + GRAFFBOT_FIRE_RENDER_SIZE, drawY);
          ctx.scale(-1, 1);
          ctx.drawImage(image, sourceX, sourceY, cellW, cellH,
            0, 0, GRAFFBOT_FIRE_RENDER_SIZE, GRAFFBOT_FIRE_RENDER_SIZE);
        } else {
          ctx.drawImage(image, sourceX, sourceY, cellW, cellH,
            drawX, drawY, GRAFFBOT_FIRE_RENDER_SIZE, GRAFFBOT_FIRE_RENDER_SIZE);
        }
        ctx.restore();
      }
    }

    function drawObjects() {
      for (var speedIndex = 0; speedIndex < speedBoxes.length; speedIndex += 1) {
        var speedBox = speedBoxes[speedIndex];
        if (speedBox.collected) continue;
        var speedX = Math.round(speedBox.x - cameraX);
        if (speedX + speedBox.w < 0 || speedX > WIDTH) continue;
        var speedY = speedBox.y + FOREGROUND_VISUAL_OFFSET_Y;
        if (images.speedBox) {
          ctx.drawImage(images.speedBox, speedX, speedY,
            SPEED_BOX_RENDER_SIZE, SPEED_BOX_RENDER_SIZE);
        }
      }

      for (var boxIndex = 0; boxIndex < rewardBoxes.length; boxIndex += 1) {
        var box = rewardBoxes[boxIndex];
        var boxX = Math.round(box.x - cameraX);
        if (boxX + box.w < 0 || boxX > WIDTH) continue;
        var boxY = box.y + FOREGROUND_VISUAL_OFFSET_Y;
        var boxImage = box.type === 'star' ? images.starBox : images.mysteryBox;
        ctx.save();
        if (box.opened) ctx.globalAlpha = 0.32;
        if (boxImage) {
          ctx.drawImage(boxImage, boxX, boxY, box.w, box.h);
        } else {
          ctx.fillStyle = box.type === 'star' ? '#ffd85c' : '#ff9c38';
          ctx.fillRect(boxX, boxY, box.w, box.h);
        }
        ctx.restore();
      }

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
      if (!complete && !gameOver) return;
      if (gameOver) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.84)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff786b';
        ctx.font = '900 26px Courier New';
        ctx.fillText('GAME OVER', WIDTH / 2, 81);
        ctx.font = 'bold 13px Courier New';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('RUN TIME ' + formatRunTime(runElapsedMs), WIDTH / 2, 121);
        ctx.fillText('XP EARNED ' + xp, WIDTH / 2, 145);
        ctx.fillStyle = '#ffd447';
        ctx.fillText('PRESS RESET TO TRY AGAIN', WIDTH / 2, 190);
        ctx.restore();
        return;
      }
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
      ctx.fillText('PRACTICE XP: ' + xp, WIDTH / 2, 174);
      ctx.fillText('BEST PRACTICE XP: ' + bestXp, WIDTH / 2, 196);
      ctx.fillText('PRESS RESET TO RUN AGAIN', WIDTH / 2, 221);
      ctx.restore();
    }

    function drawSpeedrunHud(time) {
      var speedrunText = 'RUN ' + formatRunTime(runElapsedMs) + '/3:00';
      if (time < speedBoostUntil) {
        speedrunText += ' B' + ((speedBoostUntil - time) / 1000).toFixed(1) + 's';
      }
      if (comboCount > 1 && time < comboExpiresAt) speedrunText += ' Cx' + comboCount;
      var panelX = WIDTH - SPEEDRUN_HUD_WIDTH - 4;
      ctx.save();
      ctx.fillStyle = 'rgba(9, 19, 38, 0.86)';
      ctx.fillRect(panelX, 3, SPEEDRUN_HUD_WIDTH, SPEEDRUN_HUD_HEIGHT);
      ctx.font = 'bold 6px Courier New';
      ctx.fillStyle = time < speedBoostUntil ? '#ffe45a' : '#ffffff';
      ctx.fillText(speedrunText, panelX + 3, 10);
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

    function drawRewardNotification(time) {
      if (time >= rewardNotificationUntil) return;
      ctx.save();
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#191522';
      ctx.fillText(rewardNotificationText, WIDTH / 2 + 1, 67);
      ctx.fillStyle = '#fff08c';
      ctx.fillText(rewardNotificationText, WIDTH / 2, 66);
      ctx.restore();
    }

    function drawBalloonRewardNotification(time) {
      if (time >= balloonRewardNotificationUntil) return;
      ctx.save();
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111111';
      ctx.fillText(balloonRewardNotificationText, WIDTH / 2 + 2, 91);
      ctx.fillStyle = '#ff4d65';
      ctx.fillText(balloonRewardNotificationText, WIDTH / 2, 89);
      ctx.restore();
    }

    function render(time) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#0078fb';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      ctx.translate(0, Math.round(cameraY));
      drawWorld();
      drawCoins(time);
      drawSecretCoins(time);
      drawObjects();
      // Attack start/end timestamps use runElapsedMs in updateEnemies();
      // RAF performance.now() is a different clock and hid attack poses.
      drawEnemies(runElapsedMs);
      drawGraffbotFires(runElapsedMs);
      drawParachuteRats(time);
      drawPlayer();
      ctx.restore();
      drawSpeedrunHud(runElapsedMs);
      drawSecretNotification(runElapsedMs);
      drawRewardNotification(runElapsedMs);
      drawBalloonRewardNotification(runElapsedMs);
      drawOverlay();
    }

    function tick(time, sequence) {
      if (sequence !== runSequence) return;
      if (!lastTime) lastTime = time;
      var frameElapsedMs = Math.round(Math.max(0, time - lastTime) * 10) / 10;
      var dt = Math.min(33, frameElapsedMs);
      lastTime = time;

      if (running) {
        runElapsedMs += frameElapsedMs;
        recordReplayTick(frameElapsedMs, dt);
        updatePlayer(dt);
        if (gameOver) {
          cameraY = 0; // Terminal frame is always normally framed.
          updateHud();
          render(time);
          return;
        }
        updateCoins(runElapsedMs);
        updateSpeedBoxes(runElapsedMs);
        updateSecretCoins(runElapsedMs);
        updateRewardBoxes(runElapsedMs);
        updateEnemies(runElapsedMs, dt);
        updateParachuteRats(runElapsedMs, dt);
        updateHazards();
        updateLevel();
        updateCamera();
        updateCameraY();
        if (!running) cameraY = 0; // Completion must not freeze a held-down look.
      } else if (completionAnimationActive) {
        completionAnimationActive = !advancePlayerAnimation(dt, false);
      }
      updateHud();
      render(time);
      if (running || completionAnimationActive) requestAnimationFrame(function (nextTime) { tick(nextTime, sequence); });
    }

    function exposeTestState() {
      window.NBGLevel1State = {
        get player() { return player; },
        get jumpsUsed() { return jumpsUsed; },
        get backflipActive() { return backflipActive; },
        get pendingJumpPresses() { return pendingJumpPresses; },
        get nextJumpBoostAtMs() { return nextJumpBoostAtMs; },
        get recordedReplay() { return encodedRunReplay(); },
        get coins() { return coins; },
        get secretCoins() { return secretCoins; },
        get secretNotificationUntil() { return secretNotificationUntil; },
        get secretNotificationText() { return secretNotificationText; },
        get enemies() { return enemies; },
        get parachuteRats() { return parachuteRats; },
        get parachuteSpawnCount() { return parachuteSpawnCount; },
        get platforms() { return platforms; },
        get crates() { return crates; },
        get rewardBoxes() { return rewardBoxes; },
        get speedBoxes() { return speedBoxes; },
        get speedBoostUntil() { return speedBoostUntil; },
        get speedBoostActive() { return runElapsedMs < speedBoostUntil; },
        get balloonRewardNotificationText() { return balloonRewardNotificationText; },
        get balloonRewardNotificationUntil() { return balloonRewardNotificationUntil; },
        get rewardNotificationText() { return rewardNotificationText; },
        get rewardNotificationUntil() { return rewardNotificationUntil; },
        get hazards() { return hazards; },
        get courseCheckpoints() { return courseCheckpoints; },
        get runElapsedMs() { return runElapsedMs; },
        get bestTimeMs() { return bestTimeMs; },
        get bestXp() { return bestXp; },
        get speedrunBonusXp() { return speedrunBonusXp; },
        get comboCount() { return comboCount; },
        get xp() { return xp; },
        get complete() { return complete; },
        get gameOver() { return gameOver; },
        get activeSpawnedRats() { return enemies.filter(function (enemy) { return enemy.spawnedByParachute && !enemy.defeated; }).length; },
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
        get playerAnimations() { return playerAnimations; },
        get objectImages() { return images; },
        get playerCombatRect() { return getPlayerCombatRect(); },
        enemyCombatRect: function (enemy) { return getEnemyCombatRect(enemy); },
        get sprayAttackRect() { return getSprayAttackRect(); },
        ratAttackRect: function (enemy) { return getRatAttackRect(enemy); },
        graffbotFireRect: function (enemy) { return getGraffbotFireRect(enemy, runElapsedMs); }
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
      runSequence += 1;
      pendingRunStartPromise = null;
      pendingRunOwner = null;
      running = false;
      gameOver = false;
      waitingForFirstInput = true;
      completionAnimationActive = false;
      complete = false;
      lastTime = 0;
      cameraX = 0;
      cameraY = 0;
      checkpointX = 72;
      finishBonusAwarded = false;
      sprayTimer = 0;
      speedBoostUntil = 0;
      balloonRewardNotificationText = '';
      balloonRewardNotificationUntil = 0;
      parachuteRats = [];
      parachuteSpawnCount = 0;
      runElapsedMs = 0;
      nextJumpBoostAtMs = 0;
      runReplayFrames = [];
      replayInvalid = false;
      runRandomState = 0x9e3779b9;
      speedrunBonusXp = 0;
      comboCount = 0;
      comboExpiresAt = 0;
      xp = 0;
      secretNotificationUntil = 0;
      secretNotificationText = '';
      rewardNotificationText = '';
      rewardNotificationUntil = 0;
      pendingInitialInput = null;
      initialInputReplay = null;
      clearInput();

      player.x = 64;
      player.w = 24;
      player.h = 34;
      player.y = FLOOR_Y - player.h;
      previousPlayerY = player.y;
      previousPlayerVy = 0;
      player.vx = 0;
      player.vy = 0;
      player.facing = 1;
      player.grounded = true;
      jumpsUsed = 0;
      backflipActive = false;
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
      rewardBoxes.forEach(function (box) { box.opened = false; box.reward = null; });
      speedBoxes.forEach(function (box) { box.collected = false; });
      // Remove extra walkers created by landed parachutes before restoring patrols.
      enemies.length = 0;
      initialEnemies.forEach(function (enemy) { enemies.push(Object.assign({}, enemy)); });
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
            images[key] = key === 'botFire' && result.image ?
              prepareMatteSpriteSheet(result.image, 18) : result.image;
            if (BALLOON_ANIMATIONS[key] && result.image)
              balloonFrames[key] = measureBalloonFrames(result.image, BALLOON_ANIMATIONS[key]);
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
              image: key === 'spray' && result.image ?
                prepareFinalSpraySheet(result.image) : result.image
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

    function startSimulation() {
      // A Jump press is already in pendingJumpPresses (keyboard and touch).
      // Replaying the same press as an initial control would create a second
      // Jump on the following tick without a second user action.
      initialInputReplay = pendingInitialInput && pendingInitialInput.control === 'jump' &&
        pendingJumpPresses > 0 ? null : pendingInitialInput;
      pendingInitialInput = null;
      waitingForFirstInput = false;
      running = true;
      runSequence += 1;
      var sequence = runSequence;
      runReplayFrames = [];
      replayInvalid = false;
      runRandomState = 0x9e3779b9;
      lastTime = 0;
      updateHud();
      window.dispatchEvent(new CustomEvent('nbg-level-started', { detail: { level: 'london-level-1' } }));
      requestAnimationFrame(function (time) { tick(time, sequence); });
      return Promise.resolve(window.NBGLevel1State);
    }

    function cancelQueuedStartIfOwnerChanged() {
      if (!pendingRunStartPromise) return;
      var gate = window.MOONBOYS_IDENTITY;
      var currentOwner = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
      var sameOwner = pendingRunOwner && currentOwner === pendingRunOwner &&
        gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked();
      if (sameOwner) return;
      // Abandon only this level's pending gameplay wait, not the old Worker's
      // HTTP request; the latter is still serialized by its captured owner.
      // A new owner's controls must never wait for the old account's network.
      runSequence += 1;
      pendingRunStartPromise = null;
      pendingRunOwner = null;
      pendingInitialInput = null;
      initialInputReplay = null;
      clearInput();
      waitingForFirstInput = true;
      updateHud();
    }

    function beginGameplay(control) {
      if (running) return Promise.resolve(window.NBGLevel1State);
      if (!assetsLoaded) return init().then(function () { return beginGameplay(control); });
      if (complete || gameOver) return Promise.resolve(window.NBGLevel1State);
      if (pendingRunStartPromise) {
        cancelQueuedStartIfOwnerChanged();
        if (pendingRunStartPromise) return pendingRunStartPromise;
      }
      // A fast reset can queue a new /run/start behind a still-unsettled
      // request for this SAME Telegram owner. Hold simulation at elapsed 0
      // until its actual signed server session exists. Guest/ordinary starts
      // retain the original immediate play path.
      var beforePlay = window.NBGLondonBeforeQueuedRun;
      var preparation = typeof beforePlay === 'function' ? beforePlay() : null;
      if (!preparation || typeof preparation.then !== 'function')
        return startSimulation();
      // The jump press is held by pendingJumpPresses already, including if
      // released while awaiting the signed session. Do not replay it twice.
      if (control && control !== 'jump' && !pendingInitialInput)
        pendingInitialInput = { control: control };
      var ownerGate = window.MOONBOYS_IDENTITY;
      var capturedOwner = String(ownerGate && ownerGate.getTelegramId ?
        ownerGate.getTelegramId() || '' : '');
      var capturedSequence = runSequence;
      var wait = Promise.resolve(preparation).catch(function () {
        // Auth/network failure leaves gameplay playable as practice, without
        // claiming an official score. Client displays the ranked error.
      }).then(function () {
        var gate = window.MOONBOYS_IDENTITY;
        var currentOwner = String(gate && gate.getTelegramId ? gate.getTelegramId() || '' : '');
        if (capturedSequence !== runSequence || complete || gameOver ||
            currentOwner !== capturedOwner)
          return window.NBGLevel1State;
        if (pendingRunStartPromise === wait) {
          pendingRunStartPromise = null;
          pendingRunOwner = null;
        }
        return startSimulation();
      });
      pendingRunOwner = capturedOwner;
      pendingRunStartPromise = wait;
      return wait;
    }

    window.addEventListener('moonboys:identity-change', cancelQueuedStartIfOwnerChanged);
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
      suspendInput: clearInput,
      setTouchControl: function (control, active) {
        if (Object.prototype.hasOwnProperty.call(touch, control)) {
          touch[control] = active;
          if (active) {
            if (control === 'jump') pendingJumpPresses = Math.min(Math.max(0, 3 - jumpsUsed), pendingJumpPresses + 1);
            if (control !== 'look') {
              queueInitialInput(control);
              beginGameplay(control);
            }
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
