-- Keep each compound trigger in its own migration for D1 runner compatibility.
CREATE TRIGGER IF NOT EXISTS prevent_pet_sanctuary_snapshot_update
BEFORE UPDATE ON telegram_pet_sanctuary
BEGIN
  SELECT RAISE(ABORT, 'sanctuary_snapshot_is_immutable');
END;
