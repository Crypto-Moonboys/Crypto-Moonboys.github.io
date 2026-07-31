import baseWorker from '../leaderboard-worker.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';
import { withRegisteredTelegramLinkFallback } from './registered-telegram-link-fallback.js';

const CANONICAL_GAMES = Object.freeze([
  'snake',
  'blocktopia',
  'meme-swarm-3008',
  'chain-maze',
  'forkfield',
  'bullrun-brick-smash',
  'block-topia-dropzone',
  'kaiju',
]);

const leaderboardWorker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.replace(/\/$/, '') === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'moonboys-leaderboard',
        canonical_games: CANONICAL_GAMES,
        telegram_auth_configured: Boolean(env.TELEGRAM_BOT_TOKEN),
        database_configured: Boolean(env.DB),
        leaderboard_store_configured: Boolean(env.LEADERBOARD),
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const runtimeEnv = {
      ...env,
      DB: withRegisteredTelegramLinkFallback(env.DB),
    };
    return baseWorker.fetch(request, runtimeEnv, context);
  },
};

export default withDeploymentProvenance(leaderboardWorker, 'moonboys-leaderboard');
