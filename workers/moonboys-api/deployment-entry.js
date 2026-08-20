import baseWorker from './worker-phase5-final.js';
import { handleNodesRequest, handleNodesScheduled } from './nodes/nodes-api.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

const workerWithNodes = {
  ...baseWorker,
  async fetch(request, env, ctx) {
    const nodesResponse = await handleNodesRequest(request, env);
    if (nodesResponse) return nodesResponse;
    return baseWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    handleNodesScheduled(event, env, ctx);
    if (typeof baseWorker.scheduled === 'function') {
      return baseWorker.scheduled(event, env, ctx);
    }
    return undefined;
  },
};

export default withDeploymentProvenance(workerWithNodes, 'moonboys-api');
