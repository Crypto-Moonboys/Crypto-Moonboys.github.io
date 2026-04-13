export async function loadNPCProfiles() {
  const res = await fetch('/games/data/blocktopia-npc-profiles.json');
  const data = await res.json();
  return data.profiles;
}

export function createNPC(scene, profile, x, y) {
  const npc = scene.add.rectangle(x, y, 20, 30, getFactionColor(profile.faction));
  npc.profile = profile;
  npc.state = 'idle';
  npc.target = { x, y };
  npc.speed = 0.6 + Math.random() * 0.4;
  npc.rumorTimer = 0;
  return npc;
}

export function updateNPCBehavior(scene, npc, player, phase) {
  const behavior = phase === 'Day' ? npc.profile.day_behavior : npc.profile.night_behavior;

  switch (behavior) {
    case 'deliver':
    case 'patrol':
      wander(npc);
      break;
    case 'trade':
      idle(npc);
      break;
    case 'guide':
      moveTowards(npc, player.x, player.y, 0.4);
      break;
    case 'hunt':
      moveTowards(npc, player.x, player.y, 0.8);
      break;
    case 'observe':
      idle(npc);
      break;
    case 'prophesy':
      idle(npc);
      break;
    default:
      wander(npc);
  }

  npc.rumorTimer++;
  if (npc.rumorTimer > 600) {
    npc.rumorTimer = 0;
    const rumor = npc.profile.rumors[Math.floor(Math.random() * npc.profile.rumors.length)];
    showRumor(scene, npc, rumor);
  }
}

function wander(npc) {
  if (!npc.target || Phaser.Math.Distance.Between(npc.x, npc.y, npc.target.x, npc.target.y) < 5) {
    npc.target = {
      x: npc.x + Phaser.Math.Between(-120, 120),
      y: npc.y + Phaser.Math.Between(-120, 120)
    };
  }
  moveTowards(npc, npc.target.x, npc.target.y, npc.speed);
}

function idle(npc) {
  // Subtle idle movement
  npc.x += Math.sin(Date.now() / 1000 + npc.y) * 0.05;
}

function moveTowards(npc, tx, ty, speed) {
  const dx = tx - npc.x;
  const dy = ty - npc.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 1) {
    npc.x += (dx / dist) * speed;
    npc.y += (dy / dist) * speed;
  }
}

function showRumor(scene, npc, text) {
  const bubble = scene.add.text(npc.x, npc.y - 40, text, {
    fontSize: '12px',
    color: '#eaf6ff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: { x: 6, y: 4 },
    wordWrap: { width: 200 }
  }).setOrigin(0.5);

  scene.tweens.add({
    targets: bubble,
    alpha: 0,
    duration: 4000,
    ease: 'Power2',
    onComplete: () => bubble.destroy()
  });
}

function getFactionColor(faction) {
  switch (faction) {
    case 'GraffPUNKS': return 0xff4fd8;
    case 'hostile': return 0xff4d4d;
    case 'moon-mission': return 0x5ef2ff;
    default: return 0x8dff6a;
  }
}
