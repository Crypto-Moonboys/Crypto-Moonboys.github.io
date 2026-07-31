import baseWorker from './worker.js';
import { withDeploymentProvenance } from '../shared/deployment-provenance.js';

export default withDeploymentProvenance(baseWorker, 'moonboys-anti-cheat');
