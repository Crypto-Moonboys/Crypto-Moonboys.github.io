import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';

import { CityRoom } from './rooms/CityRoom.js';
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
gameServer.define('city', CityRoom).enableRealtimeListing();

// Colyseus monitor (protected in production)
app.use('/colyseus', monitor());

server.listen(PORT, () => {
  console.log(`🚀 Block Topia Colyseus server running on port ${PORT}`);
});