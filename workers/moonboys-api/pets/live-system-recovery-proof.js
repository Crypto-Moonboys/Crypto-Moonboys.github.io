import { PET_REGION_CONTENT, PET_EVENT_CHAINS, PET_SEASONAL_BOSSES } from './content-phase-4.js';

// Only saved charged/frozen decisions can resume a rejected settlement.
// These keys are repository content, never request input.
const keysSql = content => Object.keys(content).map(key => `'${key.replaceAll("'", "''")}'`).join(',');
export function petRecoverableLiveDecisionSql(alias = 'e') {
  const payload = `CASE WHEN json_valid(${alias}.payload_json) THEN ${alias}.payload_json ELSE '{}' END`;
  return `((${alias}.system_key='district' AND ${alias}.action_key IN (${keysSql(PET_REGION_CONTENT)})
      AND json_extract(${payload},'$.energy_charged')=1 AND json_type(${payload},'$.decision')='object')
    OR (${alias}.system_key='event_chain' AND ${alias}.action_key IN (${keysSql(PET_EVENT_CHAINS)})
      AND json_type(${payload},'$.decision')='object')
    OR (${alias}.system_key='seasonal_boss' AND ${alias}.action_key IN (${keysSql(PET_SEASONAL_BOSSES)})
      AND json_extract(${payload},'$.energy_charged')=1
      AND (json_type(${payload},'$.attack')='object' OR json_type(${payload},'$.decision.attack')='object')))`;
}
