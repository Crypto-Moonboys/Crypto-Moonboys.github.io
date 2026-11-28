/*
 * Getting Up — "The Gauntlet" course (unranked map prototype).
 *
 * Loaded only by /games/getting-up/ and activated by
 * <canvas data-nbg-course="getting-up-gauntlet">. The shared engine
 * (game/nbg-level1.js) only reads this for unranked runs, so the ranked
 * NBG London course and its Worker replay stay unchanged.
 *
 * Timer level: race the clock, hunt points, or both. Points are uncapped.
 *
 * New objects (TEMP ART files live in course-art/temp/, final art can be
 * dropped in with the same filenames):
 *   floor pits, moving platforms, crumbling platforms, floating wall blocks
 *   (solid on all sides), low crawl-space walls, bounce pads, laser gates,
 *   flame vents, gems, relics, tag spots (spray to reveal a piece),
 *   time crystals (-3s), coin trails (clear a trail for a bonus), hidden sky
 *   routes (camera reveals them only after you land up there), visible
 *   course checkpoints and warning signs.
 *
 * Hidden: NIGHT TRAIN easter egg (faint wall just before the flag — spray it).
 * Shortcut: tap 1 + 9 together to start on the night-train perch (5s drop).
 * LEVEL 1A: the night-train carriage run, x ~300 -> the finish flag, with its own
 *   obstacles (gantries, signal lasers, drones) and sky structures to hidden riches.
 *
 * Debug: add ?gu-debug=1 to the page URL. Keys 0-8 jump to zone starts, 9 to the night-train wall,
 * G toggles invulnerability, H toggles hitbox outlines.
 */
(function () {
  'use strict';

  var ART = '/games/getting-up/course-art/';
  var TEMP = ART + 'temp/';

  function createGauntlet(env) {
    var F = env.FLOOR_Y;
    var OFFSET_Y = env.FOREGROUND_VISUAL_OFFSET_Y;
    var VIEW_W = env.WIDTH;
    var VIEW_H = env.HEIGHT;
    var STREET_Y = env.STREET_Y;
    var TIERS = env.COIN_TIERS;
    var TAU = Math.PI * 2;

    var debug = false;
    try { debug = /[?&]gu-debug=1/.test(window.location.search); } catch (e) { debug = false; }
    var debugGod = false;
    var debugBoxes = debug;

    // ------------------------------------------------------------------
    // Layout containers
    // ------------------------------------------------------------------
    var L = {
      platforms: [], crates: [], rewardBoxes: [], speedBoxes: [], secretCoins: [],
      coins: [], enemies: [], hazards: [], checkpoints: [],
      checkpoint: null, finish: null
    };
    var gaps = [];       // [x, w] holes in the street
    var walls = [];      // solid blocks: land on top, blocked at sides, bonk underneath
    var movers = [];     // moving one-way platforms
    var crumbles = [];   // one-way platforms that drop after you stand on them
    var pads = [];       // bounce pads
    var lasers = [];     // timed vertical beams
    var vents = [];      // timed upward flame jets
    var gems = [];
    var relics = [];
    var tags = [];
    var crystals = [];
    var signs = [];
    var zones = [];      // debug teleport + HUD zone name

    var EXTRA_TIERS = { mega: { size: 56, xp: 2500 } };
    var GEM_XP = { ruby: 1500, emerald: 2500, sapphire: 3000, diamond: 7500 };
    var RELIC_XP = { bunny: 5000, 'heart-skull': 5000, skull: 7500, crown: 10000 };
    var RELIC_NAMES = { bunny: 'BUNNY', 'heart-skull': 'HEART SKULL', skull: 'SKULL', crown: 'CROWN' };
    var TRAIL_BONUS_PER_COIN = 150;
    var CRYSTAL_MS = 3000;

    // ------------------------------------------------------------------
    // Builders
    // ------------------------------------------------------------------
    function zone(x, name) { zones.push({ x: x, name: name }); }
    function gap(x, w) { gaps.push([x, w]); }
    function plat(x, y, w, material, extra) {
      var p = Object.assign({ x: x, y: y, w: w, h: 16, material: material || 'brick' }, extra || {});
      L.platforms.push(p);
      return p;
    }
    function sky(x, y, w, material, zoneName) {
      return plat(x, y, w, material, { skyZone: zoneName });
    }
    function wall(x, y, w, h, extra) {
      var b = Object.assign({ x: x, y: y, w: w, h: h, solidBottom: true, kind: 'wall' }, extra || {});
      walls.push(b);
      return b;
    }
    function groundWall(x, w, h) { return wall(x, F - h, w, h, { ground: true }); }
    // Bottom edge sits 26px above the street: stand = blocked, crouch = through.
    function lowWall(x, w) { return wall(x, F - 26 - 34, w, 34, { crawl: true }); }
    function mover(x, y, w, axis, range, period, phase) {
      var m = { x: x, y: y, w: w, h: 16, bx: x, by: y, axis: axis, range: range,
        period: period, phase: phase || 0, kind: 'mover' };
      movers.push(m);
      return m;
    }
    function crumble(x, y, w) {
      var c = { x: x, y: y, w: w || 48, h: 16, state: 'solid', at: 0, delay: 380,
        respawn: 2600, kind: 'crumble' };
      crumbles.push(c);
      return c;
    }
    function pad(x, surfaceY, w, bounce) {
      var p = { x: x, y: surfaceY - 8, w: w || 48, h: 8, bounce: bounce || 17, kind: 'pad' };
      pads.push(p);
      return p;
    }
    function laser(x, y0, y1, period, on, phase) {
      lasers.push({ x: x, y0: y0, y1: y1, period: period, on: on, phase: phase || 0 });
    }
    function vent(x, period, on, phase, height, baseY) {
      vents.push({ x: x, baseY: baseY === undefined ? F : baseY, h: height || 84,
        period: period, on: on, phase: phase || 0 });
    }
    function coin(x, y, tier, trail) {
      tier = tier || 'small';
      var t = TIERS[tier] || EXTRA_TIERS[tier];
      var c = { x: Math.round(x), y: Math.round(y), tier: tier, size: t.size,
        r: Math.round(t.size * 0.4), xp: t.xp, taken: false };
      if (trail) c.trail = trail;
      L.coins.push(c);
      return c;
    }
    function coinRow(x, y, n, dx, tier, trail) {
      for (var i = 0; i < n; i += 1) coin(x + i * dx, y, tier, trail);
    }
    function coinArc(x0, x1, yBase, height, n, tier, trail) {
      for (var i = 0; i < n; i += 1) {
        var t = n === 1 ? 0.5 : i / (n - 1);
        coin(x0 + (x1 - x0) * t, yBase - Math.sin(t * Math.PI) * height, tier, trail);
      }
    }
    function secret(x, y, xp) {
      L.secretCoins.push({ x: x, y: y, r: 8, xp: xp || 750, taken: false, secret: true,
        label: 'SECRET FOUND +' + (xp || 750) + ' XP' });
    }
    function gem(x, y, kind) { gems.push({ x: x, y: y, kind: kind, xp: GEM_XP[kind], taken: false }); }
    function relic(x, y, kind) {
      relics.push({ x: x, y: y, kind: kind, xp: RELIC_XP[kind], taken: false });
    }
    function tag(x, y, art, xp, w, h) {
      tags.push({ x: x, y: y, w: w || 72, h: h || 46, art: art, xp: xp || 750, done: false });
    }
    function crystal(x, y) { crystals.push({ x: x, y: y, ms: CRYSTAL_MS, taken: false }); }
    function sign(x, kind, y) { signs.push({ x: x, y: y === undefined ? F - 30 : y, kind: kind || 'danger' }); }
    function crate(x, y) {
      L.crates.push({ x: x, y: y === undefined ? F - 28 : y, w: 28, h: 28 });
    }
    function box(x, y, type, mode) {
      var b = { x: x, y: y, w: 25, h: 25, type: type, opened: false, mode: mode || 'touch' };
      if (b.mode === 'reveal') { b.revealX = x - 120; b.visible = false; }
      L.rewardBoxes.push(b);
    }
    function speed(x, y) {
      L.speedBoxes.push({ x: x, y: y === undefined ? F - 28 : y, w: 28, h: 28, collected: false });
    }
    function checkpointAt(x) {
      L.checkpoints.push({ x: x, y: F - 48, w: 30, h: 48, active: false });
    }
    function hazard(x, y, w, h, type) { L.hazards.push({ x: x, y: y, w: w, h: h, type: type }); }
    function spikesOn(x, surfaceY, w) { hazard(x, surfaceY - 20, w || 46, 20, 'spikes'); }

    function onSurface(surfaceY, h) { return surfaceY - h; }
    function rat(x0, x1, surfaceY, speedX) {
      var s = surfaceY === undefined ? F : surfaceY;
      L.enemies.push({ type: 'rat', x: x0 + 10, y: onSurface(s, 42), w: 28, h: 42,
        vx: speedX || 1.25, min: x0, max: x1 });
    }
    function tealRat(x0, x1, surfaceY) {
      var s = surfaceY === undefined ? F : surfaceY;
      L.enemies.push({ type: 'turquoiseRat', x: x0 + 10, y: onSurface(s, 42), w: 28, h: 42,
        vx: 1.35, min: x0, max: x1 });
    }
    function brownRat(x0, x1, surfaceY) {
      var s = surfaceY === undefined ? F : surfaceY;
      L.enemies.push({ type: 'brownRat', x: x0 + 10, y: onSurface(s, 42), w: 28, h: 42,
        vx: 1.5, min: x0, max: x1 });
    }
    function bot(x0, x1, surfaceY, speedX) {
      var s = surfaceY === undefined ? F : surfaceY;
      L.enemies.push({ type: 'bot', x: x0 + 10, y: onSurface(s, 38), w: 30, h: 38,
        vx: speedX || 1.0, min: x0, max: x1 });
    }
    function pigeon(x0, x1, y, speedX) {
      L.enemies.push({ type: 'pigeon', x: x0 + 10, y: y, w: 28, h: 22,
        vx: speedX || 1.5, min: x0, max: x1, bob: 0 });
    }
    function balloon(x0, x1, surfaceY) {
      var s = surfaceY === undefined ? F : surfaceY;
      L.enemies.push({ type: 'balloon', x: x0 + 10, y: onSurface(s, 48), w: 30, h: 48, vx: 0.7,
        min: x0, max: x1, balloonState: 'walk', balloonCycles: 0,
        balloonStartedAt: 0, nextBalloonAt: 0, balloonRewardAwarded: false });
    }

    // ------------------------------------------------------------------
    // THE GAUNTLET — 9 zones across the 22,000px street.
    // Main-route jumps: <=100px single, <=170px double, rises <=100px
    // single / <=240px double. Hidden routes expect pads + triple jumps.
    // ------------------------------------------------------------------

    // ZONE 0 · WAKE UP (0–1850) ---------------------------------------
    zone(64, 'WAKE UP');
    coinRow(140, 190, 6, 28, 'small', 'wake-up');
    tag(300, F - 70, 'buster', 750);
    crate(470);
    sign(565, 'danger');
    gap(620, 70);
    coinArc(600, 712, 160, 44, 5, 'small', 'first-gap');
    plat(760, 150, 120, 'brick');
    coinRow(780, 126, 4, 26, 'small');
    rat(900, 1030);
    // Floating-wall stairway that climbs off the top of the screen.
    groundWall(1060, 40, 64);
    wall(1140, 70, 40, 24);
    wall(1220, -10, 40, 24);
    wall(1300, -90, 40, 24);
    coin(1160, 46, 'small', 'stairway');
    coin(1240, -34, 'small', 'stairway');
    coin(1320, -114, 'medium', 'stairway');
    sky(1380, -150, 360, 'rock', 'ROOFTOP STASH');
    coinRow(1400, -176, 9, 34, 'small', 'rooftop-stash');
    coin(1560, -222, 'mega');
    gem(1720, -176, 'ruby');
    box(1450, 100, 'star', 'reveal');
    balloon(1420, 1560);
    sign(1580, 'danger');
    gap(1620, 100);
    coinArc(1600, 1740, 150, 56, 6, 'small', 'second-gap');
    coinRow(1760, 190, 3, 30, 'small');
    L.checkpoint = { x: 1850, y: F - 48, w: 30, h: 48, active: false };

    // ZONE 1 · ROOFTOP GAPS (1850–4250) -------------------------------
    zone(1880, 'ROOFTOP GAPS');
    gap(1960, 190);
    plat(2025, 170, 60, 'rock');
    coinArc(1960, 2150, 150, 40, 7, 'small', 'island-hop');
    box(2043, 110, 'mystery', 'touch');
    sign(2215, 'danger');
    gap(2260, 260);
    mover(2330, 175, 64, 'x', 60, 3200, 0);
    gem(2390, 64, 'ruby');
    coinRow(2290, 150, 7, 32, 'small', 'ferry');
    bot(2580, 2720);
    secret(2600, -120);
    lowWall(2820, 140);
    coinRow(2836, 204, 5, 26, 'small', 'crawl-one');
    coin(2948, 202, 'medium', 'crawl-one');
    coinRow(2840, 134, 4, 30, 'small');
    pigeon(2980, 3160, 125);
    secret(3000, -140);
    sign(3110, 'danger');
    gap(3150, 80);
    gap(3290, 90);
    gap(3440, 100);
    coin(3260, 160, 'medium', 'triple-pits');
    coin(3410, 160, 'medium', 'triple-pits');
    coin(3570, 160, 'medium', 'triple-pits');
    crate(3560);
    speed(3620);
    // Hidden: bounce pad -> PIGEON HIGHWAY (sky, y -170 to -330).
    pad(3720, F, 48, 17);
    coin(3744, 150, 'small', 'pad-hint');
    coin(3744, 90, 'small', 'pad-hint');
    coin(3744, 30, 'small', 'pad-hint');
    sky(3820, -170, 200, 'rock', 'PIGEON HIGHWAY');
    sky(4080, -210, 140, 'brick', 'PIGEON HIGHWAY');
    mover(4290, -200, 64, 'y', 40, 2600, 0);
    sky(4440, -240, 160, 'rock', 'PIGEON HIGHWAY');
    tag(4470, -296, 'run', 2000);
    bot(4450, 4570, -240, 0.9);
    wall(4660, -300, 40, 24);
    sky(4760, -280, 220, 'brick', 'PIGEON HIGHWAY');
    spikesOn(4850, -280, 34);
    gem(4900, -330, 'sapphire');
    sky(5060, -240, 140, 'rock', 'PIGEON HIGHWAY');
    crystal(5130, -290);
    crumble(5260, -240);
    crumble(5360, -240);
    sky(5460, -260, 180, 'brick', 'PIGEON HIGHWAY');
    wall(5600, -330, 40, 24);
    relic(5620, -350, 'bunny');
    coinRow(3840, -196, 6, 30, 'small', 'pigeon-highway');
    coinRow(4100, -236, 4, 30, 'small', 'pigeon-highway');
    coinRow(4780, -306, 3, 26, 'small', 'pigeon-highway');
    coinRow(4910, -306, 2, 26, 'small', 'pigeon-highway');
    coinRow(5480, -286, 5, 28, 'small', 'pigeon-highway');
    coin(5310, -300, 'large');
    pigeon(4100, 4400, -262, 1.6);
    pigeon(4780, 4980, -330, 1.8);
    pigeon(5260, 5440, -300, 1.4);
    // Street below the highway.
    rat(3850, 3990);
    sign(4010, 'danger');
    gap(4060, 120);
    coinArc(4050, 4190, 150, 50, 5, 'small');
    checkpointAt(4250);

    // ZONE 2 · BOT ALLEY (4250–6600) ----------------------------------
    zone(4280, 'BOT ALLEY');
    bot(4380, 4520, F, 1.1);
    plat(4560, 130, 90, 'brick');
    coinRow(4572, 106, 3, 30, 'small', 'vent-roof');
    vent(4600, 2400, 1000, 0);
    bot(4700, 4840, F, 1.15);
    vent(4930, 2400, 1000, 1200);
    groundWall(5050, 40, 64);
    wall(5110, 60, 40, 24);
    crystal(5130, 30);
    bot(5200, 5340, F, 1.2);
    vent(5420, 2000, 800, 500);
    sign(5480, 'keepout');
    laser(5540, F - 135, F, 2600, 1300, 0);
    box(5600, 110, 'star', 'reveal');
    tealRat(5680, 5820);
    coinRow(5650, 190, 8, 56, 'medium', 'alley-run');
    brownRat(5950, 6080);
    secret(6000, -130);
    sign(6130, 'danger');
    gap(6180, 120);
    coinArc(6170, 6310, 150, 50, 5, 'small');
    box(6350, 120, 'mystery', 'solid');
    speed(6450);
    checkpointAt(6600);

    // ZONE 3 · SEWER DROP (6600–9000) ---------------------------------
    zone(6630, 'SEWER DROP');
    sign(6700, 'danger');
    gap(6760, 600);
    mover(6790, 170, 56, 'y', 45, 2800, 0);
    mover(6940, 130, 56, 'y', 60, 3000, 1.6);
    mover(7090, 150, 56, 'x', 40, 2400, 0);
    mover(7250, 160, 56, 'y', 50, 2600, 3.1);
    coinArc(6780, 7340, 110, 50, 12, 'small', 'sewer-drop');
    coin(7070, 30, 'mega');
    balloon(7450, 7600);
    tag(7660, F - 76, 'skeleton-crew', 1000, 70, 56);
    secret(7600, -150);
    balloon(7750, 7900);
    // Crumbling stair to the hidden CRUMBLE LOFT.
    crumble(7980, 170);
    crumble(8070, 130);
    crumble(8160, 90);
    crumble(8250, 50);
    crumble(8340, 10);
    coin(8004, 146, 'small', 'crumble-stair');
    coin(8094, 106, 'small', 'crumble-stair');
    coin(8184, 66, 'small', 'crumble-stair');
    coin(8274, 26, 'small', 'crumble-stair');
    coin(8364, -14, 'medium', 'crumble-stair');
    sky(8430, -60, 380, 'brick', 'CRUMBLE LOFT');
    tag(8560, -112, 'kelawall', 2000);
    rat(8620, 8780, -60, 1.3);
    coinRow(8450, -86, 4, 28, 'small', 'crumble-loft');
    coinRow(8660, -86, 4, 28, 'small', 'crumble-loft');
    gem(8790, -90, 'emerald');
    secret(8620, -200, 1500);
    gap(8020, 90);
    gap(8200, 90);
    rat(8450, 8600, F, 1.35);
    bot(8700, 8850, F, 1.2);
    checkpointAt(9000);

    // ZONE 4 · WALL CLIMB (9000–11400) --------------------------------
    zone(9030, 'WALL CLIMB');
    groundWall(9250, 40, 64);
    crate(9380);
    groundWall(9420, 40, 114);
    plat(9520, 120, 60, 'rock');
    box(9540, 70, 'mystery', 'touch');
    groundWall(9620, 50, 184);
    plat(9730, 40, 60, 'rock');
    groundWall(9850, 100, 254);
    coin(9640, 4, 'medium', 'wall-climb');
    coin(9760, 14, 'medium', 'wall-climb');
    coin(9870, -66, 'large', 'wall-climb');
    // Hidden: pad on the tower top -> CROWN VAULT (y -480).
    pad(9905, -40, 40, 18);
    sky(10000, -480, 320, 'rock', 'CROWN VAULT');
    wall(10296, -560, 24, 80);
    relic(10160, -506, 'crown');
    gem(10070, -510, 'diamond');
    coin(10110, -520, 'mega');
    coin(10230, -520, 'mega');
    coinRow(10040, -380, 8, 32, 'small', 'crown-drop');
    sign(10380, 'keepout');
    laser(10450, F - 100, F, 1800, 900, 0);
    crystal(10525, 20);
    laser(10600, F - 100, F, 1800, 900, 900);
    bot(10700, 10850, F, 1.25);
    secret(11000, -160);
    sign(10900, 'danger');
    gap(10950, 150);
    coinArc(10940, 11110, 140, 60, 6, 'small', 'climb-exit');
    checkpointAt(11400);

    // ZONE 5 · CRUMBLE RUN (11400–14000) ------------------------------
    zone(11430, 'CRUMBLE RUN');
    speed(11480);
    sign(11640, 'danger');
    gap(11700, 800);
    for (var ci = 0; ci < 8; ci += 1) {
      crumble(11730 + ci * 96, 175);
      coin(11754 + ci * 96, 150, 'small', 'crumble-run');
    }
    mover(11850, 95, 64, 'x', 50, 2600, 0);
    mover(12100, 90, 64, 'x', 50, 2600, 1.5);
    mover(12330, 95, 64, 'x', 50, 2600, 3);
    coinRow(11860, 70, 3, 22, 'small', 'upper-ferries');
    coinRow(12110, 65, 3, 22, 'small', 'upper-ferries');
    coinRow(12340, 70, 3, 22, 'small', 'upper-ferries');
    gem(12132, 52, 'emerald');
    box(12230, 30, 'star', 'touch');
    crystal(12150, -150);
    pigeon(12600, 12800, 130, 1.6);
    tag(12700, F - 64, 'social-media', 750, 90, 32);
    rat(12850, 12980, F, 1.4);
    sign(13010, 'danger');
    gap(13050, 100);
    vent(13200, 2200, 900, 0);
    gap(13280, 120);
    secret(13300, -170);
    coinArc(13040, 13410, 140, 50, 9, 'small', 'vent-island');
    crate(13500);
    tag(13600, F - 70, 'wezt', 750);
    tealRat(13700, 13850);
    checkpointAt(14000);

    // ZONE 6 · THE GAUNTLET (14000–16600) -----------------------------
    zone(14030, 'THE GAUNTLET');
    speed(14100);
    bot(14150, 14280, F, 1.3);
    laser(14350, F - 60, F, 1600, 1000, 0);
    rat(14450, 14580, F, 1.5);
    secret(14500, -120);
    spikesOn(14620, F, 46);
    tealRat(14700, 14840);
    plat(14900, 140, 160, 'brick');
    bot(14905, 15025, 140, 1.0);
    coinRow(14920, 116, 5, 28, 'small', 'bot-roof');
    balloon(15100, 15250);
    box(15180, 110, 'mystery', 'solid');
    spikesOn(15300, F, 46);
    brownRat(15360, 15480);
    // Hidden: double pad chain -> STRATOSPHERE (y -560).
    pad(15560, F, 48, 17);
    sky(15660, -170, 90, 'rock', 'STRATO BASE');
    pad(15700, -170, 40, 19);
    sky(15800, -560, 460, 'brick', 'STRATOSPHERE');
    gem(15900, -592, 'diamond');
    relic(16050, -590, 'skull');
    tag(16130, -626, 'tag-or-die', 3000, 84, 50);
    coin(15980, -610, 'mega');
    coin(16220, -610, 'mega');
    coinRow(15820, -586, 12, 36, 'small', 'stratosphere');
    pigeon(15850, 16200, -630, 1.7);
    bot(16080, 16220, -560, 1.1);
    spikesOn(16000, -560, 34);
    sign(15750, 'danger');
    gap(15800, 150);
    coinArc(15790, 15960, 140, 60, 6, 'small');
    vent(16100, 2000, 800, 400);
    rat(16200, 16350, F, 1.5);
    checkpointAt(16600);

    // ZONE 7 · NIGHT BUS (16600–19400) --------------------------------
    zone(16630, 'NIGHT BUS');
    sign(16740, 'danger');
    gap(16780, 300);
    mover(16860, 170, 64, 'x', 70, 3000, 0);
    coinRow(16800, 140, 9, 30, 'small', 'night-bus');
    secret(17000, -150);
    vent(17180, 2000, 900, 300);
    box(17200, 110, 'star', 'reveal');
    gap(17300, 360);
    mover(17340, 160, 56, 'y', 50, 2600, 0);
    mover(17470, 120, 56, 'y', 60, 2800, 2);
    mover(17590, 160, 56, 'y', 50, 2600, 4);
    crystal(17497, 20);
    coinArc(17320, 17640, 100, 40, 9, 'small', 'elevators');
    sign(17740, 'keepout');
    laser(17800, F - 120, F, 2200, 1100, 0);
    laser(17900, F - 120, F, 2200, 1100, 1100);
    sign(18050, 'danger');
    gap(18100, 360);
    crumble(18120, 175);
    crumble(18215, 175);
    crumble(18310, 175);
    crumble(18405, 175);
    coinRow(18144, 150, 4, 95, 'medium', 'bus-crumbles');
    // Crawl space hiding a relic.
    lowWall(18650, 200);
    relic(18750, 200, 'heart-skull');
    coinRow(18664, 204, 3, 24, 'small', 'crawl-two');
    coinRow(18790, 204, 3, 24, 'small', 'crawl-two');
    coinRow(18670, 134, 6, 32, 'small');
    // Stair to BUS STOP ROOF.
    groundWall(18920, 40, 64);
    wall(19000, 70, 40, 24);
    wall(19080, -10, 40, 24);
    sky(19160, -90, 200, 'rock', 'BUS STOP ROOF');
    tag(19200, -142, 'pmsl', 2000);
    gem(19330, -120, 'sapphire');
    coinRow(19170, -116, 3, 26, 'small', 'bus-roof');
    checkpointAt(19400);

    // ZONE 8 · FINAL WALL (19400–21850) -------------------------------
    zone(19430, 'FINAL WALL');
    speed(19450);
    sign(19480, 'danger');
    gap(19520, 100);
    gap(19700, 130);
    crumble(19741, 175);
    gap(19950, 160);
    plat(20005, 165, 50, 'rock');
    coinArc(19510, 20120, 140, 30, 14, 'small', 'last-pits');
    secret(20000, -180, 1000);
    sign(20190, 'keepout');
    laser(20250, F - 125, F, 2400, 800, 0);
    laser(20330, F - 125, F, 2400, 800, 800);
    laser(20410, F - 125, F, 2400, 800, 1600);
    crystal(20330, 60);
    tag(20560, F - 76, 'all-city', 1500, 64, 58);
    box(20680, 110, 'mystery', 'touch');
    bot(20700, 20850, F, 1.35);
    crate(20900);
    tag(20990, F - 64, 'million-sold', 1000, 70, 40);
    tealRat(20950, 21080);
    // Final hidden roof above the finish.
    groundWall(21150, 40, 74);
    wall(21240, 60, 40, 24);
    wall(21320, -20, 40, 24);
    sky(21400, -110, 360, 'brick', 'ALL CITY ROOF');
    tag(21500, -186, 'crypto-moonboys', 25000, 104, 78);
    gem(21700, -140, 'diamond');
    coin(21440, -150, 'mega');
    coinRow(21420, -136, 10, 32, 'small', 'all-city-roof');
    tealRat(21560, 21730, -110);
    spikesOn(21620, -110, 34);
    L.finish = { x: 21850, y: F - 62, w: 38, h: 62 };

    // ------------------------------------------------------------------
    // Derived data
    // ------------------------------------------------------------------
    gaps.sort(function (a, b) { return a[0] - b[0]; });
    var floorSolids = [];
    (function buildFloor() {
      var cursor = 0;
      gaps.forEach(function (g) {
        if (g[0] > cursor) floorSolids.push({ x: cursor, y: F, w: g[0] - cursor, h: 60 });
        cursor = Math.max(cursor, g[0] + g[1]);
      });
      if (cursor < env.WORLD_WIDTH) floorSolids.push({ x: cursor, y: F, w: env.WORLD_WIDTH - cursor, h: 60 });
    }());

    var trails = {};
    L.coins.forEach(function (c) {
      if (!c.trail) return;
      if (!trails[c.trail]) trails[c.trail] = { coins: [], done: false };
      trails[c.trail].coins.push(c);
    });
    var trailNames = Object.keys(trails);

    var skyZoneNames = [];
    L.platforms.forEach(function (p) {
      if (p.skyZone && skyZoneNames.indexOf(p.skyZone) < 0) skyZoneNames.push(p.skyZone);
    });

    // ------------------------------------------------------------------
    // Art (lazy, optional — every object has a canvas fallback)
    // ------------------------------------------------------------------
    var art = {};
    function loadArt(key, src) {
      var img = new Image();
      img.decoding = 'async';
      img.src = src;
      art[key] = img;
    }
    function ready(img) { return img && img.complete && img.naturalWidth > 0; }
    // The generated sheets are presentation atlases rather than uniform grids.
    // These measured row bounds/centres keep every source crop on one complete
    // sprite instead of allowing adjacent art to bleed into a frame.
    var ATLAS_LAYOUTS = {
      structures: { w: 2172, h: 724, rows: [
        { y: 0, h: 160, fw: 350, c: [190,550,915,1275,1635,1995] },
        { y: 145, h: 190, fw: 350, c: [190,550,915,1275,1635,1995] },
        { y: 315, h: 160, fw: 310, c: [175,460,745,1030,1315,1585,1840,2050] },
        { y: 455, h: 165, fw: 350, c: [190,550,915,1275,1635,1995] },
        { y: 590, h: 134, fw: 350, c: [190,550,915,1275,1635,1995] }
      ] },
      hazards: { w: 2172, h: 724, rows: [
        { y: 0, h: 165, fw: 205, c: [130,347,564,781,997,1198,1403,1608,1834,2060] },
        { y: 145, h: 190, fw: 310, c: [145,460,775,1090,1405,1720,2035] },
        { y: 290, h: 200, fw: 320, c: [140,415,690,965,1240,1515,1790,2060] },
        { y: 470, h: 175, fw: 345, c: [190,550,910,1270,1630,1990] },
        { y: 620, h: 104, fw: 260, c: [135,405,675,945,1215,1485,1755,2025] }
      ] },
      pickups: { w: 1536, h: 1024, rows: [
        { y: 0, h: 148, fw: 175, c: [245,425,605,775,950,1125,1295] },
        { y: 146, h: 148, fw: 175, c: [225,415,605,775,960,1135,1330] },
        { y: 292, h: 148, fw: 175, c: [225,415,605,775,960,1135,1330] },
        { y: 438, h: 148, fw: 180, c: [175,350,525,700,875,1050,1225,1385] },
        { y: 584, h: 148, fw: 190, c: [175,350,525,700,875,1050,1225,1385] },
        { y: 730, h: 148, fw: 190, c: [165,350,535,735,930,1130,1330] },
        { y: 876, h: 148, fw: 210, c: [185,410,640,850,1080,1325] }
      ] },
      night: { w: 2172, h: 724, rows: [
        { y: 0, h: 125, fw: 350, c: [365,725,1085,1445,1805,2070] },
        { y: 115, h: 145, fw: 270, c: [140,420,700,980,1260,1540,1820,2070] },
        { y: 245, h: 150, fw: 310, c: [175,500,825,1150,1475,1800,2070] },
        { y: 385, h: 135, fw: 270, c: [140,420,700,980,1260,1540,1820,2070] },
        { y: 500, h: 130, fw: 320, c: [175,500,825,1150,1475,1800,2070] },
        { y: 600, h: 124, fw: 270, c: [140,420,700,980,1260,1540,1820,2070] }
      ] }
    };
    function atlasLayoutFor(img) {
      if (img === art['atlas-structures']) return ATLAS_LAYOUTS.structures;
      if (img === art['atlas-hazards']) return ATLAS_LAYOUTS.hazards;
      if (img === art['atlas-pickups']) return ATLAS_LAYOUTS.pickups;
      if (img === art['atlas-night']) return ATLAS_LAYOUTS.night;
      return null;
    }
    function drawAtlasFrame(ctx, img, row, rows, frame, frames, x, y, w, h) {
      if (!ready(img)) return false;
      var layout = atlasLayoutFor(img);
      var sx, sy, sw, sh;
      if (layout && layout.rows[row]) {
        var spec = layout.rows[row];
        frame = ((frame % spec.c.length) + spec.c.length) % spec.c.length;
        var scaleX = img.naturalWidth / layout.w;
        var scaleY = img.naturalHeight / layout.h;
        sw = Math.min(spec.fw, layout.w) * scaleX;
        sh = Math.min(spec.h, layout.h - spec.y) * scaleY;
        sx = Math.max(0, Math.min(layout.w - spec.fw, spec.c[frame] - spec.fw / 2)) * scaleX;
        sy = spec.y * scaleY;
      } else {
        frame = ((frame % frames) + frames) % frames;
        sw = img.naturalWidth / frames;
        sh = img.naturalHeight / rows;
        sx = frame * sw;
        sy = row * sh;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh,
        Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      ctx.restore();
      return true;
    }
    function atlasLoop(t, frames, frameMs) { return Math.floor(t / frameMs) % frames; }
    function drawAtlasStrip(ctx, img, nx, ny, nw, nh, frame, frames, x, y, w, h) {
      if (!ready(img)) return false;
      frame = ((frame % frames) + frames) % frames;
      var regionX = img.naturalWidth * nx;
      var regionY = img.naturalHeight * ny;
      var regionW = img.naturalWidth * nw;
      var regionH = img.naturalHeight * nh;
      var sw = regionW / frames;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, regionX + frame * sw, regionY, sw, regionH,
        Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      ctx.restore();
      return true;
    }
    function drawGridCell(ctx, img, index, x, y, w, h, flipX, alpha) {
      if (!ready(img)) return false;
      var cols = 4;
      var rows = 4;
      var cellW = img.naturalWidth / cols;
      var cellH = img.naturalHeight / rows;
      var col = index % cols;
      var row = Math.floor(index / cols);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      if (flipX) {
        ctx.translate(Math.round(x + w), Math.round(y));
        ctx.scale(-1, 1);
        ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH,
          0, 0, Math.round(w), Math.round(h));
      } else {
        ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH,
          Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      }
      ctx.restore();
      return true;
    }

    function gemAtlasRow(kind) {
      return kind === 'ruby' ? 0 : kind === 'emerald' ? 1 : kind === 'sapphire' ? 2 : 3;
    }
    loadArt('atlas-structures', '/games/getting-up/01-platforms-and-structures.png');
    loadArt('atlas-hazards', '/games/getting-up/02-enemies-and-hazards.png');
    loadArt('atlas-pickups', '/games/getting-up/03-collectibles-and-checkpoints.png');
    loadArt('atlas-night', '/games/getting-up/04-night-train-transitions.png');
    loadArt('atlas-vfx', '/games/getting-up/05-shared-vfx-atlas.png');
    loadArt('ground-hazards', '/games/getting-up/Gritty Ground Hazards Sprite Atlas-5.png');
    loadArt('ground-pickups', '/games/getting-up/Neon Street Pickups, Crates, and Respawns-4.png');
    loadArt('ground-zones-a', '/games/getting-up/Gritty neon ground zone props atlas-1.png');
    loadArt('ground-zones-b', '/games/getting-up/Neon Ground Zone Props Atlas-3.png');
    loadArt('ground-enemies', '/games/getting-up/Neon Graffiti Enemy Sprite Atlas-2.png');
    loadArt('hidden-routes', '/games/getting-up/Hidden Sky Route Discovery Atlas-7.png');
    loadArt('ground-transitions', '/games/getting-up/Neon Graffiti Transition Sprite Atlas-6.png');
    ['ruby', 'emerald', 'sapphire', 'diamond'].forEach(function (k) { loadArt('gem-' + k, TEMP + 'gem-' + k + '.svg'); });
    ['time-crystal', 'bounce-pad', 'laser-emitter', 'wall-block', 'crumble-platform',
      'moving-platform', 'flame-vent', 'tag-spot', 'night-train-tag', 'sky-girder', 'drone'].forEach(function (k) { loadArt(k, TEMP + k + '.svg'); });
    ['bunny', 'skull', 'heart-skull', 'crown'].forEach(function (k) { loadArt('relic-' + k, ART + 'relic-' + k + '-runtime.webp'); });
    ['danger', 'keep-out'].forEach(function (k) { loadArt('sign-' + k, ART + 'sign-' + k + '-runtime.webp'); });
    tags.forEach(function (t) {
      if (!art['tag-' + t.art]) loadArt('tag-' + t.art, ART + 'tag-' + t.art + '-runtime.webp');
    });

    // ------------------------------------------------------------------
    // Runtime state
    // ------------------------------------------------------------------
    var skyMode = false;
    var foundSkyZones = {};
    var timeBonusMs = 0;
    var currentZone = zones[0].name;
    var courseVfx = [];
    var zoneTransitionAt = -9999;
    var zoneTransitionIndex = 0;
    var skyDiscoveryAt = -9999;
    var skyDiscoveryIndex = 0;
    var respawnVfxAt = -9999;

    // Decorative world art is deliberately scaled in world units, never by
    // atlas-cell size. A bus is hundreds of pixels wide, a street lamp is
    // tall and narrow, while rats and pickups remain character-sized.
    var PHASE2_PROPS = [
      { a: 'ground-zones-a', c: 0, x: 120,  b: F, w: 150, h: 112 },
      { a: 'ground-zones-a', c: 1, x: 610,  b: F, w: 74,  h: 48 },
      { a: 'ground-zones-a', c: 2, x: 1160, b: F, w: 112, h: 146 },
      { a: 'ground-zones-a', c: 3, x: 1670, b: F, w: 28,  h: 112 },
      { a: 'ground-zones-a', c: 4, x: 1990, b: F, w: 132, h: 46 },
      { a: 'ground-zones-a', c: 5, x: 2730, b: F, w: 54,  h: 48 },
      { a: 'ground-zones-a', c: 6, x: 3350, b: F, w: 58,  h: 108 },
      { a: 'ground-zones-a', c: 7, x: 4050, b: F, w: 106, h: 150 },
      { a: 'ground-zones-a', c: 8, x: 4400, b: F, w: 150, h: 132 },
      { a: 'ground-zones-a', c: 9, x: 5050, b: F, w: 62,  h: 98 },
      { a: 'ground-zones-a', c:10, x: 5740, b: F, w: 92,  h: 60 },
      { a: 'ground-zones-a', c:11, x: 6350, b: F, w: 88,  h: 116 },
      { a: 'ground-zones-a', c:12, x: 6740, b: F, w: 152, h: 104 },
      { a: 'ground-zones-a', c:13, x: 7440, b: F, w: 78,  h: 84 },
      { a: 'ground-zones-a', c:14, x: 8190, b: F, w: 58,  h: 124 },
      { a: 'ground-zones-a', c:15, x: 8860, b: F, w: 62,  h: 80 },
      { a: 'ground-zones-b', c: 0, x: 9140, b: F, w: 150, h: 120 },
      { a: 'ground-zones-b', c: 1, x: 9820, b: F, w: 92,  h: 152 },
      { a: 'ground-zones-b', c: 2, x:10450, b: F, w: 62,  h: 128 },
      { a: 'ground-zones-b', c: 3, x:11200, b: F, w: 78,  h: 118 },
      { a: 'ground-zones-b', c: 4, x:11560, b: F, w: 142, h: 58 },
      { a: 'ground-zones-b', c: 5, x:12240, b: F, w: 88,  h: 126 },
      { a: 'ground-zones-b', c: 6, x:13020, b: F, w: 100, h: 62 },
      { a: 'ground-zones-b', c: 7, x:13800, b: F, w: 92,  h: 66 },
      { a: 'ground-zones-b', c: 8, x:14180, b: F, w: 62,  h: 92 },
      { a: 'ground-zones-b', c: 9, x:14920, b: F, w: 128, h: 52 },
      { a: 'ground-zones-b', c:10, x:15860, b: F, w: 92,  h: 58 },
      { a: 'ground-zones-b', c:11, x:16880, b: F, w: 230, h: 112 },
      { a: 'ground-zones-b', c:12, x:17830, b: F, w: 122, h: 106 },
      { a: 'ground-zones-b', c:13, x:19020, b: F, w: 34,  h: 122 },
      { a: 'ground-zones-b', c:14, x:20020, b: F, w: 68,  h: 124 },
      { a: 'ground-zones-b', c:15, x:21680, b: F, w: 176, h: 198 },
      { a: 'ground-pickups', c:14, x: 3650, b: F, w: 46, h: 34 },
      { a: 'ground-pickups', c:14, x:13280, b: F, w: 52, h: 38 },
      { a: 'ground-pickups', c:14, x:18720, b: F, w: 44, h: 32 }
    ];

    function drawPhase2Props(ctx, api) {
      var camX = api.cameraX;
      for (var i = 0; i < PHASE2_PROPS.length; i += 1) {
        var p = PHASE2_PROPS[i];
        if (!inView(p.x, p.w, camX)) continue;
        drawGridCell(ctx, art[p.a], p.c, p.x - camX, p.b + OFFSET_Y - p.h, p.w, p.h);
      }
      for (var j = 0; j < L.platforms.length; j += 1) {
        var platform = L.platforms[j];
        if (!platform.skyZone || !inView(platform.x, platform.w, camX)) continue;
        var routeIndex = Math.max(0, skyZoneNames.indexOf(platform.skyZone)) % 8;
        var routeHeight = Math.max(34, Math.min(58, platform.w * 0.32));
        drawGridCell(ctx, art['hidden-routes'], routeIndex,
          platform.x - camX, platform.y + OFFSET_Y + platform.h - routeHeight,
          platform.w, routeHeight);
      }
    }

    function drawPhase2Hud(ctx, api, t) {
      var zoneAge = t - zoneTransitionAt;
      if (zoneAge >= 0 && zoneAge < 900 && ready(art['ground-transitions'])) {
        var zoneProgress = zoneAge / 900;
        var zw = 126 + zoneProgress * 34;
        var zh = 92 + zoneProgress * 22;
        drawGridCell(ctx, art['ground-transitions'], zoneTransitionIndex,
          VIEW_W / 2 - zw / 2, 56 - zh / 2, zw, zh, false, 1 - zoneProgress);
      }
      var skyAge = t - skyDiscoveryAt;
      if (skyAge >= 0 && skyAge < 950 && ready(art['hidden-routes'])) {
        var skyProgress = skyAge / 950;
        var ss = 78 + skyProgress * 44;
        var skyAlpha = 1 - skyProgress;
        drawGridCell(ctx, art['hidden-routes'], 13,
          VIEW_W / 2 - ss * 0.72, VIEW_H / 2 - ss * 0.72, ss * 1.44, ss * 1.44, false, skyAlpha * 0.55);
        drawGridCell(ctx, art['hidden-routes'], 12,
          VIEW_W / 2 - ss * 0.62, VIEW_H / 2 - ss * 0.62, ss * 1.24, ss * 1.24, false, skyAlpha * 0.75);
        drawGridCell(ctx, art['hidden-routes'], 8 + skyDiscoveryIndex % 4,
          VIEW_W / 2 - ss / 2, VIEW_H / 2 - ss / 2, ss, ss, false, skyAlpha);
        drawGridCell(ctx, art['hidden-routes'], 14,
          VIEW_W / 2 - ss * 0.62, VIEW_H / 2 + ss * 0.34, ss * 1.24, ss * 0.48, false, skyAlpha);
        drawGridCell(ctx, art['hidden-routes'], 15,
          VIEW_W / 2 - ss * 0.70, VIEW_H / 2 - ss * 0.30, ss * 1.40, ss * 1.10, false, skyAlpha * 0.7);
      }
      if (api.complete && ready(art['ground-transitions'])) {
        var pulse = 1 + Math.sin(t / 90) * 0.08;
        drawGridCell(ctx, art['ground-transitions'], 12,
          VIEW_W / 2 - 92 * pulse, VIEW_H / 2 - 64 * pulse,
          184 * pulse, 128 * pulse, false, 0.9);
      }
    }

    function drawCourseHazard(ctx, api, hazard) {
      if (hazard.type !== 'spikes' || !ready(art['ground-hazards'])) return false;
      var x = hazard.x - api.cameraX;
      drawGridCell(ctx, art['ground-hazards'], 13,
        x - 4, hazard.y + OFFSET_Y - 8, hazard.w + 8, hazard.h + 8);
      return true;
    }

    function drawCourseCrate(ctx, api, crate, t) {
      if (!ready(art['ground-pickups'])) return false;
      var cell = 11 + Math.abs(Math.floor(crate.x / 100)) % 3;
      var size = 36;
      drawGridCell(ctx, art['ground-pickups'], cell,
        crate.x - api.cameraX - (size - crate.w) / 2,
        crate.y + OFFSET_Y + crate.h - size, size, size);
      return true;
    }

    function drawCourseSpeedBox(ctx, api, box, t) {
      if (!ready(art['ground-pickups'])) return false;
      var cell = Math.floor(t / 140) % 2 ? 9 : 10;
      var size = 40;
      drawGridCell(ctx, art['ground-pickups'], cell,
        box.x - api.cameraX - (size - box.w) / 2,
        box.y + OFFSET_Y + box.h - size + Math.sin(t / 130) * 2, size, size);
      return true;
    }

    function drawCourseRewardBox(ctx, api, box) {
      if (!ready(art['ground-pickups'])) return false;
      var cell = box.type === 'star' ? (box.opened ? 6 : 5) : (box.opened ? 8 : 7);
      var size = 38;
      drawGridCell(ctx, art['ground-pickups'], cell,
        box.x - api.cameraX - (size - box.w) / 2,
        box.y + OFFSET_Y + box.h - size, size, size, false,
        box.opened && box.mode !== 'solid' ? 0.55 : 1);
      return true;
    }

    function drawCourseSecretCoin(ctx, api, coin, t) {
      if (!ready(art['ground-pickups'])) return false;
      if (coin.taken && t - (coin.takenAt || 0) >= 420) return true;
      var takenAge = coin.taken ? t - (coin.takenAt || t) : -1;
      var cell = coin.taken ? 2 : (Math.floor((t + coin.x) / 180) % 2);
      var size = coin.taken ? 40 : 28;
      var alpha = coin.taken ? Math.max(0, 1 - takenAge / 420) : 1;
      drawGridCell(ctx, art['ground-pickups'], cell,
        coin.x - api.cameraX - size / 2,
        coin.y + OFFSET_Y - size / 2 + Math.sin((t + coin.x) / 180) * 2,
        size, size, false, alpha);
      return true;
    }

    function drawCourseCoin(ctx, api, coin, t) {
      if (coin.tier !== 'mega' || !ready(art['ground-pickups'])) return false;
      if (coin.taken && t - (coin.takenAt || 0) >= 520) return true;
      var age = coin.taken ? t - (coin.takenAt || t) : -1;
      var cell = coin.taken ? 4 : 3;
      var size = coin.taken ? 86 : 66 + Math.sin((t + coin.x) / 140) * 4;
      drawGridCell(ctx, art['ground-pickups'], cell,
        coin.x - api.cameraX - size / 2,
        coin.y + OFFSET_Y - size / 2,
        size, size, false, coin.taken ? Math.max(0, 1 - age / 520) : 1);
      return true;
    }

    function drawCourseFinish(ctx, api, finish, t) {
      if (!ready(art['ground-transitions'])) return false;
      var approaching = Math.abs(api.player.x - finish.x) < 420;
      var cell = api.complete ? 11 : approaching ? 10 : 9;
      var w = api.complete ? 94 : 64;
      var h = api.complete ? 94 : 98;
      drawGridCell(ctx, art['ground-transitions'], cell,
        finish.x - api.cameraX - (w - finish.w) / 2,
        finish.y + OFFSET_Y + finish.h - h, w, h);
      return true;
    }

    function drawCourseEnemy(ctx, api, enemy, t) {
      var img = art['ground-enemies'];
      if (!ready(img)) return false;
      var cell = -1;
      var w = 36;
      var h = 42;
      if (enemy.type === 'rat') {
        var ratDefeatAge = enemy.defeated ? t - (enemy.defeatedAt || t) : -1;
        cell = enemy.defeated ? (ratDefeatAge < 180 ? 2 : 3) : (enemy.attackUntil > t ? 1 : 0);
      } else if (enemy.type === 'turquoiseRat') {
        cell = enemy.defeated ? 5 : 4;
      } else if (enemy.type === 'brownRat') {
        cell = enemy.defeated ? 7 : 6;
      } else if (enemy.type === 'bot') {
        cell = enemy.defeated ? 11 : (enemy.hurtUntil > t ? 10 : (enemy.fireUntil > t ? 9 : 8));
        w = 48; h = 56;
      } else if (enemy.type === 'pigeon') {
        cell = enemy.defeated ? 13 : 12;
        w = 44; h = 34;
      } else if (enemy.type === 'balloon') {
        cell = enemy.defeated ? 15 : 14;
        w = 64; h = 88;
      } else {
        return false;
      }
      if (enemy.defeated && t - (enemy.defeatedAt || 0) >= 520) return true;
      var x = enemy.x - api.cameraX - (w - enemy.w) / 2;
      if (x + w < -60 || x > VIEW_W + 60) return true;
      var y = enemy.y + (enemy.bob || 0) + OFFSET_Y + enemy.h - h;
      var facing = enemy.vx < 0 ? -1 : 1;
      if ((enemy.type === 'rat' || enemy.type === 'turquoiseRat' || enemy.type === 'brownRat') &&
          enemy.attackUntil > t) {
        facing = enemy.attackFacing || facing;
      } else if (enemy.type === 'bot' && enemy.fireUntil > t) {
        facing = enemy.fireFacing || facing;
      } else if (enemy.type === 'balloon' && enemy.balloonState === 'release') {
        facing = enemy.balloonFacing || facing;
      }
      var alpha = enemy.defeated ? Math.max(0, 1 - (t - enemy.defeatedAt) / 520) : 1;
      if (!enemy.defeated && t < 420 && ready(art['ground-transitions'])) {
        drawGridCell(ctx, art['ground-transitions'], 15,
          x - w * 0.25, y + h * 0.15, w * 1.5, h * 1.05, facing < 0, 1 - t / 420);
      }
      drawGridCell(ctx, img, cell, x, y, w, h, facing < 0, alpha);
      return true;
    }

    function onCourseRespawn(api, t) {
      respawnVfxAt = t;
    }
    function spawnCourseVfx(kind, x, y, at, variant) {
      courseVfx.push({ kind: kind, x: x, y: y, at: at, variant: variant || 0 });
      if (courseVfx.length > 40) courseVfx.splice(0, courseVfx.length - 40);
    }
    function drawCourseVfx(ctx, api, t) {
      var img = art['atlas-vfx'];
      if (!ready(img)) return;
      var camX = api.cameraX;
      for (var i = courseVfx.length - 1; i >= 0; i -= 1) {
        var fx = courseVfx[i];
        var age = t - fx.at;
        var life = fx.kind === 'spray' ? 500 : 420;
        if (age >= life) { courseVfx.splice(i, 1); continue; }
        var frame = Math.min(4, Math.floor(age / (life / 5)));
        var x = fx.x - camX, y = fx.y + OFFSET_Y;
        if (fx.kind === 'gem') {
          var gx = 0.77 + Math.min(3, fx.variant) * 0.0575;
          drawAtlasStrip(ctx, img, gx, 0.25, 0.0575, 0.25, 0, 1, x - 22, y - 22, 44, 44);
        } else if (fx.kind === 'time') {
          drawAtlasStrip(ctx, img, 0, 0.50, 0.25, 0.25, frame, 5, x - 24, y - 24, 48, 48);
        } else if (fx.kind === 'spray') {
          drawAtlasStrip(ctx, img, 0.25, 0.50, 0.27, 0.25, frame, 5, x - 34, y - 22, 68, 44);
        } else if (fx.kind === 'trail') {
          drawAtlasStrip(ctx, img, 0, 0.75, 0.27, 0.25, frame, 5, x - 30, y - 30, 60, 60);
        }
      }
    }

    function placeMovers(t) {
      for (var i = 0; i < movers.length; i += 1) {
        var m = movers[i];
        var off = Math.sin(t / m.period * TAU + m.phase) * m.range;
        m.x = m.bx + (m.axis === 'x' ? off : 0);
        m.y = m.by + (m.axis === 'y' ? off : 0);
      }
    }
    placeMovers(0);

    function cycleOn(item, t) { return ((t + item.phase) % item.period) < item.on; }
    function cycleWarn(item, t) {
      var local = (t + item.phase) % item.period;
      return local >= item.period - 350;
    }
    function laserRect(l) { return { x: l.x + 12, y: l.y0, w: 8, h: l.y1 - l.y0 }; }
    function ventRect(v) { return { x: v.x + 6, y: v.baseY - v.h, w: 20, h: v.h }; }
    function pickupRect(o, r) { return { x: o.x - r, y: o.y - r, w: r * 2, h: r * 2 }; }

    function reset() {
      skyMode = false;
      foundSkyZones = {};
      timeBonusMs = 0;
      currentZone = zones[0].name;
      placeMovers(0);
      crumbles.forEach(function (c) { c.state = 'solid'; c.at = 0; });
      gems.forEach(function (g) { g.taken = false; });
      relics.forEach(function (r) { r.taken = false; });
      tags.forEach(function (t) { t.done = false; });
      crystals.forEach(function (c) { c.taken = false; });
      trailNames.forEach(function (n) { trails[n].done = false; });
      pads.forEach(function (p) { p.lastBounceAt = -9999; });
      courseVfx = [];
      zoneTransitionAt = -9999;
      zoneTransitionIndex = 0;
      skyDiscoveryAt = -9999;
      skyDiscoveryIndex = 0;
      respawnVfxAt = -9999;
      resetNight();
      aReset();
    }

    var lastApi = null;
    function update(t, dt, api) {
      lastApi = api;
      var p = api.player;
      if (debugGod) p.invuln = Math.max(p.invuln, 200);
      updateNight(t, dt, api);
      if (api.gameOver) return;

      // Moving platforms carry a rider.
      for (var i = 0; i < movers.length; i += 1) {
        var m = movers[i];
        var ox = m.x, oy = m.y;
        var off = Math.sin(t / m.period * TAU + m.phase) * m.range;
        m.x = m.bx + (m.axis === 'x' ? off : 0);
        m.y = m.by + (m.axis === 'y' ? off : 0);
        if (p.grounded && p.groundTile === m) {
          p.x += m.x - ox;
          p.y += m.y - oy;
        }
      }

      // Crumbling platforms.
      for (var c = 0; c < crumbles.length; c += 1) {
        var cr = crumbles[c];
        if (cr.state === 'solid' && p.grounded && p.groundTile === cr) {
          cr.state = 'shaking';
          cr.at = t;
          api.cue('land_soft');
        } else if (cr.state === 'shaking' && t - cr.at >= cr.delay) {
          cr.state = 'gone';
          cr.at = t;
        } else if (cr.state === 'gone' && t - cr.at >= cr.respawn && !api.rectsOverlap(p, cr)) {
          cr.state = 'solid';
        }
      }

      // Sky routes: the camera only follows once you land up there.
      if (p.grounded) {
        var tile = p.groundTile;
        skyMode = !!(tile && tile.y < 30);
        if (tile && tile.skyZone && !foundSkyZones[tile.skyZone]) {
          foundSkyZones[tile.skyZone] = true;
          skyDiscoveryAt = t;
          skyDiscoveryIndex = Math.max(0, skyZoneNames.indexOf(tile.skyZone));
          api.addXp(1000, { skyZone: tile.skyZone });
          api.notify('SKY ROUTE: ' + tile.skyZone + ' +1000', 2400);
        }
      } else if (skyMode && p.y > 150) {
        skyMode = false;
      }

      // Timed hazards.
      if (p.invuln <= 0 && !api.gameOver) {
        for (var li = 0; li < lasers.length; li += 1) {
          if (cycleOn(lasers[li], t) && api.rectsOverlap(p, laserRect(lasers[li]))) {
            api.damage('laser', lasers[li].x);
            break;
          }
        }
      }
      if (p.invuln <= 0 && !api.gameOver) {
        for (var vi = 0; vi < vents.length; vi += 1) {
          if (cycleOn(vents[vi], t) && api.rectsOverlap(p, ventRect(vents[vi]))) {
            api.damage('flame-vent', vents[vi].x);
            break;
          }
        }
      }

      // Pickups.
      gems.forEach(function (g) {
        if (g.taken || !api.rectsOverlap(p, pickupRect(g, 9))) return;
        g.taken = true;
        spawnCourseVfx('gem', g.x, g.y, t, gemAtlasRow(g.kind));
        api.addXp(g.xp, { gem: g.kind });
        api.notify(g.kind.toUpperCase() + ' +' + g.xp + ' XP', 2200);
      });
      relics.forEach(function (r) {
        if (r.taken || !api.rectsOverlap(p, pickupRect(r, 12))) return;
        r.taken = true;
        api.addXp(r.xp, { relic: r.kind });
        api.notify('RELIC: ' + RELIC_NAMES[r.kind] + ' +' + r.xp, 2800);
      });
      crystals.forEach(function (cy) {
        if (cy.taken || !api.rectsOverlap(p, pickupRect(cy, 9))) return;
        cy.taken = true;
        spawnCourseVfx('time', cy.x, cy.y, t);
        timeBonusMs += cy.ms;
        api.notify('TIME -' + (cy.ms / 1000).toFixed(1) + 's', 2000);
        api.cue('speed_boost_start');
      });
      if (api.sprayActive) {
        var spray = api.sprayRect();
        tags.forEach(function (tg) {
          if (tg.done || !api.rectsOverlap(spray, tg)) return;
          tg.done = true;
          tg.doneAt = t;
          spawnCourseVfx('spray', tg.x + tg.w / 2, tg.y + tg.h / 2, t);
          api.addXp(tg.xp, { tag: tg.art });
          api.notify('GOT UP! ' + tg.art.toUpperCase().replace(/-/g, ' ') + ' +' + tg.xp, 2400);
        });
      }

      // Coin trails.
      for (var ti = 0; ti < trailNames.length; ti += 1) {
        var tr = trails[trailNames[ti]];
        if (tr.done) continue;
        var all = true;
        for (var k = 0; k < tr.coins.length; k += 1) {
          if (!tr.coins[k].taken) { all = false; break; }
        }
        if (all) {
          tr.done = true;
          var lastTrailCoin = tr.coins[tr.coins.length - 1];
          spawnCourseVfx('trail', lastTrailCoin.x, lastTrailCoin.y, t);
          var bonus = tr.coins.length * TRAIL_BONUS_PER_COIN;
          api.addXp(bonus, { trail: trailNames[ti] });
          api.notify('TRAIL CLEAR +' + bonus, 1800);
        }
      }

      // Level 1A sets its own section name while the night train runs.
      if (!nightActive()) {
        var nextGroundZoneIndex = 0;
        for (var z = zones.length - 1; z >= 0; z -= 1) {
          if (p.x >= zones[z].x) { nextGroundZoneIndex = z; break; }
        }
        if (zones[nextGroundZoneIndex].name !== currentZone) {
          currentZone = zones[nextGroundZoneIndex].name;
          zoneTransitionAt = t;
          zoneTransitionIndex = nextGroundZoneIndex;
        }
      }
    }

    // ------------------------------------------------------------------
    // NIGHT TRAIN — hidden end-of-level easter egg.
    // Spray the faint wall just before the flag -> ride the first carriage
    // back toward the start. When the camera brakes, triple-jump onto the
    // hidden perch before the carriage leaves the screen (= death). After
    // 5s the perch vanishes; hop carriage to carriage, against the flow,
    // to the flag. Touching anything but a carriage = instant death.
    // ------------------------------------------------------------------
    // Carriages run on the existing bridge track (same size and line as the
    // scenery convoy, which is hidden while the night train runs).
    var CAR_W = env.TRAIN_WIDTH || 234;
    var CAR_H = env.TRAIN_HEIGHT || 78;
    var CAR_GAP = env.TRAIN_GAP === undefined ? 2 : env.TRAIN_GAP;
    var CAR_SCREEN_Y = env.TRAIN_SCREEN_Y === undefined ? 72 : env.TRAIN_SCREEN_Y;
    var RAIL_Y = Math.round(CAR_SCREEN_Y + CAR_H * 0.175 - OFFSET_Y); // roof line (world y)
    var NT = {
      tag: { x: 21760, y: F - 70, w: 72, h: 46 },
      railY: RAIL_Y,          // carriage roof (world y)
      rideStartX: 1500,       // spraying the wall warps the ride train here (Level 1A start)
      lockCamX: 200,          // camera stops here during the ride
      perch: { x: 255, y: RAIL_Y - 310, w: 72, h: 16, kind: 'nt-perch' },
      playerScale: 0.55,      // the runner is "out on the bridge", so drawn smaller
      rideSpeed: 3.2,         // px per 60fps frame, toward the start
      brakeSpeed: 2.0,
      departSpeed: 4.5,
      streamSpeed: 0.9,       // Level 1A carriages drift toward the start
      perchMs: 5000,
      rideCars: 4,
      xpBonus: 50000,
      xpPerCar: 1000,
      timeCutMs: 10000
    };
    var TRAIN_ART = ['trainNbg', 'trainWaxcash', 'trainAlcor', 'trainSwaxp', 'trainPxjking',
      'trainWpixal', 'trainWuf', 'trainGetsulaid', 'trainTrustme', 'trainHodlwars',
      'trainPunk', 'trainKek', 'trainCronx', 'trainWaxgod'];
    var night = null;
    function resetNight() {
      night = { phase: '', cars: [], speed: 0, camLocked: false, startedAt: 0, perchAt: 0,
        perchGone: false, carSeq: 0, pattern: 0, hops: {}, hopCount: 0, result: '', flashAt: -99999,
        doneAt: -99999 };
    }
    resetNight();
    function nightActive() { return night.phase === 'ride' || night.phase === 'perch' || night.phase === 'stream'; }

    // ==================================================================
    // LEVEL 1A — the night-train run. After the perch drop the runner hops
    // carriages (flowing toward the start) the whole length of the street,
    // x ~300 -> the finish flag. Everything below is active only while the
    // night train runs: fixed-world obstacles (low gantry beams, signal
    // lasers, drones), floating sky structures that climb off-screen to
    // hidden riches, and dense carriage runs under every sky structure so
    // a deliberate drop lands back on a train.
    // ==================================================================
    var A = {
      sections: [], platforms: [], walls: [], movers: [], crumbles: [], pads: [],
      beams: [], sigLasers: [], drones: [], coins: [], gems: [], crystals: [], dense: []
    };
    var A_GEM_XP = { ruby: 2000, emerald: 3500, sapphire: 4500, diamond: 10000 };
    var A_COIN = { small: { size: 16, xp: 100 }, medium: { size: 32, xp: 250 }, mega: { size: 56, xp: 2500 } };
    var R = RAIL_Y; // carriage roof line (world y)

    function aSection(x0, x1, name, gapMin, gapMax, spikes) {
      A.sections.push({ x0: x0, x1: x1, name: name, gapMin: gapMin, gapMax: gapMax, spikes: spikes, seen: false });
    }
    function aDense(x0, x1) { A.dense.push([x0, x1]); }
    function aPlat(x, y, w) { var p = { x: x, y: y, w: w, h: 16, kind: 'a-plat' }; A.platforms.push(p); return p; }
    function aWall(x, y, w, h) { var b = { x: x, y: y, w: w, h: h, solidBottom: true, kind: 'a-wall' }; A.walls.push(b); return b; }
    function aMover(x, y, w, axis, range, period, phase) {
      var m = { x: x, y: y, w: w, h: 16, bx: x, by: y, axis: axis, range: range, period: period, phase: phase || 0, kind: 'a-mover' };
      A.movers.push(m); return m;
    }
    function aCrumble(x, y, w) {
      var c = { x: x, y: y, w: w || 56, h: 16, state: 'solid', at: 0, delay: 420, respawn: 2400, kind: 'a-crumble' };
      A.crumbles.push(c); return c;
    }
    function aPad(x, surfaceY, w, bounce) {
      var p = { x: x, y: surfaceY - 8, w: w || 44, h: 8, bounce: bounce || 17, kind: 'a-pad' };
      A.pads.push(p); return p;
    }
    // Low gantry: bottom edge 26px above the roof. Standing = hit, crouch = clear, or jump it.
    function aBeam(x, w) { A.beams.push({ x: x, y: R - 58, w: w || 18, h: 32 }); }
    function aSig(x, period, on, phase) {
      A.sigLasers.push({ x: x, y0: R - 170, y1: R + 30, period: period || 2400, on: on || 1000, phase: phase || 0 });
    }
    function aDrone(x, y, rx, ry, period, phase) {
      A.drones.push({ bx: x, by: y, rx: rx, ry: ry, period: period, phase: phase || 0, x: x, y: y, w: 22, h: 14 });
    }
    function aCoin(x, y, tier) {
      var t = A_COIN[tier || 'small'];
      A.coins.push({ x: Math.round(x), y: Math.round(y), size: t.size, xp: t.xp, tier: tier || 'small', taken: false });
    }
    function aRow(x, y, n, dx, tier) { for (var i = 0; i < n; i += 1) aCoin(x + i * dx, y, tier); }
    function aArc(x0, x1, yBase, height, n, tier) {
      for (var i = 0; i < n; i += 1) {
        var k = n === 1 ? 0.5 : i / (n - 1);
        aCoin(x0 + (x1 - x0) * k, yBase - Math.sin(k * Math.PI) * height, tier);
      }
    }
    function aGem(x, y, kind) { A.gems.push({ x: x, y: y, kind: kind, xp: A_GEM_XP[kind], taken: false }); }
    function aCrystal(x, y) { A.crystals.push({ x: x, y: y, ms: 3000, taken: false }); }
    var ROOF_COIN_Y = R - 22;

    // --- 1 · WARM-UP (300–2000) -------------------------------------
    aSection(300, 2000, 'LEVEL 1A', 30, 90, 0);
    aRow(420, ROOF_COIN_Y, 6, 30, 'small');
    aArc(700, 980, R - 30, 60, 7, 'small');
    aRow(1150, ROOF_COIN_Y, 6, 30, 'small');
    aBeam(1800);
    aRow(1860, ROOF_COIN_Y, 4, 28, 'medium');

    // --- 2 · SIGNAL BOX (2000–3800) ----------------------------------
    aSection(2000, 3800, 'SIGNAL BOX', 50, 130, 0.1);
    aSig(2300, 2400, 1000, 0);
    aBeam(2600);
    aSig(2900, 2400, 1000, 800);
    aBeam(3300);
    aSig(3500, 2400, 1000, 1600);
    aRow(2100, ROOF_COIN_Y, 5, 30, 'small');
    aArc(3050, 3260, R - 30, 70, 6, 'small');
    // Signal tower: floating walls climbing off-screen.
    aDense(2350, 2980);
    aWall(2450, R - 90, 40, 24);
    aWall(2540, R - 170, 40, 24);
    aWall(2630, R - 250, 40, 24);
    aPlat(2720, R - 320, 180);
    aCoin(2470, R - 114, 'small');
    aCoin(2560, R - 194, 'small');
    aCoin(2650, R - 274, 'medium');
    aRow(2740, R - 346, 5, 32, 'small');
    aGem(2880, R - 350, 'sapphire');
    aCrystal(2810, R - 380);

    // --- 3 · PIGEON UNDERPASS (3800–5600) ----------------------------
    // Climbs into the street level's PIGEON HIGHWAY sky route above.
    aSection(3800, 5600, 'PIGEON UNDERPASS', 60, 150, 0.15);
    aDense(3600, 5700);
    aPlat(3650, R - 78, 60);
    aPlat(3740, R - 148, 60);
    aCoin(3680, R - 104, 'small');
    aCoin(3770, R - 174, 'medium');
    aBeam(4200);
    aDrone(4600, R - 60, 90, 24, 3000, 0);
    aBeam(5000);
    aDrone(5200, R - 70, 70, 30, 2600, 1.4);
    aDrone(5450, R - 50, 80, 20, 2200, 2.6);
    aRow(4300, ROOF_COIN_Y, 6, 30, 'small');
    aRow(5050, ROOF_COIN_Y, 4, 30, 'medium');
    aGem(4320, R - 440, 'emerald');
    aCoin(4380, R - 440, 'mega');

    // --- 4 · BEAM ALLEY (5600–7400) ----------------------------------
    aSection(5600, 7400, 'BEAM ALLEY', 50, 140, 0.25);
    [5800, 6050, 6300, 6600, 6850, 7150].forEach(function (bx) { aBeam(bx); });
    aRow(5850, ROOF_COIN_Y + 10, 6, 30, 'small');
    aRow(6350, ROOF_COIN_Y + 10, 6, 30, 'small');
    aRow(6900, ROOF_COIN_Y + 10, 6, 30, 'small');
    aDense(6400, 6800);
    aMover(6500, R - 150, 64, 'x', 70, 3200, 0);
    aPlat(6720, R - 250, 90);
    aGem(6765, R - 285, 'ruby');
    aCoin(6560, R - 190, 'mega');

    // --- 5 · CRUMBLE CLOUDS (7400–9000) ------------------------------
    aSection(7400, 9000, 'CRUMBLE CLOUDS', 60, 160, 0.1);
    aDense(7550, 8850);
    [[7600, -70], [7700, -140], [7800, -210], [7900, -280], [8000, -350], [8100, -420]].forEach(function (c) {
      aCrumble(c[0], R + c[1]);
      aCoin(c[0] + 28, R + c[1] - 24, 'small');
    });
    aPlat(8200, R - 480, 200);
    aGem(8300, R - 520, 'diamond');
    aCoin(8240, R - 510, 'mega');
    aCoin(8360, R - 510, 'mega');
    aCrystal(8300, R - 580);
    [[8450, -410], [8550, -340], [8650, -270], [8750, -200]].forEach(function (c) { aCrumble(c[0], R + c[1]); });
    aRow(8460, R - 440, 4, 100, 'medium');

    // --- 6 · DRONE STORM (9000–10800) --------------------------------
    aSection(9000, 10800, 'DRONE STORM', 90, 200, 0.15);
    aDrone(9150, R - 50, 80, 30, 2400, 0);
    aDrone(9350, R - 80, 60, 40, 2000, 1);
    aBeam(9400);
    aDrone(9600, R - 40, 100, 20, 2800, 2);
    aDrone(9900, R - 70, 70, 35, 2200, 0.5);
    aDrone(10100, R - 50, 90, 25, 2600, 1.8);
    aBeam(10300);
    aDrone(10400, R - 90, 60, 30, 2000, 2.9);
    aDrone(10600, R - 45, 80, 20, 2400, 0.9);
    aRow(9200, ROOF_COIN_Y, 5, 30, 'small');
    aRow(10150, ROOF_COIN_Y, 5, 30, 'small');
    // Hidden lift above the storm.
    aDense(9650, 10080);
    aPlat(9660, R - 60, 60);
    aMover(9760, R - 140, 64, 'y', 80, 4000, 0);
    aPlat(9860, R - 300, 120);
    aWall(10020, R - 380, 40, 24);
    aGem(9920, R - 336, 'emerald');
    aCrystal(10040, R - 410);
    aRow(9875, R - 326, 3, 30, 'medium');

    // --- 7 · TWIN TOWERS (10800–12600) -------------------------------
    aSection(10800, 12600, 'TWIN TOWERS', 60, 170, 0.2);
    aDense(10950, 11800);
    aPlat(11000, R - 40, 80);
    aPad(11020, R - 40, 40, 17);
    aWall(11120, R - 430, 60, 300);       // tower 1 (top R-430)
    aMover(11250, R - 470, 64, 'x', 50, 3000, 0);
    aWall(11420, R - 510, 60, 330);       // tower 2 (top R-510)
    aRow(11126, R - 454, 2, 24, 'medium');
    aGem(11150, R - 480, 'ruby');
    aGem(11450, R - 560, 'sapphire');
    aCoin(11430, R - 535, 'mega');
    aCrystal(11470, R - 600);
    aBeam(11000 + 640);
    aBeam(12000);
    aRow(12050, ROOF_COIN_Y, 6, 30, 'small');

    // --- 8 · LASER GRID (12600–14400) --------------------------------
    aSection(12600, 14400, 'LASER GRID', 70, 170, 0.15);
    for (var gi = 0; gi < 8; gi += 1) aSig(12750 + gi * 200, 2000, 900, (gi % 2) * 1000);
    aBeam(12850);
    aBeam(13950);
    aRow(12800, ROOF_COIN_Y, 4, 40, 'medium');
    aRow(13600, ROOF_COIN_Y, 4, 40, 'medium');
    aDense(13250, 13650);
    aPlat(13300, R - 120, 70);
    aPlat(13420, R - 210, 70);
    aPlat(13540, R - 300, 90);
    aGem(13585, R - 340, 'emerald');

    // --- 9 · STRATO LIFT (14400–16200) -------------------------------
    aSection(14400, 16200, 'STRATO LIFT', 80, 190, 0.2);
    aDense(14550, 15500);
    aPlat(14600, R - 40, 90);
    aPad(14625, R - 40, 40, 17);
    aPlat(14760, R - 330, 90);
    aPad(14785, R - 330, 40, 18);
    aPlat(14960, R - 660, 300);
    aGem(15050, R - 700, 'diamond');
    aCoin(15000, R - 690, 'mega');
    aCoin(15110, R - 690, 'mega');
    aCoin(15200, R - 690, 'mega');
    aCrystal(15240, R - 740);
    aRow(14980, R - 560, 8, 34, 'small');
    aDrone(15700, R - 60, 80, 25, 2400, 0);
    aBeam(15900);
    aRow(15650, ROOF_COIN_Y, 5, 30, 'small');

    // --- 10 · SPIKE EXPRESS (16200–18000) ----------------------------
    aSection(16200, 18000, 'SPIKE EXPRESS', 60, 150, 0.5);
    aBeam(16500);
    aBeam(16900);
    aDrone(17100, R - 60, 90, 25, 2600, 0.7);
    aBeam(17400);
    aDrone(17600, R - 50, 70, 30, 2200, 2.1);
    aBeam(17800);
    aRow(16550, ROOF_COIN_Y, 5, 30, 'small');
    aRow(17450, ROOF_COIN_Y, 5, 30, 'small');
    aDense(16950, 17350);
    aMover(17000, R - 120, 64, 'y', 60, 3000, 0);
    aPlat(17120, R - 260, 100);
    aGem(17170, R - 296, 'ruby');

    // --- 11 · GAP SPRINT (18000–19800) -------------------------------
    aSection(18000, 19800, 'GAP SPRINT', 150, 260, 0.1);
    aArc(18200, 18500, R - 30, 90, 7, 'small');
    aArc(18800, 19100, R - 30, 90, 7, 'small');
    aArc(19350, 19650, R - 30, 90, 7, 'medium');
    aCrystal(18950, R - 150);

    // --- 12 · FINAL APPROACH (19800–21900) ---------------------------
    aSection(19800, 21900, 'FINAL APPROACH', 90, 220, 0.25);
    aSig(19950, 2200, 1000, 0);
    aBeam(20100);
    aDrone(20350, R - 60, 80, 25, 2400, 1.2);
    aBeam(20600);
    aSig(20900, 2200, 1000, 1100);
    aDrone(21050, R - 70, 70, 30, 2000, 0.3);
    aRow(20150, ROOF_COIN_Y, 5, 30, 'small');
    aRow(20650, ROOF_COIN_Y, 5, 30, 'small');
    // Final climb onto the street level's ALL CITY ROOF and above.
    aDense(21150, 21900);
    aPlat(21250, R - 90, 60);
    aWall(21560, R - 300, 40, 24);
    aWall(21650, R - 380, 40, 24);
    aPlat(21720, R - 450, 120);
    aGem(21780, R - 490, 'diamond');
    aCoin(21740, R - 480, 'mega');
    aCrystal(21670, R - 410);

    function aSectionAt(x) {
      if (x < A.sections[0].x0) return A.sections[0];
      for (var i = 0; i < A.sections.length; i += 1) {
        if (x >= A.sections[i].x0 && x < A.sections[i].x1) return A.sections[i];
      }
      return A.sections[A.sections.length - 1];
    }
    function aIsDense(x) {
      for (var i = 0; i < A.dense.length; i += 1) if (x >= A.dense[i][0] && x < A.dense[i][1]) return true;
      return false;
    }
    // Does the world span [x0, x1] touch a safe-drop zone (optionally widened
    // on the right, where carriages arrive from)?
    function aTouchesDense(x0, x1, leadIn) {
      for (var i = 0; i < A.dense.length; i += 1) {
        if (x1 > A.dense[i][0] && x0 < A.dense[i][1] + (leadIn || 0)) return true;
      }
      return false;
    }
    var COUPLE_GAP = 12;          // max gap while coupled under a safe-drop zone
    var COUPLE_SPEED = 4;         // extra px/frame a trailing carriage uses to close up
    var COUPLE_LEAD_IN = 420;     // start coupling this far before the zone
    // Deterministic per-run carriage pattern (seeded by carriage number).
    function aRand(n) {
      var s = (n * 2654435761 + 0x9e3779b9) >>> 0;
      s ^= s >>> 15; s = Math.imul(s, 0x85ebca6b) >>> 0; s ^= s >>> 13;
      return (s >>> 0) / 4294967296;
    }
    function aDronePos(d, t) {
      var a = t / d.period * TAU + d.phase;
      d.x = d.bx + Math.sin(a) * d.rx - d.w / 2;
      d.y = d.by + Math.cos(a * 2) * d.ry - d.h / 2;
    }
    function aMovePlatforms(list, t, p) {
      for (var i = 0; i < list.length; i += 1) {
        var m = list[i];
        var ox = m.x, oy = m.y;
        var off = Math.sin(t / m.period * TAU + m.phase) * m.range;
        m.x = m.bx + (m.axis === 'x' ? off : 0);
        m.y = m.by + (m.axis === 'y' ? off : 0);
        if (p && p.grounded && p.groundTile === m) { p.x += m.x - ox; p.y += m.y - oy; }
      }
    }
    function aCrumbleStep(list, t, p, api) {
      for (var c = 0; c < list.length; c += 1) {
        var cr = list[c];
        if (cr.state === 'solid' && p.grounded && p.groundTile === cr) { cr.state = 'shaking'; cr.at = t; api.cue('land_soft'); }
        else if (cr.state === 'shaking' && t - cr.at >= cr.delay) { cr.state = 'gone'; cr.at = t; }
        else if (cr.state === 'gone' && t - cr.at >= cr.respawn && !api.rectsOverlap(p, cr)) cr.state = 'solid';
      }
    }
    function aReset() {
      A.coins.forEach(function (c) { c.taken = false; });
      A.gems.forEach(function (g) { g.taken = false; });
      A.crystals.forEach(function (c) { c.taken = false; });
      A.crumbles.forEach(function (c) { c.state = 'solid'; c.at = 0; });
      A.sections.forEach(function (s) { s.seen = false; });
      aMovePlatforms(A.movers, 0, null);
    }
    aMovePlatforms(A.movers, 0, null);
    A.drones.forEach(function (d) { aDronePos(d, 0); });

    function aSolids() {
      var out = A.platforms.concat(A.walls, A.movers, A.pads);
      for (var i = 0; i < A.crumbles.length; i += 1) if (A.crumbles[i].state !== 'gone') out.push(A.crumbles[i]);
      return out;
    }

    function aUpdate(t, api) {
      var p = api.player;
      aMovePlatforms(A.movers, t, p);
      aCrumbleStep(A.crumbles, t, p, api);
      A.drones.forEach(function (d) { aDronePos(d, t); });
      var sec = aSectionAt(p.x);
      currentZone = '1A · ' + sec.name;
      if (!sec.seen && night.phase === 'stream') {
        sec.seen = true;
        api.notify('LEVEL 1A · ' + sec.name, 1600);
      }
      // Pickups.
      for (var i = 0; i < A.coins.length; i += 1) {
        var c = A.coins[i];
        if (c.taken) continue;
        var r = c.size * 0.4;
        if (api.rectsOverlap(p, { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 })) {
          c.taken = true;
          api.addXp(c.xp, { level1A: 'coin' });
          api.cue('coin_collect');
        }
      }
      A.gems.forEach(function (g) {
        if (g.taken || !api.rectsOverlap(p, pickupRect(g, 10))) return;
        g.taken = true;
        spawnCourseVfx('gem', g.x, g.y, t, gemAtlasRow(g.kind));
        api.addXp(g.xp, { level1A: 'gem', gem: g.kind });
        api.notify('1A ' + g.kind.toUpperCase() + ' +' + g.xp, 2200);
      });
      A.crystals.forEach(function (cy) {
        if (cy.taken || !api.rectsOverlap(p, pickupRect(cy, 9))) return;
        cy.taken = true;
        spawnCourseVfx('time', cy.x, cy.y, t);
        timeBonusMs += cy.ms;
        api.notify('TIME -' + (cy.ms / 1000).toFixed(1) + 's', 2000);
        api.cue('speed_boost_start');
      });
      // Obstacles (only once the carriage run proper is under way).
      if (night.phase !== 'stream' || p.invuln > 0 || api.gameOver) return;
      for (var b = 0; b < A.beams.length; b += 1) {
        if (api.rectsOverlap(p, A.beams[b])) { api.damage('gantry', A.beams[b].x); return; }
      }
      for (var s = 0; s < A.sigLasers.length; s += 1) {
        var l = A.sigLasers[s];
        if (cycleOn(l, t) && api.rectsOverlap(p, { x: l.x + 12, y: l.y0, w: 8, h: l.y1 - l.y0 })) {
          api.damage('signal-laser', l.x); return;
        }
      }
      for (var d = 0; d < A.drones.length; d += 1) {
        if (api.rectsOverlap(p, A.drones[d])) { api.damage('drone', A.drones[d].x); return; }
      }
    }

    function aDraw(ctx, api, t) {
      var camX = api.cameraX;
      var i, x, y;
      var girder = art['sky-girder'];
      for (i = 0; i < A.platforms.length; i += 1) {
        var p = A.platforms[i];
        if (!inView(p.x, p.w, camX)) continue;
        x = Math.round(p.x - camX); y = p.y + OFFSET_Y;
        if (drawAtlasFrame(ctx, art['atlas-structures'], 0, 5, atlasLoop(t + p.x, 6, 420), 6,
          x, y - 18, p.w, p.h + 28)) {}
        else if (ready(girder)) drawTiled(ctx, girder, x, y, p.w, p.h, 48);
        else { ctx.fillStyle = '#7a86a8'; ctx.fillRect(x, y, p.w, p.h); }
      }
      var wimg = art['wall-block'];
      for (i = 0; i < A.walls.length; i += 1) {
        var w = A.walls[i];
        if (!inView(w.x, w.w, camX)) continue;
        x = Math.round(w.x - camX); y = w.y + OFFSET_Y;
        if (drawAtlasFrame(ctx, art['atlas-structures'], 4, 5, Math.abs(Math.floor(w.x / 40)) % 6, 6,
          x, y, w.w, w.h)) {}
        else if (ready(wimg)) {
          for (var by = 0; by < w.h; by += 32) for (var bx = 0; bx < w.w; bx += 32) {
            var bw = Math.min(32, w.w - bx), bh = Math.min(32, w.h - by);
            ctx.drawImage(wimg, 0, 0, wimg.naturalWidth * bw / 32, wimg.naturalHeight * bh / 32, x + bx, y + by, bw, bh);
          }
        } else { ctx.fillStyle = '#4a3a5c'; ctx.fillRect(x, y, w.w, w.h); }
      }
      var mimg = art['moving-platform'];
      for (i = 0; i < A.movers.length; i += 1) {
        var m = A.movers[i];
        if (!inView(m.x, m.w, camX)) continue;
        x = Math.round(m.x - camX); y = Math.round(m.y + OFFSET_Y);
        if (drawAtlasFrame(ctx, art['atlas-structures'], 3, 5, atlasLoop(t + m.bx, 6, 130), 6,
          x, y - 14, m.w, m.h + 24)) {}
        else if (ready(mimg)) ctx.drawImage(mimg, x, y, m.w, m.h);
        else { ctx.fillStyle = '#2e8f9e'; ctx.fillRect(x, y, m.w, m.h); }
      }
      var cimg = art['crumble-platform'];
      for (i = 0; i < A.crumbles.length; i += 1) {
        var cr = A.crumbles[i];
        if (cr.state === 'gone' || !inView(cr.x, cr.w, camX)) continue;
        x = Math.round(cr.x - camX) + (cr.state === 'shaking' ? Math.round(Math.sin(t / 18) * 2) : 0);
        y = cr.y + OFFSET_Y;
        var crFrame = cr.state === 'shaking' ? Math.min(4, 1 + Math.floor((t - cr.at) / 90)) : 0;
        if (drawAtlasFrame(ctx, art['atlas-structures'], 2, 5, crFrame, 8,
          x, y - 12, cr.w, cr.h + 22)) {}
        else if (ready(cimg)) ctx.drawImage(cimg, x, y, cr.w, cr.h);
        else { ctx.fillStyle = '#a8743e'; ctx.fillRect(x, y, cr.w, cr.h); }
      }
      var pimg = art['bounce-pad'];
      for (i = 0; i < A.pads.length; i += 1) {
        var pd = A.pads[i];
        if (!inView(pd.x, pd.w, camX)) continue;
        var squash = t - (pd.lastBounceAt || -9999) < 160 ? 4 : 0;
        x = Math.round(pd.x - camX); y = pd.y + OFFSET_Y - 4 + squash;
        var padAge = t - (pd.lastBounceAt || -9999);
        var padFrame = padAge < 360 ? Math.min(5, Math.floor(padAge / 60)) : 0;
        if (drawAtlasFrame(ctx, art['atlas-structures'], 1, 5, padFrame, 6,
          x, y - 8, pd.w, 24 - squash)) {}
        else if (ready(pimg)) ctx.drawImage(pimg, x, y, pd.w, 12 - squash);
        else { ctx.fillStyle = '#ff2fd0'; ctx.fillRect(x, y, pd.w, 12 - squash); }
      }
      // Low gantry beams with hangers running up off-screen.
      for (i = 0; i < A.beams.length; i += 1) {
        var bm = A.beams[i];
        if (!inView(bm.x - 30, bm.w + 60, camX)) continue;
        x = Math.round(bm.x - camX); y = bm.y + OFFSET_Y;
        if (drawAtlasFrame(ctx, art['atlas-hazards'], 3, 5, atlasLoop(t + bm.x, 4, 260), 6,
          x - 34, y - 48, bm.w + 68, bm.h + 54)) continue;
        ctx.fillStyle = '#3b3f4c';
        ctx.fillRect(x - 26, y - 900, 3, 900);
        ctx.fillRect(x + bm.w + 23, y - 900, 3, 900);
        ctx.fillRect(x - 28, y, bm.w + 56, 8);
        ctx.fillStyle = '#ffd400';
        for (var sx = 0; sx < bm.w + 56; sx += 10) ctx.fillRect(x - 28 + sx, y + 8, 5, 4);
        ctx.fillStyle = '#5a6070';
        ctx.fillRect(x, y + 8, bm.w, bm.h - 8);
      }
      // Signal lasers.
      var limg = art['laser-emitter'];
      for (i = 0; i < A.sigLasers.length; i += 1) {
        var sl = A.sigLasers[i];
        if (!inView(sl.x, 32, camX)) continue;
        x = Math.round(sl.x - camX);
        var y0 = sl.y0 + OFFSET_Y, y1 = sl.y1 + OFFSET_Y;
        if (cycleOn(sl, t)) {
          ctx.fillStyle = 'rgba(60,255,140,0.3)'; ctx.fillRect(x + 9, y0, 14, y1 - y0);
          ctx.fillStyle = '#3cff8c'; ctx.fillRect(x + 13, y0, 6, y1 - y0);
          ctx.fillStyle = '#e0ffe9'; ctx.fillRect(x + 15, y0, 2, y1 - y0);
        } else if (cycleWarn(sl, t)) {
          ctx.fillStyle = Math.floor(t / 70) % 2 ? 'rgba(60,255,140,0.55)' : 'rgba(60,255,140,0.15)';
          ctx.fillRect(x + 15, y0, 2, y1 - y0);
        }
        var laserFrame = cycleOn(sl, t) ? 5 : cycleWarn(sl, t) ? 3 : 0;
        if (drawAtlasFrame(ctx, art['atlas-hazards'], 1, 5, laserFrame, 7,
          x - 4, y0 - 28, 40, 30)) {}
        else if (ready(limg)) ctx.drawImage(limg, x, y0 - 20, 32, 20);
        else { ctx.fillStyle = '#1d1f29'; ctx.fillRect(x, y0 - 20, 32, 20); }
      }
      // Drones.
      var dimg = art['drone'];
      for (i = 0; i < A.drones.length; i += 1) {
        var dr = A.drones[i];
        if (!inView(dr.x, dr.w, camX)) continue;
        x = Math.round(dr.x - camX); y = Math.round(dr.y + OFFSET_Y);
        if (drawAtlasFrame(ctx, art['atlas-hazards'], 0, 5, atlasLoop(t + dr.bx, 4, 105), 10,
          x - 10, y - 11, dr.w + 20, dr.h + 22)) {}
        else if (ready(dimg)) ctx.drawImage(dimg, x - 5, y - 6, dr.w + 10, dr.h + 10);
        else { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, y, dr.w, dr.h); }
      }
      // Coins (engine coin sheet), gems, crystals.
      var coinImg = api.images.coin;
      for (i = 0; i < A.coins.length; i += 1) {
        var c = A.coins[i];
        if (c.taken || !inView(c.x - c.size / 2, c.size, camX)) continue;
        x = Math.round(c.x - camX - c.size / 2); y = Math.round(c.y + OFFSET_Y - c.size / 2);
        if (coinImg) {
          var frame = Math.floor((t + c.x * 7) / 85) % 25;
          var sw = coinImg.naturalWidth / 5, sh = coinImg.naturalHeight / 5;
          ctx.drawImage(coinImg, frame % 5 * sw, Math.floor(frame / 5) * sh, sw, sh, x, y, c.size, c.size);
        } else { ctx.fillStyle = '#ffd447'; ctx.fillRect(x, y, c.size, c.size); }
      }
      for (i = 0; i < A.gems.length; i += 1) {
        var g = A.gems[i];
        if (g.taken || !inView(g.x, 20, camX)) continue;
        var agSize = 22 * (1 + Math.sin(t / 150 + i) * 0.08);
        if (!drawAtlasFrame(ctx, art['atlas-pickups'], gemAtlasRow(g.kind), 7,
          atlasLoop(t + i * 43, g.kind === 'diamond' ? 7 : 6, 120), g.kind === 'diamond' ? 8 : 7,
          g.x - camX - agSize / 2, g.y + OFFSET_Y - agSize / 2, agSize, agSize)) {
          drawPickup(ctx, art['gem-' + g.kind], g.x - camX, g.y + OFFSET_Y, agSize, t, '#ff3060');
        }
      }
      for (i = 0; i < A.crystals.length; i += 1) {
        var cy = A.crystals[i];
        if (cy.taken || !inView(cy.x, 20, camX)) continue;
        if (!drawAtlasFrame(ctx, art['atlas-pickups'], 4, 7, atlasLoop(t + i * 31, 5, 125), 8,
          cy.x - camX - 12, cy.y + OFFSET_Y - 12, 24, 24)) {
          drawPickup(ctx, art['time-crystal'], cy.x - camX, cy.y + OFFSET_Y, 20, t, '#3cf2ff');
        }
      }
    }

    function makeCar(x, w, spikes) {
      night.carSeq += 1;
      return { x: x, y: NT.railY, w: w, h: 12, kind: 'train', id: night.carSeq, spikes: !!spikes,
        art: TRAIN_ART[night.carSeq % TRAIN_ART.length] };
    }

    function startNightTrain(api, t) {
      var p = api.player;
      night.phase = 'ride';
      night.startedAt = t;
      night.flashAt = t;
      night.speed = NT.rideSpeed;
      aReset();
      // Warp: the ride starts back at the beginning of the street (Level 1A).
      p.x = NT.rideStartX + 40;
      var x = NT.rideStartX;
      for (var i = 0; i < NT.rideCars; i += 1) {
        night.cars.push(makeCar(x, CAR_W, false));
        x += CAR_W + CAR_GAP;
      }
      p.y = NT.railY - p.h;
      p.vx = 0;
      p.vy = 0;
      skyMode = false;
      p.grounded = false;
      p.groundTile = null;
      api.notify('LEVEL 1A · ALL ABOARD THE NIGHT TRAIN', 2600);
      api.cue('speed_boost_start');
    }

    function streamTailX() {
      var last = null;
      for (var i = 0; i < night.cars.length; i += 1) {
        if (night.cars[i].stream && (!last || night.cars[i].x > last.x)) last = night.cars[i];
      }
      return last ? last.x + last.w + last.gapAfter : null;
    }

    // Carriage gaps come from the Level 1A section the carriage will be in
    // when the runner meets it (~220px left of where it spawns). Under sky
    // structures the carriages run nearly joined so a deliberate drop lands.
    function nextCarSpec(spawnX) {
      var meet = spawnX - 220;
      var sec = aSectionAt(meet);
      if (aIsDense(meet)) return { gap: CAR_GAP + Math.round(aRand(night.carSeq) * 22), spikes: false };
      return {
        gap: Math.round(sec.gapMin + aRand(night.carSeq) * (sec.gapMax - sec.gapMin)),
        spikes: aRand(night.carSeq + 7777) < sec.spikes
      };
    }

    function spawnStream(api) {
      var limit = api.cameraX + VIEW_W + 420;
      var tail = streamTailX();
      if (tail === null) {
        // First stream carriage arrives centred under the perch as it vanishes.
        // + ~34 frames for the drop from the perch to the carriage roof.
        var frames = NT.perchMs / (1000 / 60) + Math.sqrt(2 * (NT.railY - NT.perch.y) / 0.52);
        var first = makeCar(NT.perch.x + NT.perch.w / 2 - CAR_W / 2 + NT.streamSpeed * frames, CAR_W, false);
        first.stream = true;
        first.gapAfter = nextCarSpec(first.x + CAR_W).gap;
        night.cars.push(first);
        tail = streamTailX();
      }
      while (tail < limit) {
        var spec = nextCarSpec(tail);
        var car = makeCar(tail, CAR_W, spec.spikes);
        car.stream = true;
        car.gapAfter = nextCarSpec(tail + CAR_W).gap;
        // Spawn already coupled when the gap would sit in (or lead into) a safe-drop zone.
        if (aTouchesDense(car.x + car.w, car.x + car.w + car.gapAfter, COUPLE_LEAD_IN)) {
          car.gapAfter = Math.min(car.gapAfter, COUPLE_GAP);
        }
        night.cars.push(car);
        tail = car.x + car.w + car.gapAfter;
      }
    }

    // Safe-drop zones are fixed in the world but the carriages drift, so
    // coverage is kept from the carriages' current positions: any gap that
    // is in (or about to reach) a zone is closed by the trailing carriage
    // catching up, and roof spikes fold down while a carriage is in a zone.
    function coupleUnderSafeZones(p, step) {
      var cars = night.cars.filter(function (c) { return c.stream; }).sort(function (a, b) { return a.x - b.x; });
      for (var i = 0; i < cars.length; i += 1) {
        var car = cars[i];
        car.spikesFolded = aTouchesDense(car.x, car.x + car.w, 0);
        if (i === 0) continue;
        var lead = cars[i - 1];
        var gapStart = lead.x + lead.w;
        var gap = car.x - gapStart;
        if (gap <= COUPLE_GAP || !aTouchesDense(gapStart, car.x, COUPLE_LEAD_IN)) continue;
        var close = Math.min(gap - COUPLE_GAP, COUPLE_SPEED * step);
        car.x -= close;
        if (p.grounded && p.groundTile === car) p.x -= close;
      }
    }

    function spikeRect(car) { return { x: car.x + car.w / 2 - 22, y: NT.railY - 14, w: 44, h: 14 }; }

    function failNight(api, reason) {
      night.result = 'failed';
      night.phase = 'failed';
      api.kill(reason);
    }

    // Shortcut: tap 1 + 9 together -> straight onto the 5-second perch, then
    // drop onto the carriage stream and play on to the flag.
    var perchShortcutPending = false;
    function startAtPerch(api, t) {
      var p = api.player;
      resetNight();
      aReset();
      night.phase = 'perch';
      night.camLocked = true;
      night.startedAt = t;
      night.perchAt = t;
      night.flashAt = t;
      p.x = NT.perch.x + NT.perch.w / 2 - p.w / 2;
      p.y = NT.perch.y - p.h;
      p.vx = 0;
      p.vy = 0;
      // Clear the stale street contact so the landing rules don't see it.
      p.grounded = false;
      p.groundTile = null;
      skyMode = true;
      spawnStream(api);
      api.notify('LEVEL 1A SHORTCUT · DROP IN 5s', 2200);
    }

    function updateNight(t, dt, api) {
      var p = api.player;
      if (perchShortcutPending) {
        perchShortcutPending = false;
        if (!api.complete) { startAtPerch(api, t); return; }
      }
      if (!night.phase) {
        if (api.sprayActive && !api.complete && api.rectsOverlap(api.sprayRect(), NT.tag)) startNightTrain(api, t);
        return;
      }
      if (!nightActive()) return;
      var step = dt / (1000 / 60);

      if (night.phase === 'ride' && !night.camLocked && p.x <= NT.lockCamX + 200) {
        night.camLocked = true;
        night.speed = NT.brakeSpeed;
        api.cue('land_soft');
      }
      // Once the runner leaves the ride train for the perch, it pulls away.
      var speed = night.phase === 'ride' ? night.speed : NT.departSpeed;
      for (var i = 0; i < night.cars.length; i += 1) {
        var car = night.cars[i];
        var v = car.stream ? NT.streamSpeed : speed;
        car.x -= v * step;
        if (p.grounded && p.groundTile === car) p.x -= v * step;
      }
      night.cars = night.cars.filter(function (c) { return c.x + c.w > api.cameraX - 700; });
      coupleUnderSafeZones(p, step);

      if (night.phase === 'perch' || night.phase === 'stream') spawnStream(api);
      if (night.phase === 'perch' && !night.perchGone && t - night.perchAt >= NT.perchMs) {
        night.perchGone = true;
        night.phase = 'stream';
      }

      // Landing rules: only carriages (and the perch while it exists) are safe.
      if (p.grounded && p.groundTile) {
        var tile = p.groundTile;
        if (tile === NT.perch) {
          if (night.phase === 'ride') {
            night.phase = 'perch';
            night.perchAt = t;
            skyMode = true;
            api.addXp(5000, { nightTrain: 'perch' });
            api.notify('PERCH FOUND +5000 · 5s', 2200);
            spawnStream(api);
          }
        } else if (tile.kind === 'train') {
          if (night.phase !== 'ride' && !night.hops[tile.id]) {
            night.hops[tile.id] = true;
            night.hopCount += 1;
            if (night.phase === 'perch') { night.phase = 'stream'; night.perchGone = true; }
          }
        } else if (tile.y > NT.railY + 2) {
          // Anything below the carriage roofs (street, crates, low ledges) = death.
          // Sky structures above the track are safe.
          failNight(api, 'night-train-fall');
          return;
        }
      }
      if (p.y + p.h > F + 2) { failNight(api, 'night-train-fall'); return; }
      aUpdate(t, api);
      if (api.gameOver) { night.phase = 'failed'; night.result = 'failed'; return; }
      if (night.phase === 'ride' && night.camLocked && p.x + p.w < NT.lockCamX) {
        failNight(api, 'night-train-off-screen');
        return;
      }
      if (night.phase === 'stream' && p.invuln <= 0) {
        for (var s = 0; s < night.cars.length; s += 1) {
          if (night.cars[s].spikes && !night.cars[s].spikesFolded && api.rectsOverlap(p, spikeRect(night.cars[s]))) {
            api.damage('spikes', night.cars[s].x + night.cars[s].w / 2);
            if (api.gameOver) { night.phase = 'failed'; night.result = 'failed'; }
            break;
          }
        }
      }
    }

    function forceFinish(api) {
      // A fatal hit on the same frame (e.g. roof spikes) must never also count as a finish.
      if (night.phase !== 'stream' || api.gameOver) return false;
      var p = api.player;
      if (p.x + p.w < L.finish.x) return false;
      night.phase = 'done';
      night.result = 'done';
      night.doneAt = api.runElapsedMs || 0;
      var bonus = NT.xpBonus + night.hopCount * NT.xpPerCar;
      timeBonusMs += NT.timeCutMs;
      api.addXp(bonus, { nightTrain: 'complete', carriages: night.hopCount });
      api.notify('NIGHT TRAIN LEGEND +' + bonus + ' · -10s', 4000);
      return true;
    }

    function nightSolids() {
      var out = night.cars.slice();
      if ((night.phase === 'ride' || night.phase === 'perch') && !night.perchGone) out.push(NT.perch);
      return out;
    }

    // Draw the night-train carriages in the bridge-track layer instead of the
    // scenery convoy. Returning true tells the engine to skip its convoy.
    function drawBridgeTrack(ctx, api, t) {
      if (!night.phase) return false;
      var camX = api.cameraX;
      for (var i = 0; i < night.cars.length; i += 1) {
        var car = night.cars[i];
        if (!inView(car.x, car.w, camX)) continue;
        var img = api.images[car.art];
        var cx = Math.round(car.x - camX);
        if (img) ctx.drawImage(img, cx, CAR_SCREEN_Y, car.w, CAR_H);
        else {
          ctx.fillStyle = '#3b4a7a';
          ctx.fillRect(cx, CAR_SCREEN_Y + 12, car.w, CAR_H - 20);
          ctx.fillStyle = '#ffe45a';
          ctx.font = 'bold 7px Courier New';
          ctx.fillText('TEMP CARRIAGE', cx + 6, CAR_SCREEN_Y + 30);
        }
        if (car.spikes) {
          var sr = spikeRect(car);
          var sx = Math.round(sr.x - camX);
          var sy = sr.y + OFFSET_Y;
          var spikeFrame = car.spikesFolded ? 7 : 4;
          if (!drawAtlasFrame(ctx, art['atlas-hazards'], 4, 5, spikeFrame, 8,
            sx - 10, sy - 10, sr.w + 20, sr.h + 20) && !car.spikesFolded) {
            ctx.fillStyle = '#d9dde8';
            for (var k = 0; k < sr.w; k += 11) {
              ctx.beginPath();
              ctx.moveTo(sx + k, sy + sr.h);
              ctx.lineTo(sx + k + 5.5, sy);
              ctx.lineTo(sx + k + 11, sy + sr.h);
              ctx.fill();
            }
          }
        }
        if (i > 0 && car.stream) {
          var lead = night.cars[i - 1];
          var liveGap = car.x - (lead.x + lead.w);
          if (liveGap >= -4 && liveGap <= 14) {
            drawAtlasStrip(ctx, art['atlas-vfx'], 0.50, 0.50, 0.29, 0.25,
              atlasLoop(t + i * 37, 5, 85), 5,
              cx - 18, CAR_SCREEN_Y + CAR_H - 36, 44, 36);
          }
        }
      }
      return true;
    }

    var scaleNow = 1;
    var scaleClock = 0;
    function playerScale(api) {
      var target = (nightActive() || night.phase === 'done') ? NT.playerScale : 1;
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var dtMs = scaleClock ? Math.min(100, now - scaleClock) : 0;
      scaleClock = now;
      var k = Math.min(1, dtMs / 220);
      scaleNow += (target - scaleNow) * k;
      if (Math.abs(scaleNow - target) < 0.01) scaleNow = target;
      return scaleNow;
    }

    function drawNightTag(ctx, api, time) {
      var camX = api.cameraX;
      if (!inView(NT.tag.x, NT.tag.w, camX)) return;
      var x = Math.round(NT.tag.x - camX);
      var y = NT.tag.y + OFFSET_Y;
      if (night.phase) {
        var revealAge = Math.max(0, time - night.startedAt);
        var revealFrame = Math.min(7, Math.floor(revealAge / 85));
        if (!drawAtlasFrame(ctx, art['atlas-night'], 1, 6, revealFrame, 8,
          x - 10, y - 8, NT.tag.w + 20, NT.tag.h + 16) &&
          ready(art['night-train-tag'])) ctx.drawImage(art['night-train-tag'], x, y, NT.tag.w, NT.tag.h);
        return;
      }
      if (drawAtlasFrame(ctx, art['atlas-night'], 0, 6, atlasLoop(time, 4, 420), 6,
        x - 10, y - 8, NT.tag.w + 20, NT.tag.h + 16)) return;
      ctx.save();
      ctx.globalAlpha = 0.1 + Math.max(0, Math.sin(time / 900)) * 0.08;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([3, 4]);
      ctx.strokeRect(x + 0.5, y + 0.5, NT.tag.w - 1, NT.tag.h - 1);
      ctx.restore();
    }

    function drawNight(ctx, api, t) {
      if (!night.phase) return;
      var camX = api.cameraX;
      var i;
      aDraw(ctx, api, t);
      // The perch: visible only once you are up there (camera follows).
      if ((night.phase === 'ride' || night.phase === 'perch') && !night.perchGone) {
        var pr = NT.perch;
        var prx = Math.round(pr.x - camX);
        var pry = pr.y + OFFSET_Y;
        var blink = night.phase === 'perch' && NT.perchMs - (t - night.perchAt) < 1500 && Math.floor(t / 90) % 2;
        if (!blink) {
          var perchFrame = night.phase === 'perch' ?
            Math.min(6, Math.floor((t - night.perchAt) / Math.max(1, NT.perchMs / 7))) : 0;
          if (!drawAtlasFrame(ctx, art['atlas-night'], 2, 6, perchFrame, 7,
            prx - 12, pry - 30, pr.w + 24, pr.h + 36)) {
            if (ready(art['moving-platform'])) ctx.drawImage(art['moving-platform'], prx, pry, pr.w, pr.h);
            else { ctx.fillStyle = '#2e8f9e'; ctx.fillRect(prx, pry, pr.w, pr.h); }
          }
        }
      }
    }

    function drawNightHud(ctx, api, t) {
      if (!nightActive() && night.phase !== 'done') return;
      var since = t - night.flashAt;
      if (since < 520) {
        var warpFrame = Math.min(7, Math.floor(since / 65));
        if (!drawAtlasFrame(ctx, art['atlas-night'], 3, 6, warpFrame, 8,
          VIEW_W / 2 - 150, VIEW_H / 2 - 72, 300, 144)) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - since / 520)).toFixed(3) + ')';
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }
      }
      if (night.phase === 'done') {
        var doneAge = Math.max(0, t - night.doneAt);
        var doneFrame = Math.min(7, Math.floor(doneAge / 140));
        drawAtlasFrame(ctx, art['atlas-night'], 5, 6, doneFrame, 8,
          VIEW_W / 2 - 170, VIEW_H / 2 - 82, 340, 164);
      }
      // Twinkle hint at the top edge above the hidden perch once the brakes bite.
      if (night.phase === 'ride' && night.camLocked) {
        var hx = NT.perch.x + NT.perch.w / 2 - api.cameraX;
        var tw = 2 + Math.abs(Math.sin(t / 120)) * 2.5;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(hx - tw), 4, Math.round(tw * 2), 1);
        ctx.fillRect(Math.round(hx), Math.round(4 - tw), 1, Math.round(tw * 2));
      }
      if (night.phase === 'done') return;
      ctx.save();
      ctx.font = 'bold 7px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2fd0';
      var label = night.phase === 'ride' ? (night.camLocked ? 'LEVEL 1A · JUMP!' : 'LEVEL 1A · NIGHT TRAIN') :
        'LEVEL 1A · CARRIAGES ' + night.hopCount + ' · GEMS ' + count(A.gems, 'taken') + '/' + A.gems.length;
      ctx.fillText(label, VIEW_W / 2, 64);
      if (night.phase === 'perch') {
        var left = Math.max(0, Math.ceil((NT.perchMs - (t - night.perchAt)) / 1000));
        ctx.font = 'bold 22px Courier New';
        ctx.fillStyle = '#000';
        ctx.fillText(String(left), VIEW_W / 2 + 1, 89);
        ctx.fillStyle = '#ffe45a';
        ctx.fillText(String(left), VIEW_W / 2, 88);
      }
      ctx.restore();
    }

    function solids() {
      if (nightActive()) {
        var nightOut = nightSolids().concat(aSolids(), movers);
        for (var n = 0; n < crumbles.length; n += 1) if (crumbles[n].state !== 'gone') nightOut.push(crumbles[n]);
        return nightOut;
      }
      var out = walls.concat(movers, pads);
      for (var i = 0; i < crumbles.length; i += 1) if (crumbles[i].state !== 'gone') out.push(crumbles[i]);
      return out;
    }

    function cameraTargetX(defaultX, api) {
      if ((night.phase === 'ride' && night.camLocked) || night.phase === 'perch') return NT.lockCamX;
      return defaultX;
    }

    function cameraTargetY(defaultTarget, api) {
      if (!skyMode) return defaultTarget;
      var p = api.player;
      return Math.max(defaultTarget, 175 - (p.y + p.h + OFFSET_Y));
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------
    function inView(x, w, camX) { return x + w >= camX - 40 && x <= camX + VIEW_W + 40; }

    function drawTiled(ctx, img, x, y, w, h, tile) {
      for (var tx = 0; tx < w; tx += tile) {
        var tw = Math.min(tile, w - tx);
        ctx.drawImage(img, 0, 0, img.naturalWidth * tw / tile, img.naturalHeight, x + tx, y, tw, h);
      }
    }

    function drawGround(ctx, api) {
      var camX = api.cameraX;
      var zoneSurfaceCells = [4, 1, 2, 5, 0, 1, 2, 3, 4];
      if (ready(art['ground-hazards'])) {
        for (var fs = 0; fs < floorSolids.length; fs += 1) {
          var solid = floorSolids[fs];
          if (!inView(solid.x, solid.w, camX)) continue;
          var zoneIndex = 0;
          for (var zi = zones.length - 1; zi >= 0; zi -= 1) {
            if (solid.x >= zones[zi].x) { zoneIndex = zi; break; }
          }
          var tileCell = zoneSurfaceCells[zoneIndex] || 0;
          var start = Math.max(solid.x, camX - 140);
          var end = Math.min(solid.x + solid.w, camX + VIEW_W + 140);
          for (var wx = Math.floor(start / 128) * 128; wx < end; wx += 128) {
            drawGridCell(ctx, art['ground-hazards'], tileCell,
              wx - camX, STREET_Y - 10, 132, 42);
          }
        }
      }
      for (var i = 0; i < gaps.length; i += 1) {
        var g = gaps[i];
        if (!inView(g[0], g[1], camX)) continue;
        var x = Math.round(g[0] - camX);
        var top = STREET_Y + 2;
        var grad = ctx.createLinearGradient(0, top, 0, top + 120);
        grad.addColorStop(0, '#050509');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.fillRect(x, top, g[1], VIEW_H - top + env.CAMERA_LOOK_DOWN_MAX_Y + 700);
        if (ready(art['ground-hazards'])) {
          drawGridCell(ctx, art['ground-hazards'], 8, x - 34, top - 24, 54, 62);
          drawGridCell(ctx, art['ground-hazards'], 9, x + g[1] - 20, top - 24, 54, 62, true);
        } else {
          for (var s = 0; s < 2; s += 1) {
            var ex = s === 0 ? x - 3 : x + g[1] - 1;
            ctx.fillStyle = '#ffd400';
            ctx.fillRect(ex, top - 2, 4, 26);
          }
        }
      }
    }

    function drawWorld(ctx, api, time) {
      var camX = api.cameraX;
      var t = api.runElapsedMs;
      var i;
      drawPhase2Props(ctx, api);
      // Warning signs.
      for (i = 0; i < signs.length; i += 1) {
        var sg = signs[i];
        if (!inView(sg.x, 32, camX)) continue;
        var simg = art[sg.kind === 'keepout' ? 'sign-keep-out' : 'sign-danger'];
        var sx = Math.round(sg.x - camX);
        var sy = sg.y + OFFSET_Y;
        ctx.fillStyle = '#5a5f6b';
        ctx.fillRect(sx + 14, sy + 18, 4, 14);
        if (ready(simg)) ctx.drawImage(simg, sx, sy - 6, 32, Math.round(32 * simg.naturalHeight / simg.naturalWidth));
        else { ctx.fillStyle = '#d62c2c'; ctx.fillRect(sx, sy, 32, 18); }
      }
      // Tag spots.
      for (i = 0; i < tags.length; i += 1) {
        var tg = tags[i];
        if (!inView(tg.x, tg.w, camX)) continue;
        var tx = Math.round(tg.x - camX);
        var ty = tg.y + OFFSET_Y;
        if (tg.done) {
          var piece = art['tag-' + tg.art];
          var pop = Math.min(1, (t - (tg.doneAt || 0)) / 260);
          if (ready(piece)) {
            var ratio = Math.min(tg.w / piece.naturalWidth, tg.h / piece.naturalHeight);
            var pw = piece.naturalWidth * ratio * (0.6 + 0.4 * pop);
            var ph = piece.naturalHeight * ratio * (0.6 + 0.4 * pop);
            ctx.drawImage(piece, tx + (tg.w - pw) / 2, ty + (tg.h - ph) / 2, pw, ph);
          } else {
            ctx.fillStyle = '#ff2fd0';
            ctx.fillRect(tx, ty, tg.w, tg.h);
          }
        } else if (ready(art['tag-spot'])) {
          ctx.globalAlpha = 0.75 + Math.sin(time / 260) * 0.2;
          ctx.drawImage(art['tag-spot'], tx, ty, tg.w, tg.h);
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(tx + 0.5, ty + 0.5, tg.w - 1, tg.h - 1);
        }
      }
      drawNightTag(ctx, api, time);
      // Wall blocks (lifted out of the world while the night train runs).
      var wimg = art['wall-block'];
      var structureAtlas = art['atlas-structures'];
      for (i = nightActive() ? walls.length : 0; i < walls.length; i += 1) {
        var w = walls[i];
        if (!inView(w.x, w.w, camX)) continue;
        var wx = Math.round(w.x - camX);
        var wy = w.y + OFFSET_Y;
        if (drawAtlasFrame(ctx, structureAtlas, 4, 5, Math.abs(Math.floor(w.x / 40)) % 6, 6,
          wx, wy, w.w, w.h)) {}
        else if (ready(wimg)) {
          for (var by = 0; by < w.h; by += 32) {
            var bh = Math.min(32, w.h - by);
            for (var bx = 0; bx < w.w; bx += 32) {
              var bw = Math.min(32, w.w - bx);
              ctx.drawImage(wimg, 0, 0, wimg.naturalWidth * bw / 32, wimg.naturalHeight * bh / 32,
                wx + bx, wy + by, bw, bh);
            }
          }
        } else {
          ctx.fillStyle = '#4a3a5c';
          ctx.fillRect(wx, wy, w.w, w.h);
        }
        if (w.crawl) {
          if (!drawGridCell(ctx, art['ground-hazards'], 15,
            wx, wy + w.h - 42, w.w, 68)) {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(wx, wy + w.h, w.w, 26);
          }
        }
      }
      // Moving platforms.
      var mimg = art['moving-platform'];
      for (i = 0; i < movers.length; i += 1) {
        var m = movers[i];
        if (!inView(m.x, m.w, camX)) continue;
        var mx = Math.round(m.x - camX);
        var my = Math.round(m.y + OFFSET_Y);
        if (drawAtlasFrame(ctx, structureAtlas, 3, 5, atlasLoop(t + m.bx, 6, 130), 6,
          mx, my - 14, m.w, m.h + 24)) {}
        else if (ready(mimg)) ctx.drawImage(mimg, mx, my, m.w, m.h);
        else { ctx.fillStyle = '#2e8f9e'; ctx.fillRect(mx, my, m.w, m.h); }
      }
      // Crumbling platforms.
      var cimg = art['crumble-platform'];
      for (i = 0; i < crumbles.length; i += 1) {
        var cr = crumbles[i];
        if (cr.state === 'gone' || !inView(cr.x, cr.w, camX)) continue;
        var shake = cr.state === 'shaking' ? Math.round(Math.sin(t / 18) * 2) : 0;
        var cx = Math.round(cr.x - camX) + shake;
        var cy = cr.y + OFFSET_Y;
        if (cr.state === 'gone') continue;
        var groundCrFrame = cr.state === 'shaking' ? Math.min(4, 1 + Math.floor((t - cr.at) / 90)) : 0;
        if (drawAtlasFrame(ctx, structureAtlas, 2, 5, groundCrFrame, 8,
          cx, cy - 12, cr.w, cr.h + 22)) {}
        else if (ready(cimg)) ctx.drawImage(cimg, cx, cy, cr.w, cr.h);
        else { ctx.fillStyle = '#a8743e'; ctx.fillRect(cx, cy, cr.w, cr.h); }
      }
      // Bounce pads.
      var pimg = art['bounce-pad'];
      for (i = 0; i < pads.length; i += 1) {
        var pd = pads[i];
        if (!inView(pd.x, pd.w, camX)) continue;
        var squash = t - (pd.lastBounceAt || -9999) < 160 ? 4 : 0;
        var px = Math.round(pd.x - camX);
        var py = pd.y + OFFSET_Y - 4 + squash;
        var groundPadAge = t - (pd.lastBounceAt || -9999);
        var groundPadFrame = groundPadAge < 360 ? Math.min(5, Math.floor(groundPadAge / 60)) : 0;
        if (drawAtlasFrame(ctx, structureAtlas, 1, 5, groundPadFrame, 6,
          px, py - 8, pd.w, 24 - squash)) {}
        else if (ready(pimg)) ctx.drawImage(pimg, px, py, pd.w, 12 - squash);
        else { ctx.fillStyle = '#ff2fd0'; ctx.fillRect(px, py, pd.w, 12 - squash); }
        if (groundPadAge >= 0 && groundPadAge < 420) {
          drawAtlasStrip(ctx, art['atlas-vfx'], 0, 0, 0.23, 0.25,
            Math.min(4, Math.floor(groundPadAge / 84)), 5,
            px - pd.w * 0.35, py - 18, pd.w * 1.7, 34);
        }
      }
      // Flame vent grates.
      var vimg = art['flame-vent'];
      for (i = 0; i < vents.length; i += 1) {
        var v = vents[i];
        if (!inView(v.x, 32, camX)) continue;
        var vx = Math.round(v.x - camX);
        var vy = v.baseY + OFFSET_Y - 8;
        var ventLocal = (t + v.phase) % v.period;
        var ventFrame = cycleOn(v, t) ? Math.min(6, 4 + Math.floor(ventLocal / 140) % 3) :
          cycleWarn(v, t) ? 3 : 0;
        if (drawAtlasFrame(ctx, art['atlas-hazards'], 2, 5, ventFrame, 8,
          vx - 5, vy - 16, 42, 28)) {}
        else if (ready(vimg)) ctx.drawImage(vimg, vx, vy, 32, 12);
        else { ctx.fillStyle = '#30262a'; ctx.fillRect(vx, vy, 32, 12); }
        if (cycleWarn(v, t) && Math.floor(t / 80) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,140,30,0.8)';
          ctx.fillRect(vx + 4, vy - 4, 24, 4);
        }
      }
      // Lasers (street-level; hidden while the night train owns the bridge view).
      var limg = art['laser-emitter'];
      for (i = nightActive() ? lasers.length : 0; i < lasers.length; i += 1) {
        var l = lasers[i];
        if (!inView(l.x, 32, camX)) continue;
        var lx = Math.round(l.x - camX);
        var ly0 = l.y0 + OFFSET_Y;
        var ly1 = l.y1 + OFFSET_Y;
        if (cycleOn(l, t)) {
          ctx.fillStyle = 'rgba(255,40,40,0.35)';
          ctx.fillRect(lx + 9, ly0, 14, ly1 - ly0);
          ctx.fillStyle = '#ff3b3b';
          ctx.fillRect(lx + 13, ly0, 6, ly1 - ly0);
          ctx.fillStyle = '#ffd0d0';
          ctx.fillRect(lx + 15, ly0, 2, ly1 - ly0);
        } else if (cycleWarn(l, t)) {
          ctx.fillStyle = Math.floor(t / 70) % 2 ? 'rgba(255,60,60,0.55)' : 'rgba(255,60,60,0.15)';
          ctx.fillRect(lx + 15, ly0, 2, ly1 - ly0);
        }
        var streetLaserFrame = cycleOn(l, t) ? 5 : cycleWarn(l, t) ? 3 : 0;
        if (drawAtlasFrame(ctx, art['atlas-hazards'], 1, 5, streetLaserFrame, 7,
          lx - 4, ly0 - 28, 40, 30)) {
        } else if (ready(limg)) {
          ctx.drawImage(limg, lx, ly0 - 20, 32, 20);
        } else {
          ctx.fillStyle = '#1d1f29';
          ctx.fillRect(lx, ly0 - 20, 32, 20);
        }
        ctx.fillStyle = '#1d1f29';
        ctx.fillRect(lx + 8, ly1 - 4, 16, 6);
      }
    }

    function drawPickup(ctx, img, x, y, size, time, fallback) {
      var bob = Math.sin((time + x * 7) / 200) * 2;
      if (ready(img)) ctx.drawImage(img, Math.round(x - size / 2), Math.round(y - size / 2 + bob), size, size);
      else {
        ctx.fillStyle = fallback;
        ctx.beginPath();
        ctx.arc(x, y + bob, size / 2, 0, TAU);
        ctx.fill();
      }
    }

    function drawObjects(ctx, api, t) {
      var camX = api.cameraX;
      var time = t;
      var i;
      for (i = 0; i < gems.length; i += 1) {
        var g = gems[i];
        if (g.taken || !inView(g.x, 20, camX)) continue;
        var sparkle = 1 + Math.sin(time / 150 + i) * 0.08;
        var gemSize = 20 * sparkle;
        if (!drawAtlasFrame(ctx, art['atlas-pickups'], gemAtlasRow(g.kind), 7,
          atlasLoop(time + i * 43, g.kind === 'diamond' ? 7 : 6, 120), g.kind === 'diamond' ? 8 : 7,
          g.x - camX - gemSize / 2, g.y + OFFSET_Y - gemSize / 2, gemSize, gemSize)) {
          drawPickup(ctx, art['gem-' + g.kind], g.x - camX, g.y + OFFSET_Y, gemSize, time, '#ff3060');
        }
      }
      for (i = 0; i < relics.length; i += 1) {
        var r = relics[i];
        if (r.taken || !inView(r.x, 30, camX)) continue;
        var rimg = art['relic-' + r.kind];
        var rx = r.x - camX;
        var ry = r.y + OFFSET_Y;
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(time / 240) * 0.15;
        ctx.fillStyle = '#ffe45a';
        ctx.beginPath();
        ctx.arc(rx, ry, 18, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (ready(rimg)) {
          var rh = 30;
          var rw = rh * rimg.naturalWidth / rimg.naturalHeight;
          ctx.drawImage(rimg, Math.round(rx - rw / 2), Math.round(ry - rh / 2 + Math.sin(time / 260) * 2), rw, rh);
        } else drawPickup(ctx, null, rx, ry, 24, time, '#ffffff');
      }
      for (i = 0; i < crystals.length; i += 1) {
        var cy = crystals[i];
        if (cy.taken || !inView(cy.x, 20, camX)) continue;
        if (!drawAtlasFrame(ctx, art['atlas-pickups'], 4, 7, atlasLoop(time + i * 31, 5, 125), 8,
          cy.x - camX - 12, cy.y + OFFSET_Y - 12, 24, 24)) {
          drawPickup(ctx, art['time-crystal'], cy.x - camX, cy.y + OFFSET_Y, 20, time, '#3cf2ff');
        }
      }
      // Course checkpoints (the engine only paints its primary checkpoint).
      var cpImg = api.images.checkpoint;
      for (i = 0; i < L.checkpoints.length; i += 1) {
        var cp = L.checkpoints[i];
        if (!inView(cp.x, cp.w, camX)) continue;
        var cpx = Math.round(cp.x - camX);
        var cpy = cp.y + OFFSET_Y;
        var cpFrame = cp.active ? 3 + atlasLoop(time + cp.x, 4, 160) : atlasLoop(time + cp.x, 2, 420);
        if (!drawAtlasFrame(ctx, art['atlas-pickups'], 5, 7, cpFrame, 7,
          cpx - 8, cpy - 4, cp.w + 16, cp.h + 8)) {
          if (cpImg) ctx.drawImage(cpImg, cpx, cpy, cp.w, cp.h);
          else { ctx.fillStyle = '#7cff82'; ctx.fillRect(cpx + 12, cpy, 6, cp.h); }
          if (cp.active) { ctx.fillStyle = '#7cff82'; ctx.fillRect(cpx + 12, cpy + 8, 10, 8); }
        }
      }
      // Flame jets (reuse the graffbot fire sheet, rotated upward).
      var fire = api.images.botFire;
      for (i = 0; i < vents.length; i += 1) {
        var v = vents[i];
        if (!cycleOn(v, t) || !inView(v.x, 32, camX)) continue;
        var local = (t + v.phase) % v.period;
        var vx = v.x - camX + 16;
        var vy = v.baseY + OFFSET_Y - 6;
        if (fire) {
          var fw = (fire.naturalWidth || fire.width) / 4;
          var fh = (fire.naturalHeight || fire.height) / 4;
          var frame = Math.min(15, Math.floor(local / 55)) % 16;
          if (local > 16 * 55) frame = 6 + Math.floor(local / 55) % 6;
          var size = v.h * 1.25;
          ctx.save();
          ctx.translate(Math.round(vx), Math.round(vy));
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(fire, frame % 4 * fw, Math.floor(frame / 4) * fh, fw, fh, -6, -size / 2, size, size);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,120,20,0.85)';
          ctx.fillRect(vx - 10, vy - v.h, 20, v.h);
        }
      }
      var respawnAge = t - respawnVfxAt;
      if (respawnAge >= 0 && respawnAge < 720) {
        var respawnSize = 74 + respawnAge / 18;
        var respawnX = api.player.x - camX + api.player.w / 2 - respawnSize / 2;
        var respawnY = api.player.y + OFFSET_Y + api.player.h - respawnSize;
        drawGridCell(ctx, art['ground-transitions'], 13,
          respawnX - 12, respawnY - 8, respawnSize + 24, respawnSize + 16, false,
          Math.max(0, 0.65 - respawnAge / 900));
        drawGridCell(ctx, art['ground-pickups'], 15,
          respawnX, respawnY, respawnSize, respawnSize, false, 1 - respawnAge / 720);
        drawGridCell(ctx, art['ground-transitions'], 14,
          respawnX - 6, respawnY - 6, respawnSize + 12, respawnSize + 12, false,
          1 - respawnAge / 720);
      }
      drawCourseVfx(ctx, api, t);
      drawNight(ctx, api, t);
      if (debugBoxes) drawDebugBoxes(ctx, api);
    }

    function drawDebugBoxes(ctx, api) {
      var camX = api.cameraX;
      ctx.save();
      ctx.lineWidth = 1;
      function box(r, color) {
        if (!inView(r.x, r.w, camX)) return;
        ctx.strokeStyle = color;
        ctx.strokeRect(Math.round(r.x - camX) + 0.5, Math.round(r.y + OFFSET_Y) + 0.5, r.w, r.h);
      }
      walls.forEach(function (w) { box(w, '#c48bff'); });
      L.platforms.forEach(function (p) { box(p, '#7cff82'); });
      movers.forEach(function (m) { box(m, '#3cf2ff'); });
      crumbles.forEach(function (c) { box(c, c.state === 'gone' ? '#553' : '#ffb347'); });
      pads.forEach(function (p) { box(p, '#ff2fd0'); });
      tags.forEach(function (t) { box(t, '#ffffff'); });
      box(api.player, '#ff3b3b');
      ctx.restore();
    }

    function drawHud(ctx, api, t) {
      var p = api.player;
      drawNightHud(ctx, api, t);
      var feetScreenY = p.y + p.h + OFFSET_Y + api.cameraY;
      // Off-screen marker when the runner is above the view.
      if (feetScreenY - 30 < 0) {
        var mx = Math.round(p.x + p.w / 2 - api.cameraX);
        var altitude = Math.max(0, Math.round(F - (p.y + p.h)));
        ctx.save();
        if (drawAtlasFrame(ctx, art['atlas-pickups'], 6, 7, atlasLoop(t, 5, 130), 6,
          mx - 14, 0, 28, 18)) {
          ctx.font = 'bold 7px Courier New';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000';
          ctx.fillText(altitude + 'px', mx + 1, 22);
          ctx.fillStyle = '#ffe45a';
          ctx.fillText(altitude + 'px', mx, 21);
          ctx.restore();
        } else {
        ctx.fillStyle = '#ffe45a';
        ctx.beginPath();
        ctx.moveTo(mx, 3);
        ctx.lineTo(mx - 6, 12);
        ctx.lineTo(mx + 6, 12);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 7px Courier New';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(altitude + 'px', mx + 1, 22);
        ctx.fillStyle = '#ffe45a';
        ctx.fillText(altitude + 'px', mx, 21);
        ctx.restore();
        }
      }
      // Collection panel (top-left).
      ctx.save();
      ctx.fillStyle = 'rgba(9,19,38,0.82)';
      ctx.fillRect(4, 14, 132, 21);
      ctx.strokeStyle = '#ff2fd0';
      ctx.strokeRect(4.5, 14.5, 131, 20);
      ctx.font = 'bold 6px Courier New';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff9be9';
      ctx.fillText(currentZone, 8, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('GEM ' + count(gems, 'taken') + '/' + gems.length +
        ' RELIC ' + count(relics, 'taken') + '/' + relics.length +
        ' TAG ' + count(tags, 'done') + '/' + tags.length, 8, 28);
      if (timeBonusMs > 0) {
        ctx.fillStyle = '#3cf2ff';
        ctx.textAlign = 'right';
        ctx.fillText('-' + (timeBonusMs / 1000).toFixed(0) + 's', 132, 20);
      }
      if (debug) {
        ctx.textAlign = 'left';
        ctx.fillStyle = debugGod ? '#7cff82' : '#ffe45a';
        ctx.fillText('x' + Math.round(p.x) + ' y' + Math.round(p.y) + (debugGod ? ' GOD' : '') +
          (skyMode ? ' SKY' : ''), 8, 41);
      }
      ctx.restore();
      drawPhase2Hud(ctx, api, t);
    }

    function count(list, key) {
      var n = 0;
      for (var i = 0; i < list.length; i += 1) if (list[i][key]) n += 1;
      return n;
    }

    function summary() {
      return {
        id: 'getting-up-gauntlet',
        gems: count(gems, 'taken') + '/' + gems.length,
        relics: count(relics, 'taken') + '/' + relics.length,
        tags: count(tags, 'done') + '/' + tags.length,
        crystals: count(crystals, 'taken') + '/' + crystals.length,
        trails: trailNames.filter(function (n) { return trails[n].done; }).length + '/' + trailNames.length,
        skyRoutes: Object.keys(foundSkyZones).length + '/' + skyZoneNames.length,
        nightTrain: night.result || (night.phase ? night.phase : 'not found'),
        nightTrainCarriages: night.hopCount,
        level1AGems: count(A.gems, 'taken') + '/' + A.gems.length,
        level1ACoins: count(A.coins, 'taken') + '/' + A.coins.length,
        timeBonusMs: timeBonusMs
      };
    }

    // 1 + 9 shortcut listener (pressed together or within 700ms, either order).
    if (typeof window !== 'undefined') {
      var comboDown = { one: -9999, nine: -9999 };
      window.addEventListener('keydown', function (e) {
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
        var now = Date.now();
        if (e.code === 'Digit1' || e.code === 'Numpad1') comboDown.one = now;
        else if (e.code === 'Digit9' || e.code === 'Numpad9') comboDown.nine = now;
        else return;
        if (Math.abs(comboDown.one - comboDown.nine) <= 700 && lastApi && lastApi.running && !lastApi.gameOver) {
          comboDown.one = comboDown.nine = -9999;
          perchShortcutPending = true;
        }
      });
    }

    // Debug teleport / god mode.
    if (debug && typeof window !== 'undefined') {
      window.addEventListener('keydown', function (e) {
        if (!lastApi) return;
        var p = lastApi.player;
        var m = /^Digit(\d)$/.exec(e.code);
        if (m && m[1] === '9') {
          p.x = NT.tag.x - 10;
          p.y = F - p.h;
          p.vx = 0;
          p.vy = 0;
          skyMode = false;
        } else if (m && zones[+m[1]]) {
          p.x = zones[+m[1]].x;
          p.y = F - p.h;
          p.vx = 0;
          p.vy = 0;
          skyMode = false;
        } else if (e.code === 'KeyG') {
          debugGod = !debugGod;
        } else if (e.code === 'KeyH') {
          debugBoxes = !debugBoxes;
        }
      });
    }

    return {
      id: 'getting-up-gauntlet',
      parMs: 240000,
      layout: L,
      floorSolids: function () { return floorSolids; },
      solids: solids,
      sideSolids: function () { return nightActive() ? A.walls : walls; },
      cameraTargetX: cameraTargetX,
      drawBridgeTrack: drawBridgeTrack,
      playerScale: playerScale,
      forceFinish: forceFinish,
      cameraTargetY: cameraTargetY,
      update: update,
      reset: reset,
      drawGround: drawGround,
      drawWorld: drawWorld,
      drawObjects: drawObjects,
      drawHud: drawHud,
      drawHazard: drawCourseHazard,
      drawCrate: drawCourseCrate,
      drawSpeedBox: drawCourseSpeedBox,
      drawRewardBox: drawCourseRewardBox,
      drawSecretCoin: drawCourseSecretCoin,
      drawCoin: drawCourseCoin,
      drawFinish: drawCourseFinish,
      drawEnemy: drawCourseEnemy,
      onRespawn: onCourseRespawn,
      summary: summary,
      timeBonusMs: function () { return timeBonusMs; },
      // Read-only access for tests / layout tooling.
      data: {
        gaps: gaps, walls: walls, movers: movers, crumbles: crumbles, pads: pads,
        lasers: lasers, vents: vents, gems: gems, relics: relics, tags: tags,
        crystals: crystals, signs: signs, zones: zones, trails: trails,
        skyZones: skyZoneNames, floorSolids: floorSolids, nightTrain: NT, level1A: A,
        night: function () { return night; }
      }
    };
  }

  window.NBGCourses = window.NBGCourses || {};
  window.NBGCourses['getting-up-gauntlet'] = createGauntlet;
}());
