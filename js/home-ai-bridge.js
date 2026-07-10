/* home-ai-bridge.js — Staged loading sequence (canvas animation)
 * Black/yellow/orange block-built title lettering.
 * Words assemble from rectangular slice fragments one stage at a time.
 */
(function () {
  'use strict';

  /* ── Sequence stages ────────────────────────────────────────────── */
  var STAGES = [
    { lines: ['FREE TO ENTER.'],          dur: 4200 },
    { lines: ['PLAY.'],                   dur: 2800 },
    { lines: ['CREATE.'],                 dur: 2800 },
    { lines: ['EVOLVE.'],                 dur: 3000 },
    { lines: ['BUILD YOUR', 'IDENTITY.'], dur: 5800, final: true  },
    { lines: ['YOUR STORY', 'STARTS HERE.'], dur: 4000, outro: true },
  ];

  /* ── Palette ────────────────────────────────────────────────────── */
  var COL_YELLOW  = '#F7C948';
  var COL_ORANGE  = '#E8601A';
  var COL_ECHO1   = '#7A2800';
  var COL_ECHO2   = '#3A0F00';
  var COL_BG      = '#000000';

  /* ── Bootstrap ──────────────────────────────────────────────────── */
  function init() {
    var section = document.querySelector('.home-ai-bridge');
    if (!section) { return; }

    /* Reduced motion: leave the CSS-handled static version visible */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    /* Hide static fallback now that canvas will run */
    var staticEl = section.querySelector('.home-ai-bridge-static');
    if (staticEl) { staticEl.setAttribute('aria-hidden', 'true'); staticEl.style.display = 'none'; }

    /* Build canvas */
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'home-ai-bridge-canvas';
    section.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, DPR = 1;

    function resize() {
      var r = section.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width || window.innerWidth;
      H = r.height || 520;
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
    }
    resize();

    /* Use ResizeObserver if available, otherwise listen on window */
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(section);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    /* ── Math helpers ─────────────────────────────────────────────── */
    function easeOut(t) {
      var c = Math.min(t, 1);
      return 1 - Math.pow(1 - c, 2.6);
    }

    function stepped(t, n) {
      /* Hard stepped easing — the "crack intro" chunky snap */
      return Math.ceil(Math.min(t, 1) * n) / n;
    }

    /* ── Font fitting ─────────────────────────────────────────────── */
    function fitFont(lines, maxW, maxPx, minPx) {
      var sz = maxPx;
      while (sz > minPx) {
        ctx.font = '900 ' + sz + 'px Impact, "Arial Black", sans-serif';
        var fits = true;
        for (var i = 0; i < lines.length; i++) {
          if (ctx.measureText(lines[i]).width > maxW) { fits = false; break; }
        }
        if (fits) { break; }
        sz -= 3;
      }
      return sz;
    }

    /* ── Glitch strip generator ───────────────────────────────────── */
    function makeGlitchStrips(stage, totalH, topY, now, glitchT) {
      if (glitchT <= 0 || glitchT >= 0.95) { return []; }
      var strips = [];
      var n = stage.final ? 5 : 3;
      /* Fast-changing seed (40 ms buckets) creates jittery displacement */
      var seed = Math.floor(now / 40);
      for (var i = 0; i < n; i++) {
        var p1 = (Math.sin(seed * 1.23 + i * 7.43) * 0.5 + 0.5);
        var p2 = (Math.cos(seed * 0.87 + i * 3.21) * 0.5 + 0.5);
        strips.push({
          y:  topY + p1 * totalH,
          h:  totalH * 0.06 + p2 * totalH * 0.08,
          dx: (Math.sin(seed * 2.1 + i) > 0 ? 1 : -1) * (4 + p2 * 14),
        });
      }
      return strips;
    }

    /* ── Draw one line with slice-based reveal ────────────────────── */
    function drawLine(line, CX, CY, fontSize, buildT, glitchStrips) {
      var metrics = ctx.measureText(line);
      var TW = metrics.width;
      var TH = fontSize * 1.15;
      var SLICES = 14;
      var sliceH = TH / SLICES;

      for (var s = 0; s < SLICES; s++) {
        var sy = CY - TH / 2 + s * sliceH;

        /* Staggered reveal — lower slices start slightly later */
        var delay = (s / SLICES) * 0.65;
        var rawP  = (buildT < 1) ? Math.max(0, (buildT - delay) / (1 - delay)) : 1;
        /* 7-step hard snap */
        var p = (buildT >= 1) ? 1 : stepped(easeOut(rawP), 7);
        if (p <= 0) { continue; }

        /* Glitch displacement for this strip */
        var dx = 0;
        for (var g = 0; g < glitchStrips.length; g++) {
          var gs = glitchStrips[g];
          if (sy + sliceH * 0.5 >= gs.y && sy + sliceH * 0.5 < gs.y + gs.h) {
            dx = gs.dx;
            break;
          }
        }

        /* Alternate reveal direction: even slices from left, odd from right */
        var fromLeft = (s % 2 === 0);
        var clipW = TW * 1.28 * p;
        var clipX = fromLeft ? CX - TW * 0.64 + dx : CX + TW * 0.64 - clipW + dx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, sy - 1, clipW, sliceH + 2);
        ctx.clip();

        var tx = CX + dx;

        /* Echo layer 1 — offset shadow (chunky 3D depth) */
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = COL_ECHO1;
        ctx.fillText(line, tx + 5, CY + 4);

        /* Echo layer 2 — deeper shadow */
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = COL_ECHO2;
        ctx.fillText(line, tx + 9, CY + 7);

        /* Main yellow fill */
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL_YELLOW;
        ctx.fillText(line, tx, CY);

        /* Orange lower-half clipped layer */
        ctx.save();
        ctx.beginPath();
        ctx.rect(CX - TW * 0.7 + dx, CY + fontSize * 0.06, TW * 1.4, TH * 2);
        ctx.clip();
        ctx.fillStyle = COL_ORANGE;
        ctx.fillText(line, tx, CY);
        ctx.restore();

        /* Thin white top-edge highlight */
        ctx.save();
        ctx.beginPath();
        ctx.rect(CX - TW * 0.7 + dx, CY - fontSize * 0.52, TW * 1.4, fontSize * 0.065);
        ctx.clip();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(line, tx, CY);
        ctx.restore();

        ctx.restore();
      }

      /* Scan line — thin bright stripe that sweeps downward during build */
      if (buildT > 0 && buildT < 1) {
        var scanY = CY - TH / 2 + buildT * TH;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(CX - TW * 0.72, scanY - 1, TW * 1.44, 2);
        ctx.restore();
      }
    }

    /* ── Draw entire stage (all lines) ───────────────────────────── */
    function drawStage(stage, buildT, glitchT, holdT, now) {
      var maxFontW = W * 0.88;
      var maxPx    = Math.round(Math.min(H * 0.38, W * 0.18, 160));
      var minPx    = 34;

      var fontSize = fitFont(stage.lines, maxFontW, maxPx, minPx);
      ctx.font = '900 ' + fontSize + 'px Impact, "Arial Black", sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      var lineH  = fontSize * 1.18;
      var totalH = stage.lines.length * lineH;
      var topY   = H / 2 - totalH / 2;
      /* Push slightly above centre to give room for progress bar */
      var baseY  = topY - 20;

      var glitchStrips = makeGlitchStrips(stage, totalH, topY - 20, now, glitchT);

      for (var li = 0; li < stage.lines.length; li++) {
        var CY = baseY + (li + 0.5) * lineH;
        drawLine(stage.lines[li], W / 2, CY, fontSize, buildT, glitchStrips);

        /* Hold-phase glow pulse (subtle breathing after lock) */
        if (holdT > 0) {
          ctx.save();
          ctx.globalAlpha = (0.12 + 0.06 * Math.sin(now * 0.0035)) * holdT;
          ctx.shadowColor = COL_YELLOW;
          ctx.shadowBlur  = 50;
          ctx.fillStyle   = COL_YELLOW;
          ctx.fillText(stage.lines[li], W / 2, CY);
          ctx.restore();
        }
      }

      /* "FINAL" stage: extra flicker burst just before hold */
      if (stage.final && glitchT > 0.75 && glitchT < 0.88) {
        var flicker = (Math.sin(now * 0.04) > 0) ? 0.15 : 0;
        if (flicker > 0) {
          ctx.save();
          ctx.globalAlpha = flicker;
          ctx.fillStyle = COL_YELLOW;
          ctx.shadowColor = COL_YELLOW;
          ctx.shadowBlur = 80;
          for (var fi = 0; fi < stage.lines.length; fi++) {
            var FCY = baseY + (fi + 0.5) * lineH;
            ctx.fillText(stage.lines[fi], W / 2, FCY);
          }
          ctx.restore();
        }
      }
    }

    /* ── Progress bar ────────────────────────────────────────────── */
    function drawProgress(t, idx) {
      var barW = Math.min(W * 0.38, 320);
      var barH = 2;
      var bx   = (W - barW) / 2;
      var by   = H * 0.73;

      /* Track */
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#888';
      ctx.fillRect(bx, by, barW, barH);

      /* Fill */
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COL_YELLOW;
      ctx.fillRect(bx, by, barW * t, barH);

      /* Stage tick marks */
      ctx.globalAlpha = 0.4;
      for (var i = 0; i <= STAGES.length; i++) {
        var tx = bx + (barW / STAGES.length) * i;
        ctx.fillStyle = (i <= idx) ? COL_YELLOW : '#333';
        ctx.beginPath();
        ctx.arc(tx, by + barH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Percentage */
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COL_YELLOW;
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(t * 100) + '%', bx + barW, by + 14);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
    }

    /* ── Background scanlines (subtle texture) ───────────────────── */
    function drawBackground() {
      ctx.fillStyle = COL_BG;
      ctx.fillRect(0, 0, W, H);

      /* Faint horizontal scanlines */
      ctx.globalAlpha = 0.025;
      ctx.fillStyle = '#FFFFFF';
      for (var y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }
      ctx.globalAlpha = 1;
    }

    /* ── Main animation loop ─────────────────────────────────────── */
    var stageIdx   = 0;
    var stageStart = performance.now();
    var rafId      = null;

    function loop(now) {
      var stage   = STAGES[stageIdx];
      var elapsed = now - stageStart;
      var t       = Math.min(elapsed / stage.dur, 1);

      /* Apply DPR transform */
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawBackground();

      /* Phase thresholds (normalized 0–1 within stage duration):
       *  INTRO : black / fade-in
       *  BUILD : slice-reveal
       *  GLITCH: displacement lock-in
       *  HOLD  : clean hold with glow
       *  FADE  : fade to black, next stage */
      var INTRO_END  = 0.10;
      var BUILD_END  = stage.final  ? 0.62 : 0.65;
      var GLITCH_END = stage.final  ? 0.82 : 0.78;
      var HOLD_END   = stage.final  ? 0.94 : 0.91;

      var buildT      = 0;
      var glitchT     = 0;
      var holdT       = 0;
      var masterAlpha = 1;

      if (t <= INTRO_END) {
        masterAlpha = t / INTRO_END;
        buildT = 0;
      } else if (t <= BUILD_END) {
        buildT  = (t - INTRO_END) / (BUILD_END - INTRO_END);
      } else if (t <= GLITCH_END) {
        buildT  = 1;
        glitchT = (t - BUILD_END) / (GLITCH_END - BUILD_END);
      } else if (t <= HOLD_END) {
        buildT  = 1;
        holdT   = (t - GLITCH_END) / (HOLD_END - GLITCH_END);
      } else {
        buildT  = 1;
        masterAlpha = Math.max(0, 1 - ((t - HOLD_END) / (1 - HOLD_END)));
      }

      if (masterAlpha > 0.005) {
        ctx.globalAlpha = masterAlpha;
        drawStage(stage, buildT, glitchT, holdT, now);
        drawProgress(t, stageIdx);
        ctx.globalAlpha = 1;
      }

      if (t >= 1) {
        stageIdx   = (stageIdx + 1) % STAGES.length;
        stageStart = now;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    /* Pause animation when tab is hidden (saves CPU) */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else {
        if (!rafId) {
          stageStart = performance.now() - (STAGES[stageIdx].dur * 0.1);
          rafId = requestAnimationFrame(loop);
        }
      }
    });

    window.addEventListener('pagehide', function () {
      if (rafId) { cancelAnimationFrame(rafId); }
    });
  }

  /* DOMContentLoaded guard */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
