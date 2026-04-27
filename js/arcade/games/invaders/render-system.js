/**
 * render-system.js — all canvas drawing for Invaders 3008.
 *
 * Exports createRenderer(ctx, W, H) which returns a renderer object.
 * The renderer is pure canvas writes — it never mutates game state.
 */

import { POWERUP_COLORS, POWERUP_ICONS, POWERUP_DURATION } from './powerup-system.js';
import { WAVE_BOSS, BUNKER_BLOCK_W, BUNKER_BLOCK_H } from './invader-system.js';
import { UPGRADE_DEFS, UPGRADE_COLORS } from './upgrade-system.js';

// Boss phase colour palette — shared between drawBoss() and the phase label.
const BOSS_PHASE_COLORS = ['#ff4444', '#ff8800', '#ff0055'];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  canvas logical width
 * @param {number} H  canvas logical height
 */
export function createRenderer(ctx, W, H) {

  // ── Internal helpers ────────────────────────────────────────────────────────

  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // ── Ship ─────────────────────────────────────────────────────────────────────

  function drawShip(player) {
    const { x, y, w, h, shielded } = player;
    ctx.fillStyle = '#2ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w,     y + h);
    ctx.lineTo(x,         y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8eaff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.55, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x + w / 2 - 4, y + h - 6, 8, 6);
    ctx.fillStyle = '#1a9acc';
    ctx.fillRect(x,         y + h - 8, 8, 4);
    ctx.fillRect(x + w - 8, y + h - 8, 8, 4);
    if (shielded) {
      ctx.save();
      ctx.strokeStyle = 'rgba(63,185,80,0.7)';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#3fb950';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Invader type renderers ────────────────────────────────────────────────────

  function drawInvaderBasic(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffbbee' : '#ff4fd1';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8,      y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    ctx.strokeStyle = '#ff4fd1';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(x + 5,     y + h - 2); ctx.lineTo(x,     y + h + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 5, y + h - 2); ctx.lineTo(x + w, y + h + 4); ctx.stroke();
  }

  function drawInvaderFast(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffe0a0' : '#f7c948';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 2, y + h - 2);
    ctx.lineTo(x + 2,     y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + w / 2 - 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w / 2 + 5, y + 3, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawInvaderTank(x, y, w, h, hitFrac, hpRatio) {
    ctx.fillStyle = hitFrac > 0 ? '#b0ffb0' : '#3fb950';
    ctx.fillRect(x + 2, y + 3, w - 4, h - 5);
    ctx.fillStyle = '#2a8040';
    ctx.fillRect(x,         y + 6, 5, h - 10);
    ctx.fillRect(x + w - 5, y + 6, 5, h - 10);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 7,      y + 7, 7, 7);
    ctx.fillRect(x + w - 14, y + 7, 7, 7);
    if (hpRatio < 1) {
      ctx.fillStyle = '#222';
      ctx.fillRect(x, y + h + 1, w, 3);
      ctx.fillStyle = hpRatio > 0.5 ? '#3fb950' : '#f7c948';
      ctx.fillRect(x, y + h + 1, w * hpRatio, 3);
    }
  }

  function drawInvaderShooter(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ddc0ff' : '#bc8cff';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 7);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 9,      y + 7, 5, 5);
    ctx.fillRect(x + w - 14, y + 7, 5, 5);
    ctx.fillStyle = '#9060cc';
    ctx.fillRect(x + w / 2 - 2, y + h - 4, 4, 7);
  }

  function drawInvaderShield(x, y, w, h, hitFrac, shieldFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#aaddff' : '#2ec5ff';
    ctx.fillRect(x + 3, y + 4, w - 6, h - 6);
    ctx.fillStyle = '#090c16';
    ctx.fillRect(x + 8,      y + 8, 5, 5);
    ctx.fillRect(x + w - 13, y + 8, 5, 5);
    if (shieldFrac > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(46,197,255,' + (0.35 + shieldFrac * 0.45) + ')';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#2ec5ff';
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r  = w * 0.65;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 - Math.PI / 6;
        if (k === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else         ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  function drawInvaderBomber(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffd4a0' : '#ff8c00';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cc5500';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hitFrac > 0 ? '#fff' : '#ffcc44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 5);
    ctx.lineTo(x + w / 2, y - 2);
    ctx.stroke();
  }

  function drawInvaderHunter(x, y, w, h, hitFrac) {
    ctx.fillStyle = hitFrac > 0 ? '#ffaaaa' : '#cc1111';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4,     y + h - 4);
    ctx.lineTo(x,         y + h + 4);
    ctx.moveTo(x + w - 4, y + h - 4);
    ctx.lineTo(x + w,     y + h + 4);
    ctx.stroke();
  }

  function drawInvader(inv) {
    const hf      = clamp(inv.hitTimer / 0.12, 0, 1);
    const sf      = inv.maxShieldHp > 0 ? inv.shieldHp / inv.maxShieldHp : 0;
    const hpRatio = clamp(inv.hp / inv.maxHp, 0, 1);
    switch (inv.type) {
      case 'fast':    drawInvaderFast(inv.x, inv.y, inv.w, inv.h, hf); break;
      case 'tank':    drawInvaderTank(inv.x, inv.y, inv.w, inv.h, hf, hpRatio); break;
      case 'shooter': drawInvaderShooter(inv.x, inv.y, inv.w, inv.h, hf); break;
      case 'shield':  drawInvaderShield(inv.x, inv.y, inv.w, inv.h, hf, sf); break;
      case 'bomber':  drawInvaderBomber(inv.x, inv.y, inv.w, inv.h, hf); break;
      case 'hunter':  drawInvaderHunter(inv.x, inv.y, inv.w, inv.h, hf); break;
      default:        drawInvaderBasic(inv.x, inv.y, inv.w, inv.h, hf);
    }
  }

  // ── Boss ──────────────────────────────────────────────────────────────────────

  function drawBoss(b, phase) {
    const isShooting = b.flashTimer > 0;
    const isHit      = b.hitTimer > 0;
    const cx         = b.x + b.w / 2;
    const cut        = 10;
    const phaseColors = BOSS_PHASE_COLORS;
    const bodyColor   = phaseColors[(phase || 1) - 1];
    ctx.save();
    ctx.shadowBlur  = phase === 3 ? 28 : 18;
    ctx.shadowColor = bodyColor;
    ctx.fillStyle   = isHit ? '#ffd3d3' : isShooting ? '#ff2f2f' : bodyColor;
    ctx.beginPath();
    ctx.moveTo(cx - b.w / 2 + cut, b.y);
    ctx.lineTo(cx + b.w / 2 - cut, b.y);
    ctx.lineTo(cx + b.w / 2,       b.y + cut);
    ctx.lineTo(cx + b.w / 2,       b.y + b.h - cut);
    ctx.lineTo(cx + b.w / 2 - cut, b.y + b.h);
    ctx.lineTo(cx - b.w / 2 + cut, b.y + b.h);
    ctx.lineTo(cx - b.w / 2,       b.y + b.h - cut);
    ctx.lineTo(cx - b.w / 2,       b.y + cut);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#fff';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle  = '#ff0000';
    ctx.beginPath(); ctx.arc(cx - 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 16, b.y + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle   = '#333';
    ctx.fillRect(b.x, b.y - 10, b.w, 6);
    ctx.fillStyle   = '#f7c948';
    ctx.fillRect(b.x, b.y - 10, b.w * clamp(b.hpDisplay / b.maxHp, 0, 1), 6);
    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.strokeRect(b.x, b.y - 10, b.w, 6);
    // Phase indicator
    const phaseLabel = ['P1', 'P2', '⚡P3'][( phase || 1) - 1];
    const phaseCol   = BOSS_PHASE_COLORS[( phase || 1) - 1];
    ctx.fillStyle   = phaseCol;
    ctx.font        = 'bold 10px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText(phaseLabel, b.x + b.w / 2, b.y - 14);
  }

  // ── Background ────────────────────────────────────────────────────────────────

  function drawBackground(elapsed, wave, stars) {
    const glow = 8 + Math.sin(elapsed * 0.8) * 3;
    const bg   = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#090c16');
    bg.addColorStop(1, '#060912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const alpha = 0.2 + s.z * 0.6;
      const r     = 0.8 + s.z * 1.4;
      ctx.fillStyle = 'rgba(90,170,255,' + alpha + ')';
      ctx.fillRect(s.x, s.y, r, r);
    }
    ctx.strokeStyle = 'rgba(63,185,80,0.06)';
    ctx.lineWidth   = 1;
    const yOffset = (elapsed * 18) % 40;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin((elapsed + x) * 0.01) * 2, 0);
      ctx.lineTo(x + Math.sin((elapsed + x) * 0.01) * 2, H);
      ctx.stroke();
    }
    for (let y = -40; y < H + 40; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + yOffset);
      ctx.lineTo(W, y + yOffset);
      ctx.stroke();
    }
    ctx.shadowBlur  = glow;
    ctx.shadowColor = 'rgba(63,185,80,0.2)';
    ctx.strokeStyle = 'rgba(63,185,80,0.25)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 30);
    ctx.lineTo(W, H - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Bunkers ───────────────────────────────────────────────────────────────────

  function drawBunkers(bunkers) {
    for (const bunker of bunkers) {
      for (const blk of bunker) {
        const g = Math.floor(100 + (blk.hp / blk.maxHp) * 85);
        ctx.fillStyle = 'rgb(0,' + g + ',0)';
        ctx.fillRect(blk.x, blk.y, BUNKER_BLOCK_W - 1, BUNKER_BLOCK_H - 1);
      }
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────────

  function drawEffects(particles, scoreTexts, hitFlashes) {
    for (const f of hitFlashes) {
      const a = f.life / f.maxLife;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.35) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle   = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    ctx.font      = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    for (const s of scoreTexts) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle   = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  // ── Powerup items ──────────────────────────────────────────────────────────────

  function drawPowerupItems(powerupItems) {
    for (const p of powerupItems) {
      const col = POWERUP_COLORS[p.type] || '#fff';
      ctx.save();
      ctx.fillStyle    = col;
      ctx.strokeStyle  = '#fff';
      ctx.lineWidth    = 1.5;
      ctx.shadowBlur   = 8;
      ctx.shadowColor  = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur   = 0;
      ctx.fillStyle    = '#111';
      ctx.font         = 'bold 8px system-ui';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWERUP_ICONS[p.type] || '?', p.x, p.y);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  }

  // ── Active powerup pills ──────────────────────────────────────────────────────

  function drawActivePowerupOverlay(activePowerups) {
    if (activePowerups.size === 0) return;
    let px     = 12;
    const py   = H - 26;
    for (const [type, data] of activePowerups) {
      const col = POWERUP_COLORS[type] || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle   = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, 30, 14, 4);
      else ctx.rect(px, py, 30, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#111';
      ctx.font        = 'bold 8px system-ui';
      ctx.textAlign   = 'left';
      ctx.fillText(POWERUP_ICONS[type] || type, px + 3, py + 10);
      if (data.timer !== Infinity) {
        const ratio = clamp(data.timer / POWERUP_DURATION, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px, py + 11, 30, 3);
        ctx.fillStyle = col;
        ctx.fillRect(px, py + 11, 30 * ratio, 3);
      }
      px += 34;
    }
  }

  // ── Combo overlay ─────────────────────────────────────────────────────────────

  function drawComboOverlay(streak, streakTimer) {
    if (streak < 3) return;
    const alpha = Math.min(1, streakTimer / 1.8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#f7c948';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#f7c948';
    ctx.font        = 'bold 14px system-ui';
    ctx.textAlign   = 'right';
    ctx.fillText('COMBO \xd7' + streak, W - 10, 22);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Wave intro ────────────────────────────────────────────────────────────────

  function drawWaveIntro(waveIntroTimer, wave, waveDuration) {
    if (waveIntroTimer <= 0) return;
    const fade  = Math.min(1, waveIntroTimer / 0.4, (waveDuration - waveIntroTimer) / 0.4 + 0.1);
    const isBoss = wave % WAVE_BOSS === 0;
    const label  = isBoss ? 'BOSS WAVE ' + wave : 'WAVE ' + wave;
    const color  = isBoss ? '#ff4444' : '#3fb950';
    ctx.globalAlpha = clamp(fade, 0, 1);
    ctx.font        = 'bold 36px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowBlur  = 20;
    ctx.shadowColor = color;
    ctx.fillText(label, W / 2, H / 2 - 10);
    ctx.shadowBlur  = 0;
    if (isBoss) {
      ctx.fillStyle = '#ff8888';
      ctx.font      = '18px system-ui';
      ctx.fillText('Incoming threat!', W / 2, H / 2 + 22);
    }
    ctx.globalAlpha = 1;
  }

  // ── Drone companion ───────────────────────────────────────────────────────────

  function drawDrone(player, droneAngle) {
    const cx = player.x + player.w / 2 + Math.cos(droneAngle) * 44;
    const cy = player.y + player.h / 2 + Math.sin(droneAngle) * 28;
    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#f7c948';
    ctx.fillStyle   = '#f7c948';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#090c16';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Upgrade screen ────────────────────────────────────────────────────────────

  function drawUpgradeScreen(choices, upgrades) {
    // Darkened overlay
    ctx.fillStyle = 'rgba(5, 8, 20, 0.90)';
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.save();
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#3fb950';
    ctx.fillStyle   = '#3fb950';
    ctx.font        = 'bold 24px system-ui';
    ctx.textAlign   = 'center';
    ctx.fillText('WAVE COMPLETE', W / 2, 78);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#f7c948';
    ctx.font        = '15px system-ui';
    ctx.fillText('Choose an upgrade  ( 1 / 2 / 3 )', W / 2, 106);
    ctx.restore();

    // Cards
    const cardW = 138;
    const cardH = 162;
    const gap   = 14;
    const totalW = 3 * cardW + 2 * gap;
    const startX = (W - totalW) / 2;
    const cardY  = 130;

    for (let i = 0; i < choices.length; i++) {
      const def      = choices[i];
      const cx       = startX + i * (cardW + gap);
      const col      = UPGRADE_COLORS[def.id] || '#888';
      const curLevel = upgrades[def.id] || 0;
      const maxLevel = def.maxLevel;
      const atMax    = curLevel >= maxLevel;

      // Card background
      ctx.fillStyle = 'rgba(18, 22, 42, 0.96)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, cardY, cardW, cardH, 10);
      else               ctx.rect(cx, cardY, cardW, cardH);
      ctx.fill();

      // Card border
      ctx.save();
      ctx.strokeStyle = atMax ? '#555' : col;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = atMax ? 0 : 8;
      ctx.shadowColor = col;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, cardY, cardW, cardH, 10);
      else               ctx.rect(cx, cardY, cardW, cardH);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Key number
      ctx.fillStyle = atMax ? '#555' : col;
      ctx.font      = 'bold 24px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx + cardW / 2, cardY + 32);

      // Icon + label
      ctx.fillStyle = atMax ? '#555' : '#eee';
      ctx.font      = 'bold 13px system-ui';
      ctx.fillText(def.icon + ' ' + def.label, cx + cardW / 2, cardY + 60);

      // Description
      ctx.fillStyle = atMax ? '#444' : '#8b949e';
      ctx.font      = '11px system-ui';
      ctx.fillText(atMax ? 'MAXED OUT' : def.desc, cx + cardW / 2, cardY + 80);

      // Level pips
      const pipTotal  = cardW - 24;
      const pipW      = pipTotal / maxLevel - 2;
      for (let lv = 0; lv < maxLevel; lv++) {
        ctx.fillStyle = lv < curLevel ? col : 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx + 12 + lv * (pipTotal / maxLevel), cardY + 98, pipW, 7);
      }

      // Level text
      ctx.fillStyle = atMax ? '#555' : '#8b949e';
      ctx.font      = '10px system-ui';
      const lvText  = atMax ? 'MAX' : 'Lv ' + curLevel + ' → ' + (curLevel + 1);
      ctx.fillText(lvText, cx + cardW / 2, cardY + 122);
    }
  }

  // ── Screen flash ──────────────────────────────────────────────────────────────

  function drawScreenFlash(flashTimer) {
    if (flashTimer <= 0) return;
    const MAX_FLASH = 0.35;
    ctx.fillStyle   = 'rgba(255, 255, 255, ' + Math.min(0.55, (flashTimer / MAX_FLASH) * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Main draw ─────────────────────────────────────────────────────────────────

  /**
   * Render a full frame.
   * @param {object} s  full game snapshot (read-only from renderer's perspective)
   */
  function draw(s) {
    ctx.save();
    if (s.shakeTime > 0 && s.shakeIntensity > 0) {
      ctx.translate(
        (Math.random() * 2 - 1) * s.shakeIntensity,
        (Math.random() * 2 - 1) * s.shakeIntensity,
      );
    }

    drawBackground(s.elapsed, s.wave, s.stars);

    if (!s.running && !s.gameOver) {
      drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
      ctx.fillStyle = '#3fb950';
      ctx.font      = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press Start', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (s.paused) {
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.restore();
      return;
    }
    if (s.gameOver) {
      drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
      ctx.fillStyle = '#ff4fd1';
      ctx.font      = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#f7c948';
      ctx.font      = 'bold 20px system-ui';
      ctx.fillText('Score: ' + s.score, W / 2, H / 2 + 20);
      ctx.fillStyle = '#8b949e';
      ctx.font      = '16px system-ui';
      ctx.fillText('Press Start to play again', W / 2, H / 2 + 55);
      ctx.restore();
      return;
    }

    drawBunkers(s.bunkers);
    drawShip(s.player);
    if (s.upgrades && s.upgrades.drone > 0) drawDrone(s.player, s.droneAngle);
    for (const inv of s.invaders) { if (inv.alive) drawInvader(inv); }
    if (s.boss) drawBoss(s.boss, s.bossPhase);

    // Player bullets — regular (cyan) and bomb (orange glow)
    ctx.save();
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#2ec5ff';
    ctx.fillStyle   = '#2ec5ff';
    for (const b of s.bullets) {
      if (!b.isBomb) ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.shadowBlur  = 0;
    ctx.restore();
    for (const b of s.bullets) {
      if (!b.isBomb) continue;
      ctx.save();
      ctx.fillStyle   = '#ff6b2b';
      ctx.shadowBlur  = 22;
      ctx.shadowColor = '#ff6b2b';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    ctx.save();
    ctx.shadowBlur  = 6;
    ctx.shadowColor = '#ff4fd1';
    ctx.fillStyle   = '#ff4fd1';
    for (const b of s.invBullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowBlur  = 0;
    ctx.restore();

    drawPowerupItems(s.powerupItems);
    drawEffects(s.particles, s.scoreTexts, s.hitFlashes);
    drawWaveIntro(s.waveIntroTimer, s.wave, s.WAVE_INTRO_DURATION);
    drawComboOverlay(s.streak, s.streakTimer);
    drawActivePowerupOverlay(s.activePowerups);

    // Bomb cooldown indicator (canvas HUD only — no DOM)
    if (s.upgrades && s.upgrades.bombShot > 0) {
      const ready = (s.bombCooldown || 0) <= 0;
      ctx.fillStyle = ready ? '#ff6b2b' : '#555';
      ctx.font      = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(ready ? '[B] BOMB ✓' : '[B] ' + (s.bombCooldown || 0).toFixed(1) + 's', 10, H - 8);
    }

    ctx.fillStyle = '#2ec5ff';
    ctx.font      = '16px system-ui';
    ctx.textAlign = 'right';
    for (let i = 0; i < s.lives; i++) ctx.fillText('\u25b2', W - 10 - i * 22, H - 8);

    // Upgrade screen overlay (drawn on top of the frozen game state)
    if (s.upgradePhase === 'picking') {
      drawUpgradeScreen(s.upgradeChoices, s.upgrades);
    }

    // Screen flash (drawn above everything)
    drawScreenFlash(s.screenFlashTimer || 0);

    ctx.restore();
  }

  return { draw };
}
