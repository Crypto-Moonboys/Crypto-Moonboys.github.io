// Replacement age belongs to the new pet; roster position belongs to the space.
// The canonical deletion receipt carries the original ordering through every
// replacement without changing creation dates or historical purchase records.
export function petSpaceValueSql(alias, field) {
  if (!['created_at', 'pet_id'].includes(field)) throw new Error('invalid_pet_space_field');
  return `COALESCE((SELECT json_extract(CASE WHEN json_valid(d.payload) THEN d.payload ELSE '{}' END,'$.space_${field}')
    FROM telegram_pet_identity_events d
    WHERE d.pet_id=SUBSTR(${alias}.source_event_key,12)
      AND d.event_key=${alias}.source_event_key AND d.event_key='pet:delete:'||d.pet_id
      AND d.telegram_id=${alias}.telegram_id AND d.event_kind='memory' AND d.applied_at IS NOT NULL
      AND json_extract(CASE WHEN json_valid(d.payload) THEN d.payload ELSE '{}' END,'$.replacement_pet_id')=${alias}.pet_id
    LIMIT 1),${alias}.${field})`;
}

export function petSpaceOrderSql(alias = 's') {
  return `${petSpaceValueSql(alias, 'created_at')},${petSpaceValueSql(alias, 'pet_id')}`;
}


// A deleted paid space remains a position in the 1–3 roster until it is
// purchased again. Only an applied deletion receipt without a successor
// contributes a tombstone; ordinary archived ownership is not resurrected.
// Existing legacy pets still use their canonical creation-order ordinal.
export function petRankedSpaceCteSql() {
  return `pet_ranked_spaces AS (
    SELECT s.pet_id,
      ROW_NUMBER() OVER (ORDER BY ${petSpaceOrderSql('s')}) AS display_slot_number
    FROM telegram_pet_season_slots s
    WHERE s.telegram_id=? AND (
      s.status='active' OR (
        s.status='archived' AND EXISTS (
          SELECT 1 FROM telegram_pet_identity_events d
          WHERE d.pet_id=s.pet_id AND d.telegram_id=s.telegram_id AND d.season_key=s.season_key
            AND d.event_key='pet:delete:'||s.pet_id AND d.event_kind='memory'
            AND d.applied_at IS NOT NULL
            AND json_extract(CASE WHEN json_valid(d.payload) THEN d.payload ELSE '{}' END,'$.type')='pet_deleted'
        ) AND NOT EXISTS (
          SELECT 1 FROM telegram_pet_season_slots next
          WHERE next.telegram_id=s.telegram_id AND next.source_event_key='pet:delete:'||s.pet_id
        )
      )
    )
  )`;
}
