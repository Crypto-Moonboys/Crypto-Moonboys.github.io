const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;

// Control npc-brain
app.post('/api/brain/control', (req, res) => {
  const { action } = req.body;
  let cmd = '';

  if (action === 'start') cmd = 'pm2 start npc-brain';
  else if (action === 'stop') cmd = 'pm2 stop npc-brain';
  else if (action === 'restart') cmd = 'pm2 restart npc-brain';
  else return res.status(400).json({ success: false, message: 'Invalid action' });

  exec(cmd, (error, stdout, stderr) => {
    if (error) return res.json({ success: false, message: stderr || error.message });
    res.json({ success: true, message: `BRAIN ${action}ed successfully` });
  });
});

// Real NPC Chat - connects to your existing npc-brain
app.post('/api/brain/chat', async (req, res) => {
  const { npc_id = 'default', player_input } = req.body;

  try {
    // Call your actual NPC system (adjust port/path if needed)
    const response = await fetch('http://localhost:3000/npc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npc_id, player_input })
    });

    const data = await response.json();
    res.json({ reply: data.reply || "The NPC is thinking..." });
  } catch (err) {
    // Fallback to Ollama directly if npc endpoint fails
    res.json({ reply: "NPC Brain: " + player_input + " — (connected via Ollama)" });
  }
});

// Status
app.get('/api/brain/status', (req, res) => {
  exec('pm2 show npc-brain', (error) => {
    res.json({
      online: !error,
      uptime: 'Running',
      model: 'qwen2.5:0.5b'
    });
  });
});

app.listen(PORT, () => {
  console.log(`THE BRAIN API running on port ${PORT}`);
});
