const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function draw() {
  // Background
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title text
  ctx.fillStyle = '#22c55e';
  ctx.font = '30px Arial';
  ctx.fillText('Block Topia ISO – Coming Soon', 50, 80);

  requestAnimationFrame(draw);
}

draw();
