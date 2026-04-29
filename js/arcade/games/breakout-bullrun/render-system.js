/**
 * render-system.js — Breakout Bullrun canvas renderer.
 *
 * Factory: createRenderer(ctx, W, H) → { draw(state) }
 *
 * state shape:
 *   bricks, balls, paddle, hazards, particles, floatingTexts, hitFlashes,
 *   boss, bossPhase, wave, score, lives, combo, upgradePhase, upgradeChoices,
 *   riskRewardPhase, riskRewardChoices, gameOver, paused, running,
 *   waveIntroTimer, warningBanner, eventBanner, shakeX, shakeY,
 *   screenFlashTimer, intensity, runSummary, laserWarnings, drones,
 *   upgrades, elapsed
 */

import { BRICK_COLORS, BRICK_GLOW, B_W, B_H } from './brick-system.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// ── Boss colour map ───────────────────────────────────────────────────────────

const BOSS_COLORS = {
  brickTitan:    '#888',
  laserCore:     '#ff2222',
  shieldMatrix:  '#2ec5ff',
  chaosGrid:     '#cc00ff',
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRenderer(ctx, W, H) {

  // Pre-compute static star field
  const STAR_COUNT = 55;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.5,
      spd: 8 + Math.random() * 25,
      bright: 0.3 + Math.random() * 0.7,
    });
  }

  // ── Background ─────────────────────────────────────────────────────────────

  function drawBackground(wave, elapsed) {
    ctx.fillStyle = '#090c16';
    ctx.fillRect(0, 0, W, H);

    // Scroll stars
    for (const s of stars) {
      s.y += s.spd * (1 / 60);
      if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; }
      ctx.fillStyle = `rgba(255,255,255,${s.bright})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle scan-line tint from wave hue
    const hue = (wave * 37) % 360;
    ctx.fillStyle = `hsla(${hue},60%,50%,0.02)`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Bricks ─────────────────────────────────────────────────────────────────

  function drawBrick(b) {
    if (!b.alive) return;

    const flash = b.hitTimer > 0 ? b.hitTimer / 0.15 : 0;
    const color = BRICK_COLORS[b.type] || '#2ec5ff';
    const glow  = BRICK_GLOW[b.type]  || 'rgba(100,200,255,0.35)';

    // Glow halo
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur  = 10 + flash * 14;

    // Body
    const alpha = flash > 0 ? lerp(1, 0.3, flash) : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = flash > 0 ? '#ffffff' : color;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 4);
    ctx.fill();

    // HP bar for multi-hit bricks
    if (b.maxHp > 1) {
      const barW = (b.w - 4) * (b.hp / b.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(b.x + 2, b.y + b.h - 4, b.w - 4, 3);
      ctx.fillStyle = '#3fb950';
      ctx.fillRect(b.x + 2, b.y + b.h - 4, barW, 3);
    }

    // Shield ring
    if (b.shieldHp > 0) {
      ctx.strokeStyle = '#3fb950';
      ctx.lineWidth   = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }

    // Moving tick mark
    if (b.type === 'moving') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(b.x + b.w / 2 - 1, b.y + 3, 2, b.h - 6);
    }

    // Golden sparkle
    if (b.type === 'golden') {
      ctx.fillStyle = 'rgba(255,255,150,0.6)';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Paddle ─────────────────────────────────────────────────────────────────

  function drawPaddle(paddle, upgrades) {
    const gColor = '#f7ab1a';
    ctx.save();
    ctx.shadowColor = 'rgba(247,171,26,0.6)';
    ctx.shadowBlur  = 14;
    ctx.fillStyle = gColor;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 5);
    ctx.fill();

    // Shield floor upgrade
    if (upgrades && upgrades.shieldFloor > 0) {
      ctx.strokeStyle = 'rgba(63,185,80,0.7)';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(0, paddle.y + paddle.h + 4);
      ctx.lineTo(W, paddle.y + paddle.h + 4);
      ctx.stroke();
    }

    // Sticky indicator
    if (upgrades && upgrades.sticky > 0) {
      ctx.fillStyle = 'rgba(188,140,255,0.5)';
      ctx.fillRect(paddle.x + 4, paddle.y, paddle.w - 8, 3);
    }

    ctx.restore();
  }

  // ── Balls ──────────────────────────────────────────────────────────────────

  function drawBall(ball, upgrades) {
    ctx.save();
    const color = upgrades && upgrades.explosive > 0 ? '#ff6b2b'
                : upgrades && upgrades.piercing  > 0 ? '#bc8cff'
                : '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    // Trail
    if (ball.trail && ball.trail.length > 0) {
      for (let i = 0; i < ball.trail.length; i++) {
        const t   = ball.trail[i];
        const age = (i + 1) / ball.trail.length;
        ctx.globalAlpha = age * 0.3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, ball.r * age * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ── Particles & floating texts ─────────────────────────────────────────────

  function drawParticles(particles) {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color || '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloatingTexts(texts) {
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      const alpha = t.life / t.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = t.color || '#f7c948';
      ctx.font        = `bold ${t.size || 13}px monospace`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawHitFlashes(hitFlashes) {
    for (const f of hitFlashes) {
      const alpha = f.life / f.maxLife;
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle   = f.color || '#ffffff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - alpha) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Hazards ────────────────────────────────────────────────────────────────

  function drawHazards(hazards) {
    for (const h of hazards) {
      if (h.type === 'fallingRock') {
        ctx.save();
        ctx.shadowColor = 'rgba(255,107,43,0.6)';
        ctx.shadowBlur  = 8;
        ctx.fillStyle   = '#cc5511';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (h.type === 'drone') {
        ctx.save();
        ctx.shadowColor = 'rgba(188,140,255,0.6)';
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = '#bc8cff';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        // Drone "wings"
        ctx.strokeStyle = '#bc8cff';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(h.x - h.r - 4, h.y);
        ctx.lineTo(h.x + h.r + 4, h.y);
        ctx.stroke();
        ctx.restore();
      } else if (h.type === 'laserTurret') {
        ctx.save();
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (h.type === 'enemyPaddle') {
        ctx.save();
        ctx.fillStyle = '#ff4fd1';
        ctx.beginPath();
        ctx.roundRect(h.x - h.hw, h.y, h.hw * 2, h.hh, 4);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ── Laser warnings ─────────────────────────────────────────────────────────

  function drawLaserWarnings(laserWarnings) {
    for (const lw of laserWarnings) {
      const charge = 1 - clamp(lw.chargeTimer / lw.maxCharge, 0, 1);
      const alpha  = 0.15 + charge * 0.7;
      ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
      ctx.lineWidth   = 2 + charge * 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(lw.x, 0);
      ctx.lineTo(lw.x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      if (lw.fired) {
        ctx.strokeStyle = 'rgba(255,50,50,0.9)';
        ctx.lineWidth   = 6;
        ctx.beginPath();
        ctx.moveTo(lw.x, 0);
        ctx.lineTo(lw.x, H);
        ctx.stroke();
      }
    }
  }

  // ── Boss ───────────────────────────────────────────────────────────────────

  function drawBoss(boss, bossPhase) {
    if (!boss) return;
    const color = BOSS_COLORS[boss.type] || '#ff4444';
    const flashColor = boss.hitTimer > 0 ? '#ffffff' : color;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 20 + (bossPhase || 1) * 8;

    // Boss body
    ctx.fillStyle = flashColor;
    ctx.beginPath();
    ctx.roundRect(boss.x, boss.y, boss.w, boss.h, 8);
    ctx.fill();

    // Phase indicator lines
    if (bossPhase >= 2) {
      ctx.strokeStyle = bossPhase === 3 ? '#ff4444' : '#f7c948';
      ctx.lineWidth   = 2;
      ctx.strokeRect(boss.x + 2, boss.y + 2, boss.w - 4, boss.h - 4);
    }

    // HP bar
    const barFrac = clamp(boss.hpDisplay / boss.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(boss.x, boss.y + boss.h + 4, boss.w, 6);
    const barColor = barFrac > 0.66 ? '#3fb950' : barFrac > 0.33 ? '#f7c948' : '#ff4444';
    ctx.fillStyle = barColor;
    ctx.fillRect(boss.x, boss.y + boss.h + 4, boss.w * barFrac, 6);

    // Chaos Grid type: draw checkerboard overlay
    if (boss.type === 'chaosGrid') {
      const cell = 20;
      for (let gy = 0; gy < Math.ceil(boss.h / cell); gy++) {
        for (let gx = 0; gx < Math.ceil(boss.w / cell); gx++) {
          if ((gx + gy) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,0,255,0.2)';
            ctx.fillRect(boss.x + gx * cell, boss.y + gy * cell, cell, cell);
          }
        }
      }
    }

    // Laser Core type: draw charging beam indicators
    if (boss.type === 'laserCore' && boss.chargeTimer !== undefined && boss.chargeTimer < 1.5) {
      const charge = 1 - boss.chargeTimer / 1.5;
      ctx.strokeStyle = `rgba(255,50,50,${charge * 0.8})`;
      ctx.lineWidth   = 3 + charge * 5;
      ctx.beginPath();
      ctx.moveTo(boss.x + boss.w / 2, boss.y + boss.h);
      ctx.lineTo(boss.x + boss.w / 2, H);
      ctx.stroke();
    }

    // Shield Matrix type: draw shield rings
    if (boss.type === 'shieldMatrix' && boss.shieldHp > 0) {
      ctx.strokeStyle = '#2ec5ff';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.ellipse(boss.x + boss.w / 2, boss.y + boss.h / 2, boss.w / 2 + 10, boss.h / 2 + 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Boss bullets ───────────────────────────────────────────────────────────

  function drawBossBullets(bullets) {
    ctx.save();
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur  = 8;
    for (const b of bullets) {
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r || 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Intensity overlay ──────────────────────────────────────────────────────

  function drawIntensityFeedback(intensity, elapsed) {
    if (intensity < 60) return;

    const t      = (intensity - 60) / 40;   // 0 at 60, 1 at 100
    const pulse  = 0.5 + 0.5 * Math.sin(elapsed * (3 + t * 6));
    const alpha  = t * 0.12 * pulse;

    ctx.fillStyle = `rgba(255,0,0,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Screen flash ───────────────────────────────────────────────────────────

  function drawScreenFlash(timer) {
    if (timer <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${timer * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Banners ────────────────────────────────────────────────────────────────

  function drawBanner(banner) {
    if (!banner || banner.timer <= 0) return;

    const alpha = Math.min(1, banner.timer / (banner.maxTimer || 2));
    ctx.save();
    ctx.globalAlpha = alpha;

    const text  = banner.text || '';
    const color = banner.color || '#f7c948';

    ctx.font      = 'bold 16px monospace';
    ctx.textAlign = 'center';

    // Background pill
    const tw = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2, 6, tw, 28, 6);
    ctx.fill();

    ctx.fillStyle    = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, 20);

    ctx.restore();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Wave intro ─────────────────────────────────────────────────────────────

  function drawWaveIntro(wave, timer) {
    if (timer <= 0) return;
    const alpha = Math.min(1, timer);

    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = 'bold 32px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#f7c948';
    ctx.shadowColor  = '#f7c948';
    ctx.shadowBlur   = 20;
    ctx.fillText('WAVE ' + wave, W / 2, H / 2);
    ctx.restore();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Upgrade screen ─────────────────────────────────────────────────────────

  function drawUpgradeScreen(choices) {
    if (!choices || !choices.length) return;

    // Dim background
    ctx.fillStyle = 'rgba(9,12,22,0.88)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#f7c948';
    ctx.font         = 'bold 18px monospace';
    ctx.fillText('⬆ UPGRADE', W / 2, 80);
    ctx.fillStyle = '#aaaaaa';
    ctx.font      = '12px monospace';
    ctx.fillText('Click or press 1/2/3', W / 2, 102);

    const cardH  = 100;
    const cardW  = Math.min(160, (W - 40) / 3 - 8);
    const totalW = choices.length * cardW + (choices.length - 1) * 12;
    const startX = (W - totalW) / 2;

    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const cx = startX + i * (cardW + 12);
      const cy = H / 2 - cardH / 2;
      const rarityColor = { common: '#aaaaaa', rare: '#2ec5ff', epic: '#bc8cff', legendary: '#ffd700' }[c.rarity] || '#aaaaaa';

      ctx.fillStyle = 'rgba(30,40,60,0.95)';
      ctx.beginPath();
      ctx.roundRect(cx, cy, cardW, cardH, 10);
      ctx.fill();

      ctx.strokeStyle = rarityColor;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cardW, cardH, 10);
      ctx.stroke();

      ctx.fillStyle = rarityColor;
      ctx.font      = `bold 22px monospace`;
      ctx.fillText(c.icon || '?', cx + cardW / 2, cy + 24);

      ctx.fillStyle = '#ffffff';
      ctx.font      = `bold 11px monospace`;
      ctx.fillText(c.label, cx + cardW / 2, cy + 48);

      ctx.fillStyle = '#aaaaaa';
      ctx.font      = `10px monospace`;
      const words = (c.desc || '').split(' ');
      let line = '', lineY = cy + 66;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > cardW - 12) {
          ctx.fillText(line, cx + cardW / 2, lineY);
          lineY += 13;
          line = word;
        } else { line = test; }
      }
      if (line) ctx.fillText(line, cx + cardW / 2, lineY);

      ctx.fillStyle = '#f7c948';
      ctx.font      = `bold 11px monospace`;
      ctx.fillText('[' + (i + 1) + ']', cx + cardW / 2, cy + cardH - 10);
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Game over / run summary ────────────────────────────────────────────────

  function drawRunSummary(summary) {
    if (!summary) return;

    ctx.fillStyle = 'rgba(9,12,22,0.92)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = summary.ratingColor || '#f7c948';
    ctx.font      = 'bold 48px monospace';
    ctx.fillText(summary.rating, W / 2, H / 2 - 120);

    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 16px monospace';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 72);

    const lines = [
      ['Score',    summary.score,            '#f7c948'],
      ['Wave',     summary.wave,             '#2ec5ff'],
      ['Bosses',   summary.bossesDefeated,   '#ff4fd1'],
      ['Upgrades', summary.upgradeCount,     '#bc8cff'],
      ['Best',     summary.bestScore,        '#3fb950'],
    ];
    let ly = H / 2 - 38;
    for (const [label, val, color] of lines) {
      ctx.fillStyle = '#888';
      ctx.font      = '12px monospace';
      ctx.fillText(label, W / 2 - 60, ly);
      ctx.fillStyle = color;
      ctx.font      = 'bold 14px monospace';
      ctx.fillText(val, W / 2 + 60, ly);
      ly += 22;
    }

    ctx.fillStyle = '#aaaaaa';
    ctx.font      = '12px monospace';
    ctx.fillText('Press Enter / tap Start to play again', W / 2, ly + 16);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Idle / start screen ────────────────────────────────────────────────────

  function drawIdle() {
    ctx.fillStyle = 'rgba(9,12,22,0.88)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#f7ab1a';
    ctx.font         = 'bold 22px monospace';
    ctx.fillText('🧱 BREAKOUT BULLRUN', W / 2, H / 2 - 30);
    ctx.fillStyle = '#aaaaaa';
    ctx.font      = '14px monospace';
    ctx.fillText('Click Start or press Enter', W / 2, H / 2 + 10);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Paused overlay ─────────────────────────────────────────────────────────

  function drawPaused() {
    ctx.fillStyle = 'rgba(9,12,22,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#f7c948';
    ctx.font         = 'bold 24px monospace';
    ctx.fillText('PAUSED', W / 2, H / 2);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Milestone toasts ───────────────────────────────────────────────────────

  function drawMilestoneToasts(toasts) {
    let ty = H - 80;
    for (const t of toasts) {
      const alpha = Math.min(1, t.timer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = 'rgba(0,0,0,0.75)';
      const tw = ctx.measureText(t.text).width + 20;
      ctx.font = 'bold 12px monospace';
      ctx.beginPath();
      ctx.roundRect(W / 2 - tw / 2, ty - 16, tw, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#f7c948';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, W / 2, ty - 4);
      ctx.restore();
      ty -= 30;
    }
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Master draw ────────────────────────────────────────────────────────────

  function draw(state) {
    const {
      bricks, balls, paddle, hazards = [], particles = [], floatingTexts = [],
      hitFlashes = [], boss, bossPhase, wave, upgradePhase, upgradeChoices,
      gameOver, paused, running, waveIntroTimer, warningBanner, eventBanner,
      shakeX = 0, shakeY = 0, screenFlashTimer = 0, intensity = 0, runSummary,
      laserWarnings = [], bossBullets = [], upgrades = {}, elapsed = 0,
      milestoneToasts = [],
    } = state;

    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

    // Background
    drawBackground(wave || 1, elapsed);

    if (!running && !gameOver) {
      drawIdle();
      ctx.restore();
      return;
    }

    if (gameOver && runSummary) {
      drawRunSummary(runSummary);
      ctx.restore();
      return;
    }

    if (gameOver) {
      // Plain game over without summary
      ctx.fillStyle = 'rgba(9,12,22,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#ff4444';
      ctx.font         = 'bold 28px monospace';
      ctx.fillText('GAME OVER', W / 2, H / 2);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // World
    if (bricks) for (const b of bricks) drawBrick(b);
    drawHazards(hazards);
    drawLaserWarnings(laserWarnings);
    drawHitFlashes(hitFlashes);
    drawParticles(particles);
    drawFloatingTexts(floatingTexts);
    if (boss) {
      drawBoss(boss, bossPhase);
      drawBossBullets(bossBullets);
    }
    if (balls) for (const ball of balls) drawBall(ball, upgrades);
    drawPaddle(paddle, upgrades);

    // Intensity feedback
    drawIntensityFeedback(intensity, elapsed);
    drawScreenFlash(screenFlashTimer);

    // Banners
    if (eventBanner) drawBanner(eventBanner);
    if (warningBanner) drawBanner({ ...warningBanner, maxTimer: warningBanner.maxTimer || 2.2 });

    // Wave intro overlay
    if (waveIntroTimer > 0) drawWaveIntro(wave, waveIntroTimer);

    // Upgrade screen
    if (upgradePhase === 'picking') drawUpgradeScreen(upgradeChoices);

    // Milestone toasts
    drawMilestoneToasts(milestoneToasts);

    // Paused overlay
    if (paused) drawPaused();

    ctx.restore();
  }

  return { draw };
}
