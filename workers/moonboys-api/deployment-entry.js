import baseWorker from './worker-phase5-final.js';
import { handleDeadRunRequest } from './routes/dead-run.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

const worker = {
  async fetch(request, env, ctx) {
    const deadRunResponse = await handleDeadRunRequest(request, env, ctx);
    if (deadRunResponse) return deadRunResponse;
    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof baseWorker.scheduled === 'function') return baseWorker.scheduled(event, env, ctx);
    return undefined;
  },
};

export default withDeploymentProvenance(worker, 'moonboys-api');
