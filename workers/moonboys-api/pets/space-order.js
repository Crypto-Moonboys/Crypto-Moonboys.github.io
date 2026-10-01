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
