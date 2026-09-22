(function () {
  'use strict';

  var REVISION = '20260922-moonbot-art-v1';
  var HOLD_MS = 4200;
  var mode = 'idle';
  var modeUntil = 0;
  var overlay;
  var ctx;
  var baseCanvas;
  var lastText = '';
  var lastFrame = 0;
  var reduce = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var COPY = {
    idle: ['NEON BYTE', 'MOONBOT // GRAFF PET', '#ff24a9'],
    feed: ['EAT MODE', 'ENERGY + HUNGER CARE', '#ffd73d'],
    play: ['PLAY MODE', 'HAPPINESS // STREET ENERGY', '#27ddff'],
    clean: ['CLEAN MODE', 'BUBBLES // FRESH VISOR', '#a8ffff'],
    sleep: ['SLEEP MODE', 'REST CYCLE // BATTERY SAVE', '#a45cff'],
    train: ['TRAIN MODE', 'SPRAY CAN // POWER BUILD', '#ff24a9']
  };

  function actionFromText(value) {
    var text = String(value || '').toUpperCase();
    if (/\b(FEED|EAT|FOOD|HUNGER|SNACK|BOWL)\b/.test(text)) return 'feed';
    if (/\b(PLAY|TOY|BALL|HAPPY|HOVERBOARD)\b/.test(text)) return 'play';
    if (/\b(CLEAN|WASH|SOAP|BUBBLE|BATH)\b/.test(text)) return 'clean';
    if (/\b(SLEEP|REST|NAP|BED|ENERGY)\b/.test(text)) return 'sleep';
    if (/\b(TRAIN|BATTLE|ARENA|KAIJU|BOSS|FIGHT|WORK|JOB|RUN|EXPLORE|MISSION|EQUIP|GEAR)\b/.test(text)) return 'train';
    return '';
  }

  function setMode(nextMode) {
    if (!COPY[nextMode]) return;
    mode = nextMode;
    modeUntil = Date.now() + (nextMode === 'sleep' ? 7200 : HOLD_MS);
  }

  function currentMode() {
    return Date.now() < modeUntil ? mode : 'idle';
  }

  function round(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function box(c, x, y, w, h, r, fill, stroke, line) {
    round(c, x, y, w, h, r || 0);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.lineWidth = line || 2;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  function ensureOverlay() {
    if (overlay && ctx && baseCanvas) return true;
    baseCanvas = document.getElementById('moonpet-canvas');
    if (!baseCanvas || !baseCanvas.parentElement) return false;
    var viewport = baseCanvas.parentElement;
    viewport.style.position = viewport.style.position || 'relative';
    baseCanvas.style.position = 'relative';
    baseCanvas.style.zIndex = '0';
    overlay = document.createElement('canvas');
    overlay.id = 'moonpet-art-v2-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.width = baseCanvas.width || 640;
    overlay.height = baseCanvas.height || 440;
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;image-rendering:auto';
    viewport.appendChild(overlay);
    var hud = document.getElementById('hud');
    var boot = document.getElementById('boot-layer');
    if (hud) { hud.style.position = hud.style.position || 'absolute'; hud.style.zIndex = '3'; }
    if (boot) { boot.style.position = boot.style.position || 'absolute'; boot.style.zIndex = '4'; }
    ctx = overlay.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = true;
    return true;
  }

  function syncSize() {
    if (!overlay || !baseCanvas) return;
    if (overlay.width !== baseCanvas.width || overlay.height !== baseCanvas.height) {
      overlay.width = baseCanvas.width || 640;
      overlay.height = baseCanvas.height || 440;
      ctx = overlay.getContext('2d', { alpha: true });
    }
    ctx.imageSmoothingEnabled = true;
  }

  function watchUiText() {
    var out = document.getElementById('terminal-output');
    var text = out ? String(out.textContent || '') : '';
    if (text && text !== lastText) {
      lastText = text;
      setMode(actionFromText(text));
    }
  }

  function drawRooftop(c, w, h, t, m) {
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05051b');
    g.addColorStop(0.45, '#11105c');
    g.addColorStop(0.72, '#090829');
    g.addColorStop(1, '#02030a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    for (var s = 0; s < 70; s += 1) {
      var sx = (s * 97 + (reduce ? 0 : Math.floor(t / 90) * (s % 3))) % w;
      var sy = (s * 43) % (h * 0.45);
      c.fillStyle = s % 4 ? 'rgba(157,200,255,.65)' : 'rgba(255,36,169,.75)';
      c.fillRect(sx, sy, s % 7 ? 2 : 3, s % 7 ? 2 : 3);
    }
    c.save();
    c.shadowColor = '#9d6fff';
    c.shadowBlur = 25;
    c.fillStyle = '#916cff';
    c.beginPath();
    c.arc(w * 0.58, h * 0.16, 36, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(w * 0.6, h * 0.135, 33, 0, Math.PI * 2);
    c.fill();
    c.restore();

    for (var i = -1; i < 17; i += 1) {
      var bw = 38 + i % 4 * 16;
      var bh = 80 + (i * 29 % 88);
      var x = i * 47 - ((reduce ? 0 : t / 140) % 47);
      var y = h * 0.52 - bh;
      c.fillStyle = i % 2 ? '#070923' : '#0c0a2b';
      c.fillRect(x, y, bw, bh);
      for (var wy = y + 20; wy < h * 0.52 - 8; wy += 18) {
        c.fillStyle = (wy + i) % 3 ? 'rgba(39,221,255,.7)' : 'rgba(255,36,169,.7)';
        c.fillRect(x + 8, wy, 5, 8);
        if (i % 2) c.fillRect(x + bw - 14, wy + 3, 5, 8);
      }
    }

    c.fillStyle = '#080716';
    c.fillRect(0, h * 0.52, w, h * 0.48);
    var f = c.createLinearGradient(0, h * 0.52, 0, h);
    f.addColorStop(0, 'rgba(41,20,95,.66)');
    f.addColorStop(.55, 'rgba(4,8,24,.58)');
    f.addColorStop(1, 'rgba(0,0,0,.92)');
    c.fillStyle = f;
    c.fillRect(0, h * 0.52, w, h * 0.48);
    c.strokeStyle = 'rgba(130,70,255,.38)';
    c.lineWidth = 2;
    for (var gx = -40; gx < w + 80; gx += 80) {
      c.beginPath();
      c.moveTo(gx, h);
      c.lineTo(w * .5 + (gx - w * .5) * .22, h * .54);
      c.stroke();
    }
    c.strokeStyle = 'rgba(39,221,255,.5)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, h * .53);
    c.lineTo(w, h * .53);
    c.stroke();
    c.strokeStyle = 'rgba(255,36,169,.48)';
    c.beginPath();
    c.moveTo(0, h * .56);
    c.lineTo(w, h * .56);
    c.stroke();
    c.save();
    c.font = '900 44px Courier New, monospace';
    c.textAlign = 'center';
    c.globalAlpha = .24;
    c.translate(w * .5, h * .78);
    c.rotate(-.08);
    c.strokeStyle = '#b923ff';
    c.lineWidth = 3;
    c.strokeText('MB', 0, 0);
    c.restore();
    if (m === 'sleep') {
      c.fillStyle = 'rgba(5,2,20,.34)';
      c.fillRect(0, 0, w, h);
    }
  }

  function eye(c, x, y, m) {
    c.save();
    c.translate(x, y);
    c.lineCap = 'round';
    c.strokeStyle = '#ff24a9';
    c.lineWidth = 7;
    c.shadowColor = '#ff24a9';
    c.shadowBlur = 16;
    c.beginPath();
    if (m === 'train') {
      c.moveTo(-24, -3);
      c.lineTo(17, 8);
    } else {
      c.arc(0, m === 'sleep' ? 6 : 8, m === 'sleep' ? 23 : 26, Math.PI * 1.12, Math.PI * 1.88);
    }
    c.stroke();
    c.restore();
  }

  function splashes(c) {
    c.fillStyle = '#ff24a9';
    c.beginPath();
    c.arc(-42, -14, 8, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-57, -24, 12, 21);
    c.fillRect(-36, -29, 9, 11);
    c.fillStyle = '#27ddff';
    c.beginPath();
    c.arc(43, -5, 8, 0, Math.PI * 2);
    c.fill();
    c.fillRect(48, -21, 15, 22);
    c.fillRect(31, -27, 10, 11);
  }

  function drawActionProps(c, m, t) {
    if (m === 'feed') {
      box(c, -174, 60, 77, 29, 14, '#ffd73d', '#ff24a9', 4);
      c.fillStyle = '#ff24a9';
      c.beginPath();
      c.ellipse(-136, 59, 36, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      for (var i = 0; i < 4; i += 1) {
        c.beginPath();
        c.arc(-160 + i * 17, 39 - Math.sin(t / 180 + i) * 5, 5, 0, Math.PI * 2);
        c.fill();
      }
    } else if (m === 'play') {
      c.strokeStyle = '#27ddff';
      c.lineWidth = 5;
      c.shadowColor = '#27ddff';
      c.shadowBlur = 13;
      c.beginPath();
      c.arc(-160 + Math.sin(t / 220) * 12, -83 + Math.cos(t / 180) * 9, 28, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = '#ff24a9';
      c.beginPath();
      c.arc(-160 + Math.sin(t / 220) * 12, -83 + Math.cos(t / 180) * 9, 15, .1 * Math.PI, 1.8 * Math.PI);
      c.stroke();
      c.shadowBlur = 0;
    } else if (m === 'clean') {
      c.strokeStyle = 'rgba(185,255,255,.9)';
      c.lineWidth = 3;
      for (var b = 0; b < 14; b += 1) {
        var a = t / 530 + b * .65;
        var r = 116 + b % 5 * 15;
        c.beginPath();
        c.arc(Math.cos(a) * r, -38 + Math.sin(a) * 63, 6 + b % 4, 0, Math.PI * 2);
        c.stroke();
      }
    } else if (m === 'sleep') {
      c.font = '900 32px Courier New, monospace';
      c.fillStyle = '#fff';
      c.fillText('Z', -158, -107);
      c.fillStyle = '#27ddff';
      c.fillText('Z', -113, -136);
      c.fillStyle = '#ff24a9';
      c.fillText('Z', -74, -159);
      box(c, -117, 70, 234, 58, 20, 'rgba(28,20,78,.86)', '#a45cff', 5);
      c.fillStyle = '#ff24a9';
      c.fillRect(-96, 86, 192, 12);
    } else if (m === 'train') {
      c.strokeStyle = '#ff24a9';
      c.lineWidth = 7;
      c.shadowColor = '#ff24a9';
      c.shadowBlur = 14;
      for (var sl = 0; sl < 4; sl += 1) {
        c.beginPath();
        c.moveTo(-215 + sl * 25, -126 + sl * 32);
        c.lineTo(-135 + sl * 18, -86 + sl * 32);
        c.stroke();
      }
      c.strokeStyle = '#ffd73d';
      c.beginPath();
      c.moveTo(143, -126);
      c.lineTo(229, -177);
      c.stroke();
      c.shadowBlur = 0;
    }
  }

  function drawBot(c, w, h, m, t) {
    var size = Math.min(w * .55, h * .7, 330);
    var jump = reduce ? 0 : Math.sin(t / 210) * (m === 'play' ? 9 : m === 'train' ? 5 : 2);
    if (m === 'sleep') jump = 7;
    c.save();
    c.translate(w / 2, h * .56 + jump);
    c.scale(size / 310, size / 310);
    c.fillStyle = 'rgba(0,0,0,.46)';
    c.beginPath();
    c.ellipse(0, 140, 142, 27, 0, 0, Math.PI * 2);
    c.fill();
    drawActionProps(c, m, t);

    box(c, -47, 52, 35, 71, 10, '#080811', '#05050c', 4);
    box(c, 12, 52, 35, 71, 10, '#080811', '#05050c', 4);
    box(c, -75, 112, 70, 31, 14, '#fff', '#05050c', 5);
    box(c, 5, 112, 70, 31, 14, '#fff', '#05050c', 5);
    c.fillStyle = '#ff24a9';
    c.fillRect(-65, 121, 45, 11);
    c.fillRect(16, 121, 45, 11);
    c.fillStyle = '#27ddff';
    c.fillRect(-54, 134, 22, 5);
    c.fillRect(28, 134, 22, 5);

    var arm = m === 'train' ? -22 : m === 'play' ? -14 : m === 'feed' ? 12 : 0;
    box(c, -95, -6 + arm, 35, 81, 16, '#f8f7f0', '#05050c', 5);
    box(c, 60, -6 - arm * .3, 35, 81, 16, '#f8f7f0', '#05050c', 5);
    box(c, -103, 55 + arm, 32, 29, 13, '#070713', '#05050c', 4);
    box(c, 70, 55 - arm * .3, 32, 29, 13, '#070713', '#05050c', 4);

    box(c, -66, -16, 132, 88, 18, '#141421', '#05050c', 5);
    c.fillStyle = '#fff';
    c.fillRect(-67, -13, 27, 82);
    c.fillRect(40, -13, 27, 82);
    c.fillStyle = '#ff24a9';
    c.fillRect(-51, 64, 102, 7);
    c.fillRect(-10, -15, 9, 86);
    c.fillStyle = '#05050c';
    c.fillRect(-25, -4, 50, 75);
    splashes(c);
    box(c, -70, 66, 20, 45, 5, '#dedede', '#05050c', 3);
    box(c, -47, 66, 20, 45, 5, '#dedede', '#05050c', 3);
    c.fillStyle = '#27ddff';
    c.fillRect(-66, 75, 12, 24);
    c.fillStyle = '#ff24a9';
    c.fillRect(-43, 75, 12, 24);

    c.save();
    c.translate(85, 62 - arm * .3);
    c.rotate(-.35);
    box(c, -9, -34, 23, 55, 8, '#ff24a9', '#05050c', 4);
    c.fillStyle = '#e8e8e8';
    c.fillRect(-5, -43, 15, 11);
    if (m === 'train') {
      c.strokeStyle = '#ff24a9';
      c.lineWidth = 5;
      c.shadowColor = '#ff24a9';
      c.shadowBlur = 18;
      c.beginPath();
      c.moveTo(12, -41);
      c.lineTo(68, -72);
      c.stroke();
    }
    c.restore();

    box(c, -29, -42, 58, 38, 16, '#070713', '#05050c', 4);
    c.save();
    c.shadowColor = m === 'clean' ? '#27ddff' : '#ff24a9';
    c.shadowBlur = m === 'sleep' ? 7 : 20;
    box(c, -119, -115, 238, 99, 36, '#ff24a9', '#05050c', 6);
    c.restore();
    var visor = c.createLinearGradient(-90, -96, 92, -33);
    visor.addColorStop(0, '#1a1731');
    visor.addColorStop(.45, '#06060e');
    visor.addColorStop(1, '#16071d');
    box(c, -105, -103, 210, 77, 30, '#05050f', '#25163b', 4);
    box(c, -100, -98, 200, 67, 27, visor, 'rgba(255,36,169,.45)', 2);
    c.fillStyle = 'rgba(255,255,255,.42)';
    c.fillRect(-82, -94, 35, 7);
    c.fillRect(-90, -86, 22, 6);
    eye(c, -46, -77, m);
    eye(c, 46, -77, m);
    c.fillStyle = '#ff24a9';
    c.shadowColor = '#ff24a9';
    c.shadowBlur = 9;
    c.fillRect(-45, -51, 8, 4);
    c.fillRect(-34, -51, 8, 4);
    c.fillRect(27, -51, 8, 4);
    c.fillRect(38, -51, 8, 4);
    c.shadowBlur = 0;

    c.save();
    c.lineWidth = 7;
    c.strokeStyle = '#fff';
    c.shadowColor = '#ff24a9';
    c.shadowBlur = 10;
    c.beginPath();
    c.arc(0, -83, 122, Math.PI * 1.04, Math.PI * 1.96);
    c.stroke();
    [-117, 117].forEach(function (x) {
      box(c, x - 24, -99, 48, 58, 20, '#fff', '#070713', 4);
      c.fillStyle = '#ff24a9';
      c.fillRect(x - 10, -87, 20, 34);
    });
    c.restore();

    c.save();
    c.translate(0, -126);
    c.rotate(m === 'play' ? -.06 : 0);
    c.fillStyle = '#101120';
    c.strokeStyle = '#05050c';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-98, 16);
    c.bezierCurveTo(-91, -56, 84, -61, 102, 9);
    c.lineTo(92, 32);
    c.bezierCurveTo(40, 9, -36, 8, -98, 16);
    c.fill();
    c.stroke();
    box(c, -31, -55, 62, 10, 5, '#ff24a9');
    box(c, 20, -13, 67, 23, 7, '#ff24a9', '#05050c', 4);
    c.fillStyle = '#05050c';
    for (var i = 0; i < 5; i += 1) {
      c.beginPath();
      c.arc(33 + i * 11, -1, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ff24a9';
    c.beginPath();
    c.moveTo(-95, 23);
    c.lineTo(-160, 38);
    c.quadraticCurveTo(-109, 49, -78, 30);
    c.fill();
    c.stroke();
    c.fillStyle = '#fff';
    c.font = '900 24px Courier New, monospace';
    c.fillText('☺', -62, -18);
    c.fillStyle = '#27ddff';
    c.fillRect(68, -36, 16, 9);
    c.fillRect(86, -27, 9, 15);
    c.restore();

    if (m === 'clean') {
      c.strokeStyle = 'rgba(185,255,255,.72)';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-132, -84);
      c.lineTo(-80, -105);
      c.moveTo(-137, -72);
      c.lineTo(-74, -95);
      c.stroke();
    }
    c.restore();
  }

  function panel(c, w, h, m) {
    var copy = COPY[m] || COPY.idle;
    var pw = Math.min(w * .66, 396);
    var x = (w - pw) / 2;
    var y = h - Math.min(60, h * .15);
    c.save();
    c.shadowColor = copy[2];
    c.shadowBlur = 18;
    box(c, x, y, pw, 43, 14, 'rgba(5,6,20,.78)', copy[2], 2);
    c.shadowBlur = 0;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 15px Courier New, monospace';
    c.fillStyle = '#fff';
    c.fillText(copy[0], w / 2, y + 15);
    c.font = '900 9px Courier New, monospace';
    c.fillStyle = m === 'clean' ? '#d8ffff' : m === 'feed' ? '#ffe48a' : '#27ddff';
    c.fillText(copy[1], w / 2, y + 31);
    c.restore();
  }

  function chips(c) {
    var labels = ['BOT PET', 'GRAFFITI READY', 'SPRAY TRAITS'];
    c.font = '900 9px Courier New, monospace';
    c.textBaseline = 'middle';
    var x = 12;
    labels.forEach(function (label, i) {
      var width = c.measureText(label).width + 14;
      box(c, x, 12, width, 22, 9, 'rgba(3,4,15,.7)', i % 2 ? 'rgba(39,221,255,.7)' : 'rgba(255,36,169,.7)', 1);
      c.fillStyle = '#e9fbff';
      c.fillText(label, x + 7, 23);
      x += width + 7;
    });
  }

  function paint(t) {
    if (!ensureOverlay()) return window.requestAnimationFrame(paint);
    syncSize();
    watchUiText();
    if (t - lastFrame < (reduce ? 250 : 33)) return window.requestAnimationFrame(paint);
    lastFrame = t;
    var w = overlay.width;
    var h = overlay.height;
    var m = currentMode();
    ctx.clearRect(0, 0, w, h);
    drawRooftop(ctx, w, h, t, m);
    drawBot(ctx, w, h, m, t);
    panel(ctx, w, h, m);
    chips(ctx);
    window.requestAnimationFrame(paint);
  }

  function init() {
    observeClicks();
    ensureOverlay();
    window.requestAnimationFrame(paint);
  }

  function observeClicks() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('button, a, [role="button"]') : null;
      if (!target) return;
      setMode(actionFromText([
        target.getAttribute('data-action'),
        target.getAttribute('aria-label'),
        target.getAttribute('title'),
        target.textContent
      ].filter(Boolean).join(' ')));
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.MOONPET_ART_V2 = Object.freeze({ revision: REVISION, pet: 'Neon Byte', status: 'first-pet-art-pass' });
}());
