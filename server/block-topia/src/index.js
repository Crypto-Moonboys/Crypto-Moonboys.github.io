import http from 'http';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
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
      'https://www.cryptomoonboys.com',
      'https://crypto-moonboys.github.io',
    ];

function isAllowedOrigin(origin) {
  // Development permits localhost and 127.0.0.1; production uses the allowlist.
  return !origin || ALLOWED_ORIGINS.includes(origin)
    || (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

// Colyseus 0.17 wraps the HTTP listener and sets its own CORS headers before
// Express. Apply the same allowlist there, including matchmaking preflights.
delete matchMaker.controller.DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin'];
matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get('origin');
  return origin && isAllowedOrigin(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
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
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', service: 'block-topia-server', client_protocol: '0.17' });
});

// Serve the SDK installed with this server so Pages can negotiate a rolling upgrade.
const clientSdkPath = fileURLToPath(new URL('../node_modules/@colyseus/sdk/dist/colyseus.js', import.meta.url));
app.get('/client/colyseus.js', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(clientSdkPath);
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
    // Use constant-time comparison to prevent timing-based credential inference.
    // Always compare buffers of the same length to avoid leaking credential length.
    // Buffers are padded to the length of the longer value; a length difference still
    // results in a comparison mismatch without a timing side-channel.
    const maxUserLen = Math.max(reqUser.length, user.length);
    const maxPassLen = Math.max(reqPass.length, pass.length);
    const reqUserBuf  = Buffer.alloc(maxUserLen); Buffer.from(reqUser).copy(reqUserBuf);
    const userBuf     = Buffer.alloc(maxUserLen); Buffer.from(user).copy(userBuf);
    const reqPassBuf  = Buffer.alloc(maxPassLen); Buffer.from(reqPass).copy(reqPassBuf);
    const passBuf     = Buffer.alloc(maxPassLen); Buffer.from(pass).copy(passBuf);
    const userOk = crypto.timingSafeEqual(reqUserBuf, userBuf);
    const passOk = crypto.timingSafeEqual(reqPassBuf, passBuf);
    // Both length and content must match (length difference → buffer copy mismatch → false).
    const lengthOk = reqUser.length === user.length && reqPass.length === pass.length;
    if (userOk && passOk && lengthOk) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Colyseus Monitor"');
    return res.status(401).send('Unauthorized');
  };
}

const server = http.createServer(app);

const gameServer = new Server({ transport: new WebSocketTransport({ server }) });

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
gameServer.listen(Number(PORT)).then(async () => {
  console.log(`Block Topia server running on port ${server.address().port}`);
  if (IS_PRODUCTION && !process.env.MONITOR_PASSWORD) {
    console.log('[server] /colyseus monitor is DISABLED (set MONITOR_PASSWORD to enable in production)');
  }

  try {
    await ensurePersistentCityRoom();
  } catch (err) {
    console.error('[server] failed to pre-create city room:', err?.message || err);
  }
}).catch((err) => {
  console.error('[server] startup failed:', err?.message || err);
  process.exitCode = 1;
  server.close();
});
