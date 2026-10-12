CREATE INDEX IF NOT EXISTS idx_pet_system_events_radio_delivery
  ON telegram_pet_system_events (created_at ASC)
  WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
    AND period_key>='2026-10-12'
    AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='pending';
