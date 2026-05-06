const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;

// === BLOCK TOPIA NPC LIST ===
app.get('/api/brain/npcs', (req, res) => {
  res.json({
    npcs: [
      "block-topia-guard",
      "quest-giver",
      "merchant",
      "moonboy-villager",
      "arena-boss",
      "crystal-keeper",
      "default-npc"
    ]
  });
});

// Chat handler
app.post('/api/brain/chat', (req, res) => {
  const { npc_id = 'default', player_input } = req.body;
  res.json({ 
    reply: `[${npc_id.toUpperCase()}] ${player_input}... (responding from Block Topia world)` 
  });
});

// Control + Status
app.post('/api/brain/control', (req, res) => {
  const { action } = req.body;
  let cmd = '';
  if (action === 'start') cmd = 'pm2 start npc-brain';
  else if (action === 'stop') cmd = 'pm2 stop npc-brain';
  else if (action === 'restart') cmd = 'pm2 restart npc-brain';
  else return res.status(400).json({ success: false, message: 'Invalid action' });

  exec(cmd, () => res.json({ success: true, message: `BRAIN ${action}ed` }));
});

app.get('/api/brain/status', (req, res) => {
  res.json({ online: true, uptime: 'Running', model: 'qwen2.5:0.5b' });
});

app.listen(PORT, () => console.log(`THE BRAIN (Block Topia NPCs) running on ${PORT}`));
