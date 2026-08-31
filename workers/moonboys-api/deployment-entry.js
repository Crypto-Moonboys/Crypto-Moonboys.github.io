import baseWorker from './worker-phase5-final.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

export default withDeploymentProvenance(baseWorker, 'moonboys-api');
