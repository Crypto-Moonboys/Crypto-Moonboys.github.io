/* home-ai-bridge.js — Crypto Moonboys two-path onboarding animation.
 * Crypto Moonboys is the umbrella. Visitors can either forge a Moonboy
 * identity and join the HODL Warriors, or keep an existing identity and
 * use SWARMSY to build visibility and momentum.
 */
(function () {
  'use strict';

  var STAGES = [
    {
      kicker: 'CRYPTO MOONBOYS — THE CREATOR UMBRELLA',
      lines: ['TWO WAYS', 'TO JOIN.'],
      dur: 4600
    },
    {
      kicker: 'PATH 1 — BUILD A MOONBOY IDENTITY',
      lines: ['GRIND XP.', 'EARN FREE DROPS.'],
      dur: 5200
    },
    {
      kicker: 'KEEP. FLIP. OR BURN.',
      lines: ['FORGE A UNIQUE', '1/1 MOONBOY.'],
      dur: 5600
    },
    {
      kicker: 'YOUR CHARACTER. YOUR LICENCE. YOUR ROYALTIES.',
      lines: ['JOIN THE', 'HODL WARRIORS.'],
      dur: 6000,
      final: true
    },
    {
      kicker: 'PATH 2 — KEEP YOUR EXISTING IDENTITY',
      lines: ['ARTIST. BUSINESS.', 'CREATOR. PRODUCT.'],
      dur: 5400
    },
    {
      kicker: 'USE SWARMSY TO STAND OUT',
      lines: ['CREATE. PLAN.', 'BRAND. GROW.'],
      dur: 5600
    },
    {
      kicker: 'ONE UMBRELLA. TWO PATHS. ONE MOVEMENT.',
      lines: ['BUILD IDENTITY.', 'BUILD MOMENTUM.'],
      dur: 6200,
      final: true
    }
  ];

  var COL_YELLOW = '#F7C948';
  var COL_ORANGE = '#E8601A';
  var COL_CYAN = '#00E8F0';
  var COL_BG = '#000000';

  function init() {
    var section = document.querySelector('.home-ai-bridge');
    if (!section) { return; }

    var staticEl = section.querySelector('.home-ai-bridge-static');

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (staticEl) {
        staticEl.setAttribute('aria-hidden', 'false');
        staticEl.style.display = '';
      }
      return;
    }

    if (staticEl) {
      staticEl.setAttribute('aria-hidden', 'true');
      staticEl.style.display = 'none';
    }

    var canvas = document.createElement('canvas');
    canvas.className = 'home-ai-bridge-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    section.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var width = 0;
    var height = 0;
    var dpr = 1;
    var stageIndex = 0;
    var stageStartedAt = performance.now();
    var frameId = null;

    function resize() {
      var bounds = section.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width || window.innerWidth;
      height = bounds.height || 520;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function easeOut(value) {
      var t = clamp(value, 0, 1);
      return 1 - Math.pow(1 - t, 3);
    }

    function fitFont(lines, maxWidth, maxSize, minSize) {
      var size = maxSize;
      while (size > minSize) {
        ctx.font = '900 ' + size + 'px Impact, "Arial Black", sans-serif';
        var fits = lines.every(function (line) {
          return ctx.measureText(line).width <= maxWidth;
        });
        if (fits) { return size; }
        size -= 2;
      }
      return minSize;
    }

    function drawBackground(now) {
      ctx.fillStyle = COL_BG;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.03;
      ctx.fillStyle = '#FFFFFF';
      for (var y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 1);
      }

      var pulse = 0.04 + (Math.sin(now * 0.0018) + 1) * 0.015;
      var glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
      glow.addColorStop(0, 'rgba(247,201,72,' + pulse + ')');
      glow.addColorStop(0.52, 'rgba(232,96,26,0.025)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    function drawKicker(text, opacity) {
      var maxWidth = width * 0.86;
      var size = Math.max(12, Math.min(20, width * 0.018));
      ctx.save();
      ctx.globalAlpha = opacity * 0.95;
      ctx.fillStyle = COL_CYAN;
      ctx.font = '800 ' + size + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = COL_CYAN;
      ctx.shadowBlur = 18;

      var display = text;
      while (ctx.measureText(display).width > maxWidth && size > 10) {
        size -= 1;
        ctx.font = '800 ' + size + 'px "Courier New", monospace';
      }
      ctx.fillText(display, width / 2, height * 0.22);
      ctx.restore();
    }

    function drawHeadline(stage, build, opacity, now) {
      var lines = stage.lines;
      var maxWidth = width * 0.88;
      var maxSize = Math.round(Math.min(height * 0.27, width * 0.12, 126));
      var fontSize = fitFont(lines, maxWidth, maxSize, 30);
      var lineHeight = fontSize * 1.08;
      var totalHeight = lines.length * lineHeight;
      var startY = height * 0.48 - totalHeight / 2 + lineHeight / 2;

      ctx.font = '900 ' + fontSize + 'px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      lines.forEach(function (line, index) {
        var localDelay = index * 0.12;
        var localBuild = easeOut(clamp((build - localDelay) / (1 - localDelay), 0, 1));
        var y = startY + index * lineHeight;
        var jitter = build < 0.82 ? Math.sin(now * 0.028 + index * 4) * (1 - build) * 12 : 0;
        var textWidth = ctx.measureText(line).width;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.rect(width / 2 - textWidth * 0.56, y - fontSize * 0.62, textWidth * 1.12 * localBuild, fontSize * 1.24);
        ctx.clip();

        ctx.fillStyle = '#6B2100';
        ctx.globalAlpha = opacity * 0.45;
        ctx.fillText(line, width / 2 + 8 + jitter, y + 7);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = COL_YELLOW;
        ctx.shadowColor = COL_YELLOW;
        ctx.shadowBlur = stage.final ? 32 : 18;
        ctx.fillText(line, width / 2 + jitter, y);

        ctx.save();
        ctx.beginPath();
        ctx.rect(width / 2 - textWidth * 0.6, y + 2, textWidth * 1.2, fontSize);
        ctx.clip();
        ctx.fillStyle = COL_ORANGE;
        ctx.shadowBlur = 0;
        ctx.fillText(line, width / 2 + jitter, y);
        ctx.restore();
        ctx.restore();
      });
    }

    function drawPathMarker(index, opacity) {
      var barWidth = Math.min(width * 0.48, 420);
      var x = (width - barWidth) / 2;
      var y = height * 0.77;

      ctx.save();
      ctx.globalAlpha = opacity * 0.25;
      ctx.fillStyle = '#777777';
      ctx.fillRect(x, y, barWidth, 2);

      ctx.globalAlpha = opacity * 0.95;
      ctx.fillStyle = index <= 3 ? COL_YELLOW : COL_CYAN;
      ctx.fillRect(x, y, barWidth * ((index + 1) / STAGES.length), 2);

      for (var i = 0; i < STAGES.length; i += 1) {
        ctx.beginPath();
        ctx.arc(x + (barWidth / (STAGES.length - 1)) * i, y + 1, i <= index ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = i <= index ? (i <= 3 ? COL_YELLOW : COL_CYAN) : '#333333';
        ctx.fill();
      }
      ctx.restore();
    }

    function loop(now) {
      var stage = STAGES[stageIndex];
      var elapsed = now - stageStartedAt;
      var progress = clamp(elapsed / stage.dur, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(now);

      var fadeIn = clamp(progress / 0.12, 0, 1);
      var fadeOut = clamp((1 - progress) / 0.1, 0, 1);
      var opacity = Math.min(fadeIn, fadeOut);
      var build = clamp((progress - 0.08) / 0.56, 0, 1);

      drawKicker(stage.kicker, opacity);
      drawHeadline(stage, build, opacity, now);
      drawPathMarker(stageIndex, opacity);

      if (progress >= 1) {
        stageIndex = (stageIndex + 1) % STAGES.length;
        stageStartedAt = now;
      }

      frameId = requestAnimationFrame(loop);
    }

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(section);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    frameId = requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
      } else if (!frameId) {
        stageStartedAt = performance.now();
        frameId = requestAnimationFrame(loop);
      }
    });

    window.addEventListener('pagehide', function () {
      if (frameId) { cancelAnimationFrame(frameId); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());