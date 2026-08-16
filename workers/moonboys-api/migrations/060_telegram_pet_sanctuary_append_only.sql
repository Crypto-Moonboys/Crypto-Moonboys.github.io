-- Keep the compound trigger isolated from the Sanctuary schema migration.
-- D1's remote migration runner cannot safely parse multiple trigger bodies in one migration.
CREATE TRIGGER IF NOT EXISTS prevent_pet_sanctuary_delete
BEFORE DELETE ON telegram_pet_sanctuary
BEGIN
  SELECT RAISE(ABORT, 'sanctuary_history_is_append_only');
END;
