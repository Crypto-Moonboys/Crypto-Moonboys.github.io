import baseWorker, { resolveSubmissionIdentity } from '../leaderboard-worker.js';
import { handleNbgLondonRecords } from './nbg-london-records.js';
import { settleNbgLondonDue } from './nbg-london-prizes.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';
import { withRegisteredTelegramLinkFallback } from './registered-telegram-link-fallback.js';

// No authoritative NBG gameplay simulator is installed yet. Keeping this
// code-wired and null prevents administrators mistakenly enabling payouts
// by flipping environment flags alone. Do not replace with an env boolean.
const NBG_LONDON_REPLAY_VERIFIER = null;

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
        nbg_london_ranked_scoring_available: typeof NBG_LONDON_REPLAY_VERIFIER === 'function',
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
    if (url.pathname.startsWith('/nbg-london/')) {
      return handleNbgLondonRecords(request, runtimeEnv, resolveSubmissionIdentity, NBG_LONDON_REPLAY_VERIFIER);
    }
    return baseWorker.fetch(request, runtimeEnv, context);
  },
  async scheduled(event, env, context) {
    if (event.cron === '0 0 * * *' &&
        typeof NBG_LONDON_REPLAY_VERIFIER === 'function' &&
        env.NBG_LONDON_PRIZES_ENABLED === 'true' &&
        env.NBG_LONDON_SCORE_AUTHORITY_ENABLED === 'true') {
      const job = settleNbgLondonDue({
        ...env,
        DB: withRegisteredTelegramLinkFallback(env.DB),
      }).catch(error => {
        console.error('[nbg-london-prizes]', error?.message || 'settlement_failed');
        throw error;
      });
      context.waitUntil(job);
    }
    if (typeof baseWorker.scheduled === 'function') {
      return baseWorker.scheduled(event, env, context);
    }
  },
};

export default withDeploymentProvenance(leaderboardWorker, 'moonboys-leaderboard');
