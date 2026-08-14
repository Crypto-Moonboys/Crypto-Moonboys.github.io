(function () {
  'use strict';

  var canvas = document.getElementById('moonpet-style-canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  var palette = {
    black: '#020403',
    ink: '#11120d',
    outline: '#1a0d0d',
    skin: '#d9e1d1',
    shade: '#899080',
    hair: '#251314',
    hair2: '#39201f',
    jacket: '#1b2024',
    jacket2: '#2b3338',
    neon: '#73ff8b',
    cyan: '#64f6ff',
    hot: '#f5ff62',
    pink: '#ff73bb',
    wall: '#223526',
    wall2: '#17251b',
    mortar: '#4c7a55',
    sky: '#07100c',
    haze: '#13291d',
    road: '#080b09',
  };

  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(copy, x, y, color, align) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.font = 'bold 7px "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.fillText(copy, x, y);
    ctx.restore();
  }

  function drawSky(time) {
    px(0, 0, 320, 96, palette.sky);
    px(0, 62, 320, 34, palette.haze);
    for (var i = 0; i < 34; i += 1) {
      var x = (i * 37 + Math.floor(time / 1800) * (i % 3 + 1)) % 320;
      var y = 7 + (i * 23) % 72;
      px(x, y, i % 5 === 0 ? 2 : 1, 1, i % 4 ? palette.neon : palette.cyan);
    }
    px(263, 15, 29, 29, palette.hot);
    px(268, 10, 19, 39, palette.hot);
    px(258, 20, 39, 19, palette.hot);
    px(270, 22, 16, 16, palette.sky);
    px(276, 22, 4, 16, palette.cyan);
    px(280, 22, 9, 3, palette.cyan);
    px(280, 29, 8, 3, palette.cyan);
    px(280, 36, 9, 3, palette.cyan);
    px(288, 25, 3, 5, palette.cyan);
    px(288, 32, 3, 5, palette.cyan);
  }

  function drawSkyline(time) {
    var drift = Math.round(Math.sin(time / 2600) * 3);
    var heights = [29, 47, 35, 59, 42, 67, 38, 53, 33, 61, 44];
    for (var i = -1; i < heights.length; i += 1) {
      var h = heights[(i + heights.length) % heights.length];
      var x = i * 32 - drift;
      px(x, 103 - h, 28, h, '#08120e');
      px(x + 4, 109 - h, 20, 3, palette.mortar);
      for (var wy = 13; wy < h - 3; wy += 10) {
        px(x + 6, 103 - h + wy, 4, 4, i % 2 ? palette.neon : palette.cyan);
        if ((wy + i) % 3) px(x + 18, 103 - h + wy, 4, 4, palette.neon);
      }
    }
  }

  function drawGraffitiWall(time) {
    px(0, 96, 320, 72, palette.wall2);
    px(0, 96, 320, 5, palette.mortar);
    for (var row = 0; row < 6; row += 1) {
      var offset = row % 2 ? -16 : 0;
      for (var x = offset; x < 320; x += 32) {
        px(x, 103 + row * 11, 30, 2, palette.mortar);
        px(x + 29, 103 + row * 11, 2, 11, palette.mortar);
      }
    }
    px(11, 116, 68, 34, '#0c1510');
    px(16, 121, 58, 24, palette.wall);
    px(21, 127, 48, 4, palette.pink);
    px(19, 132, 7, 10, palette.cyan);
    px(30, 132, 33, 4, palette.hot);
    px(239, 113, 61, 42, '#0c1510');
    px(245, 119, 49, 30, palette.wall);
    px(250, 124, 38, 4, palette.cyan);
    px(254, 130, 28, 4, palette.hot);
    px(259, 136, 18, 7, palette.pink);
    text('MOONPET // ALL CITY', 160, 112, palette.neon, 'center');
    text('GK', 43, 143, palette.hot, 'center');
    text('RUN', 270, 145, palette.cyan, 'center');
  }

  function drawStreet(time) {
    px(0, 168, 320, 52, palette.road);
    px(0, 168, 320, 4, palette.mortar);
    px(0, 211, 320, 9, palette.black);
    var drift = Math.floor(time / 65) % 36;
    for (var x = -36; x < 360; x += 36) px(x - drift, 195, 17, 2, palette.mortar);
    px(5, 175, 8, 31, '#1a211d');
    px(12, 179, 4, 27, palette.neon);
    px(302, 174, 12, 33, '#1a211d');
    px(298, 182, 5, 24, palette.cyan);
  }

  function drawFineMascot(time) {
    var bob = Math.round(Math.sin(time / 420) * 2);
    var blink = Math.floor(time / 1700) % 6 === 0;
    var x = 160;
    var y = 153 + bob;

    ctx.save();
    ctx.translate(x, y);

    px(-42, -45, 84, 62, 'rgba(0,0,0,.22)');

    px(-32, 6, 64, 10, palette.outline);
    px(-27, 12, 19, 10, palette.outline);
    px(8, 12, 19, 10, palette.outline);
    px(-23, 13, 13, 5, palette.skin);
    px(10, 13, 13, 5, palette.skin);

    px(-37, -39, 74, 52, palette.outline);
    px(-31, -33, 62, 39, palette.jacket);
    px(-24, -27, 48, 9, palette.cyan);
    px(-24, -14, 48, 7, palette.pink);
    px(-6, -33, 12, 39, palette.hot);
    px(-25, -3, 15, 10, palette.jacket2);
    px(10, -3, 15, 10, palette.jacket2);
    px(-4, -7, 8, 13, palette.skin);

    px(-52, -33, 18, 31, palette.outline);
    px(34, -33, 18, 31, palette.outline);
    px(-48, -28, 11, 21, palette.jacket2);
    px(37, -28, 11, 21, palette.jacket2);
    px(-56, -8, 16, 10, palette.skin);
    px(40, -8, 16, 10, palette.skin);

    px(-48, -83, 96, 48, palette.outline);
    px(-42, -77, 84, 37, palette.skin);
    px(-48, -88, 14, 11, palette.hair);
    px(-39, -96, 16, 19, palette.hair);
    px(-26, -101, 14, 22, palette.hair2);
    px(-13, -95, 15, 17, palette.hair);
    px(0, -101, 15, 22, palette.hair2);
    px(14, -95, 14, 17, palette.hair);
    px(26, -90, 13, 14, palette.hair2);
    px(36, -82, 12, 18, palette.hair);
    px(-45, -72, 11, 15, palette.hair);
    px(34, -72, 11, 15, palette.hair);

    if (blink) {
      px(-24, -61, 12, 3, palette.outline);
      px(12, -61, 12, 3, palette.outline);
    } else {
      px(-25, -66, 13, 13, palette.outline);
      px(12, -66, 13, 13, palette.outline);
      px(-21, -62, 4, 4, palette.cyan);
      px(16, -62, 4, 4, palette.cyan);
    }
    px(-5, -54, 10, 5, palette.shade);
    px(-11, -44, 22, 4, palette.outline);
    px(-5, -40, 10, 3, palette.outline);

    px(-39, -78, 17, 4, palette.neon);
    px(21, -78, 17, 4, palette.pink);
    px(-46, -51, 7, 7, palette.hot);
    px(39, -51, 7, 7, palette.cyan);

    ctx.restore();
  }

  function drawHud() {
    px(7, 7, 82, 19, palette.black);
    px(92, 7, 92, 19, palette.black);
    px(187, 7, 126, 19, palette.black);
    px(7, 7, 82, 2, palette.neon);
    px(92, 7, 92, 2, palette.hot);
    px(187, 7, 126, 2, palette.cyan);
    text('LVL 60', 15, 21, palette.hot, 'left');
    text('GOLD 1,032', 100, 21, palette.hot, 'left');
    text('STYLE: PIXEL', 195, 21, palette.cyan, 'left');
    px(69, 47, 182, 27, palette.black);
    px(69, 47, 4, 27, palette.neon);
    text('MOONPET THINKS //', 81, 59, palette.neon, 'left');
    text('LESS TERMINAL. MORE GAME.', 81, 70, palette.hot, 'left');
  }

  function draw(time) {
    ctx.clearRect(0, 0, 320, 220);
    drawSky(time);
    drawSkyline(time);
    drawGraffitiWall(time);
    drawStreet(time);
    drawFineMascot(time);
    drawHud();
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}());
