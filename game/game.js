// NBG London Graffiti Run legacy fallback runtime
// Prevents the old standalone loop from competing with the Level 1 runtime.

(function () {
  if (window.NBGLevel1RuntimeActive) return;

  const canvas = document.getElementById('game');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const player = { x: 40, y: 120, w: 16, h: 24, vx: 0, vy: 0, jump: false };
  const coins = [{ x: 100, y: 100 }, { x: 150, y: 70 }, { x: 210, y: 90 }];
  let xp = 0;
  const keys = {};

  addEventListener('keydown', e => keys[e.key] = true);
  addEventListener('keyup', e => keys[e.key] = false);

  function update() {
    player.vx = 0;
    if (keys.ArrowRight) player.vx = 2;
    if (keys.ArrowLeft) player.vx = -2;
    if (keys.Space && !player.jump) {
      player.vy = -6;
      player.jump = true;
    }

    player.x += player.vx;
    player.y += player.vy;
    player.vy += 0.25;

    if (player.y > 120) {
      player.y = 120;
      player.vy = 0;
      player.jump = false;
    }

    coins.forEach((coin, index) => {
      if (Math.abs(player.x - coin.x) < 12 && Math.abs(player.y - coin.y) < 20) {
        coins.splice(index, 1);
        xp += 100;
      }
    });
  }

  function draw() {
    ctx.fillStyle = '#081326';
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = '#263241';
    ctx.fillRect(0, 140, 320, 40);
    ctx.fillStyle = '#e5a900';
    coins.forEach(coin => ctx.fillRect(coin.x, coin.y, 6, 10));
    ctx.fillStyle = '#d52b35';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.fillText('XP ' + xp, 8, 12);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  loop();
})();
