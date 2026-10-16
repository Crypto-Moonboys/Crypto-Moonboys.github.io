import baseWorker, { resolveSubmissionIdentity } from '../leaderboard-worker.js';
import { handleNbgLondonRecords } from './nbg-london-records.js';
import { verifyNbgLondonReplay } from './nbg-london-replay.js';
import { settleNbgLondonDue } from './nbg-london-prizes.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';
import { withRegisteredTelegramLinkFallback } from './registered-telegram-link-fallback.js';
import { syncCloutPilotForVerifiedOwner } from '../moonboys-api/championship/clout-pilot.js';

// Official XP is independently computed from physical movement replays.
// Real-money-equivalent shared Arcade XP prizes stay separately code-locked
// until the owner explicitly approves the beta competition reward release.
const NBG_LONDON_REPLAY_VERIFIER = verifyNbgLondonReplay;
const NBG_LONDON_PRIZES_RELEASED = false;
// PR3B SOURCE-TRUST CODE LOCK: Cloudflare environment flags alone cannot
// enable the new 101-dependent writer or Championship Clout in production.
// A separately reviewed release, migration and signed canary are required.
const NBG_VERIFIED_RUN_RECEIPTS_RELEASED = false;

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
        nbg_london_prize_payouts_available: NBG_LONDON_PRIZES_RELEASED,
        nbg_london_trusted_receipts_available: NBG_VERIFIED_RUN_RECEIPTS_RELEASED &&
          env.NBG_VERIFIED_RUN_RECEIPTS_ENABLED === 'true',
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
      return handleNbgLondonRecords(request, {
        ...runtimeEnv,
        NBG_LONDON_PRIZES_ENABLED: NBG_LONDON_PRIZES_RELEASED ?
          env.NBG_LONDON_PRIZES_ENABLED : 'false',
        NBG_LONDON_SCORE_AUTHORITY_ENABLED: NBG_LONDON_PRIZES_RELEASED ?
          env.NBG_LONDON_SCORE_AUTHORITY_ENABLED : 'false',
      }, resolveSubmissionIdentity, NBG_LONDON_REPLAY_VERIFIER, {
        verifiedReceiptsReleased: NBG_VERIFIED_RUN_RECEIPTS_RELEASED,
        waitUntil: typeof context?.waitUntil === 'function'
          ? context.waitUntil.bind(context) : null,
        // Called only after the full replay-unique NBG finish batch commits.
        // Never authorize an XP payment or delay the finished-game response.
        onVerifiedRun: async ({db,telegramId,runId}) => {
          if (!NBG_VERIFIED_RUN_RECEIPTS_RELEASED ||
              env.CHAMPIONSHIP_CLOUT_PILOT_ENABLED !== 'true' ||
              env.CHAMPIONSHIP_CLOUT_NBG_ENABLED !== 'true') return;
          const receipt = await db.prepare([
            'SELECT finished_at_ms,telegram_id FROM nbg_london_verified_runs',
            "WHERE run_id=? AND telegram_id=? AND authority='server_replay' LIMIT 1",
          ].join(' ')).bind(runId,telegramId).first();
          if (!receipt || String(receipt.telegram_id) !== String(telegramId) ||
              !Number.isSafeInteger(receipt.finished_at_ms)) return;
          await syncCloutPilotForVerifiedOwner(db,telegramId,{
            enabled:true,nbgEnabled:true,coreSourcesEnabled:false,
            nbgFinishAtMs:receipt.finished_at_ms,
            startAt:env.CHAMPIONSHIP_CLOUT_PILOT_START_AT,
          });
        },
      });
    }
    return baseWorker.fetch(request, runtimeEnv, context);
  },
  async scheduled(event, env, context) {
    if (event.cron === '0 0 * * *' && NBG_LONDON_PRIZES_RELEASED &&
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
