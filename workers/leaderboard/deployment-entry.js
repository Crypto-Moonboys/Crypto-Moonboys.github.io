import baseWorker from '../leaderboard-worker.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';
import { withRegisteredTelegramLinkFallback } from './registered-telegram-link-fallback.js';

const leaderboardWorker = {
  async fetch(request, env, context) {
    const runtimeEnv = {
      ...env,
      DB: withRegisteredTelegramLinkFallback(env.DB),
    };
    return baseWorker.fetch(request, runtimeEnv, context);
  },
};

export default withDeploymentProvenance(leaderboardWorker, 'moonboys-leaderboard');
