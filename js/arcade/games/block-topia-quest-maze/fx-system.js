const COLORS = {
  gold: 0xf39c12,
  green: 0x00ff9c,
  red: 0xff3b3b,
  blue: 0x00cfff,
  purple: 0xa855f7,
  white: 0xffffff,
  void: 0x05070d,
};

export function createFxSystem(scene) {
  const camera = scene.cameras.main;
  const overlays = {
    whiteFlash: scene.add.rectangle(320, 224, 640, 448, COLORS.white, 0).setScrollFactor(0).setDepth(200).setVisible(false),
    redFlash: scene.add.rectangle(320, 224, 640, 448, COLORS.red, 0).setScrollFactor(0).setDepth(201).setVisible(false),
    pulse: scene.add.rectangle(320, 224, 640, 448, COLORS.gold, 0).setScrollFactor(0).setDepth(202).setVisible(false),
    bossVignette: scene.add.rectangle(320, 224, 640, 448, COLORS.purple, 0).setScrollFactor(0).setDepth(203).setVisible(false),
    lowHpVignette: scene.add.rectangle(320, 224, 640, 448, COLORS.red, 0).setScrollFactor(0).setDepth(204).setVisible(false),
    clearAura: scene.add.rectangle(320, 224, 640, 448, COLORS.gold, 0).setScrollFactor(0).setDepth(205).setVisible(false),
  };

  const chainState = { streak: 0 };
  let lowHpTween = null;
  let wtfCooldown = 0;

  function tweenOverlay(target, alpha, duration, ease = 'Quad.easeOut') {
    target.setVisible(true);
    scene.tweens.add({
      targets: target,
      alpha,
      duration,
      ease,
      yoyo: true,
      onComplete: () => {
        target.setAlpha(0);
        target.setVisible(false);
      },
    });
  }

  function floatingNumber(x, y, value, color, scale) {
    const text = scene.add.text(x, y, String(value), {
      fontFamily: 'Courier New',
      fontSize: Math.round(16 * (scale || 1)) + 'px',
      fontStyle: 'bold',
      color,
      stroke: '#05070d',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(210);
    scene.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 180,
      ease: 'Sine.easeInOut',
      onComplete: () => text.destroy(),
    });
  }

  function hitImpact(sprite, amount, origin) {
    camera.shake(150, 0.008);
    tweenOverlay(overlays.whiteFlash, 0.2, 120);
    if (sprite) {
      scene.tweens.add({
        targets: sprite,
        alpha: 0.3,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
    if (origin) floatingNumber(origin.x, origin.y, amount, '#ffffff', 1);
  }

  function criticalHit(sprite, amount, origin) {
    tweenOverlay(overlays.redFlash, 0.24, 180);
    if (sprite) {
      scene.tweens.add({
        targets: sprite,
        x: sprite.x + 3,
        duration: 80,
        yoyo: true,
        repeat: 2,
        ease: 'Quad.easeOut',
      });
    }
    if (origin) floatingNumber(origin.x, origin.y, amount, '#ff3b3b', 1.3);
  }

  function levelUp(x, y) {
    const particles = scene.add.particles(x, y, 'player', {
      speed: { min: 70, max: 220 },
      lifespan: 450,
      scale: { start: 0.45, end: 0 },
      quantity: 24,
      tint: [COLORS.gold, COLORS.green],
      gravityY: 80,
      blendMode: 'ADD',
      emitting: false,
    });
    particles.explode(24, x, y);
    scene.time.delayedCall(700, () => particles.destroy());
    const text = scene.add.text(320, 120, 'LEVEL UP', {
      fontFamily: 'Courier New',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#f39c12',
      stroke: '#00ff9c',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(212).setScale(0.6);
    scene.tweens.add({ targets: text, scale: 1.1, alpha: 0, duration: 520, ease: 'Back.easeOut', onComplete: () => text.destroy() });
    tweenOverlay(overlays.pulse, 0.16, 300, 'Sine.easeInOut');
  }

  function bossEntry() {
    tweenOverlay(overlays.bossVignette, 0.2, 420, 'Sine.easeInOut');
    scene.tweens.add({ targets: camera, zoom: 1.06, duration: 360, yoyo: true, ease: 'Sine.easeInOut' });
  }

  function transitionGlitch(onMidpoint) {
    const flicker = scene.add.rectangle(320, 224, 640, 448, COLORS.white, 0).setScrollFactor(0).setDepth(220);
    scene.tweens.add({
      targets: flicker,
      alpha: { from: 0, to: 0.16 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onYoyo: () => { if (onMidpoint) onMidpoint(); },
      onComplete: () => flicker.destroy(),
    });
  }

  function sceneTransition(onMidpoint) {
    const fade = scene.add.rectangle(320, 224, 640, 448, COLORS.void, 0).setScrollFactor(0).setDepth(221);
    scene.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 300,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (onMidpoint) onMidpoint();
        scene.tweens.add({ targets: fade, alpha: 0, duration: 300, ease: 'Sine.easeInOut', onComplete: () => fade.destroy() });
      },
    });
  }

  function updateStateFx(options) {
    const opts = options || {};
    const hpLow = !!opts.hpLow;
    const bossFight = !!opts.bossFight;
    const fullClear = !!opts.fullClear;
    overlays.bossVignette.setAlpha(bossFight ? 0.12 : 0);
    overlays.bossVignette.setVisible(bossFight);
    overlays.clearAura.setAlpha(fullClear ? 0.1 : 0);
    overlays.clearAura.setVisible(fullClear);
    if (hpLow && !lowHpTween) {
      overlays.lowHpVignette.setVisible(true).setAlpha(0.08);
      lowHpTween = scene.tweens.add({
        targets: overlays.lowHpVignette,
        alpha: 0.22,
        duration: 110,
        yoyo: true,
        repeat: -1,
        ease: 'Quad.easeOut',
      });
    }
    if (!hpLow && lowHpTween) {
      lowHpTween.stop();
      lowHpTween = null;
      overlays.lowHpVignette.setAlpha(0).setVisible(false);
    }
  }

  function setChainEnergy(streak) {
    chainState.streak = Math.max(0, streak || 0);
    const intensity = Math.min(0.18, chainState.streak * 0.02);
    overlays.pulse.setAlpha(intensity);
    overlays.pulse.setVisible(intensity > 0);
  }

  function maybeWtfEvent() {
    if (wtfCooldown > 0) return;
    if (Math.random() > 0.01) return;
    wtfCooldown = 6000;
    const chaos = scene.add.rectangle(320, 224, 640, 448, COLORS.red, 0).setScrollFactor(0).setDepth(223);
    scene.tweens.add({ targets: chaos, alpha: 0.17, duration: 90, yoyo: true, repeat: 2, onComplete: () => chaos.destroy() });
    camera.shake(180, 0.006);
  }

  function update(deltaMs) {
    if (wtfCooldown > 0) wtfCooldown = Math.max(0, wtfCooldown - deltaMs);
  }

  function destroy() {
    if (lowHpTween) lowHpTween.stop();
    Object.values(overlays).forEach((o) => { if (o && o.destroy) o.destroy(); });
  }

  return {
    hitImpact,
    criticalHit,
    levelUp,
    bossEntry,
    sceneTransition,
    transitionGlitch,
    updateStateFx,
    setChainEnergy,
    maybeWtfEvent,
    update,
    destroy,
  };
}
