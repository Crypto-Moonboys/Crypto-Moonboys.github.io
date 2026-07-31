import baseWorker from '../leaderboard-worker.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

export default withDeploymentProvenance(baseWorker, 'moonboys-leaderboard');
