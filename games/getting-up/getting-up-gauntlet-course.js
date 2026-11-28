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
    ['ruby', 'emerald', 'sapphire', 'diamond'].forEach(function (k) { loadArt('gem-' + k, TEMP + 'gem-' + k + '.svg'); });
    ['time-crystal', 'bounce-pad', 'laser-emitter', 'wall-block', 'crumble-platform',
      'moving-platform', 'flame-vent', 'tag-spot', 'night-train-tag'].forEach(function (k) { loadArt(k, TEMP + k + '.svg'); });
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
      resetNight();
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
          var bonus = tr.coins.length * TRAIL_BONUS_PER_COIN;
          api.addXp(bonus, { trail: trailNames[ti] });
          api.notify('TRAIL CLEAR +' + bonus, 1800);
        }
      }

      for (var z = zones.length - 1; z >= 0; z -= 1) {
        if (p.x >= zones[z].x) { currentZone = zones[z].name; break; }
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
      lockCamX: 20200,        // camera stops here during the ride
      perch: { x: 20255, y: RAIL_Y - 310, w: 72, h: 16, kind: 'nt-perch' },
      playerScale: 0.55,      // the runner is "out on the bridge", so drawn smaller
      rideSpeed: 3.2,         // px per 60fps frame, toward the start
      brakeSpeed: 2.0,
      departSpeed: 4.5,
      streamSpeed: 2.0,
      perchMs: 5000,
      rideCars: 4,
      xpBonus: 50000,
      xpPerCar: 1000,
      timeCutMs: 10000
    };
    var TRAIN_ART = ['trainNbg', 'trainWaxcash', 'trainAlcor', 'trainSwaxp', 'trainPxjking',
      'trainWpixal', 'trainWuf', 'trainGetsulaid', 'trainTrustme', 'trainHodlwars',
      'trainPunk', 'trainKek', 'trainCronx', 'trainWaxgod'];
    // Stream pattern: [carriage width, gap after it, roof spikes].
    // Carriages match the scenery convoy cars so every roof sits on the bridge line.
    var STREAM = [
      [CAR_W, 60, false], [CAR_W, 90, false], [CAR_W, 70, true], [CAR_W, 140, false],
      [CAR_W, 50, false], [CAR_W, 200, false], [CAR_W, 110, true], [CAR_W, 80, false],
      [CAR_W, 230, false], [CAR_W, 60, true], [CAR_W, 170, false], [CAR_W, 90, false],
      [CAR_W, 250, false], [CAR_W, 120, true], [CAR_W, 70, false], [CAR_W, 190, false]
    ];
    var night = null;
    function resetNight() {
      night = { phase: '', cars: [], speed: 0, camLocked: false, startedAt: 0, perchAt: 0,
        perchGone: false, carSeq: 0, pattern: 0, hops: {}, hopCount: 0, result: '', flashAt: -99999 };
    }
    resetNight();
    function nightActive() { return night.phase === 'ride' || night.phase === 'perch' || night.phase === 'stream'; }

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
      var x = p.x - 40;
      for (var i = 0; i < NT.rideCars; i += 1) {
        night.cars.push(makeCar(x, CAR_W, false));
        x += CAR_W + CAR_GAP;
      }
      p.y = NT.railY - p.h;
      p.vx = 0;
      p.vy = 0;
      skyMode = false;
      api.notify('ALL ABOARD THE NIGHT TRAIN', 2600);
      api.cue('speed_boost_start');
    }

    function streamTailX() {
      var last = null;
      for (var i = 0; i < night.cars.length; i += 1) {
        if (night.cars[i].stream && (!last || night.cars[i].x > last.x)) last = night.cars[i];
      }
      return last ? last.x + last.w + last.gapAfter : null;
    }

    function spawnStream(api) {
      var limit = api.cameraX + VIEW_W + 420;
      var tail = streamTailX();
      if (tail === null) {
        // First stream carriage arrives centred under the perch as it vanishes.
        // + ~34 frames for the drop from the perch to the carriage roof.
        var frames = NT.perchMs / (1000 / 60) + Math.sqrt(2 * (NT.railY - NT.perch.y) / 0.52);
        var w0 = STREAM[0][0];
        var first = makeCar(NT.perch.x + NT.perch.w / 2 - w0 / 2 + NT.streamSpeed * frames, w0, false);
        first.stream = true;
        first.gapAfter = STREAM[0][1];
        night.cars.push(first);
        night.pattern = 1;
        tail = streamTailX();
      }
      while (tail < limit) {
        var pat = STREAM[night.pattern % STREAM.length];
        night.pattern += 1;
        var car = makeCar(tail, pat[0], pat[2]);
        car.stream = true;
        car.gapAfter = pat[1];
        night.cars.push(car);
        tail = car.x + car.w + car.gapAfter;
      }
    }

    function spikeRect(car) { return { x: car.x + car.w / 2 - 22, y: NT.railY - 14, w: 44, h: 14 }; }

    function failNight(api, reason) {
      night.result = 'failed';
      night.phase = 'failed';
      api.kill(reason);
    }

    function updateNight(t, dt, api) {
      var p = api.player;
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
        } else {
          failNight(api, 'night-train-fall');
          return;
        }
      }
      if (p.y + p.h > F + 2) { failNight(api, 'night-train-fall'); return; }
      if (night.phase === 'ride' && night.camLocked && p.x + p.w < NT.lockCamX) {
        failNight(api, 'night-train-off-screen');
        return;
      }
      if (night.phase === 'stream' && p.invuln <= 0) {
        for (var s = 0; s < night.cars.length; s += 1) {
          if (night.cars[s].spikes && api.rectsOverlap(p, spikeRect(night.cars[s]))) {
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
        if (ready(art['night-train-tag'])) ctx.drawImage(art['night-train-tag'], x, y, NT.tag.w, NT.tag.h);
        return;
      }
      // Barely-there ghost outline: the secret.
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
      // The perch: visible only once you are up there (camera follows).
      if ((night.phase === 'ride' || night.phase === 'perch') && !night.perchGone) {
        var pr = NT.perch;
        var prx = Math.round(pr.x - camX);
        var pry = pr.y + OFFSET_Y;
        var blink = night.phase === 'perch' && NT.perchMs - (t - night.perchAt) < 1500 && Math.floor(t / 90) % 2;
        if (!blink) {
          if (ready(art['moving-platform'])) ctx.drawImage(art['moving-platform'], prx, pry, pr.w, pr.h);
          else { ctx.fillStyle = '#2e8f9e'; ctx.fillRect(prx, pry, pr.w, pr.h); }
        }
      }
    }

    function drawNightHud(ctx, api, t) {
      if (!nightActive()) return;
      // The flash on boarding.
      var since = t - night.flashAt;
      if (since < 350) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - since / 350)).toFixed(3) + ')';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      // Twinkle hint at the top edge above the hidden perch once the brakes bite.
      if (night.phase === 'ride' && night.camLocked) {
        var hx = NT.perch.x + NT.perch.w / 2 - api.cameraX;
        var tw = 2 + Math.abs(Math.sin(t / 120)) * 2.5;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(hx - tw), 4, Math.round(tw * 2), 1);
        ctx.fillRect(Math.round(hx), Math.round(4 - tw), 1, Math.round(tw * 2));
      }
      ctx.save();
      ctx.font = 'bold 7px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2fd0';
      var label = night.phase === 'ride' ? (night.camLocked ? 'NIGHT TRAIN · JUMP!' : 'NIGHT TRAIN') :
        'NIGHT TRAIN · CARRIAGES ' + night.hopCount;
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
        var nightOut = nightSolids().concat(movers);
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
        // Hazard-striped kerb edges.
        for (var s = 0; s < 2; s += 1) {
          var ex = s === 0 ? x - 3 : x + g[1] - 1;
          ctx.fillStyle = '#ffd400';
          ctx.fillRect(ex, top - 2, 4, 26);
          ctx.fillStyle = '#111111';
          for (var yy = top; yy < top + 24; yy += 8) ctx.fillRect(ex, yy, 4, 4);
        }
      }
    }

    function drawWorld(ctx, api, time) {
      var camX = api.cameraX;
      var t = api.runElapsedMs;
      var i;
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
      for (i = nightActive() ? walls.length : 0; i < walls.length; i += 1) {
        var w = walls[i];
        if (!inView(w.x, w.w, camX)) continue;
        var wx = Math.round(w.x - camX);
        var wy = w.y + OFFSET_Y;
        if (ready(wimg)) {
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
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(wx, wy + w.h, w.w, 26);
        }
      }
      // Moving platforms.
      var mimg = art['moving-platform'];
      for (i = 0; i < movers.length; i += 1) {
        var m = movers[i];
        if (!inView(m.x, m.w, camX)) continue;
        var mx = Math.round(m.x - camX);
        var my = Math.round(m.y + OFFSET_Y);
        if (ready(mimg)) ctx.drawImage(mimg, mx, my, m.w, m.h);
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
        if (ready(cimg)) ctx.drawImage(cimg, cx, cy, cr.w, cr.h);
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
        if (ready(pimg)) ctx.drawImage(pimg, px, py, pd.w, 12 - squash);
        else { ctx.fillStyle = '#ff2fd0'; ctx.fillRect(px, py, pd.w, 12 - squash); }
      }
      // Flame vent grates.
      var vimg = art['flame-vent'];
      for (i = 0; i < vents.length; i += 1) {
        var v = vents[i];
        if (!inView(v.x, 32, camX)) continue;
        var vx = Math.round(v.x - camX);
        var vy = v.baseY + OFFSET_Y - 8;
        if (ready(vimg)) ctx.drawImage(vimg, vx, vy, 32, 12);
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
        if (ready(limg)) {
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
        drawPickup(ctx, art['gem-' + g.kind], g.x - camX, g.y + OFFSET_Y, 20 * sparkle, time, '#ff3060');
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
        drawPickup(ctx, art['time-crystal'], cy.x - camX, cy.y + OFFSET_Y, 20, time, '#3cf2ff');
      }
      // Course checkpoints (the engine only paints its primary checkpoint).
      var cpImg = api.images.checkpoint;
      for (i = 0; i < L.checkpoints.length; i += 1) {
        var cp = L.checkpoints[i];
        if (!inView(cp.x, cp.w, camX)) continue;
        var cpx = Math.round(cp.x - camX);
        var cpy = cp.y + OFFSET_Y;
        if (cpImg) ctx.drawImage(cpImg, cpx, cpy, cp.w, cp.h);
        else { ctx.fillStyle = '#7cff82'; ctx.fillRect(cpx + 12, cpy, 6, cp.h); }
        if (cp.active) { ctx.fillStyle = '#7cff82'; ctx.fillRect(cpx + 12, cpy + 8, 10, 8); }
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
        timeBonusMs: timeBonusMs
      };
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
      sideSolids: function () { return nightActive() ? [] : walls; },
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
      summary: summary,
      timeBonusMs: function () { return timeBonusMs; },
      // Read-only access for tests / layout tooling.
      data: {
        gaps: gaps, walls: walls, movers: movers, crumbles: crumbles, pads: pads,
        lasers: lasers, vents: vents, gems: gems, relics: relics, tags: tags,
        crystals: crystals, signs: signs, zones: zones, trails: trails,
        skyZones: skyZoneNames, floorSolids: floorSolids, nightTrain: NT,
        night: function () { return night; }
      }
    };
  }

  window.NBGCourses = window.NBGCourses || {};
  window.NBGCourses['getting-up-gauntlet'] = createGauntlet;
}());
