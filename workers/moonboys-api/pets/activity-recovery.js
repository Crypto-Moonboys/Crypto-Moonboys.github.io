// Completed timed actions with an interrupted claim remain recoverable.
export const PET_RECOVERABLE_ACTIVITY_PREDICATE = `status = 'completed'
  AND json_valid(metadata) = 1
  AND json_extract(metadata, '$.claim_state') = 'claiming'`;
