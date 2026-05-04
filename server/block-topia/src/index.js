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
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Allowed browser origins for CORS.  Set CORS_ORIGIN in .env to a
// comma-separated list to override (e.g. for staging environments).
const rawCorsOrigins = process.env.CORS_ORIGIN || '';
const ALLOWED_ORIGINS = rawCorsOrigins
  ? rawCorsOrigins.split(',').map(s => s.trim()).filter(Boolean)
  : [
      'https://cryptomoonboys.com',
      'https://crypto-moonboys.github.io',
    ];

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (server-to-server, health checks).
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // In development, allow localhost/127.0.0.1 origins.
    if (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Health check — always public, no auth required.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'block-topia-server' });
});

// SAM webhook endpoint
app.use('/webhooks/sam', samWebhookRouter);

// ── Colyseus monitor protection ───────────────────────────────────────────────
// The /colyseus route exposes all active room/session data.
// In production it is protected by HTTP Basic Auth (MONITOR_USERNAME / MONITOR_PASSWORD).
// If MONITOR_PASSWORD is not set in production the route is disabled entirely.
//
// How to enable in production:
//   Set MONITOR_USERNAME and MONITOR_PASSWORD environment variables before starting.
//   The Colyseus monitor will then be available at /colyseus with those credentials.

function buildMonitorAuthMiddleware() {
  const user = process.env.MONITOR_USERNAME || 'admin';
  const pass = process.env.MONITOR_PASSWORD || '';

  if (IS_PRODUCTION && !pass) {
    // Disable the monitor entirely in production when no password is configured.
    return (_req, res) => res.status(404).json({ error: 'Monitor not available' });
  }

  return (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const [type, credentials] = authHeader.split(' ');
    if (type !== 'Basic' || !credentials) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Colyseus Monitor"');
      return res.status(401).send('Unauthorized');
    }
    const decoded = Buffer.from(credentials, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    const reqUser = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
    const reqPass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : '';
    if (reqUser === user && reqPass === pass) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Colyseus Monitor"');
    return res.status(401).send('Unauthorized');
  };
}

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

// Colyseus monitor — protected by basic auth in all environments.
// Disabled in production if MONITOR_PASSWORD is not set.
app.use('/colyseus', buildMonitorAuthMiddleware(), monitor());

app.get("/", (req, res) => {
  res.send("Block Topia Game Server is running 🚀");
});
server.listen(PORT, async () => {
  console.log(`Block Topia server running on port ${PORT}`);
  if (IS_PRODUCTION && !process.env.MONITOR_PASSWORD) {
    console.log('[server] /colyseus monitor is DISABLED (set MONITOR_PASSWORD to enable in production)');
  }

  try {
    await ensurePersistentCityRoom();
  } catch (err) {
    console.error('[server] failed to pre-create city room:', err?.message || err);
  }
});
