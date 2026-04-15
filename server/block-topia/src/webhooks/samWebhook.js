import express from 'express';

export const samWebhookRouter = express.Router();

/**
 * POST /webhooks/sam
 * Receives events from the SAM wiki agent and broadcasts them
 * to active game rooms. This is a stub and can be expanded to
 * integrate with quest and Signal Rush systems.
 */
samWebhookRouter.post('/', async (req, res) => {
  const payload = req.body;

  console.log('📡 SAM webhook received:', payload);

  // Example event mapping
  const event = {
    type: payload?.type || 'lore_update',
    district: payload?.district || 'Central Plaza',
    message: payload?.message || 'SAM has altered the city narrative.',
    timestamp: Date.now(),
  };

  // In a full implementation, this would broadcast to all rooms
  // via a shared event bus or room registry.

  res.json({
    status: 'received',
    event,
  });
});