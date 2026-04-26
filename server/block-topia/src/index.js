import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server, matchMaker } from 'colyseus';
import { monitor } from '@colyseus/monitor';

import { MinimalCityRoom } from './rooms/MinimalCityRoom.js';
import { samWebhookRouter } from './webhooks/samWebhook.js';

dotenv.config();

const PORT = process.env.PORT || 2567;

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'block-topia-server' });
});

// SAM webhook endpoint
app.use('/webhooks/sam', samWebhookRouter);

const server = http.createServer(app);

const gameServer = new Server({ server });

// Register rooms
gameServer.define('city', MinimalCityRoom).enableRealtimeListing();

let _cityRoomBootstrapped = false;

async function ensurePersistentCityRoom() {
  if (_cityRoomBootstrapped) return;
  _cityRoomBootstrapped = true;

  try {
    const existingRooms = await matchMaker.query({ name: 'city' });
    if (Array.isArray(existingRooms) && existingRooms.length > 0) {
      const existing = existingRooms[0];
      console.log(`[BlockTopia] persistent city room already exists: ${existing.roomId}`);
      return existing.roomId;
    }
  } catch (err) {
    // Continue with create fallback if query fails for any reason.
    console.warn('[server] city room query failed, attempting create:', err?.message || err);
  }

  const room = await matchMaker.createRoom('city', {});
  console.log(`[BlockTopia] persistent city room bootstrapped: ${room.roomId}`);
  return room.roomId;
}

// Colyseus monitor (protected in production)
app.use('/colyseus', monitor());
app.get("/", (req, res) => {
  res.send("Block Topia Game Server is running 🚀");
});
server.listen(PORT, async () => {
  console.log(`Block Topia server running on port ${PORT}`);

  try {
    await ensurePersistentCityRoom();
  } catch (err) {
    console.error('[server] failed to pre-create city room:', err?.message || err);
  }
});
