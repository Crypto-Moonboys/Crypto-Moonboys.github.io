/* home-ai-bridge.js — staged creator-identity canvas sequence. */
(function () {
  'use strict';

  var STAGES = [
    { lines: ['FREE TO ENTER.'], dur: 4200 },
    { lines: ['PLAY.'], dur: 2800 },
    { lines: ['CREATE.'], dur: 2800 },
    { lines: ['EVOLVE.'], dur: 3000 },
    { lines: ['BUILD YOUR', 'IDENTITY.'], dur: 5800, final: true },
    { lines: ['YOUR STORY', 'STARTS HERE.'], dur: 4000, outro: true },
  ];

  var COL_YELLOW = '#F7C948';
  var COL_ORANGE = '#E8601A';
  var COL_ECHO1 = '#7A2800';
  var COL_ECHO2 = '#3A0F00';
  var COL_BG = '#000000';

  function init() {
    var section = document.querySelector('.home-ai-bridge');
    if (!section) return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'home-ai-bridge-canvas';
    section.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    section.classList.add('is-animated');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'home-ai-bridge-toggle';
    toggle.textContent = 'Pause animation';
    toggle.setAttribute('aria-pressed', 'false');
    section.appendChild(toggle);

    var W = 0;
    var H = 0;
    var DPR = 1;
    var resizeObserver = null;

    function resize() {
      var rect = section.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width || window.innerWidth;
      H = rect.height || 520;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }

    resize();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(section);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    function easeOut(t) {
      var clamped = Math.min(t, 1);
      return 1 - Math.pow(1 - clamped, 2.6);
    }

    function stepped(t, steps) {
      return Math.ceil(Math.min(t, 1) * steps) / steps;
    }

    function fitFont(lines, maxW, maxPx, minPx) {
      var size = maxPx;
      while (size > minPx) {
        ctx.font = '900 ' + size + 'px Impact, "Arial Black", sans-serif';
        var fits = true;
        for (var i = 0; i < lines.length; i += 1) {
          if (ctx.measureText(lines[i]).width > maxW) {
            fits = false;
            break;
          }
        }
        if (fits) break;
        size -= 3;
      }
      return size;
    }

    function makeGlitchStrips(stage, totalH, topY, now, glitchT) {
      if (glitchT <= 0 || glitchT >= 0.95) return [];
      var strips = [];
      var count = stage.final ? 5 : 3;
      var seed = Math.floor(now / 40);

      for (var i = 0; i < count; i += 1) {
        var p1 = Math.sin(seed * 1.23 + i * 7.43) * 0.5 + 0.5;
        var p2 = Math.cos(seed * 0.87 + i * 3.21) * 0.5 + 0.5;
        strips.push({
          y: topY + p1 * totalH,
          h: totalH * 0.06 + p2 * totalH * 0.08,
          dx: (Math.sin(seed * 2.1 + i) > 0 ? 1 : -1) * (4 + p2 * 14),
        });
      }
      return strips;
    }

    function drawLine(line, centerX, centerY, fontSize, buildT, glitchStrips) {
      var metrics = ctx.measureText(line);
      var textWidth = metrics.width;
      var textHeight = fontSize * 1.15;
      var sliceCount = 14;
      var sliceHeight = textHeight / sliceCount;

      for (var slice = 0; slice < sliceCount; slice += 1) {
        var sliceY = centerY - textHeight / 2 + slice * sliceHeight;
        var delay = (slice / sliceCount) * 0.65;
        var rawProgress = buildT < 1 ? Math.max(0, (buildT - delay) / (1 - delay)) : 1;
        var progress = buildT >= 1 ? 1 : stepped(easeOut(rawProgress), 7);
        if (progress <= 0) continue;

        var dx = 0;
        for (var g = 0; g < glitchStrips.length; g += 1) {
          var strip = glitchStrips[g];
          var midpoint = sliceY + sliceHeight * 0.5;
          if (midpoint >= strip.y && midpoint < strip.y + strip.h) {
            dx = strip.dx;
            break;
          }
        }

        var fromLeft = slice % 2 === 0;
        var clipWidth = textWidth * 1.28 * progress;
        var clipX = fromLeft
          ? centerX - textWidth * 0.64 + dx
          : centerX + textWidth * 0.64 - clipWidth + dx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, sliceY - 1, clipWidth, sliceHeight + 2);
        ctx.clip();

        var textX = centerX + dx;
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = COL_ECHO1;
        ctx.fillText(line, textX + 5, centerY + 4);

        ctx.globalAlpha = 0.22;
        ctx.fillStyle = COL_ECHO2;
        ctx.fillText(line, textX + 9, centerY + 7);

        ctx.globalAlpha = 1;
        ctx.fillStyle = COL_YELLOW;
        ctx.fillText(line, textX, centerY);

        ctx.save();
        ctx.beginPath();
        ctx.rect(centerX - textWidth * 0.7 + dx, centerY + fontSize * 0.06, textWidth * 1.4, textHeight * 2);
        ctx.clip();
        ctx.fillStyle = COL_ORANGE;
        ctx.fillText(line, textX, centerY);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(centerX - textWidth * 0.7 + dx, centerY - fontSize * 0.52, textWidth * 1.4, fontSize * 0.065);
        ctx.clip();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(line, textX, centerY);
        ctx.restore();
        ctx.restore();
      }

      if (buildT > 0 && buildT < 1) {
        var scanY = centerY - textHeight / 2 + buildT * textHeight;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(centerX - textWidth * 0.72, scanY - 1, textWidth * 1.44, 2);
        ctx.restore();
      }
    }

    function drawStage(stage, buildT, glitchT, holdT, now) {
      var maxFontWidth = W * 0.88;
      var maxPx = Math.round(Math.min(H * 0.38, W * 0.18, 160));
      var fontSize = fitFont(stage.lines, maxFontWidth, maxPx, 34);
      ctx.font = '900 ' + fontSize + 'px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      var lineHeight = fontSize * 1.18;
      var totalHeight = stage.lines.length * lineHeight;
      var topY = H / 2 - totalHeight / 2;
      var baseY = topY - 20;
      var glitchStrips = makeGlitchStrips(stage, totalHeight, topY - 20, now, glitchT);

      for (var i = 0; i < stage.lines.length; i += 1) {
        var centerY = baseY + (i + 0.5) * lineHeight;
        drawLine(stage.lines[i], W / 2, centerY, fontSize, buildT, glitchStrips);

        if (holdT > 0) {
          ctx.save();
          ctx.globalAlpha = (0.12 + 0.06 * Math.sin(now * 0.0035)) * holdT;
          ctx.shadowColor = COL_YELLOW;
          ctx.shadowBlur = 50;
          ctx.fillStyle = COL_YELLOW;
          ctx.fillText(stage.lines[i], W / 2, centerY);
          ctx.restore();
        }
      }

      if (stage.final && glitchT > 0.75 && glitchT < 0.88 && Math.sin(now * 0.04) > 0) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = COL_YELLOW;
        ctx.shadowColor = COL_YELLOW;
        ctx.shadowBlur = 80;
        for (var f = 0; f < stage.lines.length; f += 1) {
          ctx.fillText(stage.lines[f], W / 2, baseY + (f + 0.5) * lineHeight);
        }
        ctx.restore();
      }
    }

    function drawProgress(t, stageIndex) {
      var barWidth = Math.min(W * 0.38, 320);
      var barHeight = 2;
      var x = (W - barWidth) / 2;
      var y = H * 0.73;

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#888';
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COL_YELLOW;
      ctx.fillRect(x, y, barWidth * t, barHeight);

      ctx.globalAlpha = 0.4;
      for (var i = 0; i <= STAGES.length; i += 1) {
        var tickX = x + (barWidth / STAGES.length) * i;
        ctx.fillStyle = i <= stageIndex ? COL_YELLOW : '#333';
        ctx.beginPath();
        ctx.arc(tickX, y + barHeight / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COL_YELLOW;
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(t * 100) + '%', x + barWidth, y + 14);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
    }

    function drawBackground() {
      ctx.fillStyle = COL_BG;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.025;
      ctx.fillStyle = '#FFFFFF';
      for (var y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 1;
    }

    var stageIndex = 0;
    var stageStart = performance.now();
    var rafId = null;
    var userPaused = false;
    var pausedAt = null;

    function loop(now) {
      rafId = null;
      var stage = STAGES[stageIndex];
      var elapsed = now - stageStart;
      var t = Math.min(elapsed / stage.dur, 1);

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawBackground();

      var introEnd = 0.10;
      var buildEnd = stage.final ? 0.62 : 0.65;
      var glitchEnd = stage.final ? 0.82 : 0.78;
      var holdEnd = stage.final ? 0.94 : 0.91;
      var buildT = 0;
      var glitchT = 0;
      var holdT = 0;
      var masterAlpha = 1;

      if (t <= introEnd) {
        masterAlpha = t / introEnd;
      } else if (t <= buildEnd) {
        buildT = (t - introEnd) / (buildEnd - introEnd);
      } else if (t <= glitchEnd) {
        buildT = 1;
        glitchT = (t - buildEnd) / (glitchEnd - buildEnd);
      } else if (t <= holdEnd) {
        buildT = 1;
        holdT = (t - glitchEnd) / (holdEnd - glitchEnd);
      } else {
        buildT = 1;
        masterAlpha = Math.max(0, 1 - (t - holdEnd) / (1 - holdEnd));
      }

      if (masterAlpha > 0.005) {
        ctx.globalAlpha = masterAlpha;
        drawStage(stage, buildT, glitchT, holdT, now);
        drawProgress(t, stageIndex);
        ctx.globalAlpha = 1;
      }

      if (t >= 1) {
        stageIndex = (stageIndex + 1) % STAGES.length;
        stageStart = now;
      }

      if (!userPaused && !document.hidden) rafId = requestAnimationFrame(loop);
    }

    function pauseAnimation() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pausedAt === null) pausedAt = performance.now();
    }

    function resumeAnimation() {
      if (userPaused || document.hidden || rafId) return;
      var now = performance.now();
      if (pausedAt !== null) {
        stageStart += now - pausedAt;
        pausedAt = null;
      }
      rafId = requestAnimationFrame(loop);
    }

    toggle.addEventListener('click', function () {
      userPaused = !userPaused;
      toggle.textContent = userPaused ? 'Resume animation' : 'Pause animation';
      toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      if (userPaused) pauseAnimation();
      else resumeAnimation();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseAnimation();
      else resumeAnimation();
    });

    window.addEventListener('pagehide', function () {
      pauseAnimation();
      if (resizeObserver) resizeObserver.disconnect();
    });

    rafId = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
